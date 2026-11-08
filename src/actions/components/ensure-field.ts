import { CliError } from "../../errors.ts";
import type { StoryblokGateway } from "../../storyblok/gateway.ts";
import { getComponent } from "./component.ts";

export interface DesiredComponentField {
  component: string;
  field: string;
  type: string;
  tab?: string;
  field_type?: string;
  display_name?: string;
  required?: boolean;
  translatable?: boolean;
  customize_toolbar?: boolean;
}

export async function ensureComponentField(
  gateway: Pick<
    StoryblokGateway,
    "getComponent" | "listComponents" | "updateComponent"
  >,
  spaceId: number,
  input: DesiredComponentField,
): Promise<{ status: "created" | "updated" | "unchanged" }> {
  const found = await getComponent(gateway, spaceId, input.component);
  const component = await gateway.getComponent(spaceId, found.id);
  const schema = component.schema;
  const existing = Object.hasOwn(schema, input.field)
    ? schema[input.field]
    : undefined;
  if (existing && existing.type !== input.type)
    throw new CliError(
      `Field '${input.field}' in '${input.component}' has type '${existing.type}', not '${input.type}'.`,
      1,
      "CONFLICT",
    );
  const next = { ...schema };
  const properties: Record<string, unknown> = { type: input.type };
  for (const key of [
    "field_type",
    "display_name",
    "required",
    "translatable",
    "customize_toolbar",
  ] as const)
    if (input[key] !== undefined) properties[key] = input[key];
  let changed =
    !existing ||
    Object.entries(properties).some(([key, value]) => existing[key] !== value);
  let position =
    Math.max(
      -1,
      ...Object.values(schema).map((entry) =>
        typeof entry.pos === "number" && Number.isFinite(entry.pos)
          ? entry.pos
          : -1,
      ),
    ) + 1;
  if (input.tab !== undefined) {
    const tabs = Object.entries(schema).filter(
      ([, entry]) => entry.type === "tab" && entry.display_name === input.tab,
    );
    if (tabs.length > 1)
      throw new CliError(
        `Multiple tabs named '${input.tab}' exist; cannot choose safely.`,
        1,
        "AMBIGUOUS",
      );
    for (const [key, entry] of Object.entries(schema)) {
      if (entry.type !== "tab") continue;
      if (
        !Array.isArray(entry.keys) ||
        !entry.keys.every((item) => typeof item === "string")
      )
        throw new CliError(
          `Tab '${entry.display_name ?? key}' has invalid field keys.`,
        );
      if (key !== tabs[0]?.[0] && entry.keys.includes(input.field)) {
        next[key] = {
          ...entry,
          keys: entry.keys.filter((item) => item !== input.field),
        };
        changed = true;
      }
    }
    const tab = tabs[0];
    if (tab) {
      const keys = tab[1].keys as string[];
      if (!keys.includes(input.field)) {
        next[tab[0]] = { ...tab[1], keys: [...keys, input.field] };
        changed = true;
      }
    } else {
      next[`tab-${crypto.randomUUID()}`] = {
        type: "tab",
        display_name: input.tab,
        keys: [input.field],
        pos: position++,
      };
      changed = true;
    }
  }
  if (!changed) return { status: "unchanged" };
  Object.defineProperty(next, input.field, {
    value: existing
      ? { ...existing, ...properties }
      : {
          ...properties,
          ...(input.type === "custom" ? { options: [] } : {}),
          pos: position,
        },
    enumerable: true,
    writable: true,
    configurable: true,
  });
  await gateway.updateComponent(spaceId, component.id, { schema: next });
  return { status: existing ? "updated" : "created" };
}
