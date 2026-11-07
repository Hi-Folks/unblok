import { CliError } from "../../errors.ts";
import type { StoryblokGateway } from "../../storyblok/gateway.ts";
import { getComponent } from "./component.ts";

export interface AddFieldInput {
  component: string;
  field: string;
  type: string;
  fieldType?: string;
  tab: string;
  displayName?: string;
  required?: boolean;
  translatable?: boolean;
}

export async function addComponentField(
  gateway: Pick<
    StoryblokGateway,
    "getComponent" | "listComponents" | "updateComponent"
  >,
  spaceId: number,
  input: AddFieldInput,
): Promise<{
  component: string;
  field: string;
  status: "created" | "unchanged";
}> {
  const found = await getComponent(gateway, spaceId, input.component);
  const component = await gateway.getComponent(spaceId, found.id);
  const schema = component.schema;
  const tabs = Object.entries(schema).filter(
    ([, entry]) => entry.type === "tab" && entry.display_name === input.tab,
  );
  if (tabs.length > 1)
    throw new CliError(
      `Multiple tabs named '${input.tab}' exist; cannot choose safely.`,
    );
  const tab = tabs[0];
  const existing = Object.hasOwn(schema, input.field)
    ? schema[input.field]
    : undefined;
  const desired: Record<string, unknown> = {
    type: input.type,
    ...(input.fieldType ? { field_type: input.fieldType } : {}),
    ...(input.displayName ? { display_name: input.displayName } : {}),
    ...(input.required ? { required: true } : {}),
    ...(input.translatable ? { translatable: true } : {}),
  };
  if (existing) {
    const matches = Object.entries(desired).every(
      ([key, value]) => existing[key] === value,
    );
    if (
      matches &&
      tab &&
      Array.isArray(tab[1].keys) &&
      tab[1].keys.includes(input.field)
    ) {
      return {
        component: component.name,
        field: input.field,
        status: "unchanged",
      };
    }
    throw new CliError(
      `Field '${input.field}' already exists with a different definition or tab.`,
    );
  }
  const positions = Object.values(schema).map((entry) =>
    typeof entry.pos === "number" && Number.isFinite(entry.pos)
      ? entry.pos
      : -1,
  );
  let position = Math.max(-1, ...positions) + 1;
  const next = { ...schema };
  if (tab) {
    if (
      !Array.isArray(tab[1].keys) ||
      !tab[1].keys.every((key) => typeof key === "string")
    ) {
      throw new CliError(`Tab '${input.tab}' has invalid field keys.`);
    }
    next[tab[0]] = { ...tab[1], keys: [...tab[1].keys, input.field] };
  } else {
    next[`tab-${crypto.randomUUID()}`] = {
      display_name: input.tab,
      keys: [input.field],
      pos: position++,
      type: "tab",
    };
  }
  Object.defineProperty(next, input.field, {
    value: {
      ...desired,
      ...(input.type === "custom" ? { options: [] } : {}),
      pos: position,
    },
    enumerable: true,
    configurable: true,
    writable: true,
  });
  await gateway.updateComponent(spaceId, component.id, { schema: next });
  return { component: component.name, field: input.field, status: "created" };
}
