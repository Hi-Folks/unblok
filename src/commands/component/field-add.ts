import {
  addComponentField,
  type AddFieldInput,
} from "../../actions/components/add-field.ts";
import type { Command } from "../../cli/command.ts";
import { getStoryblokToken } from "../../config/environment.ts";
import { resolveSpaceId } from "../../config/space-id.ts";
import { CliError } from "../../errors.ts";

const types = new Set([
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

export function parseFieldAddOptions(args: string[]): {
  input: AddFieldInput;
  spaceId?: string;
} {
  const values = new Map<string, string>();
  let required = false;
  let translatable = false;
  const accepted = new Set([
    "--component",
    "--field",
    "--type",
    "--field-type",
    "--tab",
    "--display-name",
    "--space-id",
  ]);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--required") {
      required = true;
      continue;
    }
    if (arg === "--translatable") {
      translatable = true;
      continue;
    }
    const option = arg?.split("=", 1)[0];
    if (!option || !accepted.has(option))
      throw new CliError(`Unknown argument '${arg}'.`, 2);
    const separator = arg?.indexOf("=") ?? -1;
    const value = separator >= 0 ? arg?.slice(separator + 1) : args[++i];
    if (!value?.trim() || value.startsWith("--"))
      throw new CliError(`Option '${option}' requires a value.`, 2);
    if (values.has(option))
      throw new CliError(`Option '${option}' may only be used once.`, 2);
    values.set(option, value.trim());
  }
  const component = values.get("--component");
  const field = values.get("--field");
  const tab = values.get("--tab");
  const type = (values.get("--type") ?? "custom").toLowerCase();
  const fieldType = values.get("--field-type");
  if (!component || !field || !tab)
    throw new CliError(
      "Options '--component', '--field', and '--tab' are required.",
      2,
    );
  if (!types.has(type))
    throw new CliError(`Unsupported field type '${type}'.`, 2);
  if (type === "custom" && !fieldType)
    throw new CliError(
      "Option '--field-type' is required for custom fields.",
      2,
    );
  if (type !== "custom" && fieldType)
    throw new CliError(
      "Option '--field-type' is only valid for custom fields.",
      2,
    );
  return {
    input: {
      component,
      field,
      tab,
      type,
      fieldType,
      displayName: values.get("--display-name"),
      required,
      translatable,
    },
    spaceId: values.get("--space-id"),
  };
}

export const componentFieldAddCommand: Command = {
  name: "field-add",
  description: "Add a field to a component tab",
  usage:
    "unblok component field-add --component <name-or-id> --field <name> --tab <name> [options]",
  async run(args, context) {
    if (args.includes("--help") || args.includes("-h")) {
      context.output.text(
        `Usage: ${this.usage}\n\nOptions:\n  --type <type>          Field type (default: custom)\n  --field-type <slug>    Plugin slug, required for custom fields\n  --display-name <name>  Field label\n  --required             Mark the field required\n  --translatable         Mark the field translatable\n  --space-id <id>        Target space; defaults to STORYBLOK_SPACE_ID\n  --json                 Emit machine-readable JSON\n  -h, --help             Show command help`,
      );
      return;
    }
    const options = parseFieldAddOptions(args);
    const spaceId = resolveSpaceId({
      environment: context.environment,
      option: options.spaceId,
    });
    const gateway = context.createGateway(
      getStoryblokToken(context.environment),
    );
    const result = await context.output.activity(
      "Checking component field",
      "Component checked",
      () => addComponentField(gateway, spaceId, options.input),
    );
    if (context.output.mode === "json") context.output.data(result);
    else
      context.output.info(
        result.status === "created"
          ? `Field '${result.field}' added to '${result.component}'.`
          : `Field '${result.field}' already matches.`,
      );
  },
};
