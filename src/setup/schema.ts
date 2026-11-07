export const SETUP_API_VERSION = "space-man/v1" as const;
export const SETUP_KIND = "SpaceSetup" as const;

export const resourceDefinitions = {
  assets: { identity: "path", singular: "asset" },
  components: { identity: "name", singular: "component" },
  datasources: { identity: "name", singular: "datasource" },
  languages: { identity: "code", singular: "language" },
  stories: { identity: "path", singular: "story" },
  tags: { identity: "name", singular: "tag" },
} as const;

export type SetupResource = keyof typeof resourceDefinitions;
export type SetupResourceItem = Record<string, unknown>;

export interface SpaceSetup {
  apiVersion: typeof SETUP_API_VERSION;
  kind: typeof SETUP_KIND;
  metadata: {
    name: string;
  };
  resources: Partial<Record<SetupResource, SetupResourceItem[]>>;
}

export class SetupValidationError extends Error {
  constructor(readonly issues: string[]) {
    super(
      `Invalid setup configuration:\n${issues.map((issue) => `- ${issue}`).join("\n")}`,
    );
    this.name = "SetupValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function parseSpaceSetup(value: unknown): SpaceSetup {
  const issues: string[] = [];

  if (!isRecord(value)) {
    throw new SetupValidationError(["the document must be a YAML object"]);
  }

  if (value.apiVersion !== SETUP_API_VERSION) {
    issues.push(`apiVersion must be '${SETUP_API_VERSION}'`);
  }
  if (value.kind !== SETUP_KIND) {
    issues.push(`kind must be '${SETUP_KIND}'`);
  }

  const metadata = value.metadata;
  if (!isRecord(metadata)) {
    issues.push("metadata must be an object");
  } else if (!nonEmptyString(metadata.name)) {
    issues.push("metadata.name must be a non-empty string");
  }

  const resources = value.resources;
  const parsedResources: Partial<Record<SetupResource, SetupResourceItem[]>> =
    {};

  if (!isRecord(resources)) {
    issues.push("resources must be an object");
  } else {
    for (const key of Object.keys(resources)) {
      if (!(key in resourceDefinitions)) {
        issues.push(
          `resources.${key} is not supported by ${SETUP_API_VERSION}`,
        );
        continue;
      }

      const resource = key as SetupResource;
      const items = resources[resource];
      if (!Array.isArray(items)) {
        issues.push(`resources.${resource} must be an array`);
        continue;
      }

      const identity = resourceDefinitions[resource].identity;
      const identities = new Set<string>();
      const parsedItems: SetupResourceItem[] = [];

      items.forEach((item, index) => {
        const path = `resources.${resource}[${index}]`;
        if (!isRecord(item)) {
          issues.push(`${path} must be an object`);
          return;
        }

        const identityValue = item[identity];
        if (!nonEmptyString(identityValue)) {
          issues.push(`${path}.${identity} must be a non-empty string`);
          return;
        }

        const normalizedIdentity = identityValue.trim();
        if (identities.has(normalizedIdentity)) {
          issues.push(
            `${path}.${identity} duplicates '${normalizedIdentity}' in the same collection`,
          );
          return;
        }

        identities.add(normalizedIdentity);
        parsedItems.push({ ...item, [identity]: normalizedIdentity });
      });

      if (resource === "languages") {
        parsedItems.forEach((item, index) => {
          if (!nonEmptyString(item.name)) {
            issues.push(
              `resources.languages[${index}].name must be a non-empty string`,
            );
          } else {
            item.name = item.name.trim();
          }
          if (
            item.aiTranslationCode !== undefined &&
            item.aiTranslationCode !== null &&
            !nonEmptyString(item.aiTranslationCode)
          ) {
            issues.push(
              `resources.languages[${index}].aiTranslationCode must be a non-empty string or null`,
            );
          } else if (typeof item.aiTranslationCode === "string") {
            item.aiTranslationCode = item.aiTranslationCode.trim();
          }
        });
      }

      if (resource === "components") {
        parsedItems.forEach((item, index) => {
          if (!isRecord(item.schema) && item.schema !== undefined) {
            issues.push(
              `resources.components[${index}].schema must be an object`,
            );
          } else if (isRecord(item.schema)) {
            for (const [field, definition] of Object.entries(item.schema)) {
              if (!isRecord(definition)) {
                issues.push(
                  `resources.components[${index}].schema.${field} must be an object`,
                );
              }
            }
          }
          for (const field of ["isRoot", "isNestable"] as const) {
            if (item[field] !== undefined && typeof item[field] !== "boolean") {
              issues.push(
                `resources.components[${index}].${field} must be a boolean`,
              );
            }
          }
        });
      }

      parsedResources[resource] = parsedItems;
    }
  }

  if (issues.length > 0) {
    throw new SetupValidationError(issues);
  }

  return {
    apiVersion: SETUP_API_VERSION,
    kind: SETUP_KIND,
    metadata: { name: (metadata as Record<string, unknown>).name as string },
    resources: parsedResources,
  };
}
