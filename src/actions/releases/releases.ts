import { CliError } from "../../errors.ts";
import type {
  StoryblokGateway,
  StoryblokRelease,
} from "../../storyblok/gateway.ts";
import { toUnblokError } from "../action-error.ts";

export type ReleaseGateway = Pick<
  StoryblokGateway,
  "listInstalledApps" | "listReleases" | "createRelease"
>;
export interface ReleaseSpaceInput {
  spaceId: number;
}
export interface CreateReleaseInput extends ReleaseSpaceInput {
  name: string;
  releaseAt?: string;
  releaseInDays?: number;
}
export interface CreateReleaseResult {
  status: "created" | "unchanged";
  release: StoryblokRelease;
}

async function checkApp(
  gateway: Pick<ReleaseGateway, "listInstalledApps">,
  spaceId: number,
): Promise<void> {
  const apps = await gateway.listInstalledApps(spaceId);
  if (
    !apps.some((app) => app.slug === "releases" || app.slug === "releases_only")
  )
    throw new CliError(
      "The Releases app is not installed. Install and enable it in the space before managing releases.",
      1,
      "NOT_FOUND",
    );
}
function validateSpace(spaceId: number): void {
  if (!Number.isSafeInteger(spaceId) || spaceId <= 0)
    throw new CliError("Provide a positive spaceId.", 1, "INVALID_INPUT");
}

export function validateReleaseSchedule(input: {
  releaseAt?: string;
  releaseInDays?: number;
}): void {
  if (input.releaseAt !== undefined && input.releaseInDays !== undefined)
    throw new CliError(
      "Provide either releaseAt or releaseInDays, not both.",
      1,
      "INVALID_INPUT",
    );
  if (
    input.releaseInDays !== undefined &&
    (!Number.isSafeInteger(input.releaseInDays) ||
      input.releaseInDays < 1 ||
      input.releaseInDays > 36500)
  )
    throw new CliError(
      "releaseInDays must be an integer between 1 and 36500.",
      1,
      "INVALID_INPUT",
    );
  if (input.releaseAt !== undefined) {
    const value = input.releaseAt;
    const match =
      typeof value === "string"
        ? /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(value)
        : null;
    const parsed = match
      ? new Date(`${value.replace(" ", "T")}:00Z`)
      : undefined;
    if (
      !match ||
      !parsed ||
      !Number.isFinite(parsed.getTime()) ||
      parsed.toISOString().slice(0, 16).replace("T", " ") !== value
    )
      throw new CliError(
        "Provide releaseAt as a valid date and time in YYYY-MM-DD HH:mm format.",
        1,
        "INVALID_INPUT",
      );
  }
}

/** List releases in a space with the Releases app installed. */
export async function listReleases(
  gateway: Pick<ReleaseGateway, "listInstalledApps" | "listReleases">,
  input: ReleaseSpaceInput,
): Promise<StoryblokRelease[]> {
  try {
    validateSpace(input?.spaceId);
    await checkApp(gateway, input.spaceId);
    return await gateway.listReleases(input.spaceId);
  } catch (error) {
    throw toUnblokError(error);
  }
}

/** Create a release unless one with the exact name already exists. */
export async function createRelease(
  gateway: ReleaseGateway,
  input: CreateReleaseInput,
): Promise<CreateReleaseResult> {
  try {
    validateSpace(input?.spaceId);
    if (typeof input.name !== "string" || !input.name.trim())
      throw new CliError("Provide a release name.", 1, "INVALID_INPUT");
    validateReleaseSchedule(input);
    await checkApp(gateway, input.spaceId);
    const name = input.name.trim();
    const releases = await gateway.listReleases(input.spaceId);
    const matches = releases.filter((release) => release.name === name);
    if (matches.length > 1)
      throw new CliError(
        `Multiple releases named '${name}' already exist.`,
        1,
        "AMBIGUOUS",
      );
    if (matches[0]) {
      if (
        input.releaseAt !== undefined &&
        matches[0].release_at !== input.releaseAt
      )
        throw new CliError(
          `Release '${name}' already exists with a different or unverifiable schedule.`,
          1,
          "CONFLICT",
        );
      return { status: "unchanged", release: matches[0] };
    }
    const releaseAt =
      input.releaseInDays === undefined
        ? input.releaseAt
        : new Date(Date.now() + input.releaseInDays * 86_400_000)
            .toISOString()
            .slice(0, 16)
            .replace("T", " ");
    return {
      status: "created",
      release: await gateway.createRelease(input.spaceId, name, releaseAt),
    };
  } catch (error) {
    throw toUnblokError(error);
  }
}
