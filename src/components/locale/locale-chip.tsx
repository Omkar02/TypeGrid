"use client";

import { cn } from "@/lib/utils";
import { localeFullLabel, localeInfo } from "@/lib/locales";

/**
 * Flag + code, with the full language/region name as the tooltip.
 * The code is always rendered — the flag is decoration, never the identity.
 */
export function LocaleChip({
  code,
  emphasis = false,
  className,
}: {
  code: string;
  /** Marks the source locale. */
  emphasis?: boolean;
  className?: string;
}) {
  const { flag } = localeInfo(code);
  return (
    <span
      title={localeFullLabel(code)}
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px]",
        emphasis
          ? "border border-foreground/25"
          : "bg-muted text-muted-foreground",
        className,
      )}
    >
      {flag ? <span aria-hidden>{flag}</span> : null}
      <span className="tabular-nums">{code}</span>
    </span>
  );
}
