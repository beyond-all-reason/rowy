import {
  Popover,
  MenuList,
  MenuItem,
  ListItemIcon,
  ListItemText,
} from "@mui/material";
import CropSquareIcon from "@mui/icons-material/CropSquare";
import ChangeHistoryIcon from "@mui/icons-material/ChangeHistory";

import { DrawMode } from "./useStartboxDraw";

export interface CreateStartboxMenuProps {
  anchorEl: HTMLElement | null;
  open: boolean;
  onClose: () => void;
  onSelect: (mode: DrawMode) => void;
}

export default function CreateStartboxMenu(props: CreateStartboxMenuProps) {
  function pick(mode: DrawMode) {
    props.onSelect(mode);
    props.onClose();
  }

  return (
    <Popover
      anchorEl={props.anchorEl}
      open={props.open}
      onClose={props.onClose}
      anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
      transformOrigin={{ vertical: "top", horizontal: "left" }}
    >
      <MenuList>
        <MenuItem onClick={() => pick("rect")}>
          <ListItemIcon>
            <CropSquareIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Rectangle</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => pick("polygon")}>
          <ListItemIcon>
            <ChangeHistoryIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>Polygon</ListItemText>
        </MenuItem>
      </MenuList>
    </Popover>
  );
}
