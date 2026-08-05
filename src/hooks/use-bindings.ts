"use client";

import { useMemo } from "react";

import { useRepoQuery } from "@/hooks/use-repo";
import { repo } from "@/lib/repo";
import { type Bindings, mergeBindings } from "@/lib/shortcuts";

/**
 * The active keyboard map: defaults with the user's overrides on top.
 *
 * Returns defaults while preferences are still loading, so shortcuts work from
 * the first keystroke rather than being dead until a round trip completes.
 */
export function useBindings(): Bindings {
  const { data } = useRepoQuery(() => repo.getPreferences(), []);
  return useMemo(() => mergeBindings(data?.shortcuts), [data?.shortcuts]);
}
