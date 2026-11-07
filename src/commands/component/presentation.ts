import type { Component } from "@storyblok/management-api-client";
import { formatColumns } from "../../cli/columns.ts";

export function formatComponentList(
  components: Component[],
  width?: number,
): string {
  return formatColumns(
    ["ID", "NAME", "TYPE", "FIELDS"],
    components.map((component) => [
      String(component.id),
      component.name,
      component.is_root ? "root" : "blok",
      String(Object.keys(component.schema).length),
    ]),
    width,
    { wrapColumn: 1 },
  );
}

export function formatComponentDetails(component: Component): string {
  return [
    `ID: ${component.id}`,
    `Name: ${component.name}`,
    `Display name: ${component.display_name ?? "—"}`,
    `Type: ${component.is_root ? "root" : "nested blok"}`,
    `Nestable: ${component.is_nestable ? "yes" : "no"}`,
    `Fields: ${Object.keys(component.schema).length}`,
  ].join("\n");
}
