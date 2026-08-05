import { customAlphabet } from "nanoid";

/** URL-safe, lowercase, no lookalike characters. */
const nano = customAlphabet("0123456789abcdefghjkmnpqrstvwxyz", 12);

export function newId(prefix: string): string {
  return `${prefix}_${nano()}`;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Appends -2, -3, ... until the slug is free within `taken`. */
export function uniqueSlug(base: string, taken: Iterable<string>): string {
  const seed = slugify(base) || "untitled";
  const used = new Set(taken);
  if (!used.has(seed)) return seed;
  let n = 2;
  while (used.has(`${seed}-${n}`)) n += 1;
  return `${seed}-${n}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
