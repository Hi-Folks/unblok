import type { StoryblokGateway } from "../../storyblok/gateway.ts";

export async function deleteSpace(
  gateway: Pick<StoryblokGateway, "deleteSpace">,
  spaceId: number,
): Promise<void> {
  await gateway.deleteSpace(spaceId);
}
