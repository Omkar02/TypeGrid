"use client";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { localeInfo } from "@/lib/locales";

/** Single-select locale dropdown: flag, code, language and region name. */
export function LocaleSelect({
  value,
  onChange,
  locales,
  /** Rendered after the name, e.g. "source". */
  annotate,
  id,
  className,
  triggerClassName,
  ariaLabel,
}: {
  value: string;
  onChange: (next: string) => void;
  locales: string[];
  annotate?: (code: string) => string | undefined;
  id?: string;
  className?: string;
  triggerClassName?: string;
  ariaLabel?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        id={id}
        aria-label={ariaLabel}
        className={cn("w-full", triggerClassName, className)}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start">
        {locales.map((code) => {
          const { flag, languageName, regionName } = localeInfo(code);
          const note = annotate?.(code);
          return (
            <SelectItem key={code} value={code} className="text-xs">
              <span className="flex items-center gap-2">
                {flag ? (
                  <span aria-hidden className="text-sm leading-none">
                    {flag}
                  </span>
                ) : null}
                <span className="tabular-nums">{code}</span>
                <span className="text-muted-foreground">
                  {languageName}
                  {regionName ? ` · ${regionName}` : ""}
                  {note ? ` · ${note}` : ""}
                </span>
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
