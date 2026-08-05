"use client";

import { useEffect, useRef } from "react";

import {
  BroadcastChannelDocTransport,
  DOC_PUBLISH_INTERVAL_MS,
  type DocFrame,
  createSenderId,
} from "@/lib/doc-sync";
import { useEditorStore } from "@/store/editor-store";
import type { CanvasDoc } from "@/lib/types";

/**
 * Mirrors canvas edits between everyone in a room.
 *
 * Outbound: every local change to `doc` is published, throttled, with a trailing
 * frame so the last state of a drag always lands. Only *dirty* docs are sent —
 * loading a document sets `doc` too, and broadcasting that would push a
 * just-read canvas over a peer's unsaved edits.
 *
 * Inbound: frames are applied straight to the store, without history and
 * without marking dirty. The tab that made the change owns saving it, and undo
 * should walk back your own edits, not someone else's.
 */
export function useDocSync(roomId: string | null, enabled: boolean): void {
  // Kept in refs so the throttle survives re-renders without restarting.
  const transportRef = useRef<BroadcastChannelDocTransport | null>(null);
  const seqRef = useRef(0);
  const lastSentAtRef = useRef(0);
  const trailingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The canvas we received, so echoing it straight back is easy to detect. */
  const appliedRef = useRef<CanvasDoc | null>(null);
  const localChangeAtRef = useRef(0);

  useEffect(() => {
    if (!enabled || !roomId) return;

    const senderId = createSenderId();
    const transport = new BroadcastChannelDocTransport();
    transportRef.current = transport;
    transport.join(roomId);

    const seenSeq = new Map<string, number>();
    /** Newest frame that could not be applied yet, waiting for a quiet moment. */
    let pending: DocFrame | null = null;

    /**
     * Applying a canvas mid-gesture or mid-typing would yank the document out
     * from under the user's hands — the drag would fight the incoming frames,
     * and a contentEditable would lose what was being typed into it.
     */
    const busy = () => {
      const s = useEditorStore.getState();
      return s.interacting || s.editingId !== null;
    };

    const apply = (frame: DocFrame) => {
      appliedRef.current = frame.canvas;
      useEditorStore.getState().applyRemoteCanvas(frame.canvas);
    };

    const unsubscribeTransport = transport.subscribe((frame) => {
      if (frame.from === senderId) return;
      const seen = seenSeq.get(frame.from) ?? -1;
      if (frame.seq <= seen) return; // a frame we have already superseded
      seenSeq.set(frame.from, frame.seq);

      if (busy()) {
        pending = frame;
        return;
      }
      apply(frame);
    });

    const publish = (canvas: CanvasDoc) => {
      lastSentAtRef.current = Date.now();
      transport.publish({
        from: senderId,
        seq: ++seqRef.current,
        at: lastSentAtRef.current,
        canvas,
      });
    };

    const unsubscribeStore = useEditorStore.subscribe((state, prev) => {
      // Once the local user is free again, deliver whatever arrived while they
      // were busy — unless they have since edited, in which case the pending
      // frame is older than what is on screen and applying it would undo them.
      if (pending && !busy()) {
        const frame = pending;
        pending = null;
        if (frame.at > localChangeAtRef.current) apply(frame);
      }

      if (state.doc === prev.doc) return;
      // Our own copy of the frame we just applied — not a local edit.
      if (state.doc === appliedRef.current) return;
      // A clean doc means it was loaded, not authored.
      if (!state.dirty) return;

      localChangeAtRef.current = Date.now();

      const sinceLast = Date.now() - lastSentAtRef.current;
      if (sinceLast >= DOC_PUBLISH_INTERVAL_MS) {
        if (trailingRef.current) clearTimeout(trailingRef.current);
        trailingRef.current = null;
        publish(state.doc);
        return;
      }
      // Inside the throttle window: schedule the trailing frame so the end of a
      // drag is never the frame that gets dropped.
      if (trailingRef.current) return;
      trailingRef.current = setTimeout(() => {
        trailingRef.current = null;
        publish(useEditorStore.getState().doc);
      }, DOC_PUBLISH_INTERVAL_MS - sinceLast);
    });

    return () => {
      if (trailingRef.current) clearTimeout(trailingRef.current);
      trailingRef.current = null;
      unsubscribeStore();
      unsubscribeTransport();
      transport.leave();
      transportRef.current = null;
      appliedRef.current = null;
    };
  }, [enabled, roomId]);
}
