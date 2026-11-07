import type { SpaceDetail } from "@storyblok/management-api-client";
import type { StoryblokGateway } from "../../storyblok/gateway.ts";

export function getSpace(
  gateway: StoryblokGateway,
  spaceId: number,
): Promise<SpaceDetail> {
  return gateway.getSpace(spaceId);
}
