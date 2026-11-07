import { CliError } from "../errors.ts";
import {
  removeDemoMode,
  setPreviewUrls,
} from "../actions/spaces/configure-space.ts";
import type { StoryblokGateway } from "../storyblok/gateway.ts";
import { BlueprintOperationError } from "./blueprint-report.ts";

export interface BlueprintConfiguration {
  languages: string[];
  preview?: {
    domain: string;
    environments?: Array<{ name: string; location: string }>;
  };
  removeDemo: boolean;
}

export async function configureBlueprintSpace(
  gateway: Pick<
    StoryblokGateway,
    "listLanguages" | "updateLanguages" | "getSpace" | "updateSpaceSettings"
  >,
  spaceId: number,
  config: BlueprintConfiguration,
  operations: Array<{ operation: string; key: string; status: string }>,
): Promise<void> {
  if (config.languages.length) {
    try {
      const current = await gateway.listLanguages(spaceId);
      const additions = config.languages.filter(
        (code) => !current.some((item) => item.code === code),
      );
      if (additions.length) {
        const names = new Intl.DisplayNames(["en"], { type: "language" });
        const languages = additions.map((code) => {
          let name: string;
          try {
            name = names.of(code) ?? code;
          } catch {
            name = code;
          }
          return { code, name };
        });
        await gateway.updateLanguages(spaceId, [...current, ...languages]);
      }
      for (const code of config.languages)
        operations.push({
          operation: "ensure-language",
          key: code,
          status: additions.includes(code) ? "created" : "unchanged",
        });
    } catch (error) {
      throw new BlueprintOperationError(
        "configure-languages",
        config.languages.join(", "),
        error,
      );
    }
  }
  if (config.preview) {
    // Never include API errors here: a server may echo a URL containing the token.
    try {
      const space = await gateway.getSpace(spaceId);
      const needsToken = JSON.stringify(config.preview).includes(
        "${{ space.preview_token }}",
      );
      if (needsToken && !space.first_token) throw new Error("Missing token");
      const resolve = (url: string) =>
        url.replaceAll("${{ space.preview_token }}", space.first_token ?? "");
      const domain = resolve(config.preview.domain);
      let environments: Array<{ name: string; location: string }> | undefined;
      if (config.preview.environments !== undefined) {
        if (
          !Array.isArray(space.environments) ||
          space.environments.some(
            (item) =>
              typeof item.name !== "string" ||
              typeof item.location !== "string",
          )
        )
          throw new Error("Invalid environments");
        environments = space.environments.map((item) => ({
          name: item.name!,
          location: item.location!,
        }));
        if (
          new Set(environments.map((item) => item.name)).size !==
          environments.length
        )
          throw new Error("Duplicate environment names");
        for (const desired of config.preview.environments) {
          const next = {
            name: desired.name,
            location: resolve(desired.location),
          };
          const index = environments.findIndex(
            (item) => item.name === next.name,
          );
          if (index < 0) environments.push(next);
          else environments[index] = next;
        }
      }
      const currentEnvironments = space.environments?.map((item) => ({
        name: item.name,
        location: item.location,
      }));
      const changed =
        space.domain !== domain ||
        (environments !== undefined &&
          JSON.stringify(currentEnvironments) !== JSON.stringify(environments));
      if (changed) await setPreviewUrls(gateway, spaceId, domain, environments);
      operations.push({
        operation: "configure-preview",
        key: "preview",
        status: changed ? "updated" : "unchanged",
      });
    } catch {
      throw new BlueprintOperationError(
        "configure-preview",
        "preview",
        new CliError(
          "Could not configure preview URLs. Check the preview token and space settings.",
        ),
      );
    }
  }
  if (config.removeDemo) {
    try {
      const changed = await removeDemoMode(gateway, spaceId);
      operations.push({
        operation: "remove-demo-mode",
        key: "demo",
        status: changed ? "updated" : "unchanged",
      });
    } catch (error) {
      throw new BlueprintOperationError("remove-demo-mode", "demo", error);
    }
  }
}
