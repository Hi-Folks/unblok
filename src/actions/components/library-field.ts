import { CliError } from "../../errors.ts";
import type { StoryblokGateway } from "../../storyblok/gateway.ts";
import { toUnblokError } from "../action-error.ts";
import {
  ensureComponentField as ensureField,
  type DesiredComponentField,
} from "./ensure-field.ts";

export type ComponentFieldGateway = Pick<
  StoryblokGateway,
  "getComponent" | "listComponents" | "updateComponent"
>;
export type EnsureComponentFieldInput = DesiredComponentField & {
  spaceId: number;
};
const fieldTypes = new Set([
  "text",
  "textarea",
  "richtext",
  "markdown",
  "number",
  "datetime",
  "boolean",
  "option",
  "options",
  "asset",
  "multiasset",
  "multilink",
  "table",
  "bloks",
  "section",
  "custom",
]);

/** Reconcile one component field and its optional tab. */
export async function ensureComponentField(
  gateway: ComponentFieldGateway,
  input: EnsureComponentFieldInput,
): Promise<{ status: "created" | "updated" | "unchanged" }> {
  try {
    if (
      !Number.isSafeInteger(input.spaceId) ||
      input.spaceId <= 0 ||
      [input.component, input.field, input.type].some(
        (value) =>
          typeof value !== "string" || !value.trim() || value !== value.trim(),
      ) ||
      !fieldTypes.has(input.type)
    )
      throw new CliError(
        "Provide a valid spaceId, component, field, and field type.",
        1,
        "INVALID_INPUT",
      );
    if (
      [input.field_type, input.tab, input.display_name].some(
        (value) =>
          value !== undefined && (typeof value !== "string" || !value.trim()),
      ) ||
      [input.required, input.translatable, input.customize_toolbar].some(
        (value) => value !== undefined && typeof value !== "boolean",
      ) ||
      (input.type === "custom"
        ? !input.field_type
        : input.field_type !== undefined) ||
      (input.type !== "richtext" && input.customize_toolbar !== undefined)
    )
      throw new CliError(
        "Invalid component field options.",
        1,
        "INVALID_INPUT",
      );
    const { spaceId, ...desired } = input;
    return await ensureField(gateway, spaceId, desired);
  } catch (error) {
    throw toUnblokError(error);
  }
}
