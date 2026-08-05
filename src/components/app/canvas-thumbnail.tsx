"use client";

import { useMemo } from "react";

import { canvasBounds, collectSubtree } from "@/lib/nodes";
import { type CanvasDoc, isComponentNode } from "@/lib/types";
import { EntityView } from "@/components/canvas/entity-view";

/** Non-interactive preview of a whole template canvas, scaled to fit `height`. */
export function CanvasThumbnail({
  canvas,
  height = 132,
}: {
  canvas: CanvasDoc;
  height?: number;
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

  // Fit on width; tall canvases simply crop from the top, like a real preview.
  const scale = Math.min(1, (height * 1.6) / bounds.w);

  return (
    <div
      className="relative overflow-hidden rounded border"
      style={{ height, background: canvas.background }}
    >
      <div
        className="absolute left-1/2 top-0"
        style={{
          width: bounds.w,
          height: bounds.h,
          transform: `translateX(-50%) scale(${scale})`,
          transformOrigin: "top center",
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
