export interface Point {
  x: number;
  y: number;
  /**
   * Optional Catmull-Rom spline strength in [0, 1].
   *   0 (default) = sharp polygon corner
   *   1           = full smooth curve
   * Per-edge tension is the average of the two endpoint anchor strengths.
   */
  strength?: number;
}

export function pointEqual(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y && (a.strength ?? 0) === (b.strength ?? 0);
}

export interface Startbox {
  poly: Point[];
}

export const NEW_POLYGON: Point[] = [
  { x: 50, y: 50 },
  { x: 150, y: 50 },
  { x: 150, y: 150 },
  { x: 50, y: 150 },
];

// Minimum width/height in the 0-200 space, enforced on rect-corner drags and on
// text-field parse so a box can't collapse to a zero-area line or point.
export const MIN_BOX_SIZE = 2;

export function startboxEqual(a: Startbox, b: Startbox): boolean {
  if (a.poly.length !== b.poly.length) return false;
  return a.poly.every((p, i) => pointEqual(p, b.poly[i]));
}

// Legacy 2-point rectangle to 4-point polygon (for editor state only).
export function rectToPolygon(poly: [Point, Point]): Point[] {
  const [tl, br] = poly;
  return [
    { x: tl.x, y: tl.y },
    { x: br.x, y: tl.y },
    { x: br.x, y: br.y },
    { x: tl.x, y: br.y },
  ];
}

export function isLegacyRect(poly: Point[]): boolean {
  return poly.length === 2;
}

// Top-left/bottom-right corners if the 4-point poly is an axis-aligned rect,
// else null.
function axisAlignedRectCorners(poly: Point[]): [Point, Point] | null {
  const xs = poly.map((p) => p.x).sort((a, b) => a - b);
  const ys = poly.map((p) => p.y).sort((a, b) => a - b);
  if (
    xs[0] !== xs[1] ||
    xs[2] !== xs[3] ||
    ys[0] !== ys[1] ||
    ys[2] !== ys[3]
  ) {
    return null;
  }
  return [
    { x: xs[0], y: ys[0] },
    { x: xs[3], y: ys[3] },
  ];
}

// True when the polygon is an axis-aligned rectangle (the editor should
// resize it as a rect rather than as free vertices).
export function isRectangle(poly: Point[]): boolean {
  if (poly.length === 2) return true;
  if (poly.length !== 4) return false;
  if (poly.some((p) => (p.strength ?? 0) > 0)) return false;
  return axisAlignedRectCorners(poly) !== null;
}

// Convert polygon back to 2-point rectangle if it's an axis-aligned rect with
// no per-anchor strengths (i.e. a plain polygon that happens to be a rectangle).
export function tryPolygonToRect(poly: Point[]): Point[] {
  if (poly.length !== 4) return poly;
  if (poly.some((p) => (p.strength ?? 0) > 0)) return poly;
  return axisAlignedRectCorners(poly) ?? poly;
}

// Snapping rounds in integer space (via STRENGTH_DENOM) so results are exact
// floats, not leaks like 0.30000000000000004, and snaps to 0/1 near the ends.
export const STRENGTH_DENOM = 40;
export const STRENGTH_STEP = 1 / STRENGTH_DENOM;
export const STRENGTH_SNAP_EPSILON = STRENGTH_STEP / 2;
export function snapStrength(s: number): number {
  if (!isFinite(s)) return 0;
  if (s <= STRENGTH_SNAP_EPSILON) return 0;
  if (s >= 1 - STRENGTH_SNAP_EPSILON) return 1;
  const clamped = Math.min(Math.max(s, 0), 1);
  return Math.round(clamped * STRENGTH_DENOM) / STRENGTH_DENOM;
}

export function formatStrength(s: number): string {
  // Display with up to 3 decimal places (matching the 0.025 step), dropping
  // trailing zeros so 0.5 shows as "0.5", 0.025 shows as "0.025".
  return Number(s.toFixed(3)).toString();
}

export function clampPoint(p: Point): Point {
  const out: Point = {
    x: Math.min(Math.max(Math.round(p.x), 0), 200),
    y: Math.min(Math.max(Math.round(p.y), 0), 200),
  };
  if (p.strength !== undefined && p.strength > 0) {
    out.strength = snapStrength(p.strength);
  }
  return out;
}

export function polygonCentroid(poly: Point[]): Point {
  const n = poly.length;
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const cross = poly[i].x * poly[j].y - poly[j].x * poly[i].y;
    area += cross;
    cx += (poly[i].x + poly[j].x) * cross;
    cy += (poly[i].y + poly[j].y) * cross;
  }
  area /= 2;
  if (Math.abs(area) < 1e-6) {
    // Degenerate — fall back to bounding box center.
    const xs = poly.map((p) => p.x);
    const ys = poly.map((p) => p.y);
    return {
      x: (Math.min(...xs) + Math.max(...xs)) / 2,
      y: (Math.min(...ys) + Math.max(...ys)) / 2,
    };
  }
  cx /= 6 * area;
  cy /= 6 * area;
  return { x: cx, y: cy };
}

// On-curve midpoint of the edge from poly[i] to poly[(i+1) % N]. For a plain
// (zero-tension) edge this collapses to the linear midpoint because
// sampleSegment with tension=0 returns the linear interpolation; for a
// splined edge it samples the same Catmull-Rom curve the renderer draws,
// so the insert handle visually rides the rendered outline.
export function curveMidpoint(poly: Point[], i: number): Point {
  const n = poly.length;
  if (n < 2) return { x: poly[0]?.x ?? 0, y: poly[0]?.y ?? 0 };
  const iPrev = (i - 1 + n) % n;
  const iNext = (i + 1) % n;
  const iNext2 = (iNext + 1) % n;
  const p0 = poly[iPrev];
  const p1 = poly[i];
  const p2 = poly[iNext];
  const p3 = poly[iNext2];
  const s1 = clamp01(p1.strength ?? 0);
  const s2 = clamp01(p2.strength ?? 0);
  const edgeTension = clamp01((s1 + s2) * 0.5);
  return sampleSegment(p0, p1, p2, p3, 0.5, edgeTension);
}

// Strength to give a vertex inserted on the edge from poly[i] to poly[i+1].
// Average of the two endpoint strengths so adding a point in the middle of a
// smooth edge keeps the curve smooth (rather than introducing a sharp corner
// that would visually break the rendered shape).
export function insertionStrength(poly: Point[], i: number): number {
  const s1 = poly[i].strength ?? 0;
  const s2 = poly[(i + 1) % poly.length].strength ?? 0;
  return snapStrength((s1 + s2) / 2);
}

// Project the popover outward from the polygon via the centroid->vertex
// direction (reliable for concave shapes, where a chord midpoint isn't).
export type PopoverOrigin = {
  vertical: "top" | "bottom";
  horizontal: "left" | "right";
};
export function popoverOriginsFor(
  poly: Point[],
  i: number
): { anchorOrigin: PopoverOrigin; transformOrigin: PopoverOrigin } {
  const here = poly[i];
  const c = polygonCentroid(poly);
  // Default to the bottom-right quadrant when the vertex coincides with the
  // centroid (degenerate). dx >= 0 / dy >= 0 → right / bottom — i.e. popover
  // extends down-right from the anchor, matching the prior fixed behavior.
  const horizontal: "left" | "right" = here.x - c.x >= 0 ? "right" : "left";
  const vertical: "top" | "bottom" = here.y - c.y >= 0 ? "bottom" : "top";
  return {
    anchorOrigin: { vertical, horizontal },
    transformOrigin: {
      vertical: vertical === "bottom" ? "top" : "bottom",
      horizontal: horizontal === "right" ? "left" : "right",
    },
  };
}

// ---------------------------------------------------------------------------
// Catmull-Rom spline tessellation (1:1 port of bar-game/common/lib_spline.lua)
// ---------------------------------------------------------------------------

export const TESSELLATION_SEGMENTS = 12;

export function clamp01(v: number): number {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

// Centripetal knot spacing: |delta|^0.5 (alpha = 0.5).
export function knotDelta(
  a: { x: number; y: number },
  b: { x: number; y: number }
): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.pow(dx * dx + dy * dy, 0.25);
}

// Barry-Goldman lerp of a->b over knot span [ta, tb], evaluated at tt.
export function bgLerp(
  tt: number,
  a: { x: number; y: number },
  b: { x: number; y: number },
  ta: number,
  tb: number
): { x: number; y: number } {
  const w = (tb - tt) / (tb - ta);
  return { x: w * a.x + (1 - w) * b.x, y: w * a.y + (1 - w) * b.y };
}

// Sample a centripetal Catmull-Rom curve segment between p1 and p2 (neighbours
// p0, p3), blended toward the straight chord by `tension` in [0, 1]. Centripetal
// (alpha = 0.5) avoids the curly-q overshoot/self-intersections at sharp corners.
export function sampleSegment(
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
  t: number,
  tension: number
): Point {
  const lx = p1.x + (p2.x - p1.x) * t;
  const ly = p1.y + (p2.y - p1.y) * t;
  if (tension <= 0) return { x: lx, y: ly };

  const t0 = 0;
  const t1 = t0 + knotDelta(p0, p1);
  const t2 = t1 + knotDelta(p1, p2);
  const t3 = t2 + knotDelta(p2, p3);

  let crX: number;
  let crY: number;
  if (t2 - t1 <= 1e-9) {
    crX = p1.x;
    crY = p1.y;
  } else {
    const tt = t1 + (t2 - t1) * t;
    const A1 =
      t1 - t0 > 1e-9 ? bgLerp(tt, p0, p1, t0, t1) : { x: p1.x, y: p1.y };
    const A2 = bgLerp(tt, p1, p2, t1, t2);
    const A3 =
      t3 - t2 > 1e-9 ? bgLerp(tt, p2, p3, t2, t3) : { x: p2.x, y: p2.y };
    const B1 = bgLerp(tt, A1, A2, t0, t2);
    const B2 = bgLerp(tt, A2, A3, t1, t3);
    const C = bgLerp(tt, B1, B2, t1, t2);
    crX = C.x;
    crY = C.y;
  }

  if (tension >= 1) return { x: crX, y: crY };
  return {
    x: lx + (crX - lx) * tension,
    y: ly + (crY - ly) * tension,
  };
}

// Tessellate a closed ring of anchor points into a dense polygon. Anchors
// without explicit strength are treated as sharp corners (strength 0); plain
// polygons emerge with vertex-identical output.
export function tessellateRing(
  anchors: Point[],
  segments = TESSELLATION_SEGMENTS
): Point[] {
  const n = anchors.length;
  if (n < 2) return anchors.map((p) => ({ x: p.x, y: p.y }));
  const seg = Math.max(1, segments);

  const out: Point[] = [];
  for (let i = 0; i < n; i++) {
    const iPrev = (i - 1 + n) % n;
    const iNext = (i + 1) % n;
    const iNext2 = (iNext + 1) % n;
    const p0 = anchors[iPrev];
    const p1 = anchors[i];
    const p2 = anchors[iNext];
    const p3 = anchors[iNext2];

    const s1 = clamp01(p1.strength ?? 0);
    const s2 = clamp01(p2.strength ?? 0);
    const edgeTension = clamp01((s1 + s2) * 0.5);

    out.push({ x: p1.x, y: p1.y });
    if (edgeTension > 0 && n >= 3) {
      for (let k = 1; k < seg; k++) {
        out.push(sampleSegment(p0, p1, p2, p3, k / seg, edgeTension));
      }
    }
  }
  return out;
}

// SVG path for the (potentially curved) polygon outline. Plain polygons emit
// a tessellation of length N (the anchors themselves) and look identical to
// the previous straight-edged rendering.
export function tessellatedPathString(poly: Point[]): string {
  const tess = tessellateRing(poly);
  if (tess.length === 0) return "";
  const parts: string[] = [`M ${tess[0].x} ${tess[0].y}`];
  for (let i = 1; i < tess.length; i++) {
    parts.push(`L ${tess[i].x} ${tess[i].y}`);
  }
  parts.push("Z");
  return parts.join(" ");
}

// Color and radius for an anchor handle based on strength: a sharp corner
// (0) is a small, dim red dot; max smoothness (1) is a brighter, larger dot.
export function strengthVisuals(strength: number): { fill: string; r: number } {
  const s = clamp01(strength);
  // Hue ramps from red (0°) toward orange/yellow (~50°) as strength rises.
  const hue = 0 + 50 * s;
  const sat = 80;
  const lit = 45 + 10 * s;
  return { fill: `hsl(${hue}, ${sat}%, ${lit}%)`, r: 2.2 + 1.0 * s };
}
