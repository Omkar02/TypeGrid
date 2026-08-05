"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";

import { cn } from "@/lib/utils";
import {
  HANDLE_CURSORS,
  MAX_ZOOM,
  MIN_ZOOM,
  RESIZE_HANDLES,
  type ResizeHandle,
  angleFromCenter,
  centerOf,
  clamp,
  handleAnchor,
  maxRadius,
  normalizeAngle,
  rotatePoint,
  rectContainsPoint,
  rectFromPoints,
  rectsIntersect,
  resizeRect,
  screenToWorld,
  snap,
  worldToScreen,
} from "@/lib/geometry";
import {
  collectSubtree,
  framesForMove,
  framesForResize,
  rootAncestorOf,
  topLevelIds,
} from "@/lib/nodes";
import {
  type AnyEntityNode,
  type CanvasNode,
  type EntityKind,
  type Module,
  type Point,
  type Rect,
  type Viewport,
  isComponentNode,
  isLinkedInstance,
} from "@/lib/types";
import {
  type Bindings,
  comboFromEvent,
  comboIndex,
  isModifierOnly,
} from "@/lib/shortcuts";
import { useEditorStore } from "@/store/editor-store";
import { EntityView } from "@/components/canvas/entity-view";
import { RichTextEditor } from "@/components/canvas/rich-text-editor";
import { StackOverlay } from "@/components/canvas/stack-overlay";
import { PresenceCursors } from "@/components/canvas/presence-cursors";
import type { PresenceState } from "@/lib/presence";

export const ENTITY_DRAG_TYPE = "application/x-typegrid-entity";
export const MODULE_DRAG_TYPE = "application/x-typegrid-module";

type Gesture =
  | { type: "pan"; startLocal: Point; startViewport: Viewport }
  | {
      type: "marquee";
      originWorld: Point;
      additive: boolean;
      base: string[];
    }
  | {
      type: "move";
      originWorld: Point;
      startNodes: Record<string, CanvasNode>;
      ids: string[];
      committed: boolean;
    }
  | {
      type: "resize";
      id: string;
      handle: ResizeHandle;
      originWorld: Point;
      startNodes: Record<string, CanvasNode>;
      startFrame: Rect;
      rotation: number;
      committed: boolean;
    }
  | {
      type: "rotate";
      id: string;
      center: Point;
      startAngle: number;
      startRotation: number;
      committed: boolean;
    }
  | {
      type: "radius";
      id: string;
      startFrame: Rect;
      startRadius: number;
      originWorld: Point;
      committed: boolean;
    };

/**
 * Given the node the pointer actually hit, decide what should get selected.
 * Top level by default; while drilled into a component, its direct child.
 */
function resolveSelectable(
  nodes: Record<string, CanvasNode>,
  hitId: string,
  isolatedId: string | null,
): string {
  if (!isolatedId || !nodes[isolatedId]) return rootAncestorOf(nodes, hitId);
  let current = hitId;
  while (nodes[current]?.parentId && nodes[current].parentId !== isolatedId) {
    current = nodes[current].parentId!;
  }
  return nodes[current]?.parentId === isolatedId
    ? current
    : rootAncestorOf(nodes, hitId);
}

/**
 * Topmost node at a world point, in paint order.
 *
 * Used instead of the DOM event target because `setPointerCapture` retargets
 * the compatibility mouse events — `click`, `dblclick` — to the capturing
 * element. Reading `e.target` there always yields the canvas container, which
 * silently broke double-click-to-edit. Hit-testing the model has no such
 * ambiguity, and it means a double-click anywhere inside an element counts,
 * not only where a child div happens to sit.
 */
function hitTestNode(
  nodes: Record<string, CanvasNode>,
  ids: string[],
  point: Point,
): string | null {
  // Back to front: the last painted node is the one on top.
  for (let i = ids.length - 1; i >= 0; i--) {
    const found = hitWithin(nodes, ids[i], point);
    if (found) return found;
  }
  return null;
}

function hitWithin(
  nodes: Record<string, CanvasNode>,
  id: string,
  point: Point,
): string | null {
  const node = nodes[id];
  if (!node || node.hidden) return null;

  // Frames stay axis-aligned, so bring the point into the node's own space
  // before testing rather than trying to test a rotated rectangle.
  const local = node.rotation
    ? rotatePoint(point, centerOf(node.frame), -node.rotation)
    : point;
  if (!rectContainsPoint(node.frame, local)) return null;

  if (isComponentNode(node)) {
    const child = hitTestNode(nodes, node.childIds, point);
    // Inside the component but not over any child — the component itself.
    return child ?? id;
  }
  return id;
}

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    el.isContentEditable
  );
}

export function InfiniteCanvas({
  className,
  bindings,
  peers = [],
  onPresence,
}: {
  className?: string;
  bindings: Bindings;
  peers?: PresenceState[];
  /** Called with the pointer in world coords so peers land on the same spot. */
  onPresence?: (
    cursor: { x: number; y: number } | null,
    selection: string[],
  ) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<Gesture | null>(null);

  const doc = useEditorStore((s) => s.doc);
  const viewport = useEditorStore((s) => s.viewport);
  const selection = useEditorStore((s) => s.selection);
  const hoveredId = useEditorStore((s) => s.hoveredId);
  const editingId = useEditorStore((s) => s.editingId);
  const isolatedId = useEditorStore((s) => s.isolatedId);
  const marquee = useEditorStore((s) => s.marquee);
  const tool = useEditorStore((s) => s.tool);
  const spacePanning = useEditorStore((s) => s.spacePanning);
  const duplicateOnDrag = useEditorStore((s) => s.duplicateOnDrag);
  const showGrid = useEditorStore((s) => s.showGrid);
  const gridSize = useEditorStore((s) => s.gridSize);

  const localPoint = useCallback((e: { clientX: number; clientY: number }): Point => {
    const rect = containerRef.current?.getBoundingClientRect();
    return {
      x: e.clientX - (rect?.left ?? 0),
      y: e.clientY - (rect?.top ?? 0),
    };
  }, []);

  const worldPoint = useCallback(
    (e: { clientX: number; clientY: number }): Point =>
      screenToWorld(localPoint(e), useEditorStore.getState().viewport),
    [localPoint],
  );

  // -- container size -------------------------------------------------------

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Measure immediately rather than waiting for the observer's first
    // callback. ResizeObserver delivers on an animation frame, which never
    // arrives while the tab is backgrounded or throttled — and until it does,
    // `viewportSize` stays {0,0} and anything that centres against it (drop
    // position, zoom-to-fit) silently computes an off-screen coordinate.
    const publish = (w: number, h: number) =>
      useEditorStore.getState().setViewportSize({ w, h });

    const rect = el.getBoundingClientRect();
    publish(rect.width, rect.height);

    const observer = new ResizeObserver(([entry]) => {
      publish(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // -- wheel: pan, or zoom with ctrl/cmd ------------------------------------

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const store = useEditorStore.getState();
      if (e.ctrlKey || e.metaKey) {
        const factor = Math.exp(-e.deltaY * 0.01);
        store.zoomByFactor(factor, localPoint(e));
      } else {
        store.panBy(-e.deltaX, -e.deltaY);
      }
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [localPoint]);

  // -- pointer gestures -----------------------------------------------------

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.button !== 0 && e.button !== 1) return;
      // Let the inline text editor own its own clicks.
      if ((e.target as HTMLElement).closest("[data-inline-editor]")) return;

      const store = useEditorStore.getState();
      const wantsPan =
        e.button === 1 || store.tool === "hand" || store.spacePanning;

      containerRef.current?.setPointerCapture(e.pointerId);
      // Held for the length of the gesture so collaboration knows to queue
      // incoming frames rather than replace the canvas under the pointer.
      store.setInteracting(true);

      if (wantsPan) {
        gestureRef.current = {
          type: "pan",
          startLocal: localPoint(e),
          startViewport: store.viewport,
        };
        return;
      }

      const target = e.target as HTMLElement;

      const rotateEl = target.closest<HTMLElement>("[data-rotate-handle]");
      if (rotateEl) {
        const id = rotateEl.dataset.rotateHandle!;
        const node = store.doc.nodes[id];
        if (node) {
          const center = centerOf(node.frame);
          gestureRef.current = {
            type: "rotate",
            id,
            center,
            startAngle: angleFromCenter(center, worldPoint(e)),
            startRotation: node.rotation,
            committed: false,
          };
        }
        return;
      }

      const radiusEl = target.closest<HTMLElement>("[data-radius-handle]");
      if (radiusEl) {
        const id = radiusEl.dataset.radiusHandle!;
        const node = store.doc.nodes[id];
        if (node && !isComponentNode(node)) {
          gestureRef.current = {
            type: "radius",
            id,
            startFrame: node.frame,
            startRadius: node.style.radius,
            originWorld: worldPoint(e),
            committed: false,
          };
        }
        return;
      }

      const handleEl = target.closest<HTMLElement>("[data-resize-handle]");
      if (handleEl) {
        const id = handleEl.dataset.resizeTarget!;
        gestureRef.current = {
          type: "resize",
          id,
          handle: handleEl.dataset.resizeHandle as ResizeHandle,
          originWorld: worldPoint(e),
          startNodes: store.doc.nodes,
          startFrame: store.doc.nodes[id].frame,
          rotation: store.doc.nodes[id].rotation,
          committed: false,
        };
        return;
      }

      const nodeEl = target.closest<HTMLElement>("[data-node-id]");
      if (!nodeEl) {
        if (!e.shiftKey) {
          store.clearSelection();
          store.setIsolated(null);
        }
        gestureRef.current = {
          type: "marquee",
          originWorld: worldPoint(e),
          additive: e.shiftKey,
          base: e.shiftKey ? store.selection : [],
        };
        return;
      }

      const id = resolveSelectable(
        store.doc.nodes,
        nodeEl.dataset.nodeId!,
        store.isolatedId,
      );

      if (e.shiftKey) {
        store.toggleInSelection(id);
      } else if (!store.selection.includes(id)) {
        store.select([id]);
      }

      let ids = useEditorStore.getState().selection;
      if (ids.length === 0) return;

      // Hold D and drag to leave the original behind. The copy is made with no
      // offset so the drag itself supplies every pixel of movement — otherwise
      // the duplicate would jump before it started following the pointer.
      let alreadyInHistory = false;
      if (store.duplicateOnDrag) {
        store.duplicateSelection(0);
        ids = useEditorStore.getState().selection;
        alreadyInHistory = true;
      }

      gestureRef.current = {
        type: "move",
        originWorld: worldPoint(e),
        startNodes: useEditorStore.getState().doc.nodes,
        ids,
        // `duplicateSelection` already pushed history; a second push on the
        // first movement would make undo need two presses.
        committed: alreadyInHistory,
      };
    },
    [localPoint, worldPoint],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const gesture = gestureRef.current;
      const store = useEditorStore.getState();

      onPresence?.(worldPoint(e), store.selection);

      if (!gesture) {
        const nodeEl = (e.target as HTMLElement).closest<HTMLElement>(
          "[data-node-id]",
        );
        const next = nodeEl
          ? resolveSelectable(store.doc.nodes, nodeEl.dataset.nodeId!, store.isolatedId)
          : null;
        if (next !== store.hoveredId) store.setHovered(next);
        return;
      }

      if (gesture.type === "pan") {
        const now = localPoint(e);
        store.setViewport({
          ...gesture.startViewport,
          x: gesture.startViewport.x + (now.x - gesture.startLocal.x),
          y: gesture.startViewport.y + (now.y - gesture.startLocal.y),
        });
        return;
      }

      const world = worldPoint(e);

      if (gesture.type === "marquee") {
        const rect = rectFromPoints(gesture.originWorld, world);
        store.setMarquee(rect);
        const hits = store.doc.rootIds.filter((id) => {
          const node = store.doc.nodes[id];
          return node && !node.hidden && rectsIntersect(node.frame, rect);
        });
        store.select(
          gesture.additive ? [...new Set([...gesture.base, ...hits])] : hits,
        );
        return;
      }

      if (gesture.type === "move") {
        let dx = world.x - gesture.originWorld.x;
        let dy = world.y - gesture.originWorld.y;
        if (e.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        if (store.snapToGrid) {
          const anchor = gesture.startNodes[gesture.ids[0]]?.frame;
          if (anchor) {
            dx = snap(anchor.x + dx, store.gridSize) - anchor.x;
            dy = snap(anchor.y + dy, store.gridSize) - anchor.y;
          }
        }
        if (dx === 0 && dy === 0) return;
        if (!gesture.committed) {
          store.beginHistory();
          gesture.committed = true;
        }
        store.setFrames(framesForMove(gesture.startNodes, gesture.ids, dx, dy));
        return;
      }

      if (gesture.type === "rotate") {
        const raw =
          gesture.startRotation +
          (angleFromCenter(gesture.center, world) - gesture.startAngle);
        // Shift snaps to 15°, the usual coarse increments.
        const next = normalizeAngle(
          e.shiftKey ? Math.round(raw / 15) * 15 : Math.round(raw),
        );
        if (next === store.doc.nodes[gesture.id]?.rotation) return;
        if (!gesture.committed) {
          store.beginHistory();
          gesture.committed = true;
        }
        store.setRotation(gesture.id, next);
        return;
      }

      if (gesture.type === "radius") {
        // Dragging the handle inward along the diagonal grows the radius.
        const travel = Math.max(
          world.x - gesture.originWorld.x,
          world.y - gesture.originWorld.y,
        );
        const next = Math.round(
          clamp(
            gesture.startRadius + travel,
            0,
            maxRadius(gesture.startFrame),
          ),
        );
        const current = store.doc.nodes[gesture.id];
        if (current && !isComponentNode(current) && next === current.style.radius) {
          return;
        }
        if (!gesture.committed) {
          store.beginHistory();
          gesture.committed = true;
        }
        store.setRadius(gesture.id, next);
        return;
      }

      // resize
      let dx = world.x - gesture.originWorld.x;
      let dy = world.y - gesture.originWorld.y;
      if (gesture.rotation) {
        // Handles sit on the rotated box but the frame is axis-aligned, so the
        // drag has to come back into the node's own unrotated space first.
        const local = rotatePoint({ x: dx, y: dy }, { x: 0, y: 0 }, -gesture.rotation);
        dx = local.x;
        dy = local.y;
      }
      const next = resizeRect(gesture.startFrame, gesture.handle, dx, dy, {
        grid: store.snapToGrid ? store.gridSize : 0,
        aspect: e.shiftKey,
      });
      if (
        next.x === gesture.startFrame.x &&
        next.y === gesture.startFrame.y &&
        next.w === gesture.startFrame.w &&
        next.h === gesture.startFrame.h
      ) {
        return;
      }
      if (!gesture.committed) {
        store.beginHistory();
        gesture.committed = true;
      }
      store.setFrames(
        framesForResize(gesture.startNodes, gesture.id, gesture.startFrame, next),
      );
    },
    [localPoint, worldPoint, onPresence],
  );

  const endGesture = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (containerRef.current?.hasPointerCapture(e.pointerId)) {
      containerRef.current.releasePointerCapture(e.pointerId);
    }
    if (gestureRef.current?.type === "marquee") {
      useEditorStore.getState().setMarquee(null);
    }
    gestureRef.current = null;
    useEditorStore.getState().setInteracting(false);
  }, []);

  const onDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      // Once the inline editor is open, a double-click belongs to it — that is
      // how you select a word. Letting it reach the canvas here also reset the
      // isolation, since the editor is not inside a [data-node-id] wrapper.
      if ((e.target as HTMLElement).closest("[data-inline-editor]")) return;

      const store = useEditorStore.getState();
      // Hit-test the model, not the DOM: see `hitTestNode`.
      const hitId = hitTestNode(store.doc.nodes, store.doc.rootIds, worldPoint(e));
      if (!hitId) {
        store.setIsolated(null);
        return;
      }
      const selected = resolveSelectable(store.doc.nodes, hitId, store.isolatedId);
      const node = store.doc.nodes[selected];

      // A linked global module is owned by the module editor: you can move or
      // delete the instance, but not open it up and edit its contents here.
      const owner = store.doc.nodes[rootAncestorOf(store.doc.nodes, hitId)];
      if (owner && isLinkedInstance(owner)) {
        store.select([owner.id]);
        return;
      }

      // Editing text must never require drilling into its component first.
      // Nearly all text lives inside one, and making people double-click twice
      // reads as "inline editing is broken" — they see a selection and stop.
      const hit = store.doc.nodes[hitId];
      if (hit && !isComponentNode(hit) && (hit.kind === "text" || hit.kind === "button")) {
        if (hit.parentId) store.setIsolated(hit.parentId);
        store.select([hitId]);
        store.setEditing(hitId);
        return;
      }

      if (node && isComponentNode(node)) {
        store.setIsolated(selected);
        store.select([hitId === selected ? selected : hitId]);
        return;
      }
    },
    [worldPoint],
  );

  // -- drop from the palette / module library -------------------------------

  const onDragOver = useCallback((e: React.DragEvent) => {
    if (
      e.dataTransfer.types.includes(ENTITY_DRAG_TYPE) ||
      e.dataTransfer.types.includes(MODULE_DRAG_TYPE)
    ) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      const store = useEditorStore.getState();
      const entityKind = e.dataTransfer.getData(ENTITY_DRAG_TYPE);
      const modulePayload = e.dataTransfer.getData(MODULE_DRAG_TYPE);
      if (!entityKind && !modulePayload) return;
      e.preventDefault();

      const at = worldPoint(e);
      const snapped = store.snapToGrid
        ? { x: snap(at.x, store.gridSize), y: snap(at.y, store.gridSize) }
        : at;

      if (entityKind) {
        store.addEntity(entityKind as EntityKind, snapped);
        return;
      }
      try {
        store.instantiateModule(JSON.parse(modulePayload) as Module, snapped);
      } catch {
        // Malformed payload — nothing sensible to drop.
      }
    },
    [worldPoint],
  );

  // -- keyboard -------------------------------------------------------------

  // The live map, kept in a ref so the listener can stay mounted once instead
  // of being torn down and rebuilt whenever a binding changes. Written in an
  // effect declared before the listener, so it is current by the time that one
  // runs.
  const bindingsRef = useRef(bindings);
  useEffect(() => {
    bindingsRef.current = bindings;
  }, [bindings]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const store = useEditorStore.getState();

      if (e.code === "Space" && !isTypingTarget(e.target) && !store.spacePanning) {
        store.setSpacePanning(true);
        e.preventDefault();
        return;
      }
      if (isTypingTarget(e.target) || isModifierOnly(e)) return;

      // Escape is structural — always steps out, never rebindable.
      if (e.key === "Escape") {
        if (store.editingId) store.setEditing(null);
        else if (store.isolatedId) store.setIsolated(null);
        else store.clearSelection();
        return;
      }

      // Arrows nudge; the modifier scales the step. Also fixed.
      if (e.key.startsWith("Arrow")) {
        e.preventDefault();
        const step = e.shiftKey ? store.gridSize * 5 : store.gridSize;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        store.nudgeSelection(dx, dy);
        return;
      }

      const combo = comboFromEvent(e);
      const id = comboIndex(bindingsRef.current).get(combo);
      if (!id) return;

      // `preventDefault` only for combos we actually handle, so unclaimed
      // browser shortcuts keep working.
      e.preventDefault();

      switch (id) {
        case "tool.select":
          store.setTool("select");
          break;
        case "tool.hand":
          store.setTool("hand");
          break;
        case "modifier.duplicateDrag":
          if (!store.duplicateOnDrag) store.setDuplicateOnDrag(true);
          break;

        case "insert.text":
          store.addEntityCentered("text");
          break;
        case "insert.button":
          store.addEntityCentered("button");
          break;
        case "insert.image":
          store.addEntityCentered("image");
          break;
        case "insert.area":
          store.addEntityCentered("area");
          break;
        case "insert.divider":
          store.addEntityCentered("divider");
          break;
        case "insert.spacer":
          store.addEntityCentered("spacer");
          break;

        case "edit.undo":
          store.undo();
          break;
        case "edit.redo":
          store.redo();
          break;
        case "edit.duplicate":
          store.duplicateSelection();
          break;
        case "edit.delete":
          store.deleteSelection();
          break;
        case "edit.selectAll":
          store.selectAll();
          break;
        case "edit.groupToggle":
          store.toggleGroupSelection();
          break;
        case "edit.lock":
          store.toggleSelectionFlag("locked");
          break;
        case "edit.hide":
          store.toggleSelectionFlag("hidden");
          break;

        case "arrange.forward":
          store.reorderSelection("forward");
          break;
        case "arrange.backward":
          store.reorderSelection("backward");
          break;
        case "arrange.front":
          store.reorderSelection("front");
          break;
        case "arrange.back":
          store.reorderSelection("back");
          break;

        case "view.zoomFit":
          store.zoomToFit();
          break;
        case "view.zoomSelection":
          store.zoomToSelection();
          break;
        case "view.zoomReset":
          store.zoomToValue(1);
          break;
        case "view.zoomIn":
          store.zoomByFactor(1.2);
          break;
        case "view.zoomOut":
          store.zoomByFactor(1 / 1.2);
          break;
        case "view.toggleGrid":
          store.toggleGrid();
          break;
        case "view.toggleSnap":
          store.toggleSnap();
          break;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") useEditorStore.getState().setSpacePanning(false);
      // Releasing whichever key currently arms duplicate-drag disarms it.
      const armed = bindingsRef.current["modifier.duplicateDrag"];
      if (armed && comboFromEvent(e).endsWith(armed.split("+").pop() ?? "")) {
        useEditorStore.getState().setDuplicateOnDrag(false);
      }
    };

    // Switching windows mid-hold would otherwise leave the modifier stuck on,
    // and every later drag would silently duplicate.
    const onBlur = () => {
      useEditorStore.getState().setDuplicateOnDrag(false);
      useEditorStore.getState().setSpacePanning(false);
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  // -- derived --------------------------------------------------------------

  /** Parents before children, so children paint on top. */
  const paintOrder = useMemo(() => {
    const out: string[] = [];
    for (const id of doc.rootIds) collectSubtree(doc.nodes, id, out);
    return out;
  }, [doc]);

  const outlineIds = useMemo(
    () => topLevelIds(doc.nodes, selection),
    [doc.nodes, selection],
  );

  const selectionBox = useMemo(() => {
    if (selection.length === 0) return null;
    const frames = selection.map((id) => doc.nodes[id]?.frame).filter(Boolean) as Rect[];
    if (frames.length === 0) return null;
    const minX = Math.min(...frames.map((f) => f.x));
    const minY = Math.min(...frames.map((f) => f.y));
    const maxX = Math.max(...frames.map((f) => f.x + f.w));
    const maxY = Math.max(...frames.map((f) => f.y + f.h));
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }, [doc.nodes, selection]);

  // Feedback that the modifier is armed, so a duplicate is never a surprise.
  const cursor =
    tool === "hand" || spacePanning
      ? "grab"
      : duplicateOnDrag
        ? "copy"
        : "default";

  const gridStyle = useMemo(
    () => gridBackground(viewport, gridSize, showGrid),
    [viewport, gridSize, showGrid],
  );

  return (
    <div
      ref={containerRef}
      className={cn("relative select-none overflow-hidden", className)}
      style={{ background: doc.background, cursor, touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endGesture}
      onPointerCancel={endGesture}
      onPointerLeave={() => {
        useEditorStore.getState().setHovered(null);
        onPresence?.(null, useEditorStore.getState().selection);
      }}
      onDoubleClick={onDoubleClick}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="pointer-events-none absolute inset-0" style={gridStyle} />

      {/* World layer — everything inside is in world units. */}
      <div
        className="absolute left-0 top-0 h-0 w-0"
        style={{
          transform: `translate3d(${viewport.x}px, ${viewport.y}px, 0) scale(${viewport.zoom})`,
          transformOrigin: "0 0",
        }}
      >
        {paintOrder.map((id) => {
          const node = doc.nodes[id];
          if (!node || node.hidden) return null;
          // The inline editor renders this node itself; drawing both stacks two
          // copies that ghost against each other wherever the boxes disagree.
          if (id === editingId) return null;
          const interactive = !node.locked && !isComponentNode(node);
          return (
            <div
              key={id}
              data-node-id={id}
              className="absolute"
              style={{
                left: node.frame.x,
                top: node.frame.y,
                width: node.frame.w,
                height: node.frame.h,
                transform: node.rotation ? `rotate(${node.rotation}deg)` : undefined,
                pointerEvents: interactive ? "auto" : "none",
              }}
            >
              {isComponentNode(node) ? null : <EntityView node={node} />}
            </div>
          );
        })}

        {editingId ? <InlineEditor id={editingId} viewport={viewport} /> : null}
      </div>

      {/* Overlay layer — screen units, so strokes stay 1px at any zoom. */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full">
        {isolatedId && doc.nodes[isolatedId] ? (
          <ScreenRect
            rect={doc.nodes[isolatedId].frame}
            viewport={viewport}
            rotation={doc.nodes[isolatedId].rotation}
            className="fill-none stroke-violet-500/70"
            strokeDasharray="4 3"
          />
        ) : null}

        {hoveredId && !selection.includes(hoveredId) && doc.nodes[hoveredId] ? (
          <ScreenRect
            rect={doc.nodes[hoveredId].frame}
            viewport={viewport}
            rotation={doc.nodes[hoveredId].rotation}
            className="fill-none stroke-sky-400/80"
          />
        ) : null}

        {/* Linked global modules read as a distinct, non-editable material. */}
        {doc.rootIds.map((id) =>
          doc.nodes[id] && isLinkedInstance(doc.nodes[id]) && !doc.nodes[id].hidden ? (
            <ScreenRect
              key={`linked-${id}`}
              rect={doc.nodes[id].frame}
              viewport={viewport}
              rotation={doc.nodes[id].rotation}
              className="fill-none stroke-violet-500/60"
              strokeDasharray="5 3"
            />
          ) : null,
        )}

        {outlineIds.map((id) =>
          doc.nodes[id] ? (
            <ScreenRect
              key={id}
              rect={doc.nodes[id].frame}
              viewport={viewport}
              rotation={doc.nodes[id].rotation}
              className="fill-none stroke-sky-500"
            />
          ) : null,
        )}

        {marquee ? (
          <ScreenRect
            rect={marquee}
            viewport={viewport}
            className="fill-sky-500/10 stroke-sky-500"
            strokeDasharray="3 2"
          />
        ) : null}
      </svg>

      <PresenceCursors peers={peers} viewport={viewport} />

      <StackOverlay />

      {/* Handles only for a single node — scaling a mixed multi-selection is
          ambiguous, so multi-select stays move-only. Linked instances get none:
          a resize would be discarded the next time the module re-syncs. */}
      {selectionBox &&
      !marquee &&
      selection.length === 1 &&
      !isLinkedInstance(doc.nodes[selection[0]]) ? (
        <TransformHandles
          node={doc.nodes[selection[0]]}
          viewport={viewport}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

function ScreenRect({
  rect,
  viewport,
  rotation = 0,
  className,
  strokeDasharray,
}: {
  rect: Rect;
  viewport: Viewport;
  rotation?: number;
  className?: string;
  strokeDasharray?: string;
}) {
  const origin = worldToScreen({ x: rect.x, y: rect.y }, viewport);
  const center = worldToScreen(centerOf(rect), viewport);
  return (
    <rect
      x={origin.x}
      y={origin.y}
      width={rect.w * viewport.zoom}
      height={rect.h * viewport.zoom}
      className={className}
      strokeWidth={1}
      strokeDasharray={strokeDasharray}
      transform={rotation ? `rotate(${rotation} ${center.x} ${center.y})` : undefined}
      // Rotated edges need antialiasing; crisp edges only helps axis-aligned.
      shapeRendering={rotation ? "auto" : "crispEdges"}
    />
  );
}

const HANDLE_SIZE = 8;
const ROTATE_OFFSET = 14;
const RADIUS_INSET = 14;

/**
 * Resize, rotate and radius grips for the selected node.
 *
 * Every grip is positioned by taking its anchor in the node's unrotated space
 * and rotating that point about the node's centre — so the whole cluster tracks
 * the node's angle without needing a rotated container.
 */
function TransformHandles({
  node,
  viewport,
}: {
  node: CanvasNode;
  viewport: Viewport;
}) {
  const rect = node.frame;
  const center = centerOf(rect);
  const rotation = node.rotation;

  const place = (p: Point) =>
    worldToScreen(rotatePoint(p, center, rotation), viewport);

  return (
    <>
      {RESIZE_HANDLES.map((handle) => {
        const screen = place(handleAnchor(rect, handle));
        return (
          <div
            key={handle}
            data-resize-handle={handle}
            data-resize-target={node.id}
            className="absolute rounded-[2px] border border-sky-500 bg-background"
            style={{
              left: screen.x - HANDLE_SIZE / 2,
              top: screen.y - HANDLE_SIZE / 2,
              width: HANDLE_SIZE,
              height: HANDLE_SIZE,
              // Cursors are only right for an unrotated box; past ~22° they
              // would point the wrong way, so fall back to a neutral one.
              cursor: rotation ? "move" : HANDLE_CURSORS[handle],
            }}
          />
        );
      })}

      {/* Rotate: just outside each corner, the convention everywhere. */}
      {(["nw", "ne", "se", "sw"] as const).map((corner) => {
        const anchor = handleAnchor(rect, corner);
        const away = ROTATE_OFFSET / viewport.zoom;
        const screen = place({
          x: anchor.x + (corner.includes("w") ? -away : away),
          y: anchor.y + (corner.includes("n") ? -away : away),
        });
        return (
          <div
            key={`rot-${corner}`}
            data-rotate-handle={node.id}
            title="Drag to rotate — hold ⇧ for 15° steps"
            className="absolute rounded-full"
            style={{
              left: screen.x - HANDLE_SIZE,
              top: screen.y - HANDLE_SIZE,
              width: HANDLE_SIZE * 2,
              height: HANDLE_SIZE * 2,
              cursor: "grab",
            }}
          />
        );
      })}

      {/* Radius: inset from the top-left, only where a radius means anything. */}
      {!isComponentNode(node) && maxRadius(rect) > 0 ? (
        <RadiusHandle node={node} rect={rect} place={place} viewport={viewport} />
      ) : null}
    </>
  );
}

function RadiusHandle({
  node,
  rect,
  place,
  viewport,
}: {
  node: AnyEntityNode;
  rect: Rect;
  place: (p: Point) => Point;
  viewport: Viewport;
}) {
  // Sits along the top-left diagonal, pushed in by the current radius so the
  // grip visibly tracks the corner it controls.
  const inset = Math.max(node.style.radius, RADIUS_INSET / viewport.zoom);
  const capped = Math.min(inset, maxRadius(rect));
  const screen = place({ x: rect.x + capped, y: rect.y + capped });

  return (
    <div
      data-radius-handle={node.id}
      title={`Corner radius ${Math.round(node.style.radius)} — drag to change`}
      className="absolute rounded-full border border-sky-500 bg-background"
      style={{
        left: screen.x - HANDLE_SIZE / 2,
        top: screen.y - HANDLE_SIZE / 2,
        width: HANDLE_SIZE,
        height: HANDLE_SIZE,
        cursor: "nwse-resize",
      }}
    />
  );
}

/**
 * In-place editing. Text entities get the rich editor; a button label is a
 * single plain string — inline markup inside one would not survive email
 * rendering and the button's own style already governs its appearance.
 */
function InlineEditor({ id, viewport }: { id: string; viewport: Viewport }) {
  const node = useEditorStore((s) => s.doc.nodes[id]);
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, [id]);

  if (!node || isComponentNode(node)) return null;
  if (node.kind === "text") {
    return <RichTextEditor node={node} viewport={viewport} />;
  }
  if (node.kind !== "button") return null;

  const value = node.props.label;
  const field = "label";

  return (
    <textarea
      ref={ref}
      data-inline-editor
      value={value}
      onChange={(e) =>
        useEditorStore.getState().updateProps(id, { [field]: e.target.value })
      }
      onBlur={() => useEditorStore.getState().setEditing(null)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") useEditorStore.getState().setEditing(null);
      }}
      className="absolute resize-none rounded-[2px] outline outline-2 outline-sky-500"
      style={{
        left: node.frame.x,
        top: node.frame.y,
        width: node.frame.w,
        height: node.frame.h,
        padding: `${node.style.paddingY}px ${node.style.paddingX}px`,
        color: node.style.color,
        background:
          node.style.fill === "transparent" ? undefined : node.style.fill,
        fontFamily: node.style.fontFamily,
        fontSize: node.style.fontSize,
        fontWeight: node.style.fontWeight,
        lineHeight: node.style.lineHeight,
        letterSpacing: node.style.letterSpacing,
        textAlign: node.style.textAlign,
        borderRadius: node.style.radius,
      }}
    />
  );
}

/** Dot grid that stays legible by stepping up to a coarser multiple when zoomed out. */
function gridBackground(
  viewport: Viewport,
  gridSize: number,
  visible: boolean,
): React.CSSProperties {
  if (!visible) return {};
  let step = gridSize * viewport.zoom;
  while (step > 0 && step < 12) step *= 4;
  const strength = clamp((viewport.zoom - MIN_ZOOM) / (1 - MIN_ZOOM), 0.25, 1);
  return {
    backgroundImage: `radial-gradient(circle, rgba(0,0,0,${0.18 * strength}) 1px, transparent 1px)`,
    backgroundSize: `${step}px ${step}px`,
    backgroundPosition: `${viewport.x}px ${viewport.y}px`,
  };
}

export { MAX_ZOOM, MIN_ZOOM };
