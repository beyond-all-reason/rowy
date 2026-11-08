import { Position, ELMOS_PER_UNIT } from "./types";

export interface MapDimensions {
  widthElmos: number;
  heightElmos: number;
}

// "12 x 20" -> { widthElmos: 6144, heightElmos: 10240 }
export function parseDimensions(
  dimensions: string | null | undefined
): MapDimensions | null {
  if (!dimensions) return null;
  const m = String(dimensions).match(
    /^\s*(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*$/i
  );
  if (!m) return null;
  const w = parseFloat(m[1]);
  const h = parseFloat(m[2]);
  if (!(w > 0) || !(h > 0)) return null;
  return { widthElmos: w * ELMOS_PER_UNIT, heightElmos: h * ELMOS_PER_UNIT };
}

export function clampToBounds(p: Position, dims: MapDimensions): Position {
  return {
    x: Math.round(Math.min(Math.max(p.x, 0), dims.widthElmos)),
    y: Math.round(Math.min(Math.max(p.y, 0), dims.heightElmos)),
  };
}
