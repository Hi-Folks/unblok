import { CliError } from "../../errors.ts";
import type {
  StoryblokAppProvision,
  StoryblokGateway,
} from "../../storyblok/gateway.ts";

type AppGateway = Pick<
  StoryblokGateway,
  "listAvailableApps" | "listInstalledApps" | "installApp"
>;

export async function installAppBySlug(
  gateway: AppGateway,
  spaceId: number,
  slug: string,
): Promise<{ status: "installed" | "unchanged"; app: StoryblokAppProvision }> {
  const installed = await gateway.listInstalledApps(spaceId);
  const existing = installed.find((app) => app.slug === slug);
  if (existing) return { status: "unchanged", app: existing };
  const apps = await gateway.listAvailableApps(spaceId);
  const matches = apps.filter((app) => app.slug === slug);
  if (matches.length === 0)
    throw new CliError(`No app found with slug '${slug}'.`, 1, "NOT_FOUND");
  if (matches.length > 1)
    throw new CliError(`App slug '${slug}' is ambiguous.`, 1, "AMBIGUOUS");
  const app = matches[0];
  if (!app || !app.id) throw new CliError(`App '${slug}' has no valid ID.`);
  return {
    status: "installed",
    app: await gateway.installApp(spaceId, String(app.id)),
  };
}

export async function installAppById(
  gateway: Pick<StoryblokGateway, "listInstalledApps" | "installApp">,
  spaceId: number,
  id: string,
): Promise<{ status: "installed" | "unchanged"; app: StoryblokAppProvision }> {
  const installed = await gateway.listInstalledApps(spaceId);
  const existing = installed.find((app) => String(app.app_id) === id);
  if (existing) return { status: "unchanged", app: existing };
  return { status: "installed", app: await gateway.installApp(spaceId, id) };
}
