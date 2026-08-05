"use client";

import { useMemo } from "react";

import { collectSubtree } from "@/lib/nodes";
import { type CanvasNode, type Size, isComponentNode } from "@/lib/types";
import { EntityView } from "@/components/canvas/entity-view";

/** Static, non-interactive thumbnail of a module subtree, scaled to fit. */
export function ModulePreview({
  nodes,
  rootId,
  size,
  box,
}: {
  nodes: Record<string, CanvasNode>;
  rootId: string;
  size: Size;
  box: { w: number; h: number };
}) {
  const order = useMemo(() => collectSubtree(nodes, rootId), [nodes, rootId]);
  const scale =
    size.w > 0 && size.h > 0
      ? Math.min(box.w / size.w, box.h / size.h, 1)
      : 1;

  return (
    <div
      className="relative shrink-0 overflow-hidden rounded border bg-white"
      style={{ width: box.w, height: box.h }}
    >
      <div
        className="absolute left-1/2 top-1/2"
        style={{
          width: size.w,
          height: size.h,
          transform: `translate(-50%, -50%) scale(${scale})`,
        }}
      >
        {order.map((id) => {
          const node = nodes[id];
          if (!node || node.hidden || isComponentNode(node)) return null;
          return (
            <div
              key={id}
              className="absolute"
              style={{
                left: node.frame.x,
                top: node.frame.y,
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
