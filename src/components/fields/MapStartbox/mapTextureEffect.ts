import { useState, useEffect } from "react";

import { useAtom } from "jotai";
import { firebaseDbAtom } from "@src/sources/ProjectSourceFirebase";
import { projectScope } from "@src/atoms/projectScope";
import { onSnapshot, doc } from "firebase/firestore";
import type { ColumnConfig, TableRowRef } from "@src/types/table";

export function useImageTextureUrl(
  _rowy_ref: TableRowRef,
  column: ColumnConfig
): string | null {
  const [firebaseDb] = useAtom(firebaseDbAtom, projectScope);
  const [imageTextureUrl, setImageTextureUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseDb) return;

    const parent = column.config?.mapTextureParentTable || 0;
    const field = column.config?.mapTextureUrlPath || "image";
    const path = _rowy_ref.path.split("/").slice(0, parent * -2);
    if (path.length == 0) return;

    return onSnapshot(doc(firebaseDb, path.join("/")), (doc) => {
      const prop = doc.get(field);
      setImageTextureUrl(prop || null);
    });
  }, [firebaseDb]);

  return imageTextureUrl;
}
