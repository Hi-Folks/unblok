import type { StoryblokGateway } from "../../storyblok/gateway.ts";
import { installAppById } from "./apps.ts";

export const EXPERIMENTS_APP_ID = "173657247642152";
export interface ExperimentsAppOperation {
  operation: string;
  key: string;
  status: string;
}

/** Accept the specified disclaimer before installing Experiments. */
export async function enableExperiments(
  gateway: Pick<
    StoryblokGateway,
    "getSpace" | "acceptSpaceDisclaimer" | "listInstalledApps" | "installApp"
  >,
  spaceId: number,
  disclaimerId: number,
  operations: ExperimentsAppOperation[] = [],
): Promise<void> {
  if (!Number.isSafeInteger(disclaimerId) || disclaimerId <= 0)
    throw new Error("A positive disclaimer ID is required.");
  const installed = await gateway.listInstalledApps(spaceId);
  if (installed.some((app) => String(app.app_id) === EXPERIMENTS_APP_ID)) {
    operations.push({
      operation: "install-experiments",
      key: EXPERIMENTS_APP_ID,
      status: "unchanged",
    });
    return;
  }
  const space = await gateway.getSpace(spaceId);
  if (space.id !== spaceId)
    throw new Error(
      "Storyblok returned a different space while checking the disclaimer.",
    );
  if (
    Array.isArray(space.disclaimer_ids) &&
    space.disclaimer_ids.includes(disclaimerId)
  ) {
    operations.push({
      operation: "accept-experiments-disclaimer",
      key: String(disclaimerId),
      status: "unchanged",
    });
  } else {
    try {
      await gateway.acceptSpaceDisclaimer(spaceId, disclaimerId);
    } catch (error) {
      operations.push({
        operation: "accept-experiments-disclaimer",
        key: String(disclaimerId),
        status: "failed",
      });
      throw error;
    }
    operations.push({
      operation: "accept-experiments-disclaimer",
      key: String(disclaimerId),
      status: "accepted",
    });
  }
  try {
    const result = await installAppById(gateway, spaceId, EXPERIMENTS_APP_ID);
    operations.push({
      operation: "install-experiments",
      key: EXPERIMENTS_APP_ID,
      status: result.status,
    });
  } catch (error) {
    operations.push({
      operation: "install-experiments",
      key: EXPERIMENTS_APP_ID,
      status: "failed",
    });
    throw error;
  }
}
