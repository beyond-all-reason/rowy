import {
  Point,
  Startbox,
  MIN_BOX_SIZE,
  snapStrength,
  formatStrength,
  isLegacyRect,
  rectToPolygon,
  tryPolygonToRect,
} from "./geometry";

export function getStartboxString(poly: Point[]): string {
  return poly
    .map((p) => {
      const s = p.strength ?? 0;
      if (s <= 0) return `${p.x} ${p.y}`;
      return `${p.x} ${p.y} ${formatStrength(s)}`;
    })
    .join(", ");
}

export function parseStartboxString(startboxString: string): Point[] {
  const parts = startboxString
    .trim()
    .split(/,/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  const points: Point[] = [];
  for (const part of parts) {
    const tokens = part.split(/ +/);
    if (tokens.length !== 2 && tokens.length !== 3) {
      throw new Error(`expected 'x y' or 'x y strength', got '${part}'`);
    }

    const x = parseInt(tokens[0], 10);
    const y = parseInt(tokens[1], 10);
    if (isNaN(x)) throw new Error(`'${tokens[0]}' is not a number`);
    if (isNaN(y)) throw new Error(`'${tokens[1]}' is not a number`);
    if (x < 0 || x > 200) throw new Error(`x=${x} not in range 0-200`);
    if (y < 0 || y > 200) throw new Error(`y=${y} not in range 0-200`);

    const point: Point = { x, y };
    if (tokens.length === 3) {
      const sRaw = parseFloat(tokens[2]);
      if (isNaN(sRaw)) throw new Error(`'${tokens[2]}' is not a number`);
      if (sRaw < 0 || sRaw > 1)
        throw new Error(`strength=${sRaw} not in range 0-1`);
      const s = snapStrength(sRaw);
      if (s > 0) point.strength = s;
    }
    points.push(point);
  }

  if (points.length < 3) {
    throw new Error(`need at least 3 vertices, got ${points.length}`);
  }

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  if (
    Math.max(...xs) - Math.min(...xs) < MIN_BOX_SIZE ||
    Math.max(...ys) - Math.min(...ys) < MIN_BOX_SIZE
  ) {
    throw new Error(
      `box must span at least ${MIN_BOX_SIZE} in width and height`
    );
  }

  return points;
}

// Convert stored startbox data to editor polygon state.
export function loadPoly(box: Startbox): Point[] {
  if (isLegacyRect(box.poly)) {
    return rectToPolygon(box.poly as [Point, Point]);
  }
  return box.poly;
}

// Convert editor polygon state back to stored startbox data.
// Preserves 2-point rectangle format when possible (no strengths).
export function savePoly(poly: Point[]): Startbox {
  return { poly: tryPolygonToRect(poly) };
}
