import { IDisplayCellProps } from "@src/components/fields/types";
import MapStartPos from "@src/components/MapStartPos";
import { useMapMeta } from "./mapMetaEffect";

export default function MapStartPosView({
  value,
  column,
  _rowy_ref,
  rowHeight,
}: IDisplayCellProps) {
  const { textureUrl, dimensions } = useMapMeta(_rowy_ref, column);
  if (textureUrl === null) {
    return <>No image texture URL</>;
  }
  if (dimensions === null) {
    return <>No map dimensions</>;
  }
  return (
    <div style={{ height: rowHeight, width: "100%" }}>
      <MapStartPos
        textureUrl={textureUrl}
        dimensions={dimensions}
        startPos={value}
        editable={false}
      />
    </div>
  );
}
