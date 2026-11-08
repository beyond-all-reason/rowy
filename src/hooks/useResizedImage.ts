import { useCallback, useEffect, useRef, useState } from "react";

import { resizedImageUrl, sizeBucket } from "@src/utils/resizedImage";
import { useDevicePixelRatio } from "./useDevicePixelRatio";

interface Size {
  width: number;
  height: number;
}

export interface ResizedImage {
  /** Callback ref for the element whose box the image is displayed in. */
  ref: (el: Element | null) => void;
  /** URL to load, or undefined while the element is not measured yet. */
  src: string | undefined;
  /** Attach to the image's onError to fall back to the original URL. */
  onError: () => void;
}

/**
 * Loads a resized variant of `url` matching the measured size of the element
 * given `ref`, at the current device pixel ratio. With `enabled` false, the
 * original URL is used as is.
 *
 * - No src until measured, to avoid fetching a variant of the wrong size first.
 * - State holds the size bucket, not the raw size, so resizing only re-renders
 *   when a different variant is needed.
 * - The requested size only ever grows, so shrinking the element (e.g. a
 *   column) doesn't re-download a smaller variant.
 * - If the resized variant fails to load, falls back to the original URL.
 */
export function useResizedImage(url: string, enabled = true): ResizedImage {
  const dpr = useDevicePixelRatio();
  const dprRef = useRef(dpr);
  dprRef.current = dpr;
  const cssSize = useRef<Size | null>(null);
  const [px, setPx] = useState<Size | null>(null);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  const update = useCallback(() => {
    const css = cssSize.current;
    if (!css || css.width <= 0 || css.height <= 0) return;
    const width = sizeBucket(css.width * dprRef.current);
    const height = sizeBucket(css.height * dprRef.current);
    setPx((prev) =>
      prev && prev.width >= width && prev.height >= height
        ? prev
        : {
            width: Math.max(width, prev?.width ?? 0),
            height: Math.max(height, prev?.height ?? 0),
          }
    );
  }, []);

  useEffect(update, [dpr, update]);

  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback(
    (el: Element | null) => {
      observer.current?.disconnect();
      observer.current = null;
      if (!el) return;
      observer.current = new ResizeObserver(([entry]) => {
        const box = entry.contentBoxSize[0];
        cssSize.current = { width: box.inlineSize, height: box.blockSize };
        update();
      });
      observer.current.observe(el);
    },
    [update]
  );

  let src: string | undefined = url;
  if (enabled) {
    src = px ? resizedImageUrl(url, px) : undefined;
    if (src === failedSrc) src = url;
  }

  const onError = useCallback(() => {
    if (src !== undefined && src !== url) setFailedSrc(src);
  }, [src, url]);

  return { ref, src, onError };
}

export default useResizedImage;
