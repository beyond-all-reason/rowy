import { ISideDrawerFieldProps } from "@src/components/fields/types";
import { IFieldConfig, FieldType } from "@src/components/fields/types";
import { getFieldProp } from "@src/components/fields";
import { isEmpty } from "lodash-es";
import { createElement } from "react";

export default function Formula({
  column,
  onChange,
  onSubmit,
  _rowy_ref,
  onDirty,
  row,
}: ISideDrawerFieldProps) {
  const value = row[`_rowy_formulaValue_${column.key}`];

  // Fall back to ShortText like the DisplayCell does. Never fall back to
  // column.type: that's FORMULA itself, and rendering this component
  // recursively freezes the page (e.g. for columns without renderFieldType).
  let type = FieldType.shortText;
  if (
    column.config?.renderFieldType &&
    column.config.renderFieldType !== FieldType.formula
  ) {
    type = column.config.renderFieldType;
  }
  const fieldComponent: IFieldConfig["SideDrawerField"] = getFieldProp(
    "SideDrawerField",
    type
  );

  // Should not reach this state
  if (isEmpty(fieldComponent)) {
    console.error("Could not find SideDrawerField component", column);
    return null;
  }

  return (
    <>
      {createElement(fieldComponent, {
        column,
        _rowy_ref,
        value,
        onDirty,
        onChange,
        onSubmit,
        disabled: true,
        row,
      })}
    </>
  );
}
