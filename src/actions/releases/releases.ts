import { CliError } from "../../errors.ts";
import type {
  StoryblokGateway,
  StoryblokRelease,
} from "../../storyblok/gateway.ts";
import { toUnblokError, UnblokError } from "../action-error.ts";

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
export type ReleaseLookupGateway = Pick<
  StoryblokGateway,
  "listInstalledApps" | "listReleases" | "getRelease"
>;
export interface GetReleaseInput extends ReleaseSpaceInput {
  reference: string;
}
export type ReleasePublishGateway = ReleaseLookupGateway &
  Pick<StoryblokGateway, "publishRelease">;
export interface PublishReleaseResult {
  status: "published" | "unchanged";
  releaseId: number;
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

/** Retrieve a release by numeric ID or unique exact name. */
export async function getRelease(
  gateway: ReleaseLookupGateway,
  input: GetReleaseInput,
): Promise<StoryblokRelease> {
  try {
    validateSpace(input?.spaceId);
    if (
      typeof input.reference !== "string" ||
      !input.reference.trim() ||
      input.reference !== input.reference.trim()
    )
      throw new CliError(
        "Provide a release ID or exact name.",
        1,
        "INVALID_INPUT",
      );
    const numeric = /^\d+$/.test(input.reference);
    let id = numeric ? Number(input.reference) : undefined;
    if (numeric && (!Number.isSafeInteger(id) || id! <= 0))
      throw new CliError("Provide a positive release ID.", 1, "INVALID_INPUT");
    await checkApp(gateway, input.spaceId);
    if (id === undefined) {
      const matches = (await gateway.listReleases(input.spaceId)).filter(
        (item) => item.name === input.reference,
      );
      if (!matches.length)
        throw new CliError(
          `Release '${input.reference}' was not found.`,
          1,
          "NOT_FOUND",
        );
      if (matches.length > 1)
        throw new CliError(
          `Multiple releases named '${input.reference}' exist.`,
          1,
          "AMBIGUOUS",
        );
      id = matches[0]!.id;
    }
    if (!Number.isSafeInteger(id) || id <= 0)
      throw new CliError(
        "Storyblok returned an invalid release ID.",
        1,
        "CONFLICT",
      );
    const release = await gateway.getRelease(input.spaceId, id);
    if (
      !release ||
      release.id !== id ||
      typeof release.name !== "string" ||
      !release.name.trim() ||
      (!numeric && release.name !== input.reference)
    )
      throw new CliError("The release could not be verified.", 1, "CONFLICT");
    return release;
  } catch (error) {
    throw toUnblokError(error);
  }
}

/** Publish a release after checking its current status. */
export async function publishRelease(
  gateway: ReleasePublishGateway,
  input: GetReleaseInput,
): Promise<PublishReleaseResult> {
  try {
    const release = await getRelease(gateway, input);
    if (typeof release.released !== "boolean")
      throw new CliError(
        "Storyblok did not return the release's publication status; publishing was stopped.",
        1,
        "CONFLICT",
      );
    if (release.released) return { status: "unchanged", releaseId: release.id };
    const result = await gateway.publishRelease(
      input.spaceId,
      release.id,
      release.name,
    );
    if (result?.id === release.id && result.released === true)
      return { status: "published", releaseId: release.id };
    let current: StoryblokRelease;
    try {
      current = await gateway.getRelease(input.spaceId, release.id);
    } catch (error) {
      throw new UnblokError(
        {
          code: "CONFLICT",
          message:
            "The publish request was sent, but publication could not be confirmed. Inspect the release in Storyblok before retrying.",
        },
        { cause: error },
      );
    }
    if (current?.id !== release.id || current.released !== true)
      throw new CliError(
        "The publish request was sent, but publication could not be confirmed. Inspect the release in Storyblok before retrying.",
        1,
        "CONFLICT",
      );
    return { status: "published", releaseId: release.id };
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
