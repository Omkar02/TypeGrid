import { newId } from "@/lib/id";
import { unionRects } from "@/lib/geometry";
import {
  type AnyEntityNode,
  type CanvasDoc,
  type CanvasNode,
  type ComponentNode,
  type EntityKind,
  type EntityPropsMap,
  type NodeStyle,
  type Rect,
  isComponentNode,
} from "@/lib/types";

export const DEFAULT_STYLE: NodeStyle = {
  fill: "transparent",
  color: "#111827",
  fontSize: 16,
  fontWeight: 400,
  fontFamily: "Helvetica, Arial, sans-serif",
  lineHeight: 1.5,
  letterSpacing: 0,
  textAlign: "left",
  radius: 0,
  borderWidth: 0,
  borderColor: "#e5e7eb",
  paddingX: 0,
  paddingY: 0,
  opacity: 1,
};

export interface EntityBlueprint<K extends EntityKind = EntityKind> {
  kind: K;
  label: string;
  /** Short line shown under the palette item. */
  hint: string;
  defaultSize: { w: number; h: number };
  defaultProps: EntityPropsMap[K];
  defaultStyle: Partial<NodeStyle>;
}

/**
 * The palette. Adding a new entity type means adding one entry here plus a
 * branch in the canvas renderer and the inspector.
 */
export const ENTITY_BLUEPRINTS: {
  [K in EntityKind]: EntityBlueprint<K>;
} = {
  text: {
    kind: "text",
    label: "Text",
    hint: "Paragraph or heading",
    defaultSize: { w: 320, h: 72 },
    defaultProps: {
      content: "Write something worth reading. Use ${first_name} for metadata.",
    },
    defaultStyle: { color: "#111827", fontSize: 16, lineHeight: 1.6 },
  },
  button: {
    kind: "button",
    label: "Button",
    hint: "Call to action",
    defaultSize: { w: 180, h: 48 },
    defaultProps: { label: "Get started", href: "https://example.com" },
    defaultStyle: {
      fill: "#111827",
      color: "#ffffff",
      fontSize: 15,
      fontWeight: 600,
      radius: 8,
      textAlign: "center",
      paddingX: 20,
      paddingY: 12,
    },
  },
  image: {
    kind: "image",
    label: "Image",
    hint: "Photo or logo",
    defaultSize: { w: 320, h: 200 },
    defaultProps: { src: "", alt: "", fit: "cover" },
    defaultStyle: { fill: "#f3f4f6", radius: 6 },
  },
  area: {
    kind: "area",
    label: "Area",
    hint: "Container / section",
    defaultSize: { w: 600, h: 240 },
    defaultProps: { label: "Section" },
    defaultStyle: {
      fill: "#ffffff",
      borderWidth: 1,
      borderColor: "#e5e7eb",
      radius: 8,
    },
  },
  divider: {
    kind: "divider",
    label: "Divider",
    hint: "Horizontal rule",
    defaultSize: { w: 320, h: 1 },
    defaultProps: {},
    defaultStyle: { fill: "#e5e7eb" },
  },
  spacer: {
    kind: "spacer",
    label: "Spacer",
    hint: "Vertical breathing room",
    defaultSize: { w: 320, h: 32 },
    defaultProps: {},
    defaultStyle: { fill: "transparent" },
  },
};

export const ENTITY_KINDS = Object.keys(ENTITY_BLUEPRINTS) as EntityKind[];

export function createEntity<K extends EntityKind>(
  kind: K,
  frame: Partial<Rect> = {},
): AnyEntityNode {
  const blueprint = ENTITY_BLUEPRINTS[kind];
  return {
    id: newId(kind),
    kind,
    name: blueprint.label,
    parentId: null,
    rotation: 0,
    locked: false,
    hidden: false,
    frame: {
      x: frame.x ?? 0,
      y: frame.y ?? 0,
      w: frame.w ?? blueprint.defaultSize.w,
      h: frame.h ?? blueprint.defaultSize.h,
    },
    props: structuredClone(blueprint.defaultProps),
    style: { ...DEFAULT_STYLE, ...blueprint.defaultStyle },
  } as AnyEntityNode;
}

export function createComponent(
  name: string,
  frame: Rect,
  childIds: string[] = [],
): ComponentNode {
  return {
    id: newId("cmp"),
    kind: "component",
    name,
    parentId: null,
    rotation: 0,
    locked: false,
    hidden: false,
    frame,
    childIds,
  };
}

export function emptyCanvas(): CanvasDoc {
  return { nodes: {}, rootIds: [], background: "#f4f4f5" };
}

// ---------------------------------------------------------------------------
// Tree walking
// ---------------------------------------------------------------------------

/** `id` and every descendant, parents before children. */
export function collectSubtree(
  nodes: Record<string, CanvasNode>,
  id: string,
  out: string[] = [],
): string[] {
  const node = nodes[id];
  if (!node) return out;
  out.push(id);
  if (isComponentNode(node)) {
    for (const childId of node.childIds) collectSubtree(nodes, childId, out);
  }
  return out;
}

/** Descendants of `id`, excluding `id` itself. */
export function collectDescendants(
  nodes: Record<string, CanvasNode>,
  id: string,
): string[] {
  return collectSubtree(nodes, id).slice(1);
}

/** Walks up until it finds the outermost ancestor of `id`. */
export function rootAncestorOf(
  nodes: Record<string, CanvasNode>,
  id: string,
): string {
  let current = nodes[id];
  while (current?.parentId && nodes[current.parentId]) {
    current = nodes[current.parentId];
  }
  return current?.id ?? id;
}

export function siblingIdsOf(doc: CanvasDoc, id: string): string[] {
  const node = doc.nodes[id];
  if (!node) return doc.rootIds;
  if (!node.parentId) return doc.rootIds;
  const parent = doc.nodes[node.parentId];
  return parent && isComponentNode(parent) ? parent.childIds : doc.rootIds;
}

/** Bounding box of the given nodes, in world space. */
export function boundsOf(
  nodes: Record<string, CanvasNode>,
  ids: string[],
): Rect | null {
  const frames = ids.map((id) => nodes[id]?.frame).filter(Boolean) as Rect[];
  return unionRects(frames);
}

/** Bounding box of everything on the canvas. */
export function canvasBounds(doc: CanvasDoc): Rect | null {
  return boundsOf(doc.nodes, doc.rootIds);
}

/**
 * Deep-copies a subtree with fresh ids.
 * Returns the new nodes keyed by new id, plus the new root id.
 */
export function cloneSubtree(
  nodes: Record<string, CanvasNode>,
  rootId: string,
  offset: { dx: number; dy: number } = { dx: 0, dy: 0 },
): { nodes: Record<string, CanvasNode>; rootId: string } {
  const idMap = new Map<string, string>();
  const order = collectSubtree(nodes, rootId);
  for (const oldId of order) {
    const node = nodes[oldId];
    idMap.set(oldId, newId(node.kind === "component" ? "cmp" : node.kind));
  }

  const out: Record<string, CanvasNode> = {};
  for (const oldId of order) {
    const node = nodes[oldId];
    const copy = structuredClone(node) as CanvasNode;
    copy.id = idMap.get(oldId)!;
    copy.frame = {
      ...copy.frame,
      x: copy.frame.x + offset.dx,
      y: copy.frame.y + offset.dy,
    };
    copy.parentId =
      node.parentId && idMap.has(node.parentId)
        ? idMap.get(node.parentId)!
        : null;
    if (isComponentNode(copy)) {
      copy.childIds = copy.childIds.map((childId) => idMap.get(childId)!);
    }
    out[copy.id] = copy;
  }

  return { nodes: out, rootId: idMap.get(rootId)! };
}

/**
 * Drops ids whose ancestor is also in the list, so a gesture never transforms
 * the same node twice (once directly, once through its component).
 */
export function topLevelIds(
  nodes: Record<string, CanvasNode>,
  ids: string[],
): string[] {
  const set = new Set(ids);
  return ids.filter((id) => {
    let parentId = nodes[id]?.parentId ?? null;
    while (parentId) {
      if (set.has(parentId)) return false;
      parentId = nodes[parentId]?.parentId ?? null;
    }
    return true;
  });
}

/** New frames for translating each id's whole subtree by (dx, dy). */
export function framesForMove(
  nodes: Record<string, CanvasNode>,
  ids: string[],
  dx: number,
  dy: number,
): Record<string, Rect> {
  const out: Record<string, Rect> = {};
  for (const id of topLevelIds(nodes, ids)) {
    for (const memberId of collectSubtree(nodes, id)) {
      const frame = nodes[memberId].frame;
      out[memberId] = { ...frame, x: frame.x + dx, y: frame.y + dy };
    }
  }
  return out;
}

/**
 * New frames for resizing `id` from `startFrame` to `nextFrame`. Descendants
 * are scaled proportionally so a component resizes as a unit.
 */
export function framesForResize(
  nodes: Record<string, CanvasNode>,
  id: string,
  startFrame: Rect,
  nextFrame: Rect,
): Record<string, Rect> {
  const out: Record<string, Rect> = { [id]: nextFrame };
  const sx = startFrame.w === 0 ? 1 : nextFrame.w / startFrame.w;
  const sy = startFrame.h === 0 ? 1 : nextFrame.h / startFrame.h;

  for (const childId of collectDescendants(nodes, id)) {
    const frame = nodes[childId].frame;
    out[childId] = {
      x: nextFrame.x + (frame.x - startFrame.x) * sx,
      y: nextFrame.y + (frame.y - startFrame.y) * sy,
      w: frame.w * sx,
      h: frame.h * sy,
    };
  }
  return out;
}

/** Replaces `${key}` with metadata values; unknown keys are left visible. */
export function resolveTokens(
  text: string,
  values: Record<string, string>,
): string {
  return text.replace(/\$\{\s*([\w.-]+)\s*\}/g, (match, key: string) =>
    key in values ? values[key] : match,
  );
}
