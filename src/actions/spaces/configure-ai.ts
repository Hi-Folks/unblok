import type { StoryblokGateway } from "../../storyblok/gateway.ts";

export async function configureSpaceAi(
  gateway: Pick<StoryblokGateway, "getSpace" | "updateSpaceSettings">,
  spaceId: number,
  desired: { enabled: boolean; inheritOrgConfiguration: boolean },
): Promise<"updated" | "unchanged"> {
  const space = await gateway.getSpace(spaceId);
  if (space.id !== spaceId)
    throw new Error("Storyblok returned a different space.");
  const current = space as typeof space & {
    ai_text_generator_disabled?: boolean;
    inherit_org_ai_configuration?: boolean;
  };
  const settings = {
    ai_text_generator_disabled: !desired.enabled,
    inherit_org_ai_configuration: desired.inheritOrgConfiguration,
  };
  if (
    current.ai_text_generator_disabled ===
      settings.ai_text_generator_disabled &&
    current.inherit_org_ai_configuration ===
      settings.inherit_org_ai_configuration
  )
    return "unchanged";
  await gateway.updateSpaceSettings(spaceId, settings);
  return "updated";
}
