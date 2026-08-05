"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  BroadcastChannelTransport,
  PEER_TIMEOUT_MS,
  PUBLISH_INTERVAL_MS,
  type PresenceState,
  createSessionIdentity,
} from "@/lib/presence";

/** Shared so an idle hook never hands out a fresh array each render. */
const EMPTY_PEERS: PresenceState[] = [];

export interface UsePresenceResult {
  peers: PresenceState[];
  /** No-op when collaboration is off, so callers need no branching. */
  report: (cursor: { x: number; y: number } | null, selection: string[]) => void;
  self: { id: string; name: string } | null;
}

/**
 * Joins a presence room and tracks everyone else in it.
 *
 * Returns a `report` that the canvas calls on pointer move. It is throttled
 * here rather than at the call site so the canvas does not need to know the
 * transport's cadence.
 */
export function usePresence(
  roomId: string | null,
  enabled: boolean,
): UsePresenceResult {
  const [peers, setPeers] = useState<PresenceState[]>(EMPTY_PEERS);

  // One identity for the life of the hook: a peer that changed colour mid-
  // session would read as a second person joining.
  const identity = useMemo(() => createSessionIdentity(), []);

  const transportRef = useRef<BroadcastChannelTransport | null>(null);
  const seqRef = useRef(0);
  const lastSentRef = useRef(0);
  const pendingRef = useRef<PresenceState | null>(null);

  useEffect(() => {
    // No room to join: `peers` is already empty and stays that way, so there is
    // nothing to reset here.
    if (!enabled || !roomId) return;

    // Scoped to this subscription rather than a ref, so the cleanup below is
    // guaranteed to be tearing down the map it was set up with.
    const known = new Map<string, PresenceState>();

    const transport = new BroadcastChannelTransport();
    transportRef.current = transport;
    transport.join(roomId);

    const unsubscribe = transport.subscribe((message) => {
      if ("left" in message) {
        if (known.delete(message.left)) setPeers([...known.values()]);
        return;
      }
      if (message.id === identity.id) return;

      // Drop frames that arrive after a newer one from the same sender.
      const previous = known.get(message.id);
      if (previous && previous.seq > message.seq) return;

      known.set(message.id, message);
      setPeers([...known.values()]);
    });

    // Sweep peers that stopped reporting — a closed tab cannot say goodbye if
    // it was killed rather than navigated away from.
    const sweep = setInterval(() => {
      const cutoff = Date.now() - PEER_TIMEOUT_MS;
      let removed = false;
      for (const [id, peer] of known) {
        if (peer.at < cutoff) {
          known.delete(id);
          removed = true;
        }
      }
      if (removed) setPeers([...known.values()]);
    }, 2000);

    // A heartbeat keeps this tab visible to others while the pointer is still.
    const heartbeat = setInterval(() => {
      const last = pendingRef.current;
      if (!last) return;
      transport.publish({ ...last, seq: ++seqRef.current, at: Date.now() });
    }, PEER_TIMEOUT_MS / 2);

    const onUnload = () => transport.announceLeave(identity.id);
    window.addEventListener("pagehide", onUnload);

    return () => {
      clearInterval(sweep);
      clearInterval(heartbeat);
      window.removeEventListener("pagehide", onUnload);
      unsubscribe();
      transport.announceLeave(identity.id);
      transport.leave();
      transportRef.current = null;
      known.clear();
      setPeers(EMPTY_PEERS);
    };
  }, [enabled, roomId, identity.id]);

  const report = useMemo(() => {
    return (cursor: { x: number; y: number } | null, selection: string[]) => {
      if (!enabled || !roomId) return;
      const state: PresenceState = {
        ...identity,
        cursor,
        selection,
        seq: seqRef.current,
        at: Date.now(),
      };
      pendingRef.current = state;

      const now = Date.now();
      if (now - lastSentRef.current < PUBLISH_INTERVAL_MS) return;
      lastSentRef.current = now;
      transportRef.current?.publish({
        ...state,
        seq: ++seqRef.current,
        at: now,
      });
    };
  }, [enabled, roomId, identity]);

  return {
    peers,
    report,
    self: enabled && roomId ? { id: identity.id, name: identity.name } : null,
  };
}
