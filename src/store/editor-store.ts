"use client";

import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { enableMapSet } from "immer";

import { fitViewport, screenToWorld, unionRects, zoomAt } from "@/lib/geometry";
import {
  ENTITY_BLUEPRINTS,
  boundsOf,
  cloneSubtree,
  collectSubtree,
  createComponent,
  createEntity,
  emptyCanvas,
  framesForMove,
  topLevelIds,
} from "@/lib/nodes";
import {
  type CanvasDoc,
  type CanvasNode,
  type EntityKind,
  type Module,
  type NodeStyle,
  type Point,
  type Rect,
  type Size,
  type TypeDocument,
  type Viewport,
  isComponentNode,
  isLinkedInstance,
} from "@/lib/types";

enableMapSet();

export type Tool = "select" | "hand";
export type ReorderDirection = "front" | "forward" | "backward" | "back";

const HISTORY_LIMIT = 60;

interface EditorState {
  /** The locale document currently open on the canvas. */
  documentId: string | null;
  doc: CanvasDoc;
  viewport: Viewport;
  /** Pixel size of the canvas element, kept here so panels can centre things. */
  viewportSize: Size;
  selection: string[];
  hoveredId: string | null;
  /** Node currently open for inline text editing. */
  editingId: string | null;
  /** Component the user drilled into via double-click. */
  isolatedId: string | null;
  /**
   * When set, newly added nodes are parented to this component instead of the
   * canvas root. The module editor uses it so everything you draw belongs to
   * the module — otherwise each save would wrap strays in a fresh component and
   * the nesting would grow one level per session.
   */
  rootParentId: string | null;
  tool: Tool;
  spacePanning: boolean;
  /** True while `D` is held: a drag then leaves the original behind. Lives in
   *  the store rather than a ref so the UI can reflect it, exactly like
   *  `spacePanning`. */
  duplicateOnDrag: boolean;
  marquee: Rect | null;
  showGrid: boolean;
  snapToGrid: boolean;
  gridSize: number;
  dirty: boolean;
  past: CanvasDoc[];
  future: CanvasDoc[];
}

interface EditorActions {
  /** Loads any canvas by id — a locale document, or a module being edited. */
  loadCanvas: (id: string, canvas: CanvasDoc) => void;
  loadDocument: (document: TypeDocument) => void;
  markSaved: () => void;
  /** Flags unsaved changes made outside the normal mutation actions. */
  markDirty: () => void;

  // viewport
  setViewport: (vp: Viewport) => void;
  setViewportSize: (size: Size) => void;
  panBy: (dx: number, dy: number) => void;
  /** Anchor defaults to the centre of the canvas. */
  zoomByFactor: (factor: number, anchor?: Point) => void;
  zoomToValue: (zoom: number, anchor?: Point) => void;
  zoomToFit: () => void;
  zoomToSelection: () => void;

  // tools & transient ui
  setTool: (tool: Tool) => void;
  setSpacePanning: (on: boolean) => void;
  setDuplicateOnDrag: (on: boolean) => void;
  setMarquee: (rect: Rect | null) => void;
  setHovered: (id: string | null) => void;
  setEditing: (id: string | null) => void;
  setIsolated: (id: string | null) => void;
  setRootParent: (id: string | null) => void;
  toggleGrid: () => void;
  toggleSnap: () => void;

  // selection
  select: (ids: string[]) => void;
  addToSelection: (ids: string[]) => void;
  toggleInSelection: (id: string) => void;
  selectAll: () => void;
  clearSelection: () => void;

  // history
  beginHistory: () => void;
  undo: () => void;
  redo: () => void;

  // mutations
  addEntity: (kind: EntityKind, at: Point) => string;
  /** Drops a new entity centred in whatever the user is currently looking at. */
  addEntityCentered: (kind: EntityKind) => string;
  instantiateModule: (module: Module, at: Point) => string;
  instantiateModuleCentered: (module: Module) => string;
  /** Turns a linked global-module instance into a plain, editable copy. */
  detachInstance: (id: string) => void;
  setFrames: (frames: Record<string, Rect>) => void;
  renameNode: (id: string, name: string) => void;
  updateProps: (id: string, patch: Record<string, unknown>) => void;
  updateStyle: (id: string, patch: Partial<NodeStyle>) => void;
  setNodeFlag: (id: string, flag: "locked" | "hidden", value: boolean) => void;
  setRotation: (id: string, degrees: number) => void;
  setRadius: (id: string, radius: number) => void;
  setBackground: (color: string) => void;
  deleteSelection: () => void;
  /** `offset` of 0 stacks the copy exactly on the original — what a
   *  duplicate-while-dragging needs, since the drag supplies the movement. */
  duplicateSelection: (offset?: number) => void;
  groupSelection: () => string | null;
  ungroupSelection: () => void;
  /** One key for both: group a multi-selection, ungroup a lone component. */
  toggleGroupSelection: () => void;
  /** Flips `locked`/`hidden` for the selection based on the first node. */
  toggleSelectionFlag: (flag: "locked" | "hidden") => void;
  reorderSelection: (direction: ReorderDirection) => void;
  nudgeSelection: (dx: number, dy: number) => void;
}

export type EditorStore = EditorState & EditorActions;

const initialState: EditorState = {
  documentId: null,
  doc: emptyCanvas(),
  viewport: { x: 120, y: 80, zoom: 1 },
  viewportSize: { w: 0, h: 0 },
  selection: [],
  hoveredId: null,
  editingId: null,
  isolatedId: null,
  rootParentId: null,
  tool: "select",
  spacePanning: false,
  duplicateOnDrag: false,
  marquee: null,
  showGrid: true,
  snapToGrid: true,
  gridSize: 8,
  dirty: false,
  past: [],
  future: [],
};

function screenCenter(size: Size): Point {
  return { x: size.w / 2, y: size.h / 2 };
}

/** Middle of the visible canvas, in world coordinates. */
export function viewportCenterWorld(state: {
  viewport: Viewport;
  viewportSize: Size;
}): Point {
  const { viewport, viewportSize } = state;
  // Centring on an unmeasured (zero-size) viewport lands at negative
  // coordinates — off-screen, where a newly placed entity looks like it was
  // never created. Fall back to a point that is definitely in view.
  const screen =
    viewportSize.w > 0 && viewportSize.h > 0
      ? screenCenter(viewportSize)
      : { x: 240, y: 160 };
  return screenToWorld(screen, viewport);
}

/** Keeps every ancestor component's frame wrapped around its children. */
function reflowAncestors(doc: CanvasDoc, changedIds: string[]): void {
  const seen = new Set<string>();
  const queue: string[] = [];

  for (const id of changedIds) {
    const parentId = doc.nodes[id]?.parentId;
    if (parentId && !seen.has(parentId)) {
      seen.add(parentId);
      queue.push(parentId);
    }
  }

  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = doc.nodes[id];
    if (!node || !isComponentNode(node)) continue;
    const bounds = boundsOf(doc.nodes, node.childIds);
    if (bounds) node.frame = bounds;
    const parentId = node.parentId;
    if (parentId && !seen.has(parentId)) {
      seen.add(parentId);
      queue.push(parentId);
    }
  }
}

/**
 * Places a freshly created node either on the canvas root or inside
 * `rootParentId`, keeping the owning component's frame in step.
 */
function attachToRoot(
  doc: CanvasDoc,
  id: string,
  rootParentId: string | null,
): void {
  const parent = rootParentId ? doc.nodes[rootParentId] : null;
  if (parent && isComponentNode(parent)) {
    parent.childIds.push(id);
    doc.nodes[id].parentId = rootParentId;
    reflowAncestors(doc, [id]);
    return;
  }
  doc.rootIds.push(id);
}

/** Removes a node id from wherever it currently sits in the tree. */
function detach(doc: CanvasDoc, id: string): void {
  const node = doc.nodes[id];
  if (!node) return;
  if (node.parentId) {
    const parent = doc.nodes[node.parentId];
    if (parent && isComponentNode(parent)) {
      parent.childIds = parent.childIds.filter((childId) => childId !== id);
    }
  } else {
    doc.rootIds = doc.rootIds.filter((rootId) => rootId !== id);
  }
}

function orderedContainer(doc: CanvasDoc, id: string): string[] {
  const node = doc.nodes[id];
  if (node?.parentId) {
    const parent = doc.nodes[node.parentId];
    if (parent && isComponentNode(parent)) return parent.childIds;
  }
  return doc.rootIds;
}

function writeContainer(doc: CanvasDoc, id: string, next: string[]): void {
  const node = doc.nodes[id];
  if (node?.parentId) {
    const parent = doc.nodes[node.parentId];
    if (parent && isComponentNode(parent)) {
      parent.childIds = next;
      return;
    }
  }
  doc.rootIds = next;
}

export const useEditorStore = create<EditorStore>()(
  immer((set, get) => ({
    ...initialState,

    loadCanvas: (id, canvas) =>
      set((s) => {
        s.documentId = id;
        s.doc = canvas;
        s.selection = [];
        s.hoveredId = null;
        s.editingId = null;
        s.isolatedId = null;
        s.rootParentId = null;
        s.past = [];
        s.future = [];
        s.dirty = false;
      }),

    loadDocument: (document) => get().loadCanvas(document.id, document.canvas),

    markSaved: () =>
      set((s) => {
        s.dirty = false;
      }),

    markDirty: () =>
      set((s) => {
        s.dirty = true;
      }),

    // -- viewport -----------------------------------------------------------

    setViewport: (vp) =>
      set((s) => {
        s.viewport = vp;
      }),

    setViewportSize: (size) =>
      set((s) => {
        s.viewportSize = size;
      }),

    panBy: (dx, dy) =>
      set((s) => {
        s.viewport.x += dx;
        s.viewport.y += dy;
      }),

    zoomByFactor: (factor, anchor) =>
      set((s) => {
        s.viewport = zoomAt(
          s.viewport,
          anchor ?? screenCenter(s.viewportSize),
          s.viewport.zoom * factor,
        );
      }),

    zoomToValue: (zoom, anchor) =>
      set((s) => {
        s.viewport = zoomAt(s.viewport, anchor ?? screenCenter(s.viewportSize), zoom);
      }),

    zoomToFit: () =>
      set((s) => {
        s.viewport = fitViewport(
          boundsOf(s.doc.nodes, s.doc.rootIds),
          s.viewportSize,
        );
      }),

    zoomToSelection: () =>
      set((s) => {
        const target =
          s.selection.length > 0
            ? boundsOf(s.doc.nodes, s.selection)
            : boundsOf(s.doc.nodes, s.doc.rootIds);
        s.viewport = fitViewport(target, s.viewportSize);
      }),

    // -- transient ui -------------------------------------------------------

    setTool: (tool) =>
      set((s) => {
        s.tool = tool;
      }),

    setSpacePanning: (on) =>
      set((s) => {
        s.spacePanning = on;
      }),

    setDuplicateOnDrag: (on) =>
      set((s) => {
        s.duplicateOnDrag = on;
      }),

    setMarquee: (rect) =>
      set((s) => {
        s.marquee = rect;
      }),

    setHovered: (id) =>
      set((s) => {
        s.hoveredId = id;
      }),

    setEditing: (id) =>
      set((s) => {
        s.editingId = id;
      }),

    setIsolated: (id) =>
      set((s) => {
        s.isolatedId = id;
      }),

    setRootParent: (id) =>
      set((s) => {
        s.rootParentId = id;
      }),

    toggleGrid: () =>
      set((s) => {
        s.showGrid = !s.showGrid;
      }),

    toggleSnap: () =>
      set((s) => {
        s.snapToGrid = !s.snapToGrid;
      }),

    // -- selection ----------------------------------------------------------

    select: (ids) =>
      set((s) => {
        s.selection = ids.filter((id) => Boolean(s.doc.nodes[id]));
      }),

    addToSelection: (ids) =>
      set((s) => {
        const next = new Set(s.selection);
        for (const id of ids) if (s.doc.nodes[id]) next.add(id);
        s.selection = [...next];
      }),

    toggleInSelection: (id) =>
      set((s) => {
        s.selection = s.selection.includes(id)
          ? s.selection.filter((selected) => selected !== id)
          : [...s.selection, id];
      }),

    selectAll: () =>
      set((s) => {
        const parent = s.isolatedId ? s.doc.nodes[s.isolatedId] : null;
        s.selection =
          parent && isComponentNode(parent) ? [...parent.childIds] : [...s.doc.rootIds];
      }),

    clearSelection: () =>
      set((s) => {
        s.selection = [];
        s.editingId = null;
      }),

    // -- history ------------------------------------------------------------

    beginHistory: () => {
      const snapshot = get().doc;
      set((s) => {
        s.past.push(snapshot);
        if (s.past.length > HISTORY_LIMIT) s.past.shift();
        s.future = [];
      });
    },

    undo: () => {
      const { past, doc } = get();
      if (past.length === 0) return;
      const previous = past[past.length - 1];
      set((s) => {
        s.past.pop();
        s.future.push(doc);
        s.doc = previous;
        s.selection = s.selection.filter((id) => Boolean(previous.nodes[id]));
        s.editingId = null;
        s.dirty = true;
      });
    },

    redo: () => {
      const { future, doc } = get();
      if (future.length === 0) return;
      const next = future[future.length - 1];
      set((s) => {
        s.future.pop();
        s.past.push(doc);
        s.doc = next;
        s.selection = s.selection.filter((id) => Boolean(next.nodes[id]));
        s.editingId = null;
        s.dirty = true;
      });
    },

    // -- mutations ----------------------------------------------------------

    addEntity: (kind, at) => {
      get().beginHistory();
      const entity = createEntity(kind, { x: at.x, y: at.y });
      set((s) => {
        s.doc.nodes[entity.id] = entity;
        attachToRoot(s.doc, entity.id, s.rootParentId);
        s.selection = [entity.id];
        s.dirty = true;
      });
      return entity.id;
    },

    addEntityCentered: (kind) => {
      const state = get();
      const center = viewportCenterWorld(state);
      const { w, h } = ENTITY_BLUEPRINTS[kind].defaultSize;
      return state.addEntity(kind, {
        x: Math.round(center.x - w / 2),
        y: Math.round(center.y - h / 2),
      });
    },

    instantiateModuleCentered: (module) => {
      const state = get();
      const center = viewportCenterWorld(state);
      return state.instantiateModule(module, {
        x: Math.round(center.x - module.size.w / 2),
        y: Math.round(center.y - module.size.h / 2),
      });
    },

    instantiateModule: (module, at) => {
      get().beginHistory();
      const clone = cloneSubtree(module.nodes, module.rootId, {
        dx: at.x,
        dy: at.y,
      });
      const root = clone.nodes[clone.rootId];
      if (isComponentNode(root)) {
        root.moduleId = module.id;
        root.name = module.name;
        // Global modules stay linked to their definition; templates are just a
        // starting point and land as ordinary editable components.
        root.linked = module.kind === "module";
      }
      set((s) => {
        Object.assign(s.doc.nodes, clone.nodes);
        attachToRoot(s.doc, clone.rootId, s.rootParentId);
        s.selection = [clone.rootId];
        s.dirty = true;
      });
      return clone.rootId;
    },

    detachInstance: (id) => {
      const node = get().doc.nodes[id];
      if (!node || !isLinkedInstance(node)) return;
      get().beginHistory();
      set((s) => {
        const target = s.doc.nodes[id];
        if (target && isComponentNode(target)) target.linked = false;
        s.dirty = true;
      });
    },

    setFrames: (frames) =>
      set((s) => {
        const ids = Object.keys(frames);
        for (const id of ids) {
          const node = s.doc.nodes[id];
          if (node) node.frame = frames[id];
        }
        reflowAncestors(s.doc, ids);
        s.dirty = true;
      }),

    renameNode: (id, name) =>
      set((s) => {
        const node = s.doc.nodes[id];
        if (node) node.name = name;
        s.dirty = true;
      }),

    updateProps: (id, patch) =>
      set((s) => {
        const node = s.doc.nodes[id];
        if (!node || isComponentNode(node)) return;
        Object.assign(node.props, patch);
        s.dirty = true;
      }),

    updateStyle: (id, patch) =>
      set((s) => {
        const node = s.doc.nodes[id];
        if (!node || isComponentNode(node)) return;
        Object.assign(node.style, patch);
        s.dirty = true;
      }),

    setNodeFlag: (id, flag, value) =>
      set((s) => {
        for (const memberId of collectSubtree(s.doc.nodes, id)) {
          s.doc.nodes[memberId][flag] = value;
        }
        if (flag === "hidden" && value) {
          s.selection = s.selection.filter((selected) => selected !== id);
        }
        s.dirty = true;
      }),

    setRotation: (id, degrees) =>
      set((s) => {
        const node = s.doc.nodes[id];
        if (!node) return;
        node.rotation = degrees;
        s.dirty = true;
      }),

    setRadius: (id, radius) =>
      set((s) => {
        const node = s.doc.nodes[id];
        // Components have no style of their own — their children carry it.
        if (!node || isComponentNode(node)) return;
        node.style.radius = Math.max(0, radius);
        s.dirty = true;
      }),

    setBackground: (color) =>
      set((s) => {
        s.doc.background = color;
        s.dirty = true;
      }),

    deleteSelection: () => {
      const { selection, doc } = get();
      if (selection.length === 0) return;
      get().beginHistory();
      const roots = topLevelIds(doc.nodes, selection);
      set((s) => {
        for (const id of roots) {
          const doomed = collectSubtree(s.doc.nodes, id);
          detach(s.doc, id);
          for (const memberId of doomed) delete s.doc.nodes[memberId];
        }
        reflowAncestors(s.doc, roots);
        s.selection = [];
        s.editingId = null;
        s.dirty = true;
      });
    },

    duplicateSelection: (offset = 24) => {
      const { selection, doc } = get();
      if (selection.length === 0) return;
      get().beginHistory();
      const roots = topLevelIds(doc.nodes, selection);

      // Clone from the committed state, never from inside the `set` recipe.
      // Immer hands the recipe a Proxy draft and `structuredClone` throws on
      // proxies — which silently broke duplication entirely.
      const clones = roots.map((id) =>
        cloneSubtree(doc.nodes, id, { dx: offset, dy: offset }),
      );

      set((s) => {
        for (const clone of clones) {
          Object.assign(s.doc.nodes, clone.nodes);
          s.doc.nodes[clone.rootId].parentId = null;
          s.doc.rootIds.push(clone.rootId);
        }
        s.selection = clones.map((clone) => clone.rootId);
        s.dirty = true;
      });
    },

    groupSelection: () => {
      const { selection, doc } = get();
      const roots = topLevelIds(doc.nodes, selection);
      if (roots.length < 2) return null;

      get().beginHistory();
      const bounds = unionRects(roots.map((id) => doc.nodes[id].frame));
      if (!bounds) return null;

      const component = createComponent("Component", bounds, []);
      component.parentId = doc.nodes[roots[0]].parentId ?? null;

      set((s) => {
        // Preserve the on-canvas stacking order of the grouped nodes.
        const container = [...orderedContainer(s.doc, roots[0])];
        const ordered = container.filter((id) => roots.includes(id));
        const insertAt = Math.max(
          container.findIndex((id) => roots.includes(id)),
          0,
        );

        for (const id of roots) detach(s.doc, id);

        component.childIds = ordered;
        s.doc.nodes[component.id] = component;
        for (const id of ordered) s.doc.nodes[id].parentId = component.id;

        const next = [...orderedContainer(s.doc, component.id)];
        next.splice(insertAt, 0, component.id);
        writeContainer(s.doc, component.id, next);

        s.selection = [component.id];
        s.dirty = true;
      });

      return component.id;
    },

    ungroupSelection: () => {
      const { selection, doc } = get();
      const components = selection.filter((id) =>
        doc.nodes[id] ? isComponentNode(doc.nodes[id]) : false,
      );
      if (components.length === 0) return;

      get().beginHistory();
      const freed: string[] = [];
      set((s) => {
        for (const id of components) {
          const node = s.doc.nodes[id];
          if (!node || !isComponentNode(node)) continue;

          const children = [...node.childIds];
          const parentId = node.parentId;
          const parent = parentId ? s.doc.nodes[parentId] : null;
          const container =
            parent && isComponentNode(parent) ? parent.childIds : s.doc.rootIds;

          // Swap the component out for its children, in place, same z-order.
          const index = container.indexOf(id);
          const next = [...container];
          next.splice(index === -1 ? next.length : index, index === -1 ? 0 : 1, ...children);

          for (const childId of children) s.doc.nodes[childId].parentId = parentId;
          delete s.doc.nodes[id];

          if (parent && isComponentNode(parent)) {
            parent.childIds = next;
          } else {
            s.doc.rootIds = next;
          }
          freed.push(...children);
        }
        reflowAncestors(s.doc, freed);
        s.selection = freed;
        s.dirty = true;
      });
    },

    toggleGroupSelection: () => {
      const { selection, doc } = get();
      if (selection.length === 0) return;
      const roots = topLevelIds(doc.nodes, selection);
      const soleComponent =
        roots.length === 1 && isComponentNode(doc.nodes[roots[0]]);
      if (soleComponent) get().ungroupSelection();
      else if (roots.length > 1) get().groupSelection();
    },

    toggleSelectionFlag: (flag) => {
      const { selection, doc } = get();
      if (selection.length === 0) return;
      // Drive every node from the first one's state so a mixed selection
      // resolves to a single, predictable outcome.
      const next = !doc.nodes[selection[0]]?.[flag];
      get().beginHistory();
      for (const id of topLevelIds(doc.nodes, selection)) {
        get().setNodeFlag(id, flag, next);
      }
    },

    reorderSelection: (direction) => {
      const { selection, doc } = get();
      if (selection.length === 0) return;
      get().beginHistory();
      const roots = topLevelIds(doc.nodes, selection);
      set((s) => {
        for (const id of roots) {
          const container = [...orderedContainer(s.doc, id)];
          const index = container.indexOf(id);
          if (index === -1) continue;
          container.splice(index, 1);
          const target =
            direction === "front"
              ? container.length
              : direction === "back"
                ? 0
                : direction === "forward"
                  ? Math.min(index + 1, container.length)
                  : Math.max(index - 1, 0);
          container.splice(target, 0, id);
          writeContainer(s.doc, id, container);
        }
        s.dirty = true;
      });
    },

    nudgeSelection: (dx, dy) => {
      const { selection, doc } = get();
      if (selection.length === 0) return;
      get().beginHistory();
      get().setFrames(framesForMove(doc.nodes, selection, dx, dy));
    },
  })),
);

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export function selectionBounds(state: EditorStore): Rect | null {
  return boundsOf(state.doc.nodes, state.selection);
}

export function primarySelected(state: EditorStore): CanvasNode | null {
  const id = state.selection[state.selection.length - 1];
  return id ? (state.doc.nodes[id] ?? null) : null;
}

export function canUndo(state: EditorStore): boolean {
  return state.past.length > 0;
}

export function canRedo(state: EditorStore): boolean {
  return state.future.length > 0;
}
