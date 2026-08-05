/**
 * The keyboard map.
 *
 * Every binding is a normalised combo string — `"g"`, `"mod+z"`,
 * `"shift+mod+z"` — where `mod` is ⌘ on macOS and Ctrl elsewhere, so one
 * definition covers both platforms.
 *
 * Defaults live here; user overrides are stored in preferences and merged on
 * top. Anything marked `fixed` is documentation for a mouse gesture or a
 * structural key and cannot be rebound.
 */

export type ShortcutGroup =
  | "Tools"
  | "Insert"
  | "Edit"
  | "Arrange"
  | "View"
  | "Canvas";

export interface ShortcutDef {
  id: string;
  label: string;
  group: ShortcutGroup;
  /** Empty for `fixed` entries, which document a gesture rather than a key. */
  defaultCombo: string;
  /** Extra combos that always work and are not shown as the primary binding. */
  aliases?: string[];
  /** Documentation only — not rebindable, not dispatched. */
  fixed?: boolean;
  /** Shown instead of a key chip for fixed entries. */
  gesture?: string;
}

export const SHORTCUTS: ShortcutDef[] = [
  // -- Tools ---------------------------------------------------------------
  { id: "tool.select", label: "Select tool", group: "Tools", defaultCombo: "v" },
  { id: "tool.hand", label: "Pan tool", group: "Tools", defaultCombo: "h" },
  {
    id: "modifier.duplicateDrag",
    label: "Hold, then drag to duplicate",
    group: "Tools",
    defaultCombo: "d",
  },

  // -- Insert --------------------------------------------------------------
  { id: "insert.text", label: "Text", group: "Insert", defaultCombo: "t" },
  { id: "insert.button", label: "Button", group: "Insert", defaultCombo: "b" },
  { id: "insert.image", label: "Image", group: "Insert", defaultCombo: "i" },
  { id: "insert.area", label: "Area", group: "Insert", defaultCombo: "r" },
  { id: "insert.divider", label: "Divider", group: "Insert", defaultCombo: "l" },
  { id: "insert.spacer", label: "Spacer", group: "Insert", defaultCombo: "s" },

  // -- Edit ----------------------------------------------------------------
  { id: "edit.undo", label: "Undo", group: "Edit", defaultCombo: "mod+z" },
  {
    id: "edit.redo",
    label: "Redo",
    group: "Edit",
    defaultCombo: "shift+mod+z",
    aliases: ["mod+y"],
  },
  {
    id: "edit.duplicate",
    label: "Duplicate in place",
    group: "Edit",
    defaultCombo: "mod+d",
  },
  {
    id: "edit.delete",
    label: "Delete",
    group: "Edit",
    defaultCombo: "Delete",
    aliases: ["Backspace"],
  },
  { id: "edit.selectAll", label: "Select all", group: "Edit", defaultCombo: "mod+a" },
  {
    id: "edit.groupToggle",
    label: "Group / ungroup",
    group: "Edit",
    defaultCombo: "g",
    aliases: ["mod+g"],
  },
  { id: "edit.lock", label: "Lock / unlock", group: "Edit", defaultCombo: "shift+l" },
  { id: "edit.hide", label: "Show / hide", group: "Edit", defaultCombo: "shift+h" },

  // -- Arrange -------------------------------------------------------------
  { id: "arrange.forward", label: "Bring forward", group: "Arrange", defaultCombo: "e" },
  { id: "arrange.backward", label: "Send backward", group: "Arrange", defaultCombo: "q" },
  {
    id: "arrange.front",
    label: "Bring to front",
    group: "Arrange",
    defaultCombo: "shift+e",
    aliases: ["shift+mod+]"],
  },
  {
    id: "arrange.back",
    label: "Send to back",
    group: "Arrange",
    defaultCombo: "shift+q",
    aliases: ["shift+mod+["],
  },

  // -- View ----------------------------------------------------------------
  { id: "view.zoomFit", label: "Zoom to fit", group: "View", defaultCombo: "1" },
  {
    id: "view.zoomSelection",
    label: "Zoom to selection",
    group: "View",
    defaultCombo: "2",
  },
  { id: "view.zoomReset", label: "Zoom to 100%", group: "View", defaultCombo: "0" },
  {
    id: "view.zoomIn",
    label: "Zoom in",
    group: "View",
    defaultCombo: "=",
    aliases: ["+"],
  },
  { id: "view.zoomOut", label: "Zoom out", group: "View", defaultCombo: "-" },
  { id: "view.toggleGrid", label: "Show / hide grid", group: "View", defaultCombo: "mod+'" },
  { id: "view.toggleSnap", label: "Snapping on / off", group: "View", defaultCombo: "mod+;" },

  // -- Canvas gestures (documentation only) --------------------------------
  {
    id: "canvas.pan",
    label: "Pan the canvas",
    group: "Canvas",
    defaultCombo: "",
    fixed: true,
    gesture: "Space-drag, middle-drag, or scroll",
  },
  {
    id: "canvas.zoom",
    label: "Zoom the canvas",
    group: "Canvas",
    defaultCombo: "",
    fixed: true,
    gesture: "⌘ / Ctrl + scroll",
  },
  {
    id: "canvas.marquee",
    label: "Marquee select",
    group: "Canvas",
    defaultCombo: "",
    fixed: true,
    gesture: "Drag on empty canvas",
  },
  {
    id: "canvas.edit",
    label: "Edit text / enter group",
    group: "Canvas",
    defaultCombo: "",
    fixed: true,
    gesture: "Double-click",
  },
  {
    id: "canvas.stepOut",
    label: "Stop editing / step out",
    group: "Canvas",
    defaultCombo: "",
    fixed: true,
    gesture: "Escape",
  },
  {
    id: "canvas.nudge",
    label: "Nudge selection",
    group: "Canvas",
    defaultCombo: "",
    fixed: true,
    gesture: "Arrows (⇧ for 5×)",
  },
  {
    id: "canvas.constrain",
    label: "Constrain axis / aspect",
    group: "Canvas",
    defaultCombo: "",
    fixed: true,
    gesture: "Hold ⇧ while dragging",
  },
];

export const SHORTCUT_GROUPS: ShortcutGroup[] = [
  "Tools",
  "Insert",
  "Edit",
  "Arrange",
  "View",
  "Canvas",
];

export const REBINDABLE = SHORTCUTS.filter((s) => !s.fixed);

const BY_ID = new Map(SHORTCUTS.map((s) => [s.id, s]));

export function shortcutDef(id: string): ShortcutDef | undefined {
  return BY_ID.get(id);
}

/** Normalised combo for a keyboard event. `mod` folds ⌘ and Ctrl together. */
export function comboFromEvent(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push("mod");
  if (e.shiftKey) parts.push("shift");
  if (e.altKey) parts.push("alt");
  // Single characters normalise to lowercase so `shift+g` is not `shift+G`.
  parts.push(e.key.length === 1 ? e.key.toLowerCase() : e.key);
  return parts.join("+");
}

/** True when the event is only a modifier being pressed, with no real key. */
export function isModifierOnly(e: KeyboardEvent): boolean {
  return ["Shift", "Control", "Alt", "Meta"].includes(e.key);
}

const IS_APPLE =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

const SYMBOLS: Record<string, string> = {
  mod: IS_APPLE ? "⌘" : "Ctrl",
  shift: "⇧",
  alt: IS_APPLE ? "⌥" : "Alt",
  Delete: "Del",
  Backspace: "⌫",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
  Escape: "Esc",
  " ": "Space",
};

/** "shift+mod+z" -> "⇧ ⌘ Z" */
export function formatCombo(combo: string): string {
  if (!combo) return "";
  return combo
    .split("+")
    .map((part) => SYMBOLS[part] ?? (part.length === 1 ? part.toUpperCase() : part))
    .join(" ");
}

export type Bindings = Record<string, string>;

export function defaultBindings(): Bindings {
  const out: Bindings = {};
  for (const def of REBINDABLE) out[def.id] = def.defaultCombo;
  return out;
}

export function mergeBindings(overrides: Bindings | undefined): Bindings {
  return { ...defaultBindings(), ...(overrides ?? {}) };
}

/**
 * Reverse index from combo to shortcut id, including aliases.
 * User bindings win over an alias that would otherwise claim the same combo.
 */
export function comboIndex(bindings: Bindings): Map<string, string> {
  const index = new Map<string, string>();
  for (const def of REBINDABLE) {
    for (const alias of def.aliases ?? []) {
      if (!index.has(alias)) index.set(alias, def.id);
    }
  }
  for (const [id, combo] of Object.entries(bindings)) {
    if (combo) index.set(combo, id);
  }
  return index;
}

/** The shortcut already using `combo`, if any — for conflict warnings. */
export function findConflict(
  bindings: Bindings,
  combo: string,
  exceptId: string,
): ShortcutDef | undefined {
  for (const [id, value] of Object.entries(bindings)) {
    if (id !== exceptId && value === combo) return shortcutDef(id);
  }
  return undefined;
}
