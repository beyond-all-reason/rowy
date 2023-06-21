import { lazy } from "react";
import { IFieldConfig, FieldType } from "@src/components/fields/types";
import withRenderTableCell from "@src/components/Table/TableCell/withRenderTableCell";

import MapStartboxIcon from "@mui/icons-material/Map";
import DisplayCell from "./DisplayCell";

const SideDrawerField = lazy(
  () =>
    import(
      "./SideDrawerField" /* webpackChunkName: "SideDrawerField-MapStartbox" */
    )
);

const Settings = lazy(
  () => import("./Settings" /* webpackChunkName: "Settings-MapStartbox" */)
);

export const config: IFieldConfig = {
  type: FieldType.mapStartbox,
  name: "Map Startbox",
  group: "BAR Custom",
  dataType: "{ poly: { x: number; y: number; }[]; }[]",
  initialValue: [],
  icon: <MapStartboxIcon />,
  description: "Map Startbox",
  TableCell: withRenderTableCell(DisplayCell, SideDrawerField, "popover", {
    usesRowData: true,
    disablePadding: true,
  }),
  SideDrawerField,
  settings: Settings,
};
export default config;
