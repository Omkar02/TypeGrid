"use client";

import { LocalRepository, STORE_EVENT } from "@/lib/repo/local-repository";
import { buildSeedDb } from "@/lib/repo/seed";
import type { Repository } from "@/lib/repo/repository";

/**
 * The single place that picks a storage backend.
 * To move to Firebase: implement `Repository` in `firebase-repository.ts` and
 * swap the constructor below. Nothing else in the app needs to change.
 */
const local = new LocalRepository();

export const repo: Repository = local;

/** Populates demo content on the very first visit. Safe to call repeatedly. */
export async function ensureSeeded(): Promise<void> {
  if (await local.isEmpty()) {
    await local.replaceAll(buildSeedDb());
  }
}

/** Wipes everything and re-seeds. Wired to the "Reset demo data" action. */
export async function resetToSeed(): Promise<void> {
  await local.replaceAll(buildSeedDb());
}

export { STORE_EVENT };
export type { Repository };
