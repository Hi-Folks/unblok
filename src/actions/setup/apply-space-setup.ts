import {
  compareComponent,
  createComponent,
  type DesiredComponent,
  updateComponent,
} from "../components/component.ts";
import {
  compareLanguage,
  ensureLanguage,
  type DesiredLanguage,
} from "../languages/language.ts";
import type { StoryblokGateway } from "../../storyblok/gateway.ts";
import type {
  SpaceSetup,
  SetupResource,
  SetupResourceItem,
} from "../../setup/schema.ts";

export type ApplyOperationStatus =
  "created" | "failed" | "unchanged" | "unsupported" | "updated";

export interface ApplyOperation {
  action: "create" | "none" | "update";
  error?: string;
  key: string;
  resource: string;
  status: ApplyOperationStatus;
}

export interface SpaceSetupApplyReport {
  apiVersion: "space-man/apply-v1";
  config: {
    apiVersion: SpaceSetup["apiVersion"];
    name: string;
  };
  operations: ApplyOperation[];
  summary: Record<ApplyOperationStatus, number>;
  target: {
    spaceId: number;
  };
}

export interface ApplySpaceSetupOptions {
  onOperation?: (operation: ApplyOperation) => void;
}

const unsupportedResources: Array<{
  collection: SetupResource;
  identity: string;
  singular: string;
}> = [
  { collection: "assets", identity: "path", singular: "asset" },
  { collection: "datasources", identity: "name", singular: "datasource" },
  { collection: "stories", identity: "path", singular: "story" },
  { collection: "tags", identity: "name", singular: "tag" },
];

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Unexpected operation failure";
}

function addOperation(
  operations: ApplyOperation[],
  operation: ApplyOperation,
  options: ApplySpaceSetupOptions,
): void {
  operations.push(operation);
  options.onOperation?.(operation);
}

export async function applySpaceSetup(
  gateway: Pick<
    StoryblokGateway,
    | "createComponent"
    | "getComponent"
    | "listComponents"
    | "listLanguages"
    | "updateComponent"
    | "updateLanguages"
  >,
  setup: SpaceSetup,
  spaceId: number,
  options: ApplySpaceSetupOptions = {},
): Promise<SpaceSetupApplyReport> {
  const operations: ApplyOperation[] = [];
  let [currentComponents, currentLanguages] = await Promise.all([
    gateway.listComponents(spaceId),
    gateway.listLanguages(spaceId),
  ]);

  for (const item of setup.resources.languages ?? []) {
    const desired = item as unknown as DesiredLanguage;
    const action = compareLanguage(desired, currentLanguages);
    if (action === "unchanged") {
      addOperation(
        operations,
        {
          action: "none",
          key: desired.code,
          resource: "language",
          status: "unchanged",
        },
        options,
      );
      continue;
    }

    try {
      const result = await ensureLanguage(gateway, spaceId, desired);
      currentLanguages =
        action === "create"
          ? [...currentLanguages, result.language]
          : currentLanguages.map((language) =>
              language.code === desired.code ? result.language : language,
            );
      addOperation(
        operations,
        {
          action,
          key: desired.code,
          resource: "language",
          status: action === "create" ? "created" : "updated",
        },
        options,
      );
    } catch (error) {
      addOperation(
        operations,
        {
          action,
          error: errorMessage(error),
          key: desired.code,
          resource: "language",
          status: "failed",
        },
        options,
      );
    }
  }

  for (const item of setup.resources.components ?? []) {
    const desired = item as DesiredComponent;
    const action = compareComponent(desired, currentComponents);
    if (action === "unchanged") {
      addOperation(
        operations,
        {
          action: "none",
          key: desired.name,
          resource: "component",
          status: "unchanged",
        },
        options,
      );
      continue;
    }

    try {
      const component =
        action === "create"
          ? await createComponent(gateway, spaceId, desired)
          : await updateComponent(gateway, spaceId, desired.name, desired);
      currentComponents =
        action === "create"
          ? [...currentComponents, component]
          : currentComponents.map((current) =>
              current.name === desired.name ? component : current,
            );
      addOperation(
        operations,
        {
          action,
          key: desired.name,
          resource: "component",
          status: action === "create" ? "created" : "updated",
        },
        options,
      );
    } catch (error) {
      addOperation(
        operations,
        {
          action,
          error: errorMessage(error),
          key: desired.name,
          resource: "component",
          status: "failed",
        },
        options,
      );
    }
  }

  for (const definition of unsupportedResources) {
    for (const item of setup.resources[definition.collection] ?? []) {
      addOperation(
        operations,
        {
          action: "none",
          key: String((item as SetupResourceItem)[definition.identity]),
          resource: definition.singular,
          status: "unsupported",
        },
        options,
      );
    }
  }

  const statuses: ApplyOperationStatus[] = [
    "created",
    "updated",
    "unchanged",
    "unsupported",
    "failed",
  ];
  const summary = Object.fromEntries(
    statuses.map((status) => [
      status,
      operations.filter((operation) => operation.status === status).length,
    ]),
  ) as Record<ApplyOperationStatus, number>;

  return {
    apiVersion: "space-man/apply-v1",
    config: { apiVersion: setup.apiVersion, name: setup.metadata.name },
    operations,
    summary,
    target: { spaceId },
  };
}
