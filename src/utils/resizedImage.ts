/**
 * Serve storage images resized through the BAR imagor service
 * (https://github.com/beyond-all-reason/maps-metadata/tree/main/cloud/serving)
 * instead of downloading the full-size originals.
 *
 * Supported source URLs:
 *   https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<object>?alt=media&token=…
 *   https://storage.googleapis.com/<bucket>/<object>
 *   https://maps-metadata.beyondallreason.dev/i/fit-in/<W>x<H>/…/<bucket>/<object>
 * which become
 *   https://maps-metadata.beyondallreason.dev/i/fit-in/<W>x<H>/filters:format(webp):quality(85)/<bucket>/<object>
 *
 * Results are cached forever on the CDN, so requested sizes are rounded up to a
 * small fixed set of buckets to keep the number of distinct variants (and cache
 * misses) low.
 */

const IMAGOR_HOST = "maps-metadata.beyondallreason.dev";
const IMAGOR_BASE = `https://${IMAGOR_HOST}/i`;
const IMAGOR_FILTERS = "filters:format(webp):quality(85)";
/** Buckets the imagor service is able to read from. */
const RESIZABLE_BUCKETS = new Set([
  "rowy-1f075.appspot.com",
  "maps-cache-8512",
]);

const SIZE_BUCKETS = [
  64, 96, 128, 192, 256, 384, 512, 768, 1024, 1536, 2048, 3072, 4096,
];
const MAX_SIZE = SIZE_BUCKETS[SIZE_BUCKETS.length - 1];

/** Round a pixel size up to the nearest size bucket. */
export function sizeBucket(px: number): number {
  return SIZE_BUCKETS.find((b) => b >= px) ?? MAX_SIZE;
}

interface ImageSource {
  bucket: string;
  /** Object name, still percent-encoded as in the source URL. */
  object: string;
  /** Size the source URL is already limited to (imagor URLs). */
  maxWidth?: number;
  maxHeight?: number;
}

function parseSourceUrl(url: string): ImageSource | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  // pathname keeps the percent-encoding of the object name, e.g. maps%2Ffoo.png
  const path = parsed.pathname;
  let m: RegExpMatchArray | null;
  switch (parsed.hostname) {
    case "firebasestorage.googleapis.com":
      m = path.match(/^\/v0\/b\/([^/]+)\/o\/([^/]+)$/);
      return m && { bucket: m[1], object: m[2] };
    case "storage.googleapis.com":
      m = path.match(/^\/([^/]+)\/(.+)$/);
      return m && { bucket: m[1], object: m[2] };
    case IMAGOR_HOST: {
      // Only plain fit-in resizes, other operations (crop, trim, …) would be
      // lost when rewriting.
      m = path.match(
        /^\/i\/fit-in\/(\d+)x(\d+)\/(?:filters:[^/]*\/)?([^/]+)\/(.+)$/
      );
      if (!m) return null;
      const maxWidth = Number(m[1]);
      const maxHeight = Number(m[2]);
      return {
        bucket: m[3],
        object: m[4],
        maxWidth: maxWidth > 0 ? maxWidth : undefined,
        maxHeight: maxHeight > 0 ? maxHeight : undefined,
      };
    }
  }
  return null;
}

export interface ResizeOptions {
  /** Width of the area the image is displayed in, in device pixels. */
  width: number;
  /** Height of the area the image is displayed in, in device pixels. */
  height: number;
}

/**
 * Returns a URL serving `url` scaled down (aspect ratio preserved, never
 * upscaled) to fit in the given box, rounded up to the size buckets. Returns
 * the original URL unchanged if it can't be served by the resizing service.
 */
export function resizedImageUrl(url: string, opts: ResizeOptions): string {
  const src = parseSourceUrl(url);
  if (!src || !RESIZABLE_BUCKETS.has(src.bucket)) return url;
  if (!(opts.width > 0) || !(opts.height > 0)) return url;

  const w = sizeBucket(opts.width);
  const h = sizeBucket(opts.height);
  // Never ask for more than an already-resized source URL provides.
  if (
    (src.maxWidth !== undefined && w >= src.maxWidth) ||
    (src.maxHeight !== undefined && h >= src.maxHeight)
  ) {
    return url;
  }
  return `${IMAGOR_BASE}/fit-in/${w}x${h}/${IMAGOR_FILTERS}/${src.bucket}/${src.object}`;
}
