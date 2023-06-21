import { IDisplayCellProps } from "@src/components/fields/types";
import MapStartbox from "@src/components/MapStartbox";
import { useImageTextureUrl } from "./mapTextureEffect";

export default function MapStartboxView({
  value,
  column,
  _rowy_ref,
}: IDisplayCellProps) {
  const imageTextureUrl = useImageTextureUrl(_rowy_ref, column);
  if (imageTextureUrl === null) {
    return <>No image texture URL</>;
  }
  return (
    <MapStartbox
      textureUrl={imageTextureUrl}
      startboxes={value}
      editable={false}
    />
  );
}
