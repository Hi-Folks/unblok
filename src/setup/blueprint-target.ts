import type { SpaceDetail } from "@storyblok/management-api-client";
import type {
  DuplicateSpaceOptions,
  StoryblokGateway,
} from "../storyblok/gateway.ts";
import { CliError } from "../errors.ts";
import { duplicateSpace } from "../actions/spaces/duplicate-space.ts";

type Mapping = Record<string, unknown>;
export interface BlueprintTarget {
  duplicate: DuplicateSpaceOptions;
  timeoutMs: number;
  intervalMs: number;
}

export function compileBlueprintTarget(blueprint: Mapping): BlueprintTarget {
  const space = blueprint.space as Mapping | undefined;
  const name = space?.name;
  const sourceSpaceId = Number(space?.duplicate_from);
  if (typeof name !== "string" || !name.trim() || name.includes("${{"))
    throw new CliError(
      "space.name must be a resolved, non-empty name when creating a space.",
      2,
    );
  if (!Number.isSafeInteger(sourceSpaceId) || sourceSpaceId <= 0)
    throw new CliError(
      "space.duplicate_from must be a positive space ID when creating a space.",
      2,
    );
  const readiness = space?.readiness as Mapping | undefined;
  const timeoutMs = Number(readiness?.timeout_seconds ?? 60) * 1000;
  const intervalMs = Number(readiness?.poll_interval_seconds ?? 5) * 1000;
  if (
    !Number.isFinite(timeoutMs) ||
    !Number.isFinite(intervalMs) ||
    timeoutMs <= 0 ||
    intervalMs <= 0
  )
    throw new CliError(
      "Space readiness timeout and poll interval must be positive numbers.",
      2,
    );
  return {
    duplicate: {
      name: name.trim(),
      sourceSpaceId,
      inOrg: space?.in_org as boolean | undefined,
      demo: space?.demo as boolean | undefined,
    },
    timeoutMs,
    intervalMs,
  };
}

export async function createBlueprintTarget(
  gateway: Pick<StoryblokGateway, "duplicateSpace">,
  target: BlueprintTarget,
): Promise<SpaceDetail> {
  const space = await duplicateSpace(gateway, target.duplicate);
  if (
    !Number.isSafeInteger(space.id) ||
    space.id <= 0 ||
    space.id === target.duplicate.sourceSpaceId
  )
    throw new CliError(
      "Duplication returned an invalid target ID. Inspect the organization before retrying.",
    );
  return space;
}

export async function waitForBlueprintTarget(
  gateway: Pick<StoryblokGateway, "getSpace">,
  spaceId: number,
  target: Pick<BlueprintTarget, "timeoutMs" | "intervalMs">,
  clock: { now(): number; sleep(ms: number): Promise<void> } = {
    now: Date.now,
    sleep: (ms) => Bun.sleep(ms),
  },
): Promise<SpaceDetail> {
  const deadline = clock.now() + target.timeoutMs;
  while (true) {
    const space = await gateway.getSpace(spaceId);
    if (space.id !== spaceId)
      throw new CliError(
        `Storyblok returned a different space ID while checking ${spaceId}.`,
      );
    if (space.duplication_status === "done") return space;
    if (space.duplication_status === "failed")
      throw new CliError(
        `Duplication of space ${spaceId} failed (status: ${space.duplication_status}).`,
      );
    const remaining = deadline - clock.now();
    if (remaining <= 0)
      throw new CliError(
        `Space ${spaceId} is not ready after ${target.timeoutMs / 1000} seconds (status: ${space.duplication_status ?? "unknown"}).`,
      );
    await clock.sleep(Math.min(target.intervalMs, remaining));
  }
}
