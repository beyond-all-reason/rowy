import { useEffect, useState, useRef, useCallback } from "react";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import SaveAltIcon from "@mui/icons-material/SaveAlt";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import {
  ButtonGroup,
  Tooltip,
  IconButton,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  Stack,
} from "@mui/material";

export interface Point {
  x: number;
  y: number;
}

function pointEqual(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

export interface Startbox {
  poly: [Point, Point];
}

function startboxEqual(a: Startbox, b: Startbox): boolean {
  return pointEqual(a.poly[0], b.poly[0]) && pointEqual(a.poly[1], b.poly[1]);
}

function getStartboxString(startbox: Startbox): string {
  return startbox.poly.map((point) => `${point.x} ${point.y}`).join(" ");
}

function parseStartboxString(startboxString: string): Startbox {
  const coords = startboxString
    .trim()
    .split(/ +/)
    .map((field) => {
      const val = parseInt(field, 10);
      if (isNaN(val)) {
        throw new Error(`'${field}' is not a number`);
      }
      if (val >= 0 && val <= 200) {
        return val;
      }
      throw new Error(`${val} not in range 0-200`);
    });
  if (coords.length !== 4) {
    throw new Error(`must have 4 coords`);
  }
  const box: Startbox = {
    poly: [
      { x: coords[0], y: coords[1] },
      { x: coords[2], y: coords[3] },
    ],
  };
  if (box.poly[0].x >= box.poly[1].x) {
    throw new Error(`x₁ (${box.poly[0].x}) must be < x₂ (${box.poly[1].x})`);
  }
  if (box.poly[0].y >= box.poly[1].y) {
    throw new Error(`y₁ (${box.poly[0].y}) must be < y₂ (${box.poly[1].y})`);
  }
  return box;
}

// Clamps val between min and max
function clamp(min: number, val: number, max: number): number {
  return Math.min(Math.max(val, min), max);
}

// Immutable state object for single startbox
class StartboxState {
  public readonly str: string;

  constructor(
    public readonly box: Startbox,
    str?: string,
    public readonly strErr?: string
  ) {
    if (str !== undefined) {
      this.str = str;
    } else {
      this.str = getStartboxString(box);
    }
  }

  setStr(str: string): StartboxState {
    if (str === this.str) {
      return this;
    }
    try {
      return new StartboxState(parseStartboxString(str), str);
    } catch (e) {
      return new StartboxState(this.box, str, (e as Error).message);
    }
  }

  private clampTopLeft({ x, y }: Point): Point {
    return {
      x: clamp(0, Math.round(x), this.box.poly[1].x - 2),
      y: clamp(0, Math.round(y), this.box.poly[1].y - 2),
    };
  }

  private clampBottomRight({ x, y }: Point): Point {
    return {
      x: clamp(this.box.poly[0].x + 2, Math.round(x), 200),
      y: clamp(this.box.poly[0].y + 2, Math.round(y), 200),
    };
  }

  setPoint(pointIndex: 0 | 1, point: Point): StartboxState {
    const newBox: Startbox = {
      poly: [...this.box.poly],
    };
    if (pointIndex === 0) {
      newBox.poly[0] = this.clampTopLeft(point);
    } else {
      newBox.poly[1] = this.clampBottomRight(point);
    }
    if (startboxEqual(this.box, newBox)) {
      return this;
    }
    return new StartboxState(newBox);
  }
}

// Immutable state object for all startboxes
class StartboxesState {
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

  add(box: Startbox): StartboxesState {
    return new StartboxesState([...this.boxes, new StartboxState(box)]);
  }

  remove(idx: number): StartboxesState {
    const newStartboxes = [...this.boxes];
    newStartboxes.splice(idx, 1);
    return new StartboxesState(newStartboxes);
  }
}

export interface MapStartboxProps {
  textureUrl: string;
  startboxes: Startbox[];
  updatedStartboxes?: (startboxes: Startbox[]) => void;
  editable?: boolean;
}

const NEW_STARTBOX: Startbox = {
  poly: [
    { x: 50, y: 50 },
    { x: 150, y: 150 },
  ],
};

export default function MapStartbox(props: MapStartboxProps) {
  const [dialogOpen, setDialogOpen] = useState<boolean>(false);
  const initStartboxes = props.startboxes || [];
  const [startboxes, setStartboxes] = useState<StartboxesState>(
    new StartboxesState(initStartboxes.map((box) => new StartboxState(box)))
  );
  const selectedElement = useRef<{
    startboxIndex: number;
    pointIndex: 0 | 1;
  } | null>(null);

  const [deleteStartbox, setDeleteStartbox] = useState<boolean>(false);

  const changedStartbox =
    initStartboxes.length !== startboxes.boxes.length ||
    initStartboxes.some(
      (box, idx) => !startboxEqual(box, startboxes.boxes[idx].box)
    );

  function saveStartboxes() {
    if (props.updatedStartboxes) {
      props.updatedStartboxes(startboxes.boxes.map((sb) => sb.box));
    }
  }

  function maybeDeleteStartbox(startboxIndex: number) {
    if (deleteStartbox) {
      setStartboxes(startboxes.remove(startboxIndex));
      setDeleteStartbox(false);
    }
  }

  function mouseMove(event: React.MouseEvent<SVGSVGElement, MouseEvent>) {
    if (selectedElement.current === null) return;
    event.preventDefault();
    const svg = event.currentTarget;
    const ctm = svg.getScreenCTM()!;
    const point = {
      x: (event.clientX - ctm.e) / ctm.a,
      y: (event.clientY - ctm.f) / ctm.d,
    };
    setStartboxes(
      startboxes.update(selectedElement.current.startboxIndex, (sb) =>
        sb.setPoint(selectedElement.current!.pointIndex, point)
      )
    );
  }

  const [textureAspectRatio, setTextureAspectRatio] = useState<number>(0);
  const [imageElementAspectRatio, setImageElementAspectRatio] =
    useState<number>(0);

  const resizeObserver = useRef<ResizeObserver>(
    new ResizeObserver((entries) => {
      setImageElementAspectRatio(
        entries[0].borderBoxSize[0].inlineSize /
          entries[0].borderBoxSize[0].blockSize
      );
    })
  );

  const registerResizeObserver = useCallback((el: HTMLImageElement) => {
    if (el) return resizeObserver.current.observe(el);
    resizeObserver.current.disconnect();
  }, []);

  const mapView = (
    <>
      <div style={{ position: "absolute", width: "100%", height: "100%" }}>
        {/* We add image here so that it's going to properly set the aspect ratio of the parent div
          and then the SVG is instructed to just fill the full space. This trick allows for the
          viewport coordinates in SVG to be always exactly 0 0 200 200 while maintaining the aspect
          ratio of the map. */}
        <img
          src={props.textureUrl}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            opacity: "0",
            display: "block",
          }}
          alt="map texture"
          onLoad={(e) =>
            setTextureAspectRatio(
              e.currentTarget.naturalWidth / e.currentTarget.naturalHeight
            )
          }
          ref={registerResizeObserver}
        />
        <svg
          viewBox="-5 -5 210 210"
          preserveAspectRatio="none"
          style={{
            position: "absolute",
            aspectRatio: textureAspectRatio,
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            ...(textureAspectRatio > imageElementAspectRatio
              ? { width: "100%", maxHeight: "100%" }
              : { height: "100%", maxWidth: "100%" }),
          }}
          onMouseLeave={() => {
            selectedElement.current = null;
          }}
          onMouseUp={() => {
            selectedElement.current = null;
          }}
          onMouseMove={mouseMove}
          onClick={() => setDeleteStartbox(false)}
        >
          <image
            width={200}
            height={200}
            x={0}
            y={0}
            href={props.textureUrl}
            preserveAspectRatio="none"
          ></image>
          {startboxes.boxes.map((startbox, startboxIndex) => {
            const [start, end] = startbox.box.poly;
            const width = end.x - start.x;
            const height = end.y - start.y;
            return (
              <g>
                <rect
                  x={start.x}
                  y={start.y}
                  width={width}
                  height={height}
                  fill="rgba(255, 0, 0, 0.15)"
                  stroke="red"
                  strokeWidth="0.5"
                  style={{ cursor: deleteStartbox ? "pointer" : "auto" }}
                  onClick={() => maybeDeleteStartbox(startboxIndex)}
                />
                <text
                  x={start.x + width / 2}
                  y={start.y + height / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="white"
                  fontSize="12px"
                >
                  {startboxIndex + 1}
                </text>
                {props.editable &&
                  startbox.box.poly.map((point, pointIndex) => (
                    <circle
                      key={pointIndex}
                      cx={point.x}
                      cy={point.y}
                      fill="red"
                      r="2"
                      style={{ cursor: "nwse-resize" }}
                      onMouseDown={(e) => {
                        selectedElement.current = {
                          startboxIndex,
                          pointIndex: pointIndex as 0 | 1,
                        };
                      }}
                    />
                  ))}
              </g>
            );
          })}
        </svg>
      </div>
    </>
  );

  if (props.editable) {
    const editorView = (
      <>
        <ButtonGroup
          variant="outlined"
          size="small"
          aria-label="outlined button group"
        >
          <Tooltip title="Add startbox">
            <span>
              <IconButton
                size="small"
                onClick={() => setStartboxes(startboxes.add(NEW_STARTBOX))}
              >
                <AddIcon />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Delete startbox">
            <span>
              <IconButton
                size="small"
                disabled={startboxes.boxes.length <= 1}
                onClick={() => setDeleteStartbox(!deleteStartbox)}
              >
                <DeleteIcon />
              </IconButton>
            </span>
          </Tooltip>
          {props.updatedStartboxes && (
            <Tooltip title="Save startboxes">
              <span>
                <IconButton
                  disabled={!changedStartbox}
                  size="small"
                  onClick={saveStartboxes}
                >
                  <SaveAltIcon />
                </IconButton>
              </span>
            </Tooltip>
          )}
          <Tooltip title="Fullscreen">
            <span>
              <IconButton
                size="small"
                onClick={() => setDialogOpen(!dialogOpen)}
              >
                {dialogOpen ? <FullscreenExitIcon /> : <FullscreenIcon />}
              </IconButton>
            </span>
          </Tooltip>
        </ButtonGroup>
        <div style={{ flexGrow: 1, position: "relative", minHeight: "300px" }}>
          {mapView}
        </div>
        <Stack direction="row" flexWrap="wrap" style={{ columnGap: "10px" }}>
          {startboxes.boxes.map((startbox, startboxIndex) => (
            <TextField
              value={startbox.str}
              size="small"
              label={`${startboxIndex + 1}`}
              style={{ width: "170px" }}
              onChange={(e) =>
                setStartboxes(
                  startboxes.update(startboxIndex, (sb) =>
                    sb.setStr(e.target.value)
                  )
                )
              }
              helperText={startbox.strErr || " "}
              error={startbox.strErr !== undefined}
            ></TextField>
          ))}
        </Stack>
      </>
    );

    if (dialogOpen) {
      return (
        <Dialog
          open={dialogOpen}
          fullWidth={true}
          maxWidth="xl"
          onClose={() => setDialogOpen(false)}
        >
          <DialogTitle>Startbox editor</DialogTitle>
          <DialogContent>
            <Stack
              spacing={2}
              flexWrap="nowrap"
              flexDirection="column"
              style={{ height: "80vh", width: "100%" }}
            >
              {editorView}
            </Stack>
          </DialogContent>
        </Dialog>
      );
    } else {
      return (
        <div style={{ padding: "20px", minWidth: "300px", maxWidth: "400px" }}>
          {editorView}
        </div>
      );
    }
  }

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        margin: "10px",
        position: "relative",
      }}
    >
      {mapView}
    </div>
  );
}
