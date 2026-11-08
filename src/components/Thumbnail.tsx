import { Suspense } from "react";
import { useImage } from "react-image";
import { ErrorBoundary } from "react-error-boundary";

import { Box, BoxProps, Skeleton } from "@mui/material";

import EmptyState from "./EmptyState";
import BrokenImageIcon from "@mui/icons-material/BrokenImageOutlined";
import { spreadSx } from "@src/utils/ui";
import { resizedImageUrl } from "@src/utils/resizedImage";
import { useDevicePixelRatio } from "@src/hooks/useDevicePixelRatio";

export interface IThumbnailProps
  extends React.DetailedHTMLProps<
    React.ImgHTMLAttributes<HTMLImageElement>,
    HTMLImageElement
  > {
  imageUrl: string;
  /** Size of the box the thumbnail is displayed in, in CSS pixels. */
  size: number;

  objectFit?: string;
  shape?: "roundedRectangle" | "square" | "circle";
  border?: boolean;

  sx?: BoxProps["sx"];
}

/**
 * Display a thumbnail resized to fit `size` CSS pixels at the current device
 * pixel ratio, falling back to original image if it doesn’t load.
 *
 * Uses react-image: https://github.com/mbrevda/react-image
 */
export function Thumbnail({
  imageUrl,
  size,

  objectFit = "cover",
  shape = "roundedRectangle",
  border = false,

  ...props
}: IThumbnailProps) {
  const dpr = useDevicePixelRatio();
  const thumbnailUrl = resizedImageUrl(imageUrl, {
    width: size * dpr,
    height: size * dpr,
  });

  const { src, error } = useImage({
    srcList: thumbnailUrl === imageUrl ? [imageUrl] : [thumbnailUrl, imageUrl],
  });

  if (error) return <>x</>;

  return (
    <Box
      component="img"
      {...props}
      {...({ src } as any)}
      sx={[
        {
          objectFit: objectFit as any,
          borderRadius: shape === "circle" ? "50%" : shape === "square" ? 0 : 1,

          display: "block",
          pointerEvents: "none",
          userSelect: "none",

          position: "relative",

          "&::after": {
            content: '""',
            display: "block",
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",

            boxShadow: (theme) =>
              border ? `0 0 0 1px ${theme.palette.divider} inset` : "none",
          },
        },
        ...spreadSx(props.sx),
      ]}
    />
  );
}

/**
 * Wrap thumbnail in an ErrorBoundary and Skeleton for loading
 */
export default function ErrorBoundedThumbnail(props: IThumbnailProps) {
  return (
    <ErrorBoundary
      fallback={
        <EmptyState
          basic
          message="Failed to load image"
          className={props.className}
          Icon={BrokenImageIcon}
        />
      }
    >
      <Suspense
        fallback={
          <Skeleton
            variant="rectangular"
            className={props.className}
            sx={{
              borderRadius:
                props.shape === "circle"
                  ? "50%"
                  : props.shape === "square"
                  ? 0
                  : 1,
              display: "block",
            }}
          />
        }
      >
        <Thumbnail {...props} />
      </Suspense>
    </ErrorBoundary>
  );
}
