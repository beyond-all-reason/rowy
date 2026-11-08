import { useEffect, useState } from "react";
import { Popover, Stack, Typography, TextField, Button } from "@mui/material";

import { Startbox } from "./geometry";
import { MODOPTION_KEY, decodeStartboxesModoption } from "./modoption";

export interface PasteModoptionMenuProps {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  onLoad: (startboxes: Startbox[]) => void;
}

// Takes a `mapmetadata_startbox_override` value, a whole `!bset …` line, or a
// `mapmetadata_startboxes_set` blob, and hands the arrangement it holds to
// `onLoad`.
export default function PasteModoptionMenu(props: PasteModoptionMenuProps) {
  const [value, setValue] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  // Every visit starts empty, pre-filled from the clipboard where the browser
  // allows reading it; pasting or typing into the field works either way.
  useEffect(() => {
    if (!props.open) return;
    setValue("");
    setError(null);
    let current = true;
    navigator.clipboard.readText().then(
      (text) => {
        if (current) setValue(text.trim());
      },
      () => {}
    );
    return () => {
      current = false;
    };
  }, [props.open]);

  async function load() {
    try {
      props.onLoad(await decodeStartboxesModoption(value));
      props.onClose();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <Popover
      anchorEl={props.anchorEl}
      open={props.open}
      onClose={props.onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      transformOrigin={{ vertical: "top", horizontal: "left" }}
      PaperProps={{ sx: { p: 1.5, width: 420 } }}
    >
      <Stack direction="column" spacing={1}>
        <Typography variant="caption" color="text.secondary">
          {`Replaces all startboxes with the ones in a ${MODOPTION_KEY} value`}
        </Typography>
        <TextField
          autoFocus
          multiline
          maxRows={4}
          size="small"
          label="Modoption value"
          placeholder="!bset command or bare value"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          helperText={error || " "}
          error={error !== null}
          inputProps={{ style: { fontFamily: "monospace" } }}
        />
        <Stack direction="row" spacing={1} justifyContent="flex-end">
          <Button size="small" onClick={props.onClose}>
            Cancel
          </Button>
          <Button
            size="small"
            variant="outlined"
            disabled={!value.trim()}
            onClick={load}
          >
            Load
          </Button>
        </Stack>
      </Stack>
    </Popover>
  );
}
