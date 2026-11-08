import { useState } from "react";
import { ISideDrawerFieldProps } from "@src/components/fields/types";
import MapStartPos from "@src/components/MapStartPos";
import { StartPos } from "@src/components/startpos/types";
import { Alert, Button } from "@mui/material";
import EditIcon from "@mui/icons-material/Edit";
import { useMapMeta } from "./mapMetaEffect";

// In the grid, rowy renders this inside the cell popover and passes
// showPopoverCell, so we open the editor immediately and dismiss the popover on
// close. In the side drawer there's no popover, so we open it behind a button.
type Props = ISideDrawerFieldProps & {
  showPopoverCell?: (open: boolean) => void;
};

export default function MapStartPosPanel({
  value,
  disabled,
  onChange,
  onSubmit,
  _rowy_ref,
  column,
  showPopoverCell,
}: Props) {
  const { textureUrl, dimensions } = useMapMeta(_rowy_ref, column);
  const [open, setOpen] = useState(false);

  const updated = (startPos: StartPos) => {
    onChange(startPos);
    onSubmit();
  };

  if (textureUrl === null) {
    return <Alert severity="error">No image texture URL</Alert>;
  }
  if (dimensions === null) {
    return (
      <Alert severity="error">
        Map dimensions missing or unparseable (expected "W x H").
      </Alert>
    );
  }

  if (showPopoverCell) {
    return (
      <MapStartPos
        editable={!disabled}
        textureUrl={textureUrl}
        dimensions={dimensions}
        startPos={value}
        updatedStartPos={updated}
        onClose={() => showPopoverCell(false)}
      />
    );
  }

  return (
    <>
      <Button
        variant="outlined"
        startIcon={<EditIcon />}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        Edit start positions
      </Button>
      {open && (
        <MapStartPos
          editable
          textureUrl={textureUrl}
          dimensions={dimensions}
          startPos={value}
          updatedStartPos={updated}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
