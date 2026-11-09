import { CliError } from "../errors.ts";

export interface BlueprintPipelineBranch {
  name: string;
  source?: string;
}
export function compilePipelineBranches(
  value: unknown,
): BlueprintPipelineBranch[] {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new CliError("pipelines must be an object.", 2);
  const section = value as Record<string, unknown>;
  if (
    Object.keys(section).some((key) => key !== "create") ||
    !Array.isArray(section.create) ||
    !section.create.length
  )
    throw new CliError("pipelines requires a non-empty create list.", 2);
  const names = new Set<string>();
  return section.create.map((entry: unknown, index: number) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry))
      throw new CliError(`pipelines.create[${index}] must be an object.`, 2);
    const item = entry as Record<string, unknown>;
    if (
      Object.keys(item).some((key) => key !== "name" && key !== "source") ||
      typeof item.name !== "string" ||
      !item.name.trim() ||
      (item.source !== undefined &&
        (typeof item.source !== "string" || !item.source.trim()))
    )
      throw new CliError(
        `pipelines.create[${index}] requires a name and optional source.`,
        2,
      );
    const name = item.name.trim();
    const source =
      typeof item.source === "string" ? item.source.trim() : undefined;
    if (names.has(name) || source === name)
      throw new CliError(
        `Pipeline branch '${name}' is duplicated or uses itself as its source.`,
        2,
      );
    names.add(name);
    return { name, ...(source === undefined ? {} : { source }) };
  });
}
