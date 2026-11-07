import type { Space, SpaceDetail } from "@storyblok/management-api-client";
import { formatColumns } from "../../cli/columns.ts";

export function formatSpaceList(spaces: Space[], width?: number): string {
  const headers = ["ID", "NAME", "PLAN", "DEMO", "CREATED", "UPDATED"];
  const rows = spaces.map((space) => [
    String(space.id),
    space.name,
    space.plan,
    space.is_demo === true ? "yes" : "no",
    space.created_at.slice(0, 10),
    space.updated_at.slice(0, 10),
  ]);
  return formatColumns(headers, rows, width, { wrapColumn: 1 });
}

export function formatSpaceDetails(space: SpaceDetail): string {
  const values: Array<[string, string | number]> = [
    ["ID", space.id],
    ["Plan", space.plan],
    ["Role", space.role],
    ["Stories", space.stories_count],
    ["Assets", space.assets_count],
    ["Created", space.created_at],
  ];

  if (space.domain) {
    values.splice(1, 0, ["Domain", space.domain]);
  }

  const labelWidth = Math.max(...values.map(([label]) => label.length));
  return values
    .map(([label, value]) => `${label.padEnd(labelWidth)}  ${value}`)
    .join("\n");
}

export function formatDuplicatedSpace(
  space: SpaceDetail,
  sourceSpaceId: number,
): string {
  const values: Array<[string, string | number]> = [
    ["ID", space.id],
    ["Name", space.name],
    ["Source ID", sourceSpaceId],
    ["Plan", space.plan],
    ["Status", space.duplication_status ?? "started"],
  ];
  const labelWidth = Math.max(...values.map(([label]) => label.length));

  return values
    .map(([label, value]) => `${label.padEnd(labelWidth)}  ${value}`)
    .join("\n");
}
