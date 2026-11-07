import {
  resourceDefinitions,
  type SpaceSetup,
  type SetupResource,
} from "../../setup/schema.ts";
import {
  compareLanguage,
  type DesiredLanguage,
  type LanguageChange,
} from "../languages/language.ts";
import type { StoryblokLanguage } from "../../storyblok/gateway.ts";
import type { Component } from "@storyblok/management-api-client";
import {
  compareComponent,
  type ComponentChange,
  type DesiredComponent,
} from "../components/component.ts";

export interface SetupPlanOperation {
  action: "create" | "ensure" | "none" | "update";
  key: string;
  resource: string;
  status: "change" | "planned" | "unchanged";
}

export interface SpaceSetupPlan {
  apiVersion: "space-man/plan-v1";
  config: {
    apiVersion: SpaceSetup["apiVersion"];
    name: string;
  };
  operations: SetupPlanOperation[];
  summary: {
    changes: number;
    pending: number;
    planned: number;
    unchanged: number;
  };
  target?: {
    spaceId: number;
  };
}

export interface CurrentSetupState {
  components?: Component[];
  languages?: StoryblokLanguage[];
  spaceId?: number;
}

export function planSpaceSetup(
  setup: SpaceSetup,
  current: CurrentSetupState = {},
): SpaceSetupPlan {
  const operations: SetupPlanOperation[] = [];

  for (const [resource, definition] of Object.entries(resourceDefinitions) as [
    SetupResource,
    (typeof resourceDefinitions)[SetupResource],
  ][]) {
    for (const item of setup.resources[resource] ?? []) {
      if (resource === "components" && current.components) {
        const change: ComponentChange = compareComponent(
          item as DesiredComponent,
          current.components,
        );
        operations.push({
          action: change === "unchanged" ? "none" : change,
          key: item[definition.identity] as string,
          resource: definition.singular,
          status: change === "unchanged" ? "unchanged" : "change",
        });
        continue;
      }

      if (resource === "languages" && current.languages) {
        const change: LanguageChange = compareLanguage(
          item as unknown as DesiredLanguage,
          current.languages,
        );
        operations.push({
          action: change === "unchanged" ? "none" : change,
          key: item[definition.identity] as string,
          resource: definition.singular,
          status: change === "unchanged" ? "unchanged" : "change",
        });
        continue;
      }

      operations.push({
        action: "ensure",
        key: item[definition.identity] as string,
        resource: definition.singular,
        status: "planned",
      });
    }
  }

  return {
    apiVersion: "space-man/plan-v1",
    config: {
      apiVersion: setup.apiVersion,
      name: setup.metadata.name,
    },
    operations,
    summary: {
      changes: operations.filter((operation) => operation.status === "change")
        .length,
      pending: operations.filter((operation) => operation.status === "planned")
        .length,
      planned: operations.length,
      unchanged: operations.filter(
        (operation) => operation.status === "unchanged",
      ).length,
    },
    ...(current.spaceId === undefined
      ? {}
      : { target: { spaceId: current.spaceId } }),
  };
}
