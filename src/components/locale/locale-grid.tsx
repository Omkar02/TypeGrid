"use client";

import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import {
  LOCALE_CATALOG,
  isValidLocale,
  localeInfo,
  localeMatches,
  normalizeLocale,
} from "@/lib/locales";

/**
 * Multi-select locale picker: a searchable checkbox grid of flag / code /
 * language / region, plus an escape hatch for any BCP-47 tag not in the
 * catalog.
 *
 * `locked` entries render checked and disabled — used when a campaign already
 * has that locale, so the grid shows the full picture rather than hiding it.
 */
export function LocaleGrid({
  value,
  onChange,
  locked = [],
  emptyHint,
  className,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  locked?: string[];
  emptyHint?: string;
  className?: string;
}) {
  const [query, setQuery] = useState("");
  const [custom, setCustom] = useState("");
  const [extras, setExtras] = useState<string[]>([]);

  const lockedSet = useMemo(() => new Set(locked), [locked]);

  // Catalog plus anything already selected, locked, or hand-added.
  const all = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const code of [...LOCALE_CATALOG, ...locked, ...value, ...extras]) {
      if (!seen.has(code)) {
        seen.add(code);
        out.push(code);
      }
    }
    return out;
  }, [locked, value, extras]);

  const visible = useMemo(
    () => all.filter((code) => localeMatches(code, query)),
    [all, query],
  );

  const toggle = (code: string) => {
    if (lockedSet.has(code)) return;
    onChange(
      value.includes(code)
        ? value.filter((c) => c !== code)
        : [...value, code],
    );
  };

  const normalizedCustom = normalizeLocale(custom);
  const canAddCustom =
    isValidLocale(normalizedCustom) && !all.includes(normalizedCustom);

  const addCustom = () => {
    if (!canAddCustom) return;
    setExtras((prev) => [...prev, normalizedCustom]);
    onChange([...value, normalizedCustom]);
    setCustom("");
    setQuery("");
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search language, country or code…"
          className="h-8 pl-8 text-xs"
        />
      </div>

      <ScrollArea className="h-56 rounded-md border">
        {visible.length === 0 ? (
          <p className="px-3 py-8 text-center text-[11px] text-muted-foreground">
            No match. Add it as a custom tag below.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-0.5 p-1.5 sm:grid-cols-2">
            {visible.map((code) => {
              const { flag, languageName, regionName } = localeInfo(code);
              const isLocked = lockedSet.has(code);
              const checked = isLocked || value.includes(code);
              return (
                <label
                  key={code}
                  className={cn(
                    "flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors",
                    isLocked
                      ? "cursor-not-allowed opacity-55"
                      : "cursor-pointer hover:bg-accent",
                    checked && !isLocked && "bg-accent/60",
                  )}
                >
                  <Checkbox
                    checked={checked}
                    disabled={isLocked}
                    onCheckedChange={() => toggle(code)}
                    aria-label={`${code} ${languageName}`}
                  />
                  {flag ? (
                    <span aria-hidden className="text-base leading-none">
                      {flag}
                    </span>
                  ) : null}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs tabular-nums">
                      {code}
                    </span>
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {languageName}
                      {regionName ? ` · ${regionName}` : ""}
                    </span>
                  </span>
                  {/* Kept out of the subtitle so long names don't truncate it away. */}
                  {isLocked ? (
                    <span className="shrink-0 rounded border px-1 py-0.5 text-[9px] uppercase tracking-wider text-muted-foreground">
                      added
                    </span>
                  ) : null}
                </label>
              );
            })}
          </div>
        )}
      </ScrollArea>

      <div className="flex items-center gap-2">
        <Input
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCustom();
            }
          }}
          placeholder="Other tag — e.g. ca, sr-RS"
          className="h-8 text-xs"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 shrink-0 gap-1.5 text-xs"
          disabled={!canAddCustom}
          onClick={addCustom}
        >
          <Plus className="size-3.5" />
          Add
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        {value.length > 0
          ? `${value.length} selected — ${value.join(", ")}`
          : (emptyHint ?? "Nothing selected yet.")}
      </p>
    </div>
  );
}
