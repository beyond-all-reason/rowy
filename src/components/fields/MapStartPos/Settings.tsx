import { ISettingsProps } from "@src/components/fields/types";
import { TextField } from "@mui/material";

const Settings = ({ config, onChange }: ISettingsProps) => {
  return (
    <>
      <TextField
        type="number"
        label="Parent table number"
        onChange={(e) => onChange("mapTextureParentTable")(e.target.value)}
        value={config.mapTextureParentTable}
      />
      <TextField
        type="text"
        label="Texture URL path"
        value={config.mapTextureUrlPath}
        fullWidth
        onChange={(e) => onChange("mapTextureUrlPath")(e.target.value)}
      />
      <TextField
        type="text"
        label="Dimensions path"
        value={config.mapDimensionsPath}
        fullWidth
        onChange={(e) => onChange("mapDimensionsPath")(e.target.value)}
      />
    </>
  );
};
export default Settings;
