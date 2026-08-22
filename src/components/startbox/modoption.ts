/*
 * The `mapmetadata_startbox_override` modoption transport:
 * `base64url(zlib(json))` with `=` padding stripped, holding a single
 * arrangement:
 *
 *   { "startboxes": [ { "poly": [ { "x": 0, "y": 0 }, { "x": 60, "y": 200 } ] } ] }
 *
 * A lobby host applies it with
 * `!bset mapmetadata_startbox_override <value>`, so the same value can be
 * copied out of, and pasted into, this editor.
 *
 * The contract is documented at
 * `Beyond-All-Reason/luarules/gadgets/include/startbox_utilities.lua`; the
 * reference encoders are `maps-metadata/scripts/js/src/gen_map_modoptions.ts`,
 * BYAR-Chobby's `mapStartBoxes.lua` and bar-lobby's
 * `start-script-converter.ts`.
 */

import stringify from "json-stable-stringify-without-jsonify";

import { Point, Startbox, clampPoint } from "./geometry";

export const MODOPTION_KEY = "mapmetadata_startbox_override";

// SPADS drops empty battle setting values, so both lobbies use the literal "0"
// to clear the override.
const CLEAR_VALUE = "0";

// The character class SPADS allows for this setting (battlePresets.conf).
const VALUE_PATTERN = /^[A-Za-z0-9_-]+$/;

// `CompressionStream("deflate")` produces the RFC1950 zlib format the game's
// `VFS.ZlibDecompress` expects — not raw deflate, not gzip. It needs a secure
// context, so it's missing on `file://` and on browsers older than 2023.
async function streamBytes(
  input: Uint8Array,
  stream: CompressionStream | DecompressionStream
): Promise<Uint8Array> {
  // `pipeThrough` would say this in one line, but @types/node's global
  // `ReadableStream` shadows the DOM one in this project, so feed the writable
  // side by hand instead. Write errors surface on the readable side too, where
  // both callers already catch them.
  const writer = stream.writable.getWriter();
  writer.write(input).catch(() => {});
  writer.close().catch(() => {});
  const buffer = await new Response(stream.readable).arrayBuffer();
  return new Uint8Array(buffer);
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Encode startboxes into a modoption value. Only `startboxes` is emitted:
 * `maxPlayersPerStartbox` is part of the map metadata schema, but the game's
 * override path never reads it and no other encoder sends it.
 */
export async function encodeStartboxesModoption(
  startboxes: Startbox[]
): Promise<string> {
  if (typeof CompressionStream === "undefined") {
    throw new Error("This browser cannot compress the modoption value");
  }
  // Key-sorted so the same arrangement always yields the same value, byte for
  // byte, as the other encoders of this modoption produce.
  const json = new TextEncoder().encode(stringify({ startboxes }));
  const compressed = await streamBytes(json, new CompressionStream("deflate"));
  return toBase64Url(compressed);
}

/**
 * Decode a pasted modoption value back into startboxes. Accepts a bare value,
 * a whole `!bset mapmetadata_startbox_override <value>` command line, and the
 * `{ "<numTeams>": arrangement }` shape of `mapmetadata_startboxes_set` (the
 * arrangement with the most boxes wins).
 */
export async function decodeStartboxesModoption(
  input: string
): Promise<Startbox[]> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("This browser cannot decompress the modoption value");
  }
  const value = input.trim().split(/\s+/).pop() ?? "";
  if (!value || value === CLEAR_VALUE) throw new Error("No value to decode");
  if (!VALUE_PATTERN.test(value)) throw new Error("Not a base64url value");

  let parsed: unknown;
  try {
    const decompressed = await streamBytes(
      fromBase64Url(value),
      new DecompressionStream("deflate")
    );
    parsed = JSON.parse(new TextDecoder().decode(decompressed));
  } catch {
    throw new Error("Not a valid base64url(zlib(json)) value");
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("Decoded value is not an object");
  }

  const arrangement = isArrangement(parsed)
    ? parsed
    : Object.values(parsed as Record<string, unknown>)
        .filter(isArrangement)
        .sort((a, b) => b.startboxes.length - a.startboxes.length)[0];
  if (!arrangement) throw new Error("Decoded value contains no startboxes");

  // Coordinates and strengths from an arbitrary pasted value are rounded and
  // clamped to the 0-200 integer grid the editor works in.
  return arrangement.startboxes.map((box) => ({
    poly: box.poly.map((p) => clampPoint(p)),
  }));
}

function isArrangement(value: unknown): value is { startboxes: Startbox[] } {
  if (typeof value !== "object" || value === null) return false;
  const boxes = (value as { startboxes?: unknown }).startboxes;
  if (!Array.isArray(boxes) || boxes.length === 0) return false;
  return boxes.every((box) => {
    const poly = (box as { poly?: unknown }).poly;
    return (
      Array.isArray(poly) &&
      poly.length >= 2 &&
      poly.every(
        (p) =>
          typeof (p as Point).x === "number" &&
          typeof (p as Point).y === "number"
      )
    );
  });
}
