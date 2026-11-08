import { useState } from "react";
import { Point, clampPoint } from "./geometry";

export type DrawMode = "rect" | "polygon";

interface DrawPreview {
  points: Point[];
  closed: boolean;
}

function rectCorners(a: Point, b: Point): Point[] {
  const minX = Math.min(a.x, b.x);
  const maxX = Math.max(a.x, b.x);
  const minY = Math.min(a.y, b.y);
  const maxY = Math.max(a.y, b.y);
  return [
    { x: minX, y: minY },
    { x: maxX, y: minY },
    { x: maxX, y: maxY },
    { x: minX, y: maxY },
  ];
}

const CLOSE_DISTANCE = 6;

export function useStartboxDraw(onComplete: (poly: Point[]) => void) {
  const [mode, setMode] = useState<DrawMode | null>(null);
  const [rectStart, setRectStart] = useState<Point | null>(null);
  const [cursor, setCursor] = useState<Point | null>(null);
  const [polyPoints, setPolyPoints] = useState<Point[]>([]);

  function reset() {
    setMode(null);
    setRectStart(null);
    setCursor(null);
    setPolyPoints([]);
  }

  function start(next: DrawMode) {
    setRectStart(null);
    setCursor(null);
    setPolyPoints([]);
    setMode(next);
  }

  function cancel() {
    reset();
  }

  function commit() {
    if (mode !== "polygon") return;
    if (polyPoints.length >= 3) {
      const poly = polyPoints;
      reset();
      onComplete(poly);
    }
  }

  function onMouseDown(raw: Point) {
    const p = clampPoint(raw);

    if (mode === "rect") {
      setRectStart(p);
      setCursor(p);

      return;
    }

    if (mode === "polygon") {
      if (polyPoints.length >= 3) {
        const first = polyPoints[0];
        const dx = p.x - first.x;
        const dy = p.y - first.y;
        if (dx * dx + dy * dy <= CLOSE_DISTANCE * CLOSE_DISTANCE) {
          const poly = polyPoints;
          reset();
          onComplete(poly);

          return;
        }
      }

      setPolyPoints([...polyPoints, p]);
    }
  }

  function onMouseMove(raw: Point) {
    if (mode === null) return;

    setCursor(clampPoint(raw));
  }

  function onMouseUp(raw: Point) {
    const p = clampPoint(raw);

    if (mode !== "rect" || rectStart === null) return;

    const w = Math.abs(p.x - rectStart.x);
    const h = Math.abs(p.y - rectStart.y);
    if (w >= 2 && h >= 2) {
      const poly = rectCorners(rectStart, p);
      reset();
      onComplete(poly);

      return;
    }

    setRectStart(null);
  }

  let preview: DrawPreview | null = null;
  if (mode === "rect" && rectStart !== null && cursor !== null) {
    preview = { points: rectCorners(rectStart, cursor), closed: true };
  } else if (mode === "polygon" && polyPoints.length >= 1) {
    preview = {
      points: cursor !== null ? [...polyPoints, cursor] : [...polyPoints],
      closed: false,
    };
  }

  return {
    mode,
    preview,
    start,
    cancel,
    commit,
    onMouseDown,
    onMouseMove,
    onMouseUp,
  };
}
