import { ISideDrawerFieldProps } from "@src/components/fields/types";
import MapStartbox, { Startbox } from "@src/components/MapStartbox";
import { Alert } from "@mui/material";
import { useImageTextureUrl } from "./mapTextureEffect";

export default function MapStartboxPanel({
  value,
  disabled,
  onChange,
  onSubmit,
  _rowy_ref,
  column,
}: ISideDrawerFieldProps) {
  const updatedStartboxes = (startboxes: Startbox[]) => {
    onChange(startboxes);
    onSubmit();
  };
  const imageTextureUrl = useImageTextureUrl(_rowy_ref, column);
  if (imageTextureUrl === null) {
    return <Alert severity="error">No image texture URL</Alert>;
  }
  return (
    <MapStartbox
      textureUrl={imageTextureUrl}
      startboxes={value}
      updatedStartboxes={updatedStartboxes}
      editable={!disabled}
    />
  );
}
