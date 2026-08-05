/**
 * TypeGrid domain model. Email only.
 *
 * Hierarchy: Project -> Campaign -> Document -> Component -> Entity
 *
 * A Campaign is one email; a Document is that email in one locale. Locales are
 * unique within a campaign, so a document is addressed by its locale code.
 *
 * A Document owns a `CanvasDoc`, a flat normalized map of nodes. A node is
 * either a Component (a group) or an Entity (a leaf: button, image, area...).
 * Every node stores an ABSOLUTE world-space frame, including children of a
 * component. Nested transforms would be more "correct" but absolute frames make
 * hit-testing, marquee selection and resize handles trivial, and moving a
 * component is just "apply the same delta to every descendant".
 */

import type { ProjectColor } from "@/lib/colors";

/** A calendar date with no time or zone, `YYYY-MM-DD`. */
export type IsoDate = string;

/** Leaf node kinds — the drawable entities. */
export type EntityKind =
  | "text"
  | "button"
  | "image"
  | "area"
  | "divider"
  | "spacer";

/** Every node kind, including the grouping node. */
export type NodeKind = EntityKind | "component";

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  w: number;
  h: number;
}

export interface Rect extends Point, Size {}

/** Screen-space translation of the world origin, plus scale. */
export interface Viewport {
  x: number;
  y: number;
  zoom: number;
}

// ---------------------------------------------------------------------------
// Node styling / props
// ---------------------------------------------------------------------------

export interface NodeStyle {
  fill: string;
  color: string;
  fontSize: number;
  fontWeight: number;
  fontFamily: string;
  lineHeight: number;
  letterSpacing: number;
  textAlign: "left" | "center" | "right";
  radius: number;
  borderWidth: number;
  borderColor: string;
  paddingX: number;
  paddingY: number;
  opacity: number;
}

export interface TextProps {
  content: string;
}

export interface ButtonProps {
  label: string;
  href: string;
}

export interface ImageProps {
  src: string;
  alt: string;
  fit: "cover" | "contain" | "fill";
}

export interface AreaProps {
  label: string;
}

export type DividerProps = Record<string, never>;
export type SpacerProps = Record<string, never>;

export interface EntityPropsMap {
  text: TextProps;
  button: ButtonProps;
  image: ImageProps;
  area: AreaProps;
  divider: DividerProps;
  spacer: SpacerProps;
}

export type AnyEntityProps = EntityPropsMap[EntityKind];

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

interface BaseNode {
  id: string;
  name: string;
  /** Absolute world-space rect, before rotation. */
  frame: Rect;
  /**
   * Clockwise degrees about the frame's centre. The frame itself stays
   * axis-aligned — rotation is presentation only, so every existing bounds,
   * snapping and marquee calculation keeps working unchanged.
   */
  rotation: number;
  /** Owning component id, or null when the node sits on the canvas root. */
  parentId: string | null;
  locked: boolean;
  hidden: boolean;
}

export interface ComponentNode extends BaseNode {
  kind: "component";
  /** Child node ids in paint order (last = on top). */
  childIds: string[];
  /** Set when this component came from a saved module — either kind. */
  moduleId?: string;
  /**
   * True when this is a *live* instance of a global module: its contents are
   * owned by the module and re-synced on load, so it cannot be edited in the
   * document. Template instances are plain copies and leave this unset.
   */
  linked?: boolean;
}

/**
 * True for a component that mirrors a global module rather than copying it.
 *
 * Deliberately a plain boolean, not a type predicate: narrowing to
 * `ComponentNode` would make the *negative* branch exclude components
 * altogether, when an unlinked component is still very much a component.
 */
export function isLinkedInstance(node: CanvasNode): boolean {
  return node.kind === "component" && node.linked === true && !!node.moduleId;
}

export interface EntityNode<K extends EntityKind = EntityKind>
  extends BaseNode {
  kind: K;
  props: EntityPropsMap[K];
  style: NodeStyle;
}

export type AnyEntityNode = {
  [K in EntityKind]: EntityNode<K>;
}[EntityKind];

export type CanvasNode = ComponentNode | AnyEntityNode;

export function isComponentNode(node: CanvasNode): node is ComponentNode {
  return node.kind === "component";
}

export function isEntityNode(node: CanvasNode): node is AnyEntityNode {
  return node.kind !== "component";
}

/** The full contents of one document's canvas. */
export interface CanvasDoc {
  nodes: Record<string, CanvasNode>;
  /** Top-level node ids in paint order (last = on top). */
  rootIds: string[];
  background: string;
}

// ---------------------------------------------------------------------------
// Hierarchy records
// ---------------------------------------------------------------------------

/**
 * Per-user settings that are not domain data — currently just the keyboard map.
 * Stored alongside everything else so the Firebase move carries it along.
 */
export interface UserPreferences {
  /** Shortcut id -> combo. Only overrides; defaults live in `lib/shortcuts`. */
  shortcuts: Record<string, string>;
}

/**
 * The top of the ownership chain. Everything — projects and the global module
 * library — belongs to exactly one tenant.
 *
 * There is a single implicit tenant today and no switcher; the abstraction
 * exists so that "global" has a real boundary rather than meaning "everything
 * in this browser".
 */
export interface Tenant {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  tenantId: string;
  name: string;
  slug: string;
  description: string;
  /** Drives the project's dot and its bands on the cross-project schedule. */
  color: ProjectColor;
  createdAt: string;
  updatedAt: string;
}

/** A metadata key exposed to a campaign's documents as `${key}`. */
export interface MetadataField {
  key: string;
  label: string;
  defaultValue: string;
}

/**
 * One email — "Welcome Email", "Password Reset".
 *
 * A campaign owns the locale list and the metadata keys; both are shared by
 * every locale document underneath it, so translations stay structurally and
 * semantically in step.
 */
export interface Campaign {
  id: string;
  projectId: string;
  name: string;
  slug: string;
  /** Locales this campaign is authored in. One document exists per entry. */
  locales: string[];
  /** The source locale translations are derived from. Always in `locales`. */
  defaultLocale: string;
  metadata: MetadataField[];
  createdAt: string;
  updatedAt: string;
}

/**
 * The canvas for exactly one locale of one campaign. This is the thing you
 * actually edit. `locale` is unique within a campaign, so it doubles as the
 * URL slug — there is no separate slug field.
 */
export interface TypeDocument {
  id: string;
  campaignId: string;
  locale: string;
  /**
   * Expected release date as `YYYY-MM-DD`, or null when unscheduled.
   *
   * Deliberately a calendar date rather than an instant: "ships on the 14th" is
   * a date, and storing a timestamp would drag timezone conversion into every
   * read and shift the date across midnight for some users.
   */
  releaseAt: IsoDate | null;
  canvas: CanvasDoc;
  createdAt: string;
  updatedAt: string;
}

/**
 * A saved, reusable Component — what the user calls a "module".
 * Stored as a self-contained node subtree normalized to origin (0,0).
 */
/**
 * How a saved component behaves once it is placed on a canvas.
 *
 * - `module`   — a **global module**. Placed as a live, linked instance that is
 *                identical everywhere and can only be changed in the module
 *                editor. Documents cannot edit its contents.
 * - `template` — a plain starting point. Placed as an independent copy that is
 *                edited freely inside the document, like any other component.
 */
export type ModuleKind = "module" | "template";

export interface Module {
  id: string;
  tenantId: string;
  kind: ModuleKind;
  /** null = global — usable in every project in the tenant. */
  projectId: string | null;
  name: string;
  slug: string;
  tags: string[];
  size: Size;
  /** Subtree with frames relative to (0,0). `rootId` is a component node. */
  nodes: Record<string, CanvasNode>;
  rootId: string;
  createdAt: string;
  updatedAt: string;
}
