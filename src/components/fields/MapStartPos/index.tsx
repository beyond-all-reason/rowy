import { lazy } from "react";
import { IFieldConfig, FieldType } from "@src/components/fields/types";
import withRenderTableCell from "@src/components/Table/TableCell/withRenderTableCell";

import MapStartPosIcon from "@mui/icons-material/PinDrop";
import DisplayCell from "./DisplayCell";

const SideDrawerField = lazy(
  () =>
    import(
      "./SideDrawerField" /* webpackChunkName: "SideDrawerField-MapStartPos" */
    )
);

const Settings = lazy(
  () => import("./Settings" /* webpackChunkName: "Settings-MapStartPos" */)
);

export const config: IFieldConfig = {
  type: FieldType.mapStartPos,
  name: "Map StartPos",
  group: "BAR Custom",
  dataType:
    "{ positions: Record<string, { x: number; y: number }>; team?: any[]; }",
  initialValue: { positions: {} },
  defaultConfig: {
    mapTextureParentTable: 0,
    mapTextureUrlPath: "startboxTextureUrl",
    mapDimensionsPath: "dimensions",
  },
  icon: <MapStartPosIcon />,
  description: "Map StartPos",
  TableCell: withRenderTableCell(DisplayCell, SideDrawerField, "popover", {
    usesRowData: true,
    disablePadding: true,
  }),
  SideDrawerField,
  settings: Settings,
  csvExportFormatter: (value: any) =>
    JSON.stringify(value ?? { positions: {} }),
  csvImportParser: (value: string) => {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  },
};
export default config;
