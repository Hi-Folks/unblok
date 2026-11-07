import type { SpaceDetail } from "@storyblok/management-api-client";
import type {
  DuplicateSpaceOptions,
  StoryblokGateway,
} from "../../storyblok/gateway.ts";

export function duplicateSpace(
  gateway: Pick<StoryblokGateway, "duplicateSpace">,
  input: DuplicateSpaceOptions,
): Promise<SpaceDetail> {
  return gateway.duplicateSpace(input);
}
