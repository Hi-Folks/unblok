import { CliError } from "../../errors.ts";
import type { StoryblokGateway } from "../../storyblok/gateway.ts";
import { toUnblokError } from "../action-error.ts";
import { installAppBySlug } from "./apps.ts";

export type AppInstallGateway = Pick<
  StoryblokGateway,
  "listAvailableApps" | "listInstalledApps" | "installApp"
>;
export interface EnsureAppInstalledInput {
  spaceId: number;
  slug: string;
}
export interface EnsureAppInstalledResult {
  status: "installed" | "unchanged";
  app: { appId: string | number; name: string; slug: string };
}

/** Install an available app by exact slug, or leave an existing installation unchanged. */
export async function ensureAppInstalled(
  gateway: AppInstallGateway,
  input: EnsureAppInstalledInput,
): Promise<EnsureAppInstalledResult> {
  try {
    if (
      !Number.isSafeInteger(input.spaceId) ||
      input.spaceId <= 0 ||
      typeof input.slug !== "string" ||
      !input.slug.trim() ||
      input.slug !== input.slug.trim()
    )
      throw new CliError(
        "Provide a positive spaceId and exact app slug.",
        1,
        "INVALID_INPUT",
      );
    const result = await installAppBySlug(gateway, input.spaceId, input.slug);
    return {
      status: result.status,
      app: {
        appId: result.app.app_id,
        name: result.app.name,
        slug: result.app.slug,
      },
    };
  } catch (error) {
    throw toUnblokError(error);
  }
}
