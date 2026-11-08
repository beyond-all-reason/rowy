// startPos data model, matching the maps-metadata schema (StartPosConf).
// https://github.com/beyond-all-reason/maps-metadata/wiki/Rowy-Maps-fields-legend

export const ROLES = [
  "air",
  "air/front",
  "air/sea",
  "air/tech",
  "front",
  "front/sea",
  "front/tech",
  "sea",
  "sea/tech",
  "tech",
] as const;

export type Role = typeof ROLES[number];

export interface Position {
  x: number;
  y: number;
}

export type Positions = Record<string, Position>;

export interface Start {
  spawnPoint: string;
  baseCenter?: string;
  role?: Role;
}

export interface Side {
  starts: Start[];
}

export interface TeamConf {
  playersPerTeam: number;
  teamCount: number;
  sides: Side[];
}

export interface StartPos {
  positions: Positions;
  team?: TeamConf[];
}

// Position names: digits, letters, spaces, and _ . -
export const POSITION_NAME_RE = /^[a-zA-Z0-9 _.-]+$/;

// dimensions are stored as map units (e.g. "12 x 20"); 1 unit = 512 elmos.
export const ELMOS_PER_UNIT = 512;

// 2 teams x 1 player -> "1v1"; 3 teams x 2 -> "2v2v2".
export function configLabel(teamCount: number, playersPerTeam: number): string {
  return Array.from({ length: teamCount }, () => playersPerTeam).join("v");
}
