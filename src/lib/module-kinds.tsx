"use client";

import { Boxes, LayoutTemplate, type LucideIcon } from "lucide-react";

import type { ModuleKind } from "@/lib/types";

interface ModuleKindMeta {
  label: string;
  /** Plural, for section headings. */
  plural: string;
  Icon: LucideIcon;
  /** One line explaining the placement behaviour. */
  blurb: string;
}

/**
 * One source of truth for how the two kinds are named and drawn, so the
 * Modules library, the editor panel and the layers tree all agree.
 */
export const MODULE_KIND_META: Record<ModuleKind, ModuleKindMeta> = {
  module: {
    label: "Global module",
    plural: "Global modules",
    Icon: Boxes,
    blurb:
      "Identical everywhere. Placed as a linked instance and edited only here.",
  },
  template: {
    label: "Template",
    plural: "Templates",
    Icon: LayoutTemplate,
    blurb: "A starting point. Placed as a copy you edit inside the document.",
  },
};

export const MODULE_KINDS: ModuleKind[] = ["module", "template"];
