import { StartPos, configLabel } from "./types";

export interface ConfigError {
  configIdx: number;
  message: string;
}

// Same checks as maps-metadata scripts/js/src/check_startpos.ts, so map makers
// hit the same problems here rather than at metadata-generation time.
export function validateStartPos(sp: StartPos): ConfigError[] {
  const errors: ConfigError[] = [];
  const positionNames = new Set(Object.keys(sp.positions));
  const seenConfs = new Set<string>();

  (sp.team || []).forEach((team, ti) => {
    const label = configLabel(team.teamCount, team.playersPerTeam);
    const add = (message: string) => errors.push({ configIdx: ti, message });

    const confKey = `${team.teamCount}|${team.playersPerTeam}`;
    if (seenConfs.has(confKey)) add(`Duplicate ${label} config`);
    seenConfs.add(confKey);

    if (team.teamCount !== team.sides.length)
      add(`Needs ${team.teamCount} teams but has ${team.sides.length}`);

    // Within a config a position is either a spawn or the base center of a
    // single start, never both.
    const spawns = new Set(
      team.sides.flatMap((s) => s.starts.map((st) => st.spawnPoint))
    );
    const bases = new Set<string>();
    team.sides.forEach((side) =>
      side.starts.forEach((start) => {
        const b = start.baseCenter;
        if (!b) return;
        if (spawns.has(b)) add(`"${b}" is both a start position and a base`);
        else if (bases.has(b)) add(`"${b}" is the base of multiple starts`);
        bases.add(b);
      })
    );

    team.sides.forEach((side, si) => {
      const short = team.playersPerTeam - side.starts.length;
      const n = Math.abs(short);
      const noun = `start position${n === 1 ? "" : "s"}`;
      if (short > 0) add(`Team ${si + 1} needs ${n} more ${noun}`);
      else if (short < 0) add(`Team ${si + 1} has ${n} ${noun} too many`);

      side.starts.forEach((start, sti) => {
        const where = `Team ${si + 1} start ${sti + 1}`;
        if (!start.spawnPoint) add(`${where} is empty`);
        else if (!positionNames.has(start.spawnPoint))
          add(`${where} points to missing position "${start.spawnPoint}"`);
        if (start.baseCenter && !positionNames.has(start.baseCenter))
          add(`${where} points to missing base "${start.baseCenter}"`);
      });
    });
  });

  return errors;
}
