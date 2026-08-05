import {
  boundsOf,
  cloneSubtree,
  collectSubtree,
  createComponent,
  topLevelIds,
} from "@/lib/nodes";
import {
  type CanvasDoc,
  type CanvasNode,
  type Module,
  type Size,
  isComponentNode,
  isLinkedInstance,
} from "@/lib/types";

export interface ExtractedModule {
  nodes: Record<string, CanvasNode>;
  rootId: string;
  size: Size;
}

/**
 * Packages the current selection as a self-contained, reusable subtree with
 * fresh ids and frames normalized to (0, 0).
 *
 * A lone component is captured as-is; anything else is wrapped in a new
 * component so a module always has exactly one root.
 */
export function extractModule(
  doc: CanvasDoc,
  selection: string[],
  name: string,
): ExtractedModule | null {
  const roots = topLevelIds(doc.nodes, selection);
  if (roots.length === 0) return null;

  let nodes: Record<string, CanvasNode>;
  let rootId: string;

  if (roots.length === 1 && isComponentNode(doc.nodes[roots[0]])) {
    const clone = cloneSubtree(doc.nodes, roots[0]);
    nodes = clone.nodes;
    rootId = clone.rootId;
  } else {
    nodes = {};
    const childIds: string[] = [];
    for (const id of roots) {
      const clone = cloneSubtree(doc.nodes, id);
      Object.assign(nodes, clone.nodes);
      childIds.push(clone.rootId);
    }
    const bounds = boundsOf(nodes, childIds);
    if (!bounds) return null;
    const wrapper = createComponent(name, bounds, childIds);
    for (const id of childIds) nodes[id].parentId = wrapper.id;
    nodes[wrapper.id] = wrapper;
    rootId = wrapper.id;
  }

  const root = nodes[rootId];
  root.name = name;

  // Normalize so the module's own origin is (0, 0).
  const dx = -root.frame.x;
  const dy = -root.frame.y;
  for (const node of Object.values(nodes)) {
    node.frame = { ...node.frame, x: node.frame.x + dx, y: node.frame.y + dy };
  }

  return { nodes, rootId, size: { w: root.frame.w, h: root.frame.h } };
}

/**
 * Rebuilds every linked global-module instance in `doc` from its current module
 * definition, keeping the instance's position on the canvas.
 *
 * Instances store a copy of the subtree rather than a reference, so this is
 * what makes "identical everywhere" true: a document picks up module edits the
 * next time it is opened. Returns the same doc when nothing changed, so callers
 * can use identity to decide whether a save is warranted.
 *
 * An instance whose module has been deleted is left alone and detached, so the
 * work stays on the canvas instead of vanishing.
 */
export function syncLinkedInstances(
  doc: CanvasDoc,
  modules: Module[],
): { doc: CanvasDoc; changed: number } {
  const byId = new Map(modules.map((m) => [m.id, m]));
  const targets = doc.rootIds.filter((id) => {
    const node = doc.nodes[id];
    return node && isLinkedInstance(node);
  });
  if (targets.length === 0) return { doc, changed: 0 };

  const nodes: Record<string, CanvasNode> = { ...doc.nodes };
  const rootIds = [...doc.rootIds];
  let changed = 0;

  for (const id of targets) {
    const instance = doc.nodes[id];
    if (!isComponentNode(instance)) continue;
    const definition = instance.moduleId ? byId.get(instance.moduleId) : undefined;

    if (!definition) {
      // Module is gone — keep the artwork, drop the link.
      nodes[id] = { ...instance, linked: false };
      changed += 1;
      continue;
    }
    if (definition.kind !== "module") {
      // Reclassified as a template: existing instances become plain copies.
      nodes[id] = { ...instance, linked: false };
      changed += 1;
      continue;
    }

    const fresh = cloneSubtree(definition.nodes, definition.rootId, {
      dx: instance.frame.x,
      dy: instance.frame.y,
    });
    const freshRoot = fresh.nodes[fresh.rootId];
    if (!isComponentNode(freshRoot)) continue;

    freshRoot.name = definition.name;
    freshRoot.moduleId = definition.id;
    freshRoot.linked = true;
    freshRoot.locked = instance.locked;
    freshRoot.hidden = instance.hidden;

    // Swap the old subtree out for the new one, in place.
    for (const oldId of collectSubtree(doc.nodes, id)) delete nodes[oldId];
    Object.assign(nodes, fresh.nodes);
    rootIds[rootIds.indexOf(id)] = fresh.rootId;
    changed += 1;
  }

  return changed === 0 ? { doc, changed: 0 } : { doc: { ...doc, nodes, rootIds }, changed };
}
