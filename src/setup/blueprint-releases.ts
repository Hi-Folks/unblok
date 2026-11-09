import { validateReleaseSchedule } from "../actions/releases/releases.ts";
import { CliError } from "../errors.ts";

export interface BlueprintRelease {
  name: string;
  releaseAt?: string;
  releaseInDays?: number;
}
export function compileReleases(value: unknown): BlueprintRelease[] {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new CliError("releases must be an object.", 2);
  const section = value as Record<string, unknown>;
  if (
    Object.keys(section).some((key) => key !== "create") ||
    !Array.isArray(section.create) ||
    !section.create.length
  )
    throw new CliError("releases requires a non-empty create list.", 2);
  const names = new Set<string>();
  return section.create.map((value: unknown, index: number) => {
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
  });
}
