import { ISettingsProps } from "@src/components/fields/types";
import { TextField } from "@mui/material";

const Settings = ({ config, onChange }: ISettingsProps) => {
  return (
    <>
      <TextField
        type="number"
        id="outlined-basic"
        label="Parent table number"
        onChange={(e) => onChange("mapTextureParentTable")(e.target.value)}
        value={config.mapTextureParentTable}
      />
      <TextField
        type="text"
        label="Table value path"
        id="value-path"
        value={config.mapTextureUrlPath}
        fullWidth
        onChange={(e) => onChange("mapTextureUrlPath")(e.target.value)}
      />
    </>
  );
};
export default Settings;
