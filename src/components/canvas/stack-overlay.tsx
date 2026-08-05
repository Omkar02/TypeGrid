"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Layers } from "lucide-react";

import { cn } from "@/lib/utils";
import { isComponentNode, isLinkedInstance } from "@/lib/types";
import { useEditorStore } from "@/store/editor-store";
import { NODE_ICONS } from "@/components/editor/entity-icons";
import { MODULE_KIND_META } from "@/lib/module-kinds";

/** How long the overlay lingers after the last z-order change. */
const LINGER_MS = 1800;

/** Plate footprint before the isometric rotation. */
const PLATE_W = 104;
const PLATE_H = 64;
const ISO = "rotateX(58deg) rotateZ(-45deg)";
/** Vertical separation between plates, in the rotated space. */
const PLATE_GAP = 16;
/** Beyond this the stack stops reading as a stack and starts reading as noise. */
const MAX_PLATES = 8;

/**
 * A transient isometric view of the stacking order.
 *
 * Z-order is otherwise invisible: pressing forward/backward either does nothing
 * visible (nothing overlaps) or changes the picture in a way that is hard to
 * attribute. Showing the sibling stack answers "where am I in the pile, and how
 * far is there left to go" at the moment the question arises, then gets out of
 * the way.
 */
export function StackOverlay() {
  const nonce = useEditorStore((s) => s.zOrderNonce);
  const doc = useEditorStore((s) => s.doc);
  const selection = useEditorStore((s) => s.selection);

  const [visible, setVisible] = useState(false);
  const firstRun = useRef(true);

  useEffect(() => {
    // Don't flash on mount — only on an actual reorder.
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setVisible(true);
    const timer = setTimeout(() => setVisible(false), LINGER_MS);
    return () => clearTimeout(timer);
  }, [nonce]);

  const stack = useMemo(() => {
    const activeId = selection[selection.length - 1];
    if (!activeId) return null;
    const node = doc.nodes[activeId];
    if (!node) return null;

    // Siblings share a container: the canvas root, or a component's children.
    const parent = node.parentId ? doc.nodes[node.parentId] : null;
    const siblings =
      parent && isComponentNode(parent) ? parent.childIds : doc.rootIds;

    const activeIndex = siblings.indexOf(activeId);
    if (activeIndex === -1) return null;

    // Keep the active plate in view when the pile is deeper than we draw.
    let from = 0;
    let to = siblings.length;
    if (siblings.length > MAX_PLATES) {
      from = Math.max(0, Math.min(activeIndex - Math.floor(MAX_PLATES / 2), siblings.length - MAX_PLATES));
      to = from + MAX_PLATES;
    }

    return {
      activeId,
      activeIndex,
      total: siblings.length,
      // Topmost first so the highest plate is drawn last and sits on top.
      window: siblings.slice(from, to),
      hiddenBelow: from,
      hiddenAbove: siblings.length - to,
      containerLabel: parent ? parent.name : "Canvas",
    };
  }, [doc, selection]);

  if (!visible || !stack) return null;

  const activeNode = doc.nodes[stack.activeId];
  const ActiveIcon = activeNode
    ? isLinkedInstance(activeNode)
      ? MODULE_KIND_META.module.Icon
      : NODE_ICONS[activeNode.kind]
    : null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none absolute bottom-4 right-4 z-30 w-56 rounded-lg border bg-background/95 p-3 shadow-lg backdrop-blur"
    >
      <div className="mb-1 flex items-center gap-1.5">
        <Layers className="size-3 text-muted-foreground" />
        <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Stack
        </span>
        <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
          {stack.activeIndex + 1} / {stack.total}
        </span>
      </div>

      <p className="truncate pb-1 text-[10px] text-muted-foreground">
        in {stack.containerLabel}
      </p>

      {/*
        Orthographic, not perspective: an isometric stack should keep every
        plate the same size, so distance reads as order rather than depth.
      */}
      <div
        className="relative mx-auto"
        style={{
          // The rotation foreshortens the plates, so the box only needs the
          // projected height — not the full plate height, which left a gap.
          height: 54 + PLATE_GAP * Math.max(stack.window.length - 1, 0),
          transformStyle: "preserve-3d",
        }}
      >
        <div
          className="absolute left-1/2 top-1/2"
          style={{
            transform: `translate(-50%, -50%) ${ISO}`,
            transformStyle: "preserve-3d",
          }}
        >
          {stack.window.map((id, i) => {
            const node = doc.nodes[id];
            if (!node) return null;
            const isActive = id === stack.activeId;

            return (
              <div
                key={id}
                className={cn(
                  "absolute rounded-[3px] border transition-colors",
                  isActive
                    ? "border-sky-500 bg-sky-500/25"
                    : "border-foreground/15 bg-muted/70",
                )}
                style={{
                  width: PLATE_W,
                  height: PLATE_H,
                  left: -PLATE_W / 2,
                  top: -PLATE_H / 2,
                  // Later siblings paint on top, so they float higher.
                  transform: `translateZ(${i * PLATE_GAP}px)`,
                }}
              >
                {/*
                  No text on the plates. Counter-rotating a label back out of
                  the isometric plane leaves it cramped and overlapping its
                  neighbours; leaving it skewed makes it decoration. The plates
                  carry the ordering, and the active node is named below where
                  it can simply be read.
                */}
              </div>
            );
          })}
        </div>
      </div>

      <p
        className="flex items-center justify-center gap-1 truncate pt-1 text-[10px]"
        title={activeNode?.name}
      >
        {ActiveIcon ? (
          <ActiveIcon className="size-3 shrink-0 text-sky-600" strokeWidth={2} />
        ) : null}
        <span className="truncate">{activeNode?.name}</span>
      </p>

      {stack.hiddenBelow > 0 || stack.hiddenAbove > 0 ? (
        <p className="pt-1 text-center text-[9px] text-muted-foreground">
          {stack.hiddenBelow > 0 ? `+${stack.hiddenBelow} below` : ""}
          {stack.hiddenBelow > 0 && stack.hiddenAbove > 0 ? " · " : ""}
          {stack.hiddenAbove > 0 ? `+${stack.hiddenAbove} above` : ""}
        </p>
      ) : null}
    </div>
  );
}
