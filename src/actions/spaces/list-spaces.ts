import type { Space, SpaceDetail } from "@storyblok/management-api-client";
import type { StoryblokGateway } from "../../storyblok/gateway.ts";
import { CliError } from "../../errors.ts";

type SpaceListGateway = Pick<
  StoryblokGateway,
  "getCurrentUserId" | "getSpace" | "listSpaces"
>;

export interface ListSpacesInput {
  limit?: number;
  onInspection?: (inspection: SoloSpaceInspection) => void;
  ownedOnly?: boolean;
  search?: string;
  soloOnly?: boolean;
  updatedBefore?: number;
}

export interface SoloSpaceInspection {
  checked: number;
  isSolo: boolean;
  space: Space;
  total: number;
}

interface InspectionResult {
  details?: SpaceDetail;
  error?: unknown;
  space: Space;
  task: Promise<InspectionResult>;
}

export function filterSpacesUpdatedBefore(
  spaces: Space[],
  days: number | undefined,
  now = Date.now(),
): Space[] {
  if (days === undefined) {
    return spaces;
  }

  const cutoff = now - days * 24 * 60 * 60 * 1_000;
  return spaces.filter((space) => Date.parse(space.updated_at) < cutoff);
}

export async function* inspectSoloSpaces(
  spaces: Space[],
  loadSpace: (spaceId: number) => Promise<SpaceDetail>,
  concurrency = 6,
): AsyncGenerator<SoloSpaceInspection> {
  const remaining = spaces[Symbol.iterator]();
  const pending = new Set<Promise<InspectionResult>>();
  const workerCount = Math.max(1, Math.floor(concurrency));
  let checked = 0;

  const schedule = (): boolean => {
    const next = remaining.next();
    if (next.done) {
      return false;
    }

    let task: Promise<InspectionResult>;
    task = loadSpace(next.value.id).then(
      (details) => ({ details, space: next.value, task }),
      (error: unknown) => ({ error, space: next.value, task }),
    );
    pending.add(task);
    return true;
  };

  for (
    let index = 0;
    index < Math.min(workerCount, spaces.length);
    index += 1
  ) {
    schedule();
  }

  while (pending.size > 0) {
    const result = await Promise.race(pending);
    pending.delete(result.task);
    schedule();

    if (result.error !== undefined) {
      throw result.error;
    }

    checked += 1;
    yield {
      checked,
      isSolo: result.details?.collaborators.length === 0,
      space: result.space,
      total: spaces.length,
    };
  }
}

export async function listSpaces(
  gateway: SpaceListGateway,
  input: ListSpacesInput,
): Promise<Space[]> {
  if (
    input.limit !== undefined &&
    (!Number.isSafeInteger(input.limit) || input.limit < 1)
  )
    throw new CliError("Limit must be a positive integer.", 2);
  let spaces = await gateway.listSpaces({ search: input.search });

  if (input.ownedOnly || input.soloOnly) {
    const currentUserId = await gateway.getCurrentUserId();
    spaces = spaces.filter((space) => space.owner_id === currentUserId);
  }

  spaces = filterSpacesUpdatedBefore(spaces, input.updatedBefore);

  if (input.soloOnly && spaces.length > 0) {
    const soloSpaces: Space[] = [];
    for await (const inspection of inspectSoloSpaces(spaces, (spaceId) =>
      gateway.getSpace(spaceId),
    )) {
      input.onInspection?.(inspection);
      if (inspection.isSolo) soloSpaces.push(inspection.space);
    }
    spaces = soloSpaces;
  }
  if (input.limit === undefined) return spaces;
  return spaces
    .sort((a, b) => {
      const aTime = Date.parse(a.created_at);
      const bTime = Date.parse(b.created_at);
      const aValid = Number.isFinite(aTime),
        bValid = Number.isFinite(bTime);
      if (aValid !== bValid) return aValid ? -1 : 1;
      return (aValid ? bTime - aTime : 0) || b.id - a.id;
    })
    .slice(0, input.limit);
}
