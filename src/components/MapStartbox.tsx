import { useEffect, useState, useRef, useCallback } from "react";
import DeleteIcon from "@mui/icons-material/Delete";
import RemoveCircleOutlineIcon from "@mui/icons-material/RemoveCircleOutline";
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
  Slider,
  Typography,
  Popover,
  Button,
} from "@mui/material";

import {
  Point,
  Startbox,
  STRENGTH_STEP,
  snapStrength,
  formatStrength,
  startboxEqual,
  isRectangle,
  polygonCentroid,
  curveMidpoint,
  insertionStrength,
  popoverOriginsFor,
  tessellatedPathString,
  strengthVisuals,
} from "./startbox/geometry";
import { loadPoly, savePoly } from "./startbox/serialization";
import { StartboxState, StartboxesState } from "./startbox/state";
import { useStartboxDraw } from "./startbox/useStartboxDraw";
import CreateStartboxMenu from "./startbox/CreateStartboxMenu";

export type { Startbox } from "./startbox/geometry";

export interface MapStartboxProps {
  textureUrl: string;
  startboxes: Startbox[];
  updatedStartboxes?: (startboxes: Startbox[]) => void;
  editable?: boolean;
}

interface SelectedVertex {
  startboxIndex: number;
  vertexIndex: number;
  anchorEl: SVGCircleElement;
}

// Pixel distance below which a mousedown/mouseup pair is treated as a click
// (open the strength popover) rather than the start of a drag.
const CLICK_DRAG_THRESHOLD = 3;

export default function MapStartbox(props: MapStartboxProps) {
  const [dialogOpen, setDialogOpen] = useState<boolean>(false);
  const initStartboxes = props.startboxes || [];
  const [startboxes, setStartboxes] = useState<StartboxesState>(
    new StartboxesState(
      initStartboxes.map((box) => new StartboxState(loadPoly(box)))
    )
  );
  const selectedElement = useRef<
    | { type: "vertex"; startboxIndex: number; vertexIndex: number }
    | { type: "move"; startboxIndex: number; origin: Point }
    | null
  >(null);

  const draw = useStartboxDraw((poly) =>
    setStartboxes((prev) => prev.add(poly))
  );
  const drawRef = useRef(draw);
  drawRef.current = draw;
  const [createAnchor, setCreateAnchor] = useState<HTMLElement | null>(null);

  const [deleteStartbox, setDeleteStartbox] = useState<boolean>(false);
  const [deleteVertex, setDeleteVertex] = useState<boolean>(false);
  const [selectedVertex, setSelectedVertex] = useState<SelectedVertex | null>(
    null
  );

  // While a vertex is mouse-down'd we track the press as either a pending
  // click or a confirmed drag. If the cursor moves more than CLICK_DRAG_THRESHOLD
  // pixels before mouseup, the press becomes a drag and the popover stays
  // closed; otherwise mouseup opens the strength popover anchored at the
  // vertex's <circle>.
  const pendingClick = useRef<{
    startboxIndex: number;
    vertexIndex: number;
    anchorEl: SVGCircleElement;
    clientX: number;
    clientY: number;
  } | null>(null);

  // Clear selection if it points at a vertex that no longer exists
  useEffect(() => {
    if (selectedVertex === null) return;
    const sb = startboxes.boxes[selectedVertex.startboxIndex];
    if (!sb || selectedVertex.vertexIndex >= sb.poly.length) {
      setSelectedVertex(null);
    }
  }, [startboxes, selectedVertex]);

  // While drawing, Escape cancels and Enter commits the in-progress shape.
  useEffect(() => {
    if (draw.mode === null) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") drawRef.current.cancel();
      else if (e.key === "Enter") drawRef.current.commit();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [draw.mode]);

  const changedStartbox =
    initStartboxes.length !== startboxes.boxes.length ||
    initStartboxes.some(
      (box, idx) => !startboxEqual(savePoly(startboxes.boxes[idx].poly), box)
    );

  function saveStartboxes() {
    if (props.updatedStartboxes) {
      props.updatedStartboxes(startboxes.boxes.map((sb) => savePoly(sb.poly)));
    }
  }

  function maybeDeleteStartbox(startboxIndex: number) {
    if (deleteStartbox) {
      setStartboxes(startboxes.remove(startboxIndex));
      setDeleteStartbox(false);
    }
  }

  function svgPoint(event: React.MouseEvent<SVGElement, MouseEvent>): Point {
    const svg =
      event.currentTarget instanceof SVGSVGElement
        ? event.currentTarget
        : event.currentTarget.ownerSVGElement!;
    const ctm = svg.getScreenCTM()!;
    return {
      x: (event.clientX - ctm.e) / ctm.a,
      y: (event.clientY - ctm.f) / ctm.d,
    };
  }

  function mouseMove(event: React.MouseEvent<SVGSVGElement, MouseEvent>) {
    // If the user moves the cursor beyond the click threshold while a vertex
    // mouse-down is still pending, promote it to a drag and cancel the
    // pending popover-open.
    if (pendingClick.current !== null) {
      const dx = event.clientX - pendingClick.current.clientX;
      const dy = event.clientY - pendingClick.current.clientY;
      if (dx * dx + dy * dy >= CLICK_DRAG_THRESHOLD * CLICK_DRAG_THRESHOLD) {
        pendingClick.current = null;
      }
    }

    if (selectedElement.current === null) return;
    event.preventDefault();
    const point = svgPoint(event);
    if (selectedElement.current.type === "vertex") {
      const { vertexIndex, startboxIndex: sbIndex } = selectedElement.current;
      setStartboxes(
        startboxes.update(sbIndex, (sb) =>
          isRectangle(sb.poly)
            ? sb.resizeRectCorner(vertexIndex, point)
            : sb.setVertex(vertexIndex, point)
        )
      );
    } else if (selectedElement.current.type === "move") {
      const dx = point.x - selectedElement.current.origin.x;
      const dy = point.y - selectedElement.current.origin.y;
      setStartboxes(
        startboxes.update(selectedElement.current.startboxIndex, (sb) =>
          sb.moveBy(dx, dy)
        )
      );
      selectedElement.current = { ...selectedElement.current, origin: point };
    }
  }

  function endInteraction() {
    if (pendingClick.current !== null) {
      // The press never moved — treat it as a click, open the popover.
      const pc = pendingClick.current;
      setSelectedVertex({
        startboxIndex: pc.startboxIndex,
        vertexIndex: pc.vertexIndex,
        anchorEl: pc.anchorEl,
      });
      pendingClick.current = null;
    }
    selectedElement.current = null;
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
            ...(draw.mode ? { cursor: "crosshair" } : {}),
          }}
          onMouseLeave={endInteraction}
          onMouseDown={(e) => {
            if (draw.mode) {
              e.preventDefault();
              draw.onMouseDown(svgPoint(e));
            }
          }}
          onMouseUp={(e) => {
            if (draw.mode) draw.onMouseUp(svgPoint(e));
            else endInteraction();
          }}
          onMouseMove={(e) => {
            if (draw.mode) draw.onMouseMove(svgPoint(e));
            else mouseMove(e);
          }}
          onClick={() => {
            setDeleteStartbox(false);
            setDeleteVertex(false);
          }}
        >
          <image
            width={200}
            height={200}
            x={0}
            y={0}
            href={props.textureUrl}
            preserveAspectRatio="none"
          ></image>
          <g style={{ pointerEvents: draw.mode ? "none" : undefined }}>
            {startboxes.boxes.map((startbox, startboxIndex) => {
              const poly = startbox.poly;
              const pathStr = tessellatedPathString(poly);
              const center = polygonCentroid(poly);
              return (
                <g key={startboxIndex}>
                  <path
                    d={pathStr}
                    fill="rgba(255, 0, 0, 0.15)"
                    stroke="red"
                    strokeWidth="0.5"
                    style={{
                      cursor: deleteStartbox
                        ? "pointer"
                        : props.editable
                        ? "grab"
                        : "auto",
                    }}
                    onClick={() => maybeDeleteStartbox(startboxIndex)}
                    onMouseDown={(e) => {
                      if (deleteStartbox || deleteVertex || !props.editable)
                        return;
                      const origin = svgPoint(e);
                      selectedElement.current = {
                        type: "move",
                        startboxIndex,
                        origin,
                      };
                    }}
                  />
                  <text
                    x={center.x}
                    y={center.y}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="white"
                    fontSize="12px"
                  >
                    {startboxIndex + 1}
                  </text>
                  {props.editable && (
                    <>
                      {/* Vertex drag handles, sized/coloured by strength */}
                      {poly.map((point, vertexIndex) => {
                        const s = point.strength ?? 0;
                        const vis = deleteVertex
                          ? { fill: "#ff6666", r: 2.5 }
                          : strengthVisuals(s);
                        const isSelected =
                          selectedVertex !== null &&
                          selectedVertex.startboxIndex === startboxIndex &&
                          selectedVertex.vertexIndex === vertexIndex;
                        return (
                          <g key={`v${vertexIndex}`}>
                            {isSelected && (
                              <circle
                                cx={point.x}
                                cy={point.y}
                                fill="none"
                                stroke="white"
                                strokeWidth="0.6"
                                r={vis.r + 1.5}
                                pointerEvents="none"
                              />
                            )}
                            <circle
                              cx={point.x}
                              cy={point.y}
                              fill={vis.fill}
                              r={vis.r}
                              style={{
                                cursor: deleteVertex ? "pointer" : "move",
                              }}
                              onMouseDown={(e) => {
                                if (deleteVertex) {
                                  e.stopPropagation();
                                  if (poly.length > 3) {
                                    setStartboxes(
                                      startboxes.update(startboxIndex, (sb) =>
                                        sb.removeVertex(vertexIndex)
                                      )
                                    );
                                  }
                                  setDeleteVertex(false);
                                  return;
                                }
                                e.stopPropagation();
                                pendingClick.current = {
                                  startboxIndex,
                                  vertexIndex,
                                  anchorEl: e.currentTarget,
                                  clientX: e.clientX,
                                  clientY: e.clientY,
                                };
                                selectedElement.current = {
                                  type: "vertex",
                                  startboxIndex,
                                  vertexIndex,
                                };
                              }}
                            >
                              <title>
                                {`vertex ${
                                  vertexIndex + 1
                                } — strength ${formatStrength(s)}`}
                              </title>
                            </circle>
                          </g>
                        );
                      })}
                      {/* Edge insert handles, riding the rendered curve. */}
                      {poly.map((_, i) => {
                        const mid = curveMidpoint(poly, i);
                        const newStrength = insertionStrength(poly, i);
                        const newPoint: Point = {
                          x: mid.x,
                          y: mid.y,
                        };
                        if (newStrength > 0) newPoint.strength = newStrength;
                        return (
                          <circle
                            key={`m${i}`}
                            cx={mid.x}
                            cy={mid.y}
                            fill="rgba(255, 255, 255, 0.6)"
                            stroke="red"
                            strokeWidth="0.3"
                            r="1.5"
                            style={{ cursor: "crosshair" }}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              setStartboxes(
                                startboxes.update(startboxIndex, (sb) =>
                                  sb.insertVertex(i, newPoint)
                                )
                              );
                            }}
                          />
                        );
                      })}
                    </>
                  )}
                </g>
              );
            })}
          </g>
          {draw.preview && (
            <g style={{ pointerEvents: "none" }}>
              {draw.preview.closed ? (
                <polygon
                  points={draw.preview.points
                    .map((p) => `${p.x},${p.y}`)
                    .join(" ")}
                  fill="rgba(0, 150, 255, 0.12)"
                  stroke="deepskyblue"
                  strokeWidth="0.7"
                  strokeDasharray="2 2"
                />
              ) : (
                <polyline
                  points={draw.preview.points
                    .map((p) => `${p.x},${p.y}`)
                    .join(" ")}
                  fill="none"
                  stroke="deepskyblue"
                  strokeWidth="0.7"
                  strokeDasharray="2 2"
                />
              )}
              {draw.preview.points.map((p, i) => (
                <circle
                  key={`dp${i}`}
                  cx={p.x}
                  cy={p.y}
                  r={!draw.preview!.closed && i === 0 ? 2.2 : 1}
                  fill={
                    !draw.preview!.closed && i === 0
                      ? "rgba(0, 150, 255, 0.4)"
                      : "deepskyblue"
                  }
                  stroke={
                    !draw.preview!.closed && i === 0 ? "deepskyblue" : "none"
                  }
                  strokeWidth="0.5"
                />
              ))}
            </g>
          )}
        </svg>
      </div>
    </>
  );

  if (props.editable) {
    const selectedSb =
      selectedVertex !== null
        ? startboxes.boxes[selectedVertex.startboxIndex]
        : null;
    const selectedStrength =
      selectedSb !== null
        ? selectedSb.poly[selectedVertex!.vertexIndex].strength ?? 0
        : 0;
    const popoverOrigins =
      selectedSb !== null
        ? popoverOriginsFor(selectedSb.poly, selectedVertex!.vertexIndex)
        : null;

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
                onClick={(e) => setCreateAnchor(e.currentTarget)}
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
                onClick={() => {
                  setDeleteStartbox(!deleteStartbox);
                  setDeleteVertex(false);
                }}
              >
                <DeleteIcon />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Remove vertex (click a vertex to remove it)">
            <span>
              <IconButton
                size="small"
                color={deleteVertex ? "error" : "default"}
                onClick={() => {
                  setDeleteVertex(!deleteVertex);
                  setDeleteStartbox(false);
                }}
              >
                <RemoveCircleOutlineIcon />
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
        <CreateStartboxMenu
          anchorEl={createAnchor}
          open={Boolean(createAnchor)}
          onClose={() => setCreateAnchor(null)}
          onSelect={(m) => draw.start(m)}
        />
        <div
          style={{
            flexGrow: 1,
            position: "relative",
            minHeight: "450px",
          }}
        >
          {mapView}
        </div>

        {/* Strength popover, anchored at the clicked vertex's <circle>.
            Slider snaps to step 0.05 with explicit snap-to-0 below 0.025
            and snap-to-1 above 0.975 so map makers can't accidentally store
            strength=0.03 by nudging the slider. */}
        <Popover
          open={selectedVertex !== null && selectedSb !== null}
          anchorEl={selectedVertex?.anchorEl ?? null}
          onClose={() => setSelectedVertex(null)}
          anchorOrigin={
            popoverOrigins?.anchorOrigin ?? {
              vertical: "bottom",
              horizontal: "right",
            }
          }
          transformOrigin={
            popoverOrigins?.transformOrigin ?? {
              vertical: "top",
              horizontal: "left",
            }
          }
          disableRestoreFocus
          PaperProps={{ sx: { p: 1.5, minWidth: 240 } }}
        >
          {selectedVertex !== null && selectedSb !== null && (
            <>
              <Stack direction="column" spacing={1}>
                <Typography variant="caption" color="text.secondary">
                  {`Box ${selectedVertex.startboxIndex + 1} · vertex ${
                    selectedVertex.vertexIndex + 1
                  }`}
                </Typography>
                <Typography variant="body2">
                  {`Strength: ${formatStrength(selectedStrength)}`}
                </Typography>
                <Slider
                  value={selectedStrength}
                  min={0}
                  max={1}
                  step={STRENGTH_STEP}
                  marks={[
                    { value: 0, label: "0" },
                    { value: 0.5, label: "0.5" },
                    { value: 1, label: "1" },
                  ]}
                  onChange={(_, raw) => {
                    const v = Array.isArray(raw) ? raw[0] : raw;
                    setStartboxes(
                      startboxes.update(selectedVertex.startboxIndex, (sb) =>
                        sb.setVertexStrength(
                          selectedVertex.vertexIndex,
                          v as number
                        )
                      )
                    );
                  }}
                  valueLabelDisplay="auto"
                  valueLabelFormat={(v) => formatStrength(snapStrength(v))}
                  // Tuck the mark labels under the track (default 30px) to fit the popover.
                  sx={{ "& .MuiSlider-markLabel": { top: "23px" } }}
                />
              </Stack>
              {/* Sibling of the Stack, not a child, to escape Stack's
                  auto-injected margin-top that would override this mt. */}
              <Button
                size="small"
                variant="outlined"
                onClick={() => {
                  setStartboxes(
                    startboxes.update(selectedVertex.startboxIndex, (sb) =>
                      sb.setUniformStrength(selectedStrength)
                    )
                  );
                }}
                sx={{ mt: "24px" }}
              >
                Apply to whole startbox
              </Button>
            </>
          )}
        </Popover>

        <Stack direction="row" flexWrap="wrap" style={{ columnGap: "10px" }}>
          {startboxes.boxes.map((startbox, startboxIndex) => (
            <TextField
              key={startboxIndex}
              value={startbox.str}
              size="small"
              label={`${startboxIndex + 1} (${startbox.poly.length} pts)`}
              style={{ width: "280px" }}
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
        <div
          style={{
            padding: "20px",
            minWidth: "500px",
            maxWidth: "700px",
          }}
        >
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
