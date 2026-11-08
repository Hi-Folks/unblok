import type {
  Component,
  ComponentCreate,
  ComponentUpdate,
} from "@storyblok/management-api-client";
import { CliError } from "../../errors.ts";
import type { StoryblokGateway } from "../../storyblok/gateway.ts";

export interface DesiredComponent extends Record<string, unknown> {
  color?: string | null;
  componentGroupUuid?: string | null;
  contentTypeAssetPreview?: string | null;
  description?: string | null;
  displayName?: string | null;
  icon?: string | null;
  image?: string | null;
  internalTagIds?: number[];
  isNestable?: boolean;
  isRoot?: boolean;
  metadata?: Record<string, unknown>;
  name: string;
  presetId?: number | null;
  previewField?: string | null;
  previewTemplate?: string | null;
  schema?: Record<string, Record<string, unknown>>;
}

export type ComponentChange = "create" | "unchanged" | "update";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseDesiredComponent(
  value: unknown,
  path = "component",
): DesiredComponent {
  if (!isRecord(value)) {
    throw new CliError(`${path} must be an object.`, 2);
  }
  if (typeof value.name !== "string" || value.name.trim().length === 0) {
    throw new CliError(`${path}.name must be a non-empty string.`, 2);
  }
  if (value.schema !== undefined && !isRecord(value.schema)) {
    throw new CliError(`${path}.schema must be an object.`, 2);
  }
  if (isRecord(value.schema)) {
    for (const [field, definition] of Object.entries(value.schema)) {
      if (!isRecord(definition)) {
        throw new CliError(`${path}.schema.${field} must be an object.`, 2);
      }
    }
  }
  for (const field of ["isRoot", "isNestable"] as const) {
    if (value[field] !== undefined && typeof value[field] !== "boolean") {
      throw new CliError(`${path}.${field} must be a boolean.`, 2);
    }
  }

  return { ...value, name: value.name.trim() } as DesiredComponent;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

function equal(left: unknown, right: unknown): boolean {
  return (
    JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right))
  );
}

function matchesDeclared(desired: unknown, current: unknown): boolean {
  if (Array.isArray(desired)) return equal(desired, current);
  if (!isRecord(desired)) return equal(desired, current);
  if (!isRecord(current)) return false;
  return Object.entries(desired).every(([key, value]) =>
    matchesDeclared(value, current[key]),
  );
}

function schemasMatch(
  desired: Record<string, Record<string, unknown>>,
  current: Component["schema"],
): boolean {
  const desiredFields = Object.keys(desired).sort();
  const currentFields = Object.keys(current).sort();
  return (
    equal(desiredFields, currentFields) &&
    desiredFields.every((field) =>
      matchesDeclared(desired[field], current[field]),
    )
  );
}

const fieldMappings = {
  color: "color",
  componentGroupUuid: "component_group_uuid",
  contentTypeAssetPreview: "content_type_asset_preview",
  description: "description",
  displayName: "display_name",
  icon: "icon",
  image: "image",
  internalTagIds: "internal_tag_ids",
  isNestable: "is_nestable",
  isRoot: "is_root",
  metadata: "metadata",
  name: "name",
  presetId: "preset_id",
  previewField: "preview_field",
  previewTemplate: "preview_tmpl",
  schema: "schema",
} as const;

export function compareComponent(
  desired: DesiredComponent,
  current: Component[],
): ComponentChange {
  const existing = current.find((component) => component.name === desired.name);
  if (!existing) {
    return "create";
  }

  for (const [desiredKey, apiKey] of Object.entries(fieldMappings) as [
    keyof typeof fieldMappings,
    (typeof fieldMappings)[keyof typeof fieldMappings],
  ][]) {
    const desiredValue = desired[desiredKey];
    if (desiredValue === undefined) continue;
    const matches =
      desiredKey === "schema"
        ? schemasMatch(
            desiredValue as Record<string, Record<string, unknown>>,
            existing.schema,
          )
        : matchesDeclared(desiredValue, existing[apiKey]);
    if (!matches) {
      return "update";
    }
  }
  return "unchanged";
}

export function toComponentPayload(
  desired: DesiredComponent,
): ComponentCreate | ComponentUpdate {
  const payload: Record<string, unknown> = {};
  for (const [desiredKey, apiKey] of Object.entries(fieldMappings) as [
    keyof typeof fieldMappings,
    string,
  ][]) {
    if (desired[desiredKey] !== undefined) {
      payload[apiKey] = desired[desiredKey];
    }
  }
  return payload as ComponentCreate;
}

function mergeSchemaForUpdate(
  desired: DesiredComponent["schema"],
  current: Component["schema"],
): DesiredComponent["schema"] {
  if (!desired) return undefined;
  return Object.fromEntries(
    Object.entries(desired).map(([field, definition]) => [
      field,
      { ...current[field], ...definition },
    ]),
  );
}

export async function listComponents(
  gateway: Pick<StoryblokGateway, "listComponents">,
  spaceId: number,
  search?: string,
): Promise<Component[]> {
  return gateway.listComponents(spaceId, { search });
}

export async function getComponent(
  gateway: Pick<StoryblokGateway, "getComponent" | "listComponents">,
  spaceId: number,
  reference: string,
): Promise<Component> {
  if (/^\d+$/.test(reference) && Number(reference) > 0) {
    return gateway.getComponent(spaceId, Number(reference));
  }

  const components = await gateway.listComponents(spaceId, {
    search: reference,
  });
  const component = components.find(
    (candidate) => candidate.name === reference,
  );
  if (!component) {
    throw new CliError(
      `Component '${reference}' was not found in space ${spaceId}.`,
      1,
      "NOT_FOUND",
    );
  }
  return component;
}

export async function createComponent(
  gateway: Pick<StoryblokGateway, "createComponent">,
  spaceId: number,
  desired: DesiredComponent,
): Promise<Component> {
  return gateway.createComponent(
    spaceId,
    toComponentPayload(desired) as ComponentCreate,
  );
}

export async function updateComponent(
  gateway: Pick<
    StoryblokGateway,
    "getComponent" | "listComponents" | "updateComponent"
  >,
  spaceId: number,
  reference: string,
  desired: DesiredComponent,
): Promise<Component> {
  const existing = await getComponent(gateway, spaceId, reference);
  if (desired.name !== existing.name) {
    throw new CliError(
      `Renaming component '${existing.name}' to '${desired.name}' is not supported safely yet.`,
      2,
    );
  }
  const update = {
    ...desired,
    ...(desired.schema
      ? { schema: mergeSchemaForUpdate(desired.schema, existing.schema) }
      : {}),
  };
  return gateway.updateComponent(
    spaceId,
    existing.id,
    toComponentPayload(update) as ComponentUpdate,
  );
}
