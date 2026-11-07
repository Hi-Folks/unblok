import type { StoryblokGateway } from "../../storyblok/gateway.ts";
import { installAppById } from "./apps.ts";

export const AI_TRANSLATION_APP_ID = "29942";
type Gateway = Pick<StoryblokGateway, "getSpace" | "acceptSpaceDisclaimer" | "listInstalledApps" | "installApp">;
export interface AiTranslationOperation { operation: string; key: string; status: string }

/** Accept the specified disclaimer before installing AI Translations. */
export async function enableAiTranslation(gateway: Gateway, spaceId: number, disclaimerId: number, operations: AiTranslationOperation[] = []): Promise<void> {
  const space = await gateway.getSpace(spaceId);
  if (space.id !== spaceId) throw new Error("Storyblok returned a different space while checking the disclaimer.");
  if (Array.isArray(space.disclaimer_ids) && space.disclaimer_ids.includes(disclaimerId)) {
    operations.push({ operation: "accept-ai-translation-disclaimer", key: String(disclaimerId), status: "unchanged" });
  } else {
    try { await gateway.acceptSpaceDisclaimer(spaceId, disclaimerId); }
    catch (error) {
      operations.push({ operation: "accept-ai-translation-disclaimer", key: String(disclaimerId), status: "failed" });
      throw error;
    }
    operations.push({ operation: "accept-ai-translation-disclaimer", key: String(disclaimerId), status: "accepted" });
  }
  let result: Awaited<ReturnType<typeof installAppById>>;
  try { result = await installAppById(gateway, spaceId, AI_TRANSLATION_APP_ID); }
  catch (error) {
    operations.push({ operation: "install-ai-translations", key: AI_TRANSLATION_APP_ID, status: "failed" });
    throw error;
  }
  operations.push({ operation: "install-ai-translations", key: AI_TRANSLATION_APP_ID, status: result.status });
}
