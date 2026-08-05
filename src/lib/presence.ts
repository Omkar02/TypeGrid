"use client";

import { COLOR_SPECS, PROJECT_COLORS, type ProjectColor } from "@/lib/colors";
import { newId } from "@/lib/id";

/**
 * Multi-user presence: who else is in this document, and where their cursor is.
 *
 * The transport is deliberately an interface. `BroadcastChannelTransport` works
 * today across tabs and windows on one machine — enough to build and use the
 * whole feature — and a Firebase transport implements the same three methods
 * without the UI knowing. Cross-machine presence needs that backend; nothing
 * here fakes it.
 */

export interface PresenceState {
  /** Unique per tab, not per person: one user can have two windows open. */
  id: string;
  name: string;
  color: ProjectColor;
  /** World coordinates, so a cursor lands in the same place at any zoom. */
  cursor: { x: number; y: number } | null;
  selection: string[];
  /** Sender clock, used to drop out-of-order frames. */
  seq: number;
  at: number;
}

export interface PresenceTransport {
  join(roomId: string): void;
  publish(state: PresenceState): void;
  subscribe(listener: (peer: PresenceState | { left: string }) => void): () => void;
  leave(): void;
}

/** A peer is considered gone if it has not been heard from in this long. */
export const PEER_TIMEOUT_MS = 6000;
/** Cursor frames are throttled to this, which is smooth without flooding. */
export const PUBLISH_INTERVAL_MS = 50;

/**
 * Identity for this tab.
 *
 * The label is generated, not asked for: sign-in will supply the real name
 * later, and until then a prompt for one would just be a field to ignore.
 * `name` stays part of the shape so that swap is a one-line change here.
 */
export function createSessionIdentity(): {
  id: string;
  name: string;
  color: ProjectColor;
} {
  const id = newId("who");
  // Colour and label derived from the id so the same tab keeps both across
  // reconnects, and two tabs almost never collide.
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  const color = PROJECT_COLORS[hash % PROJECT_COLORS.length];
  return {
    id,
    name: `${COLOR_SPECS[color].label} editor`,
    color,
  };
}

export function peerColor(color: ProjectColor): string {
  return COLOR_SPECS[color]?.base ?? COLOR_SPECS.blue.base;
}

/**
 * Same-machine transport over `BroadcastChannel`.
 *
 * Delivery is ordered per sender, which is what "FIFO" needs to mean here —
 * a global order across senders is neither available nor useful. Each frame
 * also carries a `seq`, so a slow listener can drop anything it has already
 * superseded rather than replaying stale cursor positions.
 */
export class BroadcastChannelTransport implements PresenceTransport {
  private channel: BroadcastChannel | null = null;
  private listeners = new Set<
    (peer: PresenceState | { left: string }) => void
  >();

  join(roomId: string): void {
    this.leave();
    if (typeof BroadcastChannel === "undefined") return;
    this.channel = new BroadcastChannel(`typegrid:presence:${roomId}`);
    this.channel.onmessage = (event: MessageEvent) => {
      const data = event.data as PresenceState | { left: string };
      for (const listener of this.listeners) listener(data);
    };
  }

  publish(state: PresenceState): void {
    this.channel?.postMessage(state);
  }

  subscribe(
    listener: (peer: PresenceState | { left: string }) => void,
  ): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  leave(): void {
    this.channel?.close();
    this.channel = null;
  }

  /** Tell the room this tab is going away, so its cursor disappears at once. */
  announceLeave(id: string): void {
    this.channel?.postMessage({ left: id });
  }
}
