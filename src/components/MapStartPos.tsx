import { useState, useRef, useEffect, useCallback } from "react";
import AddLocationAltIcon from "@mui/icons-material/AddLocationAlt";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import CodeIcon from "@mui/icons-material/Code";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import FitScreenIcon from "@mui/icons-material/FitScreen";
import {
  ButtonGroup,
  Tooltip,
  IconButton,
  TextField,
  TextFieldProps,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Stack,
  Popover,
  Button,
  Alert,
  Tabs,
  Tab,
  Typography,
  Paper,
  Divider,
} from "@mui/material";

import {
  StartPos,
  Position,
  Role,
  ROLES,
  POSITION_NAME_RE,
  configLabel,
} from "./startpos/types";
import { MapDimensions, clampToBounds } from "./startpos/geometry";
import { StartPosState } from "./startpos/state";
import { loadStartPos, saveStartPos } from "./startpos/serialization";
import { validateStartPos } from "./startpos/validation";
import { useResizedImage } from "@src/hooks/useResizedImage";

export interface MapStartPosProps {
  textureUrl: string;
  dimensions: MapDimensions;
  startPos: StartPos | unknown;
  updatedStartPos?: (startPos: StartPos) => void;
  editable?: boolean;
  onClose?: () => void;
}

const CLICK_DRAG_THRESHOLD = 3;
const ZOOM_STEP = 1.15;
const MIN_SPAN = 0.1;
const MAX_SPAN = 4;
const SIDE_COLORS = [
  "#2196f3",
  "#ef5350",
  "#66bb6a",
  "#ffa726",
  "#ab47bc",
  "#26c6da",
  "#d4e157",
  "#8d6e63",
];
function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

interface SpawnUse {
  role?: Role;
  baseCenter?: string;
  sideIdx: number;
  startIdx: number;
}

function serialize(sp: StartPos): string {
  return JSON.stringify(saveStartPos(sp));
}

export default function MapStartPos(props: MapStartPosProps) {
  const { dimensions } = props;
  const W = dimensions.widthElmos;
  const H = dimensions.heightElmos;
  // Match the in-game render (map_start_position_suggestions.lua): a fixed
  // 300-elmo circle. Name and role share one label size (in elmo units).
  const R = 300;
  const LABEL_SIZE = 110;

  const initial = useRef(loadStartPos(props.startPos));
  const [state, setState] = useState<StartPosState>(() =>
    StartPosState.fromStartPos(initial.current)
  );

  const [configIdx, setConfigIdx] = useState(0);
  const [addMode, setAddMode] = useState(false);
  const [deleteMode, setDeleteMode] = useState(false);
  // Raw-JSON view/edit; null = closed.
  const [jsonDraft, setJsonDraft] = useState<string | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{
    name: string;
    anchorEl: Element;
  } | null>(null);

  const dragging = useRef<string | null>(null);
  const pendingClick = useRef<{
    name: string;
    anchorEl: Element;
    clientX: number;
    clientY: number;
  } | null>(null);

  // SVG viewBox drives zoom/pan; fit (the whole map) is 0,0..W,H.
  const [view, setView] = useState(() => ({ x: 0, y: 0, w: W, h: H }));
  const viewRef = useRef(view);
  viewRef.current = view;
  const panning = useRef<{
    clientX: number;
    clientY: number;
    viewX: number;
    viewY: number;
    scale: number;
  } | null>(null);
  const atFit = view.x === 0 && view.y === 0 && view.w === W && view.h === H;

  // Cursor-anchored wheel zoom, bound natively (so preventDefault holds) via a
  // ref callback so it re-binds to whichever SVG is mounted (inline/fullscreen).
  const wheelCleanup = useRef<(() => void) | null>(null);
  const attachSvg = useCallback(
    (node: SVGSVGElement | null) => {
      wheelCleanup.current?.();
      wheelCleanup.current = null;
      if (!node || !props.editable) return;
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        const ctm = node.getScreenCTM();
        if (!ctm) return;
        const px = (e.clientX - ctm.e) / ctm.a;
        const py = (e.clientY - ctm.f) / ctm.d;
        const v = viewRef.current;
        const factor = e.deltaY < 0 ? 1 / ZOOM_STEP : ZOOM_STEP;
        const span = Math.min(Math.max((v.w / W) * factor, MIN_SPAN), MAX_SPAN);
        const k = (W * span) / v.w;
        setView({
          x: px - (px - v.x) * k,
          y: py - (py - v.y) * k,
          w: W * span,
          h: H * span,
        });
      };
      node.addEventListener("wheel", onWheel, { passive: false });
      wheelCleanup.current = () => node.removeEventListener("wheel", onWheel);
    },
    [props.editable, W, H]
  );

  const positionNames = Object.keys(state.positions);
  const errors = validateStartPos(state.toStartPos());
  const errorsByConfig = new Map<number, string[]>();
  errors.forEach((e) => {
    const list = errorsByConfig.get(e.configIdx) ?? [];
    list.push(e.message);
    errorsByConfig.set(e.configIdx, list);
  });
  const outOfBounds = positionNames.filter((n) => {
    const p = state.positions[n];
    return p.x < 0 || p.x > W || p.y < 0 || p.y > H;
  });

  const team = state.team;
  const activeConfig = configIdx < team.length ? configIdx : 0;
  const config = team[activeConfig];

  const erroredConfigs = Array.from(
    new Set(
      Array.from(errorsByConfig.keys())
        .filter((i) => team[i])
        .map((i) => configLabel(team[i].teamCount, team[i].playersPerTeam))
    )
  );

  // For the active config, map each used spawn -> its role/team/slot.
  const spawnUse = new Map<string, SpawnUse>();
  config?.sides.forEach((side, sideIdx) =>
    side.starts.forEach((start, startIdx) => {
      if (start.spawnPoint) {
        spawnUse.set(start.spawnPoint, {
          role: start.role,
          baseCenter: start.baseCenter,
          sideIdx,
          startIdx,
        });
      }
    })
  );

  // For the active config, map each base center -> the spawn that owns it.
  const baseOf = new Map<string, { spawn: string; sideIdx: number }>();
  spawnUse.forEach((use, spawn) => {
    if (use.baseCenter && use.baseCenter in state.positions)
      baseOf.set(use.baseCenter, { spawn, sideIdx: use.sideIdx });
  });

  // Off-map positions are drawn pinned to the nearest edge.
  const displayPos = (name: string): Position => {
    const p = state.positions[name];
    const oob = p.x < 0 || p.x > W || p.y < 0 || p.y > H;
    return oob ? clampToBounds(p, dimensions) : p;
  };

  useEffect(() => {
    if (selected && !(selected.name in state.positions)) setSelected(null);
  }, [state, selected]);

  useEffect(() => {
    if (configIdx >= team.length && team.length > 0)
      setConfigIdx(team.length - 1);
  }, [team.length, configIdx]);

  useEffect(() => {
    setView({ x: 0, y: 0, w: W, h: H });
  }, [W, H]);

  // Explicit save, mirroring the startbox editor: edits stay local until the
  // user saves, so a stray click or drag never mutates the stored data.
  const [savedSerialized, setSavedSerialized] = useState(() =>
    serialize(initial.current)
  );
  const dirty = serialize(state.toStartPos()) !== savedSerialized;

  // Follow the stored value when it changes underneath us (our own save landing
  // in a still-mounted cell preview, another user, the side drawer), unless
  // there are unsaved local edits that it would clobber.
  const propSerialized = serialize(loadStartPos(props.startPos));
  useEffect(() => {
    if (propSerialized === savedSerialized || dirty) return;
    setState(StartPosState.fromStartPos(loadStartPos(props.startPos)));
    setSavedSerialized(propSerialized);
    // Only react to the stored value changing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propSerialized]);

  function saveEdits() {
    if (!props.updatedStartPos) return;
    const sp = state.toStartPos();
    props.updatedStartPos(saveStartPos(sp));
    setSavedSerialized(serialize(sp));
  }

  function openJson() {
    setJsonDraft(JSON.stringify(saveStartPos(state.toStartPos()), null, 2));
    setJsonError(null);
  }

  function applyJson() {
    try {
      const parsed = JSON.parse(jsonDraft ?? "");
      // loadStartPos coerces anything malformed to an empty document, which
      // would silently wipe everything on Apply, so reject bad shapes here.
      const isObj = (v: unknown) =>
        typeof v === "object" && v !== null && !Array.isArray(v);
      if (!isObj(parsed))
        throw new Error("Expected an object with a `positions` key");
      if (!isObj(parsed.positions))
        throw new Error("`positions` must be an object of name -> {x, y}");
      if (parsed.team !== undefined && !Array.isArray(parsed.team))
        throw new Error("`team` must be an array");
      setState(StartPosState.fromStartPos(loadStartPos(parsed)));
      setJsonDraft(null);
      setJsonError(null);
    } catch (e) {
      setJsonError((e as Error).message);
    }
  }

  function svgPoint(event: React.MouseEvent<SVGElement, MouseEvent>): Position {
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

  function onBackgroundClick(
    event: React.MouseEvent<SVGSVGElement, MouseEvent>
  ) {
    if (!addMode) return;
    const elmo = clampToBounds(svgPoint(event), dimensions);
    const name = state.nextPositionName();
    setState(state.addPosition(name, elmo));
    setAddMode(false);
  }

  function onMouseMove(event: React.MouseEvent<SVGSVGElement, MouseEvent>) {
    if (panning.current) {
      const p = panning.current;
      setView((v) => ({
        ...v,
        x: p.viewX - (event.clientX - p.clientX) / p.scale,
        y: p.viewY - (event.clientY - p.clientY) / p.scale,
      }));
      return;
    }
    if (pendingClick.current) {
      const dx = event.clientX - pendingClick.current.clientX;
      const dy = event.clientY - pendingClick.current.clientY;
      if (dx * dx + dy * dy >= CLICK_DRAG_THRESHOLD * CLICK_DRAG_THRESHOLD) {
        dragging.current = pendingClick.current.name;
        pendingClick.current = null;
      }
    }
    if (!dragging.current) return;
    event.preventDefault();
    const elmo = clampToBounds(svgPoint(event), dimensions);
    setState((s) => s.movePosition(dragging.current!, elmo));
  }

  function endInteraction() {
    if (pendingClick.current) {
      const pc = pendingClick.current;
      setSelected({ name: pc.name, anchorEl: pc.anchorEl });
      pendingClick.current = null;
    }
    dragging.current = null;
    panning.current = null;
  }

  function onBackgroundMouseDown(
    event: React.MouseEvent<SVGSVGElement, MouseEvent>
  ) {
    if (!props.editable || addMode) return;
    const ctm = event.currentTarget.getScreenCTM();
    if (!ctm) return;
    event.preventDefault();
    panning.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      viewX: view.x,
      viewY: view.y,
      scale: ctm.a,
    };
  }

  // The read-only view (table cell) loads a texture resized to the displayed
  // size; the editor keeps the full-resolution original for zooming in.
  const texture = useResizedImage(props.textureUrl, !props.editable);

  const mapView = (
    <svg
      ref={attachSvg}
      viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
      preserveAspectRatio="xMidYMid meet"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        cursor: addMode ? "crosshair" : props.editable ? "grab" : "default",
      }}
      onMouseLeave={endInteraction}
      onMouseUp={endInteraction}
      onMouseMove={onMouseMove}
      onMouseDown={onBackgroundMouseDown}
      onClick={onBackgroundClick}
    >
      <image
        width={W}
        height={H}
        x={0}
        y={0}
        href={texture.src}
        onError={texture.onError}
        preserveAspectRatio="none"
      />
      {Array.from(baseOf.entries()).map(([base, { spawn, sideIdx }]) => {
        // Arrow from the spawn's circle edge to the base center's circle edge.
        const a = displayPos(spawn);
        const b = displayPos(base);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        const head = R * 0.45;
        if (len <= 2 * R + head) return null;
        const ux = dx / len;
        const uy = dy / len;
        const x1 = a.x + ux * R;
        const y1 = a.y + uy * R;
        const tipX = b.x - ux * R;
        const tipY = b.y - uy * R;
        const baseX = tipX - ux * head;
        const baseY = tipY - uy * head;
        const hw = head * 0.6;
        const color = SIDE_COLORS[sideIdx % SIDE_COLORS.length];
        return (
          <g key={`arrow-${spawn}`} style={{ pointerEvents: "none" }}>
            <line
              x1={x1}
              y1={y1}
              x2={baseX}
              y2={baseY}
              stroke={color}
              strokeWidth={R * 0.12}
              strokeLinecap="round"
            />
            <polygon
              points={`${tipX},${tipY} ${baseX - uy * hw},${baseY + ux * hw} ${
                baseX + uy * hw
              },${baseY - ux * hw}`}
              fill={color}
            />
          </g>
        );
      })}
      {positionNames.map((name) => {
        const p = state.positions[name];
        const use = spawnUse.get(name);
        const baseFor = baseOf.get(name);
        const isSelected = selected?.name === name;
        const subLabel = use?.role ?? (baseFor ? "base" : undefined);

        // A position outside the map bounds would render off-canvas and be
        // unreachable, so pin it to the nearest edge (flagged) while the modal
        // and stored value keep the true coords for correction.
        const oob = p.x < 0 || p.x > W || p.y < 0 || p.y > H;
        const d = oob ? clampToBounds(p, dimensions) : p;
        const color = deleteMode
          ? "#e53935"
          : oob
          ? "#ff5252"
          : use
          ? SIDE_COLORS[use.sideIdx % SIDE_COLORS.length]
          : baseFor
          ? SIDE_COLORS[baseFor.sideIdx % SIDE_COLORS.length]
          : "#8a93a3";

        // Shrink the name to fit across the circle if it's long.
        const nameSize = Math.min(LABEL_SIZE, (1.7 * R) / (name.length * 0.62));

        return (
          <g key={name}>
            <circle
              cx={d.x}
              cy={d.y}
              r={R}
              fill={rgba(color, baseFor ? 0.12 : 0.28)}
              stroke={isSelected ? "#ffffff" : color}
              strokeWidth={isSelected ? R * 0.11 : R * 0.07}
              strokeDasharray={oob ? `${R * 0.22} ${R * 0.16}` : undefined}
              style={{
                cursor: deleteMode
                  ? "pointer"
                  : props.editable
                  ? "move"
                  : "default",
              }}
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => {
                if (!props.editable) return;
                e.stopPropagation();
                if (deleteMode) {
                  setState(state.removePosition(name));
                  setDeleteMode(false);
                  return;
                }
                pendingClick.current = {
                  name,
                  anchorEl: e.currentTarget,
                  clientX: e.clientX,
                  clientY: e.clientY,
                };
              }}
            >
              <title>
                {oob ? `${name} - off map at (${p.x}, ${p.y})` : name}
                {baseFor ? ` (base of ${baseFor.spawn})` : ""}
              </title>
            </circle>
            <text
              x={d.x}
              y={subLabel ? d.y - LABEL_SIZE * 0.6 : d.y}
              textAnchor="middle"
              dominantBaseline="central"
              fill="#ffffff"
              stroke="rgba(0,0,0,0.5)"
              strokeWidth={nameSize * 0.05}
              paintOrder="stroke"
              fontSize={nameSize}
              fontWeight={700}
              style={{ pointerEvents: "none", userSelect: "none" }}
            >
              {name}
            </text>
            {subLabel && (
              <text
                x={d.x}
                y={d.y + LABEL_SIZE * 0.6}
                textAnchor="middle"
                dominantBaseline="central"
                fill={use?.role ? "#ffd54f" : "#e0e0e0"}
                stroke="rgba(0,0,0,0.5)"
                strokeWidth={LABEL_SIZE * 0.05}
                paintOrder="stroke"
                fontSize={LABEL_SIZE}
                fontWeight={600}
                style={{ pointerEvents: "none", userSelect: "none" }}
              >
                {subLabel}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );

  // Whole-map fit (matching the startbox editor): the SVG letterboxes via
  // preserveAspectRatio="meet", so the container is just a defined box and the
  // whole map fits inside it in both axes rather than being cropped or stretched.
  const mapWrapStyle: React.CSSProperties = { width: "100%", height: "60vh" };
  const mapBox = (
    <div style={{ position: "relative", margin: "0 auto", ...mapWrapStyle }}>
      {mapView}
    </div>
  );

  if (!props.editable) {
    // In-cell preview: scale to fit the row height (aspect preserved), so a
    // portrait map fits vertically rather than overflowing from the cell width.
    return (
      <div
        style={{
          width: "100%",
          height: "100%",
          padding: 4,
          boxSizing: "border-box",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <div
          ref={texture.ref}
          style={{
            position: "relative",
            height: "100%",
            aspectRatio: `${W} / ${H}`,
            maxWidth: "100%",
          }}
        >
          {mapView}
        </div>
      </div>
    );
  }

  const selectedPos = selected ? state.positions[selected.name] : null;
  const selectedUse = selected ? spawnUse.get(selected.name) : undefined;
  const selectedBaseOf = selected
    ? baseOf.get(selected.name)?.spawn
    : undefined;

  const editorView = (
    <>
      <Stack direction="row" spacing={1} alignItems="center">
        <ButtonGroup variant="outlined" size="small">
          <Tooltip title="Add position (then click the map)">
            <span>
              <IconButton
                size="small"
                color={addMode ? "primary" : "default"}
                onClick={() => {
                  setAddMode(!addMode);
                  setDeleteMode(false);
                }}
              >
                <AddLocationAltIcon />
              </IconButton>
            </span>
          </Tooltip>
          <Tooltip title="Delete position (then click a marker)">
            <span>
              <IconButton
                size="small"
                color={deleteMode ? "error" : "default"}
                disabled={positionNames.length === 0}
                onClick={() => {
                  setDeleteMode(!deleteMode);
                  setAddMode(false);
                }}
              >
                <DeleteIcon />
              </IconButton>
            </span>
          </Tooltip>
        </ButtonGroup>

        <ButtonGroup variant="outlined" size="small">
          <Tooltip title="Reset zoom">
            <span>
              <IconButton
                size="small"
                disabled={atFit}
                onClick={() => setView({ x: 0, y: 0, w: W, h: H })}
              >
                <FitScreenIcon />
              </IconButton>
            </span>
          </Tooltip>
        </ButtonGroup>

        <div style={{ flexGrow: 1 }} />

        <ButtonGroup variant="outlined" size="small">
          <Tooltip title="View / edit raw JSON">
            <span>
              <IconButton size="small" onClick={openJson}>
                <CodeIcon />
              </IconButton>
            </span>
          </Tooltip>
        </ButtonGroup>
      </Stack>

      {mapBox}

      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <Stack spacing={1.5}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="subtitle2">Configurations</Typography>
            {team.length > 0 ? (
              <Tabs
                value={activeConfig}
                onChange={(_, v) => setConfigIdx(v)}
                variant="scrollable"
                scrollButtons="auto"
                sx={{ minHeight: 36, flexGrow: 1 }}
              >
                {team.map((t, i) => {
                  const hasErr = (errorsByConfig.get(i)?.length ?? 0) > 0;
                  return (
                    <Tab
                      key={i}
                      sx={{
                        minHeight: 36,
                        py: 0,
                        ...(hasErr && {
                          color: "error.main",
                          "&.Mui-selected": { color: "error.main" },
                        }),
                      }}
                      label={configLabel(t.teamCount, t.playersPerTeam)}
                    />
                  );
                })}
              </Tabs>
            ) : (
              <Typography
                variant="body2"
                color="text.secondary"
                sx={{ flexGrow: 1 }}
              >
                none yet
              </Typography>
            )}
            <Button
              size="small"
              startIcon={<AddIcon />}
              onClick={() => {
                setState(state.addTeam());
                setConfigIdx(team.length);
              }}
            >
              Add
            </Button>
          </Stack>

          {config && (
            <>
              <Divider />
              <Stack direction="row" spacing={1.5} alignItems="center">
                {/* Shrinking the team count drops whole teams, so commit only
                    on blur/Enter: typing "12" over "2" must not pass via 1. */}
                <NumberField
                  label="Teams"
                  value={config.teamCount}
                  min={1}
                  integer
                  commitOnBlur
                  onCommit={(n) =>
                    setState(state.setTeamCount(activeConfig, n))
                  }
                  sx={{ width: 90 }}
                />
                <NumberField
                  label="Players / team"
                  value={config.playersPerTeam}
                  min={1}
                  integer
                  onCommit={(n) =>
                    setState(state.setPlayersPerTeam(activeConfig, n))
                  }
                  sx={{ width: 120 }}
                />
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ flexGrow: 1 }}
                >
                  Click a marker to set its team & role
                </Typography>
                <Tooltip title="Delete this configuration">
                  <IconButton
                    size="small"
                    onClick={() => {
                      setState(state.removeTeam(activeConfig));
                      setConfigIdx(Math.max(0, activeConfig - 1));
                    }}
                  >
                    <DeleteIcon />
                  </IconButton>
                </Tooltip>
              </Stack>
              {(errorsByConfig.get(activeConfig)?.length ?? 0) > 0 && (
                <Alert severity="error" sx={{ "& ul": { m: 0, pl: 2 } }}>
                  <ul>
                    {errorsByConfig.get(activeConfig)!.map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </Alert>
              )}
            </>
          )}
        </Stack>
      </Paper>

      <Popover
        open={selected !== null && selectedPos !== null}
        anchorEl={selected?.anchorEl ?? null}
        onClose={() => setSelected(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        transformOrigin={{ vertical: "top", horizontal: "center" }}
        disableRestoreFocus
        PaperProps={{ sx: { p: 1.5, minWidth: 240 } }}
      >
        {selected !== null && selectedPos !== null && (
          <PositionEditor
            name={selected.name}
            pos={selectedPos}
            use={selectedUse}
            baseOf={selectedBaseOf}
            teamCount={config?.teamCount ?? 0}
            positionNames={positionNames}
            onRename={(newName) => {
              setState(state.renamePosition(selected.name, newName));
              setSelected({ ...selected, name: newName });
            }}
            onMove={(p) =>
              setState(
                state.movePosition(selected.name, clampToBounds(p, dimensions))
              )
            }
            onSetTeam={(sideIdx) =>
              setState(state.setSpawnTeam(activeConfig, selected.name, sideIdx))
            }
            onSetRole={(role) => {
              if (selectedUse)
                setState(
                  state.setStart(
                    activeConfig,
                    selectedUse.sideIdx,
                    selectedUse.startIdx,
                    { role }
                  )
                );
            }}
            onSetBase={(base) =>
              setState(state.setBaseCenter(activeConfig, selected.name, base))
            }
            onClearBaseOf={() => {
              if (selectedBaseOf)
                setState(
                  state.setBaseCenter(activeConfig, selectedBaseOf, undefined)
                );
            }}
            onDelete={() => {
              setState(state.removePosition(selected.name));
              setSelected(null);
            }}
          />
        )}
      </Popover>

      {outOfBounds.length > 0 && (
        <Alert severity="warning">
          {outOfBounds.length} position(s) lie outside the map and are pinned to
          the edge (red, dashed): {outOfBounds.join(", ")}. Click one to correct
          its coordinates.
        </Alert>
      )}

      <Dialog
        open={jsonDraft !== null}
        onClose={() => setJsonDraft(null)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>StartPos JSON</DialogTitle>
        <DialogContent>
          <TextField
            multiline
            minRows={14}
            fullWidth
            value={jsonDraft ?? ""}
            onChange={(e) => setJsonDraft(e.target.value)}
            error={jsonError !== null}
            helperText={jsonError ?? " "}
            InputProps={{ sx: { fontFamily: "monospace", fontSize: 12 } }}
          />
          <Stack direction="row" spacing={1} sx={{ mt: 1 }}>
            <Button
              startIcon={<ContentCopyIcon />}
              onClick={() =>
                jsonDraft && navigator.clipboard?.writeText(jsonDraft)
              }
            >
              Copy
            </Button>
            <Button variant="contained" onClick={applyJson}>
              Apply
            </Button>
            <div style={{ flexGrow: 1 }} />
            <Button onClick={() => setJsonDraft(null)}>Close</Button>
          </Stack>
        </DialogContent>
      </Dialog>
    </>
  );

  return (
    <Dialog
      open
      onClose={() => props.onClose?.()}
      fullWidth
      maxWidth="xl"
      PaperProps={{ sx: { height: "90vh" } }}
    >
      <DialogTitle>Start positions</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>{editorView}</Stack>
      </DialogContent>
      <DialogActions>
        {erroredConfigs.length > 0 && (
          <Typography
            variant="caption"
            color="error"
            sx={{ flexGrow: 1, pl: 1 }}
          >
            Fix {erroredConfigs.join(", ")} to save
          </Typography>
        )}
        <Button onClick={() => props.onClose?.()}>Cancel</Button>
        <Button
          variant="contained"
          disabled={!dirty || errors.length > 0}
          onClick={() => {
            saveEdits();
            props.onClose?.();
          }}
        >
          Save
        </Button>
      </DialogActions>
    </Dialog>
  );
}

interface PositionEditorProps {
  name: string;
  pos: Position;
  use?: SpawnUse;
  // Spawn this position is the base center of, in the active config.
  baseOf?: string;
  teamCount: number;
  positionNames: string[];
  onRename: (newName: string) => void;
  onMove: (pos: Position) => void;
  onSetTeam: (sideIdx: number | null) => void;
  onSetRole: (role: Role | undefined) => void;
  onSetBase: (base: string | undefined) => void;
  onClearBaseOf: () => void;
  onDelete: () => void;
}

function PositionEditor(props: PositionEditorProps) {
  const [name, setName] = useState(props.name);
  const nameError =
    name !== props.name &&
    (name.trim() === "" ||
      !POSITION_NAME_RE.test(name) ||
      props.positionNames.includes(name));

  function commitName() {
    if (!nameError && name !== props.name) props.onRename(name);
    else setName(props.name);
  }

  return (
    <Stack spacing={1.5}>
      <TextField
        size="small"
        label="Name"
        value={name}
        error={nameError}
        helperText={nameError ? "Invalid or duplicate name" : " "}
        onChange={(e) => setName(e.target.value)}
        onBlur={commitName}
        onKeyDown={(e) => e.key === "Enter" && commitName()}
      />
      {props.use && (
        <Stack direction="row" spacing={1}>
          <TextField
            select
            size="small"
            label="Role"
            value={props.use.role ?? ""}
            fullWidth
            onChange={(e) =>
              props.onSetRole((e.target.value || undefined) as Role | undefined)
            }
          >
            <MenuItem value="">
              <em>none</em>
            </MenuItem>
            {ROLES.map((r) => (
              <MenuItem key={r} value={r}>
                {r}
              </MenuItem>
            ))}
          </TextField>
          <TextField
            select
            size="small"
            label="Base"
            value={
              props.use.baseCenter &&
              props.positionNames.includes(props.use.baseCenter)
                ? props.use.baseCenter
                : ""
            }
            fullWidth
            onChange={(e) => props.onSetBase(e.target.value || undefined)}
          >
            <MenuItem value="">
              <em>none</em>
            </MenuItem>
            {props.positionNames
              .filter((n) => n !== props.name)
              .map((n) => (
                <MenuItem key={n} value={n}>
                  {n}
                </MenuItem>
              ))}
          </TextField>
        </Stack>
      )}

      {props.baseOf && (
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography variant="body2" sx={{ flexGrow: 1 }}>
            Base of <b>{props.baseOf}</b>
          </Typography>
          <Button size="small" onClick={props.onClearBaseOf}>
            Unset
          </Button>
        </Stack>
      )}

      {props.teamCount > 0 && (
        <TextField
          select
          size="small"
          label="Team"
          value={props.use ? String(props.use.sideIdx) : ""}
          onChange={(e) =>
            props.onSetTeam(
              e.target.value === "" ? null : Number(e.target.value)
            )
          }
        >
          <MenuItem value="">
            <em>not in this config</em>
          </MenuItem>
          {Array.from({ length: props.teamCount }, (_, i) => (
            <MenuItem key={i} value={String(i)}>
              Team {i + 1}
            </MenuItem>
          ))}
        </TextField>
      )}

      <Stack direction="row" spacing={1}>
        <NumberField
          label="x"
          value={props.pos.x}
          onCommit={(x) => props.onMove({ x, y: props.pos.y })}
        />
        <NumberField
          label="y"
          value={props.pos.y}
          onCommit={(y) => props.onMove({ x: props.pos.x, y })}
        />
      </Stack>

      <Button
        size="small"
        color="error"
        startIcon={<DeleteIcon />}
        onClick={props.onDelete}
      >
        Delete position
      </Button>
    </Stack>
  );
}

interface NumberFieldProps {
  label: string;
  value: number;
  onCommit: (n: number) => void;
  min?: number;
  integer?: boolean;
  // Commit only on blur/Enter instead of on every valid keystroke.
  commitOnBlur?: boolean;
  sx?: TextFieldProps["sx"];
}

// Numeric input that keeps its own text draft, so clearing the field or typing
// an intermediate value ("" / "-") never commits a bogus 0 to the state.
function NumberField(props: NumberFieldProps) {
  const [draft, setDraft] = useState(String(props.value));
  useEffect(() => setDraft(String(props.value)), [props.value]);

  const parse = (text: string): number | null => {
    if (text.trim() === "") return null;
    const n = Number(text);
    if (!Number.isFinite(n)) return null;
    if (props.integer && !Number.isInteger(n)) return null;
    if (props.min !== undefined && n < props.min) return null;
    return n;
  };

  const commit = () => {
    const n = parse(draft);
    if (n !== null && n !== props.value) props.onCommit(n);
    else setDraft(String(props.value));
  };

  return (
    <TextField
      type="number"
      size="small"
      label={props.label}
      value={draft}
      error={parse(draft) === null}
      onChange={(e) => {
        setDraft(e.target.value);
        if (props.commitOnBlur) return;
        const n = parse(e.target.value);
        if (n !== null) props.onCommit(n);
      }}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && commit()}
      sx={props.sx}
      inputProps={{ min: props.min, step: props.integer ? 1 : undefined }}
    />
  );
}
