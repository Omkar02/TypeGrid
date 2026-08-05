"use client";

import { MousePointer2 } from "lucide-react";

import { worldToScreen } from "@/lib/geometry";
import { type PresenceState, peerColor } from "@/lib/presence";
import type { Viewport } from "@/lib/types";

/**
 * Other people's cursors, drawn in screen space.
 *
 * Positions travel as world coordinates so a cursor lands on the same element
 * for everyone regardless of their own pan and zoom — sending screen pixels
 * would put the pointer somewhere else entirely on a differently-scrolled view.
 */
export function PresenceCursors({
  peers,
  viewport,
}: {
  peers: PresenceState[];
  viewport: Viewport;
}) {
  if (peers.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-40 overflow-hidden">
      {peers.map((peer) => {
        if (!peer.cursor) return null;
        const at = worldToScreen(peer.cursor, viewport);
        const color = peerColor(peer.color);

        return (
          <div
            key={peer.id}
            className="absolute transition-transform duration-75 ease-out"
            style={{ transform: `translate3d(${at.x}px, ${at.y}px, 0)` }}
          >
            <MousePointer2
              className="size-4"
              style={{ color, fill: color }}
              strokeWidth={1.5}
            />
            <span
              className="absolute left-3.5 top-3.5 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] text-white shadow-sm"
              style={{ backgroundColor: color }}
            >
              {peer.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}
