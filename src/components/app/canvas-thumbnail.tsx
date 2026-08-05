"use client";

import { useMemo } from "react";

import { canvasBounds, collectSubtree } from "@/lib/nodes";
import { type CanvasDoc, isComponentNode } from "@/lib/types";
import { EntityView } from "@/components/canvas/entity-view";

/**
 * Non-interactive preview of a whole template canvas.
 *
 * `fit="width"` (the default) scales to the width and crops anything tall, the
 * way a card thumbnail should. `fit="contain"` scales the whole canvas into the
 * box instead — version history needs it, because a change that moved something
 * off the bottom is exactly the change you opened the dialog to look at.
 */
export function CanvasThumbnail({
  canvas,
  height = 132,
  width,
  fit = "width",
}: {
  canvas: CanvasDoc;
  height?: number;
  /** Assumed box width. Defaults to a 1.6 ratio against `height`. */
  width?: number;
  fit?: "width" | "contain";
}) {
  const bounds = useMemo(() => canvasBounds(canvas), [canvas]);
  const order = useMemo(() => {
    const out: string[] = [];
    for (const id of canvas.rootIds) collectSubtree(canvas.nodes, id, out);
    return out;
  }, [canvas]);

  if (!bounds || bounds.w <= 0 || bounds.h <= 0) {
    return (
      <div
        className="flex items-center justify-center rounded border border-dashed text-[10px] text-muted-foreground"
        style={{ height, background: canvas.background }}
      >
        Empty canvas
      </div>
    );
  }

  const boxWidth = width ?? height * 1.6;
  const scale =
    fit === "contain"
      ? Math.min(1, boxWidth / bounds.w, height / bounds.h)
      : Math.min(1, boxWidth / bounds.w);

  return (
    <div
      className="relative overflow-hidden rounded border"
      style={{ height, background: canvas.background }}
    >
      <div
        className={fit === "contain" ? "absolute left-1/2 top-1/2" : "absolute left-1/2 top-0"}
        style={{
          width: bounds.w,
          height: bounds.h,
          transform:
            fit === "contain"
              ? `translate(-50%, -50%) scale(${scale})`
              : `translateX(-50%) scale(${scale})`,
          transformOrigin: fit === "contain" ? "center" : "top center",
        }}
      >
        {order.map((id) => {
          const node = canvas.nodes[id];
          if (!node || node.hidden || isComponentNode(node)) return null;
          return (
            <div
              key={id}
              className="absolute"
              style={{
                left: node.frame.x - bounds.x,
                top: node.frame.y - bounds.y,
                width: node.frame.w,
                height: node.frame.h,
              }}
            >
              <EntityView node={node} />
            </div>
          );
        })}
      </div>
    </div>
  );
}
