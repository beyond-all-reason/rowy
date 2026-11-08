import { StartPos, Positions, TeamConf, Role, ROLES } from "./types";

const ROLE_SET = new Set<string>(ROLES);

// The stored cell value is normally a Firestore map, but tolerate a JSON
// string too (some columns store startPos as text).
export function loadStartPos(value: unknown): StartPos {
  let raw: any = value;
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (trimmed === "") return { positions: {} };
    try {
      raw = JSON.parse(trimmed);
    } catch {
      return { positions: {} };
    }
  }
  if (!raw || typeof raw !== "object") return { positions: {} };

  const positions: Positions = {};
  if (raw.positions && typeof raw.positions === "object") {
    for (const [name, p] of Object.entries<any>(raw.positions)) {
      if (p && typeof p === "object") {
        positions[name] = { x: Number(p.x) || 0, y: Number(p.y) || 0 };
      }
    }
  }

  const team: TeamConf[] = Array.isArray(raw.team)
    ? raw.team.map((t: any) => ({
        playersPerTeam: Number(t?.playersPerTeam) || 1,
        teamCount: Number(t?.teamCount) || 1,
        sides: Array.isArray(t?.sides)
          ? t.sides.map((s: any) => ({
              starts: Array.isArray(s?.starts)
                ? s.starts.map((start: any) => {
                    const out: {
                      spawnPoint: string;
                      baseCenter?: string;
                      role?: Role;
                    } = { spawnPoint: String(start?.spawnPoint ?? "") };
                    if (start?.baseCenter)
                      out.baseCenter = String(start.baseCenter);
                    if (start?.role && ROLE_SET.has(start.role))
                      out.role = start.role;
                    return out;
                  })
                : [],
            }))
          : [],
      }))
    : [];

  return { positions, team };
}

// Editor state -> stored cell value. Drops empty team[] and optional fields
// that aren't set so the saved JSON matches the schema's expectations.
export function saveStartPos(sp: StartPos): StartPos {
  const out: StartPos = { positions: sp.positions };
  if (sp.team && sp.team.length > 0) {
    out.team = sp.team.map((t) => ({
      playersPerTeam: t.playersPerTeam,
      teamCount: t.teamCount,
      sides: t.sides.map((s) => ({
        starts: s.starts.map((start) => {
          const o: { spawnPoint: string; baseCenter?: string; role?: Role } = {
            spawnPoint: start.spawnPoint,
          };
          if (start.baseCenter) o.baseCenter = start.baseCenter;
          if (start.role) o.role = start.role;
          return o;
        }),
      })),
    }));
  }
  return out;
}
