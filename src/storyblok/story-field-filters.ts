import { CliError } from "../errors.ts";

export const storyFieldOperators = [
  "is",
  "in",
  "not_in",
  "like",
  "not_like",
  "in_array",
  "all_in_array",
  "gt_int",
  "lt_int",
  "gt_float",
  "lt_float",
  "gt_date",
  "lt_date",
] as const;

export type StoryFieldOperator = (typeof storyFieldOperators)[number];
export interface StoryFieldFilter {
  field: string;
  operator: StoryFieldOperator;
  value: string;
}

/** Validate filters before making any Management API requests. */
export function validateStoryFieldFilters(
  filters: readonly StoryFieldFilter[],
): void {
  if (!Array.isArray(filters))
    throw new CliError("Field filters must be an array.", 2, "INVALID_INPUT");
  const seen = new Set<string>();
  for (const filter of filters) {
    if (
      !filter ||
      typeof filter.field !== "string" ||
      !/^[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)*$/.test(filter.field) ||
      filter.field.split(".").includes("__or")
    )
      throw new CliError(
        "Field filters require a valid content field path, such as 'category' or 'seo.title'.",
        2,
        "INVALID_INPUT",
      );
    if (!storyFieldOperators.includes(filter.operator))
      throw new CliError(
        `Unsupported field operator '${filter.operator}'. Supported operators: ${storyFieldOperators.join(", ")}.`,
        2,
        "INVALID_INPUT",
      );
    if (
      typeof filter.value !== "string" ||
      !filter.value.trim() ||
      filter.value !== filter.value.trim()
    )
      throw new CliError(
        "Field filter values must be nonempty and have no surrounding whitespace.",
        2,
        "INVALID_INPUT",
      );
    if (
      filter.operator === "is" &&
      ![
        "empty",
        "not_empty",
        "empty_array",
        "not_empty_array",
        "true",
        "false",
        "null",
        "not_null",
      ].includes(filter.value)
    )
      throw new CliError(
        "The 'is' operator requires empty, not_empty, empty_array, not_empty_array, true, false, null, or not_null.",
        2,
        "INVALID_INPUT",
      );
    const key = `${filter.field}:${filter.operator}`;
    if (seen.has(key))
      throw new CliError(
        `Duplicate field filter '${key}'. Combine values with commas when supported.`,
        2,
        "INVALID_INPUT",
      );
    seen.add(key);
  }
}

export function parseStoryFieldFilter(value: string): StoryFieldFilter {
  const first = value.indexOf(":");
  const second = value.indexOf(":", first + 1);
  if (first < 1 || second < 0)
    throw new CliError(
      "Use --field 'field:operator:value', for example --field 'category:in:news'.",
      2,
      "INVALID_INPUT",
    );
  const filter = {
    field: value.slice(0, first),
    operator: value.slice(first + 1, second) as StoryFieldOperator,
    value: value.slice(second + 1),
  };
  validateStoryFieldFilters([filter]);
  return filter;
}
