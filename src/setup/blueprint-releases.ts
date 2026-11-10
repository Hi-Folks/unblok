import { validateReleaseSchedule } from "../actions/releases/releases.ts";
import { CliError } from "../errors.ts";

export interface BlueprintRelease {
  name: string;
  releaseAt?: string;
  releaseInDays?: number;
}
export function compileReleasePublications(
  section: Record<string, unknown>,
): string[] {
  if (section.publish === undefined) return [];
  if (!Array.isArray(section.publish) || !section.publish.length)
    throw new CliError("releases.publish must be a non-empty array.", 2);
  const references: string[] = [];
  for (const item of section.publish) {
    if (
      !item ||
      typeof item !== "object" ||
      Array.isArray(item) ||
      Object.keys(item).some((key) => key !== "ref") ||
      typeof (item as { ref?: unknown }).ref !== "string" ||
      !(item as { ref: string }).ref.trim() ||
      (item as { ref: string }).ref !== (item as { ref: string }).ref.trim()
    )
      throw new CliError(
        "Each releases.publish entry requires an exact ref.",
        2,
      );
    const ref = (item as { ref: string }).ref;
    if (
      /^\d+$/.test(ref) &&
      (!Number.isSafeInteger(Number(ref)) || Number(ref) <= 0)
    )
      throw new CliError("Release IDs must be positive safe integers.", 2);
    if (references.includes(ref))
      throw new CliError(`Duplicate release publication '${ref}'.`, 2);
    references.push(ref);
  }
  return references;
}
export function compileReleases(value: unknown): BlueprintRelease[] {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new CliError("releases must be an object.", 2);
  const section = value as Record<string, unknown>;
  if (
    Object.keys(section).some((key) => key !== "create" && key !== "publish") ||
    (section.create === undefined && section.publish === undefined) ||
    (section.create !== undefined &&
      (!Array.isArray(section.create) || !section.create.length))
  )
    throw new CliError(
      "releases requires a non-empty create or publish list.",
      2,
    );
  compileReleasePublications(section);
  const names = new Set<string>();
  return (Array.isArray(section.create) ? section.create : []).map(
    (value: unknown, index: number) => {
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new CliError(`releases.create[${index}] must be an object.`, 2);
      const item = value as Record<string, unknown>;
      if (
        Object.keys(item).some(
          (key) => !["name", "release_at", "release_in_days"].includes(key),
        ) ||
        typeof item.name !== "string" ||
        !item.name.trim()
      )
        throw new CliError(
          `releases.create[${index}] requires a name and supports release_at or release_in_days.`,
          2,
        );
      const name = item.name.trim();
      if (names.has(name))
        throw new CliError(`Duplicate release name '${name}'.`, 2);
      names.add(name);
      const releaseAt = item.release_at as string | undefined;
      const releaseInDays = item.release_in_days as number | undefined;
      validateReleaseSchedule({ releaseAt, releaseInDays });
      return {
        name,
        ...(releaseAt === undefined ? {} : { releaseAt }),
        ...(releaseInDays === undefined ? {} : { releaseInDays }),
      };
    },
  );
}
