import { Position, Positions, Side, Start, TeamConf, StartPos } from "./types";

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

// Immutable editor state for a whole startPos document.
export class StartPosState {
  constructor(
    public readonly positions: Positions,
    public readonly team: TeamConf[]
  ) {}

  static fromStartPos(sp: StartPos): StartPosState {
    return new StartPosState(clone(sp.positions), clone(sp.team ?? []));
  }

  toStartPos(): StartPos {
    return { positions: this.positions, team: this.team };
  }

  // Lowest unused "P<n>" name.
  nextPositionName(): string {
    let n = 1;
    while (`P${n}` in this.positions) n++;
    return `P${n}`;
  }

  addPosition(name: string, pos: Position): StartPosState {
    return new StartPosState({ ...this.positions, [name]: pos }, this.team);
  }

  movePosition(name: string, pos: Position): StartPosState {
    if (!(name in this.positions)) return this;
    return new StartPosState({ ...this.positions, [name]: pos }, this.team);
  }

  removePosition(name: string): StartPosState {
    if (!(name in this.positions)) return this;
    const positions = { ...this.positions };
    delete positions[name];

    // Drop refs to the deleted position so a config can't carry a dangling
    // spawnPoint/baseCenter.
    const team = this.team.map((t) => ({
      ...t,
      sides: t.sides.map((s) => ({
        starts: s.starts
          .filter((start) => start.spawnPoint !== name)
          .map((start) =>
            start.baseCenter === name
              ? { ...start, baseCenter: undefined }
              : start
          ),
      })),
    }));

    return new StartPosState(positions, team);
  }

  // Rename a position and update every spawnPoint/baseCenter that referenced it.
  renamePosition(oldName: string, newName: string): StartPosState {
    if (oldName === newName || !(oldName in this.positions)) return this;

    const positions: Positions = {};
    for (const [k, v] of Object.entries(this.positions)) {
      positions[k === oldName ? newName : k] = v;
    }

    const team = this.team.map((t) => ({
      ...t,
      sides: t.sides.map((s) => ({
        starts: s.starts.map((start) => {
          const next = { ...start };
          if (next.spawnPoint === oldName) next.spawnPoint = newName;
          if (next.baseCenter === oldName) next.baseCenter = newName;
          return next;
        }),
      })),
    }));

    return new StartPosState(positions, team);
  }

  private updateTeam(
    idx: number,
    fn: (t: TeamConf) => TeamConf
  ): StartPosState {
    const team = this.team.map((t, i) => (i === idx ? fn(t) : t));
    return new StartPosState(this.positions, team);
  }

  // New configs start with empty teams; spawns are assigned by clicking
  // markers on the map (setSpawnTeam), not pre-filled.
  addTeam(): StartPosState {
    const conf: TeamConf = {
      playersPerTeam: 1,
      teamCount: 2,
      sides: [{ starts: [] }, { starts: [] }],
    };
    return new StartPosState(this.positions, [...this.team, conf]);
  }

  removeTeam(idx: number): StartPosState {
    return new StartPosState(
      this.positions,
      this.team.filter((_, i) => i !== idx)
    );
  }

  setTeamCount(idx: number, teamCount: number): StartPosState {
    const n = Math.max(1, Math.floor(teamCount) || 1);
    return this.updateTeam(idx, (t) => {
      const sides = t.sides.slice(0, n);
      while (sides.length < n) sides.push({ starts: [] });
      return { ...t, teamCount: n, sides };
    });
  }

  // playersPerTeam is the declared target; actual assignment is validated
  // against it rather than auto-filled.
  setPlayersPerTeam(idx: number, players: number): StartPosState {
    const n = Math.max(1, Math.floor(players) || 1);
    return this.updateTeam(idx, (t) => ({ ...t, playersPerTeam: n }));
  }

  // Move a spawn to a team (side) within a config, or remove it from the
  // config when sideIdx is null. Preserves the spawn's role/baseCenter.
  setSpawnTeam(
    configIdx: number,
    spawnName: string,
    sideIdx: number | null
  ): StartPosState {
    const team = this.team[configIdx];
    if (!team) return this;

    let carried: Start | undefined;
    const sides = team.sides.map((s) => ({
      starts: s.starts.filter((st) => {
        if (st.spawnPoint === spawnName) {
          carried = st;
          return false;
        }
        return true;
      }),
    }));

    if (sideIdx !== null && sideIdx >= 0 && sideIdx < sides.length) {
      const start: Start = { spawnPoint: spawnName };
      if (carried?.role) start.role = carried.role;
      if (carried?.baseCenter) start.baseCenter = carried.baseCenter;
      // A position is either a spawn or a base center within a config, so
      // turning it into a spawn releases it from whichever start used it.
      for (const s of sides) {
        s.starts = s.starts.map((st) =>
          st.baseCenter === spawnName
            ? normalizeStart({ ...st, baseCenter: undefined })
            : st
        );
      }
      sides[sideIdx] = { starts: [...sides[sideIdx].starts, start] };
    }

    return this.withSides(configIdx, sides);
  }

  // Point a spawn's baseCenter at another position (or clear it). Within a
  // config a base center is exclusively a base center: it's dropped as a
  // spawn (with its team/role) and taken away from any other start using it.
  setBaseCenter(
    configIdx: number,
    spawnName: string,
    baseName: string | undefined
  ): StartPosState {
    const team = this.team[configIdx];
    if (!team || baseName === spawnName) return this;

    const sides = team.sides.map((s) => ({
      starts: s.starts
        .filter((st) => !baseName || st.spawnPoint !== baseName)
        .map((st) => {
          if (st.spawnPoint === spawnName)
            return normalizeStart({ ...st, baseCenter: baseName });
          if (baseName && st.baseCenter === baseName)
            return normalizeStart({ ...st, baseCenter: undefined });
          return st;
        }),
    }));

    return this.withSides(configIdx, sides);
  }

  private withSides(configIdx: number, sides: Side[]): StartPosState {
    return this.updateTeam(configIdx, (t) => ({ ...t, sides }));
  }

  setStart(
    teamIdx: number,
    sideIdx: number,
    startIdx: number,
    patch: Partial<Start>
  ): StartPosState {
    return this.updateTeam(teamIdx, (t) => ({
      ...t,
      sides: t.sides.map((s, si) =>
        si !== sideIdx
          ? s
          : {
              starts: s.starts.map((start, sti) =>
                sti !== startIdx
                  ? start
                  : normalizeStart({ ...start, ...patch })
              ),
            }
      ),
    }));
  }
}

// Drop optional keys when cleared so saved JSON stays minimal.
function normalizeStart(start: Start): Start {
  const out: Start = { spawnPoint: start.spawnPoint };
  if (start.baseCenter) out.baseCenter = start.baseCenter;
  if (start.role) out.role = start.role;
  return out;
}
