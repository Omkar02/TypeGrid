"use client";

import { newId } from "@/lib/id";
import type { CanvasDoc } from "@/lib/types";

/**
 * Live document sync: the canvas itself, not just the cursors above it.
 *
 * Same shape as `presence.ts` on purpose — a transport interface with a
 * `BroadcastChannel` implementation that works across tabs and windows on one
 * machine today, and a hosted backend later without the editor knowing.
 *
 * What travels is the whole canvas, not a patch. At this document size a frame
 * is a few kilobytes of structured clone, and a full state is self-correcting:
 * a listener that missed a frame is still right after the next one, where a
 * dropped patch would leave it permanently wrong. The cost is the merge model —
 * whole-document frames mean last-writer-wins, never a merge of two people's
 * concurrent edits. Real merging needs a CRDT, and that is a different feature.
 */

export interface DocFrame {
  /** Sender's session id, so a tab ignores the echo of its own frames. */
  from: string;
  /** Sender clock. A listener drops anything older than what it already has. */
  seq: number;
  at: number;
  canvas: CanvasDoc;
}

export interface DocSyncTransport {
  join(roomId: string): void;
  publish(frame: DocFrame): void;
  subscribe(listener: (frame: DocFrame) => void): () => void;
  leave(): void;
}

/**
 * Frames are throttled to this. Slower than the cursor cadence: a cursor is one
 * point, a document frame is the whole canvas, and 100ms of latency on someone
 * else's edit is invisible where 100ms on their cursor is not.
 */
export const DOC_PUBLISH_INTERVAL_MS = 100;

export function createSenderId(): string {
  return newId("edt");
}

export class BroadcastChannelDocTransport implements DocSyncTransport {
  private channel: BroadcastChannel | null = null;
  private listeners = new Set<(frame: DocFrame) => void>();

  join(roomId: string): void {
    this.leave();
    if (typeof BroadcastChannel === "undefined") return;
    // A channel per room: two documents open in two tabs must not cross.
    this.channel = new BroadcastChannel(`typegrid:doc:${roomId}`);
    this.channel.onmessage = (event: MessageEvent) => {
      const frame = event.data as DocFrame;
      for (const listener of this.listeners) listener(frame);
    };
  }

  publish(frame: DocFrame): void {
    this.channel?.postMessage(frame);
  }

  subscribe(listener: (frame: DocFrame) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  leave(): void {
    this.channel?.close();
    this.channel = null;
  }
}
