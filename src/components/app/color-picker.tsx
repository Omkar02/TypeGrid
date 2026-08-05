"use client";

import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { COLOR_SPECS, PROJECT_COLORS, type ProjectColor } from "@/lib/colors";

/** The twelve project colours as a swatch grid. */
export function ColorPicker({
  value,
  onChange,
  className,
}: {
  value: ProjectColor;
  onChange: (next: ProjectColor) => void;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="grid grid-cols-6 gap-1.5">
        {PROJECT_COLORS.map((color) => {
          const spec = COLOR_SPECS[color];
          const selected = color === value;
          return (
            <button
              key={color}
              type="button"
              onClick={() => onChange(color)}
              title={spec.label}
              aria-label={spec.label}
              aria-pressed={selected}
              className={cn(
                "flex h-7 items-center justify-center rounded-md transition-transform hover:scale-105",
                selected && "ring-2 ring-foreground ring-offset-2",
              )}
              style={{ backgroundColor: spec.base }}
            >
              {selected ? (
                <Check className="size-3.5 text-white" strokeWidth={3} />
              ) : null}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground">
        {COLOR_SPECS[value].label}
        {" — used for this project’s dot and its bands on the schedule."}
      </p>
    </div>
  );
}

/** Small filled circle in a project's colour. */
export function ColorDot({
  color,
  className,
}: {
  color: ProjectColor;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2.5 shrink-0 rounded-full", className)}
      style={{ backgroundColor: COLOR_SPECS[color].base }}
    />
  );
}
