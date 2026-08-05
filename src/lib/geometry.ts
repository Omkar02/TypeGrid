import type { Point, Rect, Size, Viewport } from "@/lib/types";

export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 8;

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function screenToWorld(p: Point, vp: Viewport): Point {
  return { x: (p.x - vp.x) / vp.zoom, y: (p.y - vp.y) / vp.zoom };
}

export function worldToScreen(p: Point, vp: Viewport): Point {
  return { x: p.x * vp.zoom + vp.x, y: p.y * vp.zoom + vp.y };
}

/** Zooms toward `anchor` (screen coords) so the point under it stays put. */
export function zoomAt(vp: Viewport, anchor: Point, nextZoom: number): Viewport {
  const zoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
  const ratio = zoom / vp.zoom;
  return {
    zoom,
    x: anchor.x - (anchor.x - vp.x) * ratio,
    y: anchor.y - (anchor.y - vp.y) * ratio,
  };
}

/** Flips negative width/height so the rect always reads top-left -> bottom-right. */
export function normalizeRect(rect: Rect): Rect {
  return {
    x: rect.w < 0 ? rect.x + rect.w : rect.x,
    y: rect.h < 0 ? rect.y + rect.h : rect.y,
    w: Math.abs(rect.w),
    h: Math.abs(rect.h),
  };
}

export function rectFromPoints(a: Point, b: Point): Rect {
  return normalizeRect({ x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y });
}

export function rectsIntersect(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
}

export function rectContainsPoint(rect: Rect, p: Point): boolean {
  return (
    p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h
  );
}

export function unionRects(rects: Rect[]): Rect | null {
  if (rects.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rects) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

export function translateRect(rect: Rect, dx: number, dy: number): Rect {
  return { ...rect, x: rect.x + dx, y: rect.y + dy };
}

export function snap(value: number, grid: number): number {
  return grid <= 0 ? value : Math.round(value / grid) * grid;
}

export function snapPoint(p: Point, grid: number): Point {
  return { x: snap(p.x, grid), y: snap(p.y, grid) };
}

// ---------------------------------------------------------------------------
// Resize handles
// ---------------------------------------------------------------------------

export const RESIZE_HANDLES = [
  "nw",
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
] as const;

export type ResizeHandle = (typeof RESIZE_HANDLES)[number];

export const HANDLE_CURSORS: Record<ResizeHandle, string> = {
  nw: "nwse-resize",
  n: "ns-resize",
  ne: "nesw-resize",
  e: "ew-resize",
  se: "nwse-resize",
  s: "ns-resize",
  sw: "nesw-resize",
  w: "ew-resize",
};

const MIN_SIZE = 4;

/**
 * Applies a world-space drag delta to one edge/corner of `start`.
 * Keeps the opposite edge pinned and never collapses below MIN_SIZE.
 */
export function resizeRect(
  start: Rect,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  opts: { grid?: number; aspect?: boolean } = {},
): Rect {
  const grid = opts.grid ?? 0;
  let { x, y, w, h } = start;

  if (handle.includes("w")) {
    const nx = grid ? snap(start.x + dx, grid) : start.x + dx;
    w = start.x + start.w - nx;
    x = nx;
  }
  if (handle.includes("e")) {
    const right = grid ? snap(start.x + start.w + dx, grid) : start.x + start.w + dx;
    w = right - start.x;
  }
  if (handle.includes("n")) {
    const ny = grid ? snap(start.y + dy, grid) : start.y + dy;
    h = start.y + start.h - ny;
    y = ny;
  }
  if (handle.includes("s")) {
    const bottom = grid ? snap(start.y + start.h + dy, grid) : start.y + start.h + dy;
    h = bottom - start.y;
  }

  if (opts.aspect && start.w > 0 && start.h > 0 && handle.length === 2) {
    const ratio = start.w / start.h;
    if (Math.abs(w / ratio) > Math.abs(h)) {
      const nh = w / ratio;
      if (handle.includes("n")) y = start.y + start.h - nh;
      h = nh;
    } else {
      const nw = h * ratio;
      if (handle.includes("w")) x = start.x + start.w - nw;
      w = nw;
    }
  }

  if (w < MIN_SIZE) {
    if (handle.includes("w")) x = start.x + start.w - MIN_SIZE;
    w = MIN_SIZE;
  }
  if (h < MIN_SIZE) {
    if (handle.includes("n")) y = start.y + start.h - MIN_SIZE;
    h = MIN_SIZE;
  }

  return { x, y, w, h };
}

/** Where a handle sits on a rect, in the rect's own space. */
export function handleAnchor(rect: Rect, handle: ResizeHandle): Point {
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;
  const right = rect.x + rect.w;
  const bottom = rect.y + rect.h;
  switch (handle) {
    case "nw":
      return { x: rect.x, y: rect.y };
    case "n":
      return { x: cx, y: rect.y };
    case "ne":
      return { x: right, y: rect.y };
    case "e":
      return { x: right, y: cy };
    case "se":
      return { x: right, y: bottom };
    case "s":
      return { x: cx, y: bottom };
    case "sw":
      return { x: rect.x, y: bottom };
    case "w":
      return { x: rect.x, y: cy };
  }
}

/** Viewport that fits `content` inside `screen` with padding, capped at 1x. */
export function fitViewport(
  content: Rect | null,
  screen: Size,
  padding = 96,
): Viewport {
  if (!content || content.w <= 0 || content.h <= 0) {
    return { x: screen.w / 2, y: screen.h / 2, zoom: 1 };
  }
  const zoom = clamp(
    Math.min(
      (screen.w - padding * 2) / content.w,
      (screen.h - padding * 2) / content.h,
    ),
    MIN_ZOOM,
    1,
  );
  return {
    zoom,
    x: screen.w / 2 - (content.x + content.w / 2) * zoom,
    y: screen.h / 2 - (content.y + content.h / 2) * zoom,
  };
}

// ---------------------------------------------------------------------------
// Rotation
// ---------------------------------------------------------------------------

export function centerOf(rect: Rect): Point {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

export function rotatePoint(p: Point, origin: Point, degrees: number): Point {
  if (!degrees) return p;
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  return {
    x: origin.x + dx * cos - dy * sin,
    y: origin.y + dx * sin + dy * cos,
  };
}

/** Signed clockwise degrees from straight up, which is how rotation reads. */
export function angleFromCenter(center: Point, p: Point): number {
  return (Math.atan2(p.x - center.x, center.y - p.y) * 180) / Math.PI;
}

export function normalizeAngle(degrees: number): number {
  const wrapped = degrees % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
}

/** Largest radius a rect can take before the corners meet. */
export function maxRadius(rect: Rect): number {
  return Math.max(0, Math.min(rect.w, rect.h) / 2);
}
