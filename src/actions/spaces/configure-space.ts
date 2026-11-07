import { CliError } from "../../errors.ts";
import type { StoryblokGateway } from "../../storyblok/gateway.ts";

export async function getPreviewToken(
  gateway: Pick<StoryblokGateway, "getSpace">,
  spaceId: number,
): Promise<string> {
  const space = await gateway.getSpace(spaceId);
  if (!space.first_token)
    throw new CliError("No preview access token found for this space.");
  return space.first_token;
}

export async function setPreviewUrls(
  gateway: Pick<StoryblokGateway, "updateSpaceSettings">,
  spaceId: number,
  domain: string,
  environments?: Array<{ name: string; location: string }>,
): Promise<void> {
  await gateway.updateSpaceSettings(spaceId, {
    domain,
    ...(environments === undefined ? {} : { environments }),
  });
}

export async function removeDemoMode(
  gateway: Pick<StoryblokGateway, "getSpace" | "updateSpaceSettings">,
  spaceId: number,
): Promise<boolean> {
  const space = await gateway.getSpace(spaceId);
  if (space.is_demo === false) return false;
  await gateway.updateSpaceSettings(spaceId, { is_demo: false });
  return true;
}
