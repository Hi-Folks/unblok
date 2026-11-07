import { CliError } from "../errors.ts";

export interface BlueprintOperation {
  path: string;
  operation: string;
  support: "available" | "not-implemented";
  count?: number;
}

export interface BlueprintPlan {
  apiVersion: "unblok/setup-blueprint-plan-v1";
  name: string;
  operations: BlueprintOperation[];
  summary: { available: number; notImplemented: number };
  note: string;
}

type Mapping = Record<string, unknown>;
function object(value: unknown): value is Mapping {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function planBlueprint(value: unknown): BlueprintPlan {
  if (!object(value))
    throw new CliError("Setup file must contain a YAML object.", 2);
  if (value.version !== 1) throw new CliError("Setup version must be 1.", 2);
  const sections: Record<
    string,
    Record<
      string,
      { operation: string; support: BlueprintOperation["support"] }
    >
  > = {
    space: {
      name: { operation: "name new space", support: "available" },
      duplicate_from: { operation: "duplicate space", support: "available" },
      in_org: { operation: "create within organization", support: "available" },
      demo: { operation: "configure demo mode", support: "available" },
      languages: { operation: "configure languages", support: "available" },
      readiness: {
        operation: "wait for duplication readiness",
        support: "available",
      },
    },
    preview: {
      enabled: {
        operation: "enable preview configuration",
        support: "available",
      },
      default: { operation: "set preview URL", support: "available" },
      environments: {
        operation: "configure preview environments",
        support: "available",
      },
    },
    demo_mode: {
      remove: { operation: "remove demo mode", support: "available" },
    },
    apps: {
      continue_on_error: {
        operation: "continue after app errors",
        support: "available",
      },
      install: { operation: "install apps", support: "available" },
    },
    ai: {
      enabled: { operation: "configure AI", support: "available" },
      inherit_org_configuration: {
        operation: "configure AI inheritance",
        support: "available",
      },
    },
    ai_translation: {
      disclaimer_id: {
        operation: "accept disclaimer and install AI Translations",
        support: "available",
      },
    },
    experiments: {
      disclaimer_id: {
        operation: "accept disclaimer and install Experiments",
        support: "available",
      },
      create: {
        operation:
          "create experiments, update variant content, and push simulated results",
        support: "available",
      },
    },
    components: {
      fields: { operation: "add component fields", support: "available" },
    },
    assets: {
      upload_directory: {
        operation: "upload assets",
        support: "available",
      },
      upload_url: {
        operation: "upload assets from URLs",
        support: "available",
      },
    },
    stories: {
      update_blocks: {
        operation: "update selected story blocks",
        support: "available",
      },
      translated_slugs: {
        operation: "configure translated slugs",
        support: "available",
      },
      create: { operation: "create stories", support: "available" },
    },
    workflow: {
      assign_unstaged: {
        operation: "assign unstaged stories",
        support: "available",
      },
      stage_id: { operation: "select workflow stage", support: "available" },
      assign: {
        operation: "assign selected stories to stages",
        support: "available",
      },
    },
  };
  const operations: BlueprintOperation[] = [];
  const metadata = value.template;
  if (metadata !== undefined && !object(metadata))
    throw new CliError("template must be an object.", 2);
  const name =
    object(metadata) && typeof metadata.name === "string"
      ? metadata.name
      : "Untitled setup";
  for (const key of Object.keys(value)) {
    if (["version", "template", "inputs", "execution"].includes(key)) continue;
    if (key === "tags") {
      if (!Array.isArray(value.tags))
        throw new CliError("tags must be an array.", 2);
      operations.push({
        path: "tags",
        operation: "assign story tags",
        support: "available",
        count: value.tags.length,
      });
      continue;
    }
    if (!Object.hasOwn(sections, key))
      throw new CliError(`Unsupported setup section '${key}'.`, 2);
    const definition = sections[key]!;
    const section = value[key];
    if (!object(section)) throw new CliError(`${key} must be an object.`, 2);
    for (const [field, content] of Object.entries(section)) {
      if (!Object.hasOwn(definition, field))
        throw new CliError(`Unsupported setup option '${key}.${field}'.`, 2);
      const entry = definition[field]!;
      if (content === null) continue;
      if (key === "apps" && field === "install" && Array.isArray(content)) {
        operations.push({
          path: "apps.install",
          operation: "install apps by slug",
          support: "available",
          count: content.filter((item) => typeof item === "string").length,
        });
        const byId = content.filter(
          (item) => object(item) && Object.hasOwn(item, "id"),
        ).length;
        if (byId)
          operations.push({
            path: "apps.install[id]",
            operation: "install apps by ID",
            support: "available",
            count: byId,
          });
        if (
          content.some(
            (item) =>
              typeof item !== "string" &&
              !(object(item) && Object.hasOwn(item, "id")),
          )
        )
          throw new CliError(
            "apps.install entries must be app slugs or objects with an id.",
            2,
          );
      } else if (
        key === "components" &&
        field === "fields" &&
        Array.isArray(content)
      ) {
        for (const [index, item] of content.entries()) {
          if (!object(item))
            throw new CliError(
              `components.fields[${index}] must be an object.`,
              2,
            );
          const supported = [
            "component",
            "field",
            "type",
            "field_type",
            "tab",
            "display_name",
            "required",
            "translatable",
            "customize_toolbar",
          ];
          const unsupported = Object.keys(item).filter(
            (itemKey) => !supported.includes(itemKey),
          );
          if (unsupported.length)
            operations.push({
              path: `components.fields[${index}]`,
              operation: "configure component field",
              support: "not-implemented",
            });
          else
            operations.push({
              path: `components.fields[${index}]`,
              operation: "reconcile component field",
              support: "available",
            });
        }
      } else
        operations.push({
          path: `${key}.${field}`,
          ...entry,
          ...(Array.isArray(content) ? { count: content.length } : {}),
        });
    }
  }
  return {
    apiVersion: "unblok/setup-blueprint-plan-v1",
    name,
    operations,
    summary: {
      available: operations.filter((item) => item.support === "available")
        .length,
      notImplemented: operations.filter(
        (item) => item.support === "not-implemented",
      ).length,
    },
    note: "Capability inventory only: no Storyblok state was read or changed. Blueprint execution supports space settings, apps, components, assets, stories, workflows, tags and experiments.",
  };
}
