import { useState, useEffect } from "react";

import { useAtom } from "jotai";
import { firebaseDbAtom } from "@src/sources/ProjectSourceFirebase";
import { projectScope } from "@src/atoms/projectScope";
import { onSnapshot, doc } from "firebase/firestore";
import type { ColumnConfig, TableRowRef } from "@src/types/table";

import {
  parseDimensions,
  MapDimensions,
} from "@src/components/startpos/geometry";

export interface MapMeta {
  textureUrl: string | null;
  dimensions: MapDimensions | null;
}

// Reads the map texture URL and the map's dimensions ("W x H" in map units)
// from the row (or a parent row) that holds them.
export function useMapMeta(
  _rowy_ref: TableRowRef,
  column: ColumnConfig
): MapMeta {
  const [firebaseDb] = useAtom(firebaseDbAtom, projectScope);
  const [meta, setMeta] = useState<MapMeta>({
    textureUrl: null,
    dimensions: null,
  });

  const parent = column.config?.mapTextureParentTable;
  const urlField = column.config?.mapTextureUrlPath;
  const dimField = column.config?.mapDimensionsPath;

  useEffect(() => {
    if (!firebaseDb) return;
    if (parent === undefined || !urlField || !dimField) return;

    // parent counts how many tables up the texture row lives; 0 = this row.
    const segments = _rowy_ref.path.split("/");
    const path = segments.slice(0, segments.length - parent * 2);
    if (path.length === 0) return;

    return onSnapshot(doc(firebaseDb, path.join("/")), (snap) => {
      setMeta({
        textureUrl: snap.get(urlField) || null,
        dimensions: parseDimensions(snap.get(dimField)),
      });
    });
  }, [firebaseDb, _rowy_ref.path, parent, urlField, dimField]);

  return meta;
}
