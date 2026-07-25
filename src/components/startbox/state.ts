import {
  Point,
  MIN_BOX_SIZE,
  clampPoint,
  pointEqual,
  snapStrength,
} from "./geometry";
import { getStartboxString, parseStartboxString } from "./serialization";

// Keep a dragged rect corner on its side of the fixed opposite corner, at least
// MIN_BOX_SIZE away and within 0-200, so the box can't collapse to a line.
function clampRectCorner(v: number, opposite: number, above: boolean): number {
  return above
    ? Math.min(Math.max(v, opposite + MIN_BOX_SIZE), 200)
    : Math.max(Math.min(v, opposite - MIN_BOX_SIZE), 0);
}

// Immutable state object for single startbox
export class StartboxState {
  public readonly str: string;

  constructor(
    public readonly poly: Point[],
    str?: string,
    public readonly strErr?: string
  ) {
    if (str !== undefined) {
      this.str = str;
    } else {
      this.str = getStartboxString(poly);
    }
  }

  setStr(str: string): StartboxState {
    if (str === this.str) {
      return this;
    }
    try {
      return new StartboxState(parseStartboxString(str), str);
    } catch (e) {
      return new StartboxState(this.poly, str, (e as Error).message);
    }
  }

  setVertex(index: number, point: Point): StartboxState {
    const clamped = clampPoint(point);
    if (pointEqual(this.poly[index], clamped)) return this;
    const newPoly = [...this.poly];
    // Preserve existing strength if not explicitly provided in `point`
    if (
      point.strength === undefined &&
      this.poly[index].strength !== undefined
    ) {
      clamped.strength = this.poly[index].strength;
    }
    newPoly[index] = clamped;
    return new StartboxState(newPoly);
  }

  // Resize a rectangle by dragging one corner: the corner moves to `point` and
  // the two adjacent corners track its shared edges, keeping the box axis-aligned.
  // Callers gate on isRectangle; falls back to setVertex for non-4-point shapes.
  resizeRectCorner(index: number, point: Point): StartboxState {
    if (this.poly.length !== 4) return this.setVertex(index, point);
    const clamped = clampPoint(point);
    const corner = this.poly[index];
    const opposite =
      this.poly.find((p) => p.x !== corner.x && p.y !== corner.y) ?? corner;
    const x = clampRectCorner(clamped.x, opposite.x, corner.x >= opposite.x);
    const y = clampRectCorner(clamped.y, opposite.y, corner.y >= opposite.y);
    const newPoly = this.poly.map((p, j) => {
      if (j === index) return { x, y };
      return {
        x: p.x === corner.x ? x : p.x,
        y: p.y === corner.y ? y : p.y,
      };
    });
    if (this.poly.every((p, i) => pointEqual(p, newPoly[i]))) return this;
    return new StartboxState(newPoly);
  }

  setVertexStrength(index: number, rawStrength: number): StartboxState {
    const snapped = snapStrength(rawStrength);
    const current = this.poly[index].strength ?? 0;
    if (current === snapped) return this;
    const newPoly = [...this.poly];
    const updated: Point = { x: this.poly[index].x, y: this.poly[index].y };
    if (snapped > 0) updated.strength = snapped;
    newPoly[index] = updated;
    return new StartboxState(newPoly);
  }

  setUniformStrength(rawStrength: number): StartboxState {
    const snapped = snapStrength(rawStrength);
    const same = this.poly.every((p) => (p.strength ?? 0) === snapped);
    if (same) return this;
    const newPoly = this.poly.map((p) => {
      const out: Point = { x: p.x, y: p.y };
      if (snapped > 0) out.strength = snapped;
      return out;
    });
    return new StartboxState(newPoly);
  }

  insertVertex(afterIndex: number, point: Point): StartboxState {
    const newPoly = [...this.poly];
    newPoly.splice(afterIndex + 1, 0, clampPoint(point));
    return new StartboxState(newPoly);
  }

  removeVertex(index: number): StartboxState {
    if (this.poly.length <= 3) return this;
    const newPoly = [...this.poly];
    newPoly.splice(index, 1);
    return new StartboxState(newPoly);
  }

  moveBy(dx: number, dy: number): StartboxState {
    const moved = this.poly.map((p) => {
      const moved = clampPoint({ x: p.x + dx, y: p.y + dy });
      if (p.strength !== undefined) moved.strength = p.strength;
      return moved;
    });
    if (this.poly.every((p, i) => pointEqual(p, moved[i]))) return this;
    return new StartboxState(moved);
  }
}

// Immutable state object for all startboxes
export class StartboxesState {
  constructor(public readonly boxes: StartboxState[]) {}

  update(
    idx: number,
    update: (box: StartboxState) => StartboxState
  ): StartboxesState {
    const newBox = update(this.boxes[idx]);
    if (newBox === this.boxes[idx]) {
      return this;
    }
    const newStartboxes = [...this.boxes];
    newStartboxes[idx] = newBox;
    return new StartboxesState(newStartboxes);
  }

  add(poly: Point[]): StartboxesState {
    return new StartboxesState([...this.boxes, new StartboxState(poly)]);
  }

  remove(idx: number): StartboxesState {
    const newStartboxes = [...this.boxes];
    newStartboxes.splice(idx, 1);
    return new StartboxesState(newStartboxes);
  }
}
