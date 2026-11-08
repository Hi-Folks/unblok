import { CliError } from "../../errors.ts";
import { readFile } from "node:fs/promises";

export interface StoryWorkflowOptions {
  comment?: string;
  component?: string;
  concurrency: number;
  dueDate?: string;
  notify: boolean;
  releaseId?: number;
  roleIds: number[];
  search?: string;
  spaceId?: string;
  stage: string;
  startsWith?: string;
  storiesFile?: string;
  storyIds: number[];
  userIds: number[];
  workflow?: string;
  withoutStage: boolean;
  yes: boolean;
}

const valueOptions = new Set([
  "--comment",
  "--component",
  "--concurrency",
  "--due-date",
  "--release-id",
  "--role-id",
  "--search",
  "--space-id",
  "--stage",
  "--starts-with",
  "--stories-from",
  "--story",
  "--user-id",
  "--workflow",
]);

function positiveInteger(value: string, option: string): number {
  if (!/^\d+$/.test(value) || Number(value) < 1) {
    throw new CliError(`Option '${option}' requires a positive integer.`, 2);
  }
  return Number(value);
}

export function parseStoryWorkflowOptions(
  args: string[],
  mode: "assign" | "plan",
): StoryWorkflowOptions {
  const values = new Map<string, string>();
  const storyIds: number[] = [];
  const roleIds: number[] = [];
  const userIds: number[] = [];
  let notify = false;
  let yes = false;
  let withoutStage = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const option = argument?.split("=", 1)[0];
    if (
      option === "--notify" ||
      option === "--yes" ||
      option === "--without-stage"
    ) {
      if (option === "--notify") notify = true;
      if (option === "--yes") yes = true;
      if (option === "--without-stage") withoutStage = true;
      continue;
    }
    if (option && valueOptions.has(option)) {
      const inline = argument?.split("=", 2)[1];
      const value = inline ?? args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new CliError(`Option '${option}' requires a value.`, 2);
      }
      if (option === "--story") storyIds.push(positiveInteger(value, option));
      else if (option === "--role-id")
        roleIds.push(positiveInteger(value, option));
      else if (option === "--user-id")
        userIds.push(positiveInteger(value, option));
      else values.set(option, value);
      if (inline === undefined) index += 1;
    } else if (argument?.startsWith("--")) {
      throw new CliError(`Unknown option '${argument}'.`, 2);
    } else {
      throw new CliError(`Unexpected argument '${argument}'.`, 2);
    }
  }

  const stage = values.get("--stage");
  if (!stage)
    throw new CliError("Option '--stage <name-or-id>' is required.", 2);
  if (mode === "assign" && !yes) {
    throw new CliError(
      "Refusing to assign workflow stages without '--yes'. Run 'story workflow plan' first.",
      2,
    );
  }
  if (mode === "plan" && yes) {
    throw new CliError(
      "Option '--yes' is only valid for workflow assignment.",
      2,
    );
  }

  const hasExplicitStories =
    storyIds.length > 0 || values.has("--stories-from");
  const hasFilters = ["--search", "--starts-with", "--component"].some((key) =>
    values.has(key),
  );
  if (!hasExplicitStories && !hasFilters && !withoutStage) {
    throw new CliError(
      "Select stories with '--story', '--stories-from', '--search', '--starts-with', '--component', or '--without-stage'.",
      2,
    );
  }
  if (hasExplicitStories && hasFilters) {
    throw new CliError(
      "Do not combine explicit story IDs with story filters.",
      2,
    );
  }
  if (withoutStage && values.has("--release-id")) {
    throw new CliError(
      "'--without-stage' cannot be combined with '--release-id'.",
      2,
    );
  }

  const dueDateValue = values.get("--due-date");
  const timestamp = dueDateValue ? Date.parse(dueDateValue) : undefined;
  if (timestamp !== undefined && Number.isNaN(timestamp)) {
    throw new CliError("Option '--due-date' requires a valid date.", 2);
  }
  const dueDate =
    timestamp === undefined ? undefined : new Date(timestamp).toISOString();
  const concurrencyValue = values.get("--concurrency");
  const concurrency = concurrencyValue
    ? positiveInteger(concurrencyValue, "--concurrency")
    : 4;
  if (concurrency > 10) {
    throw new CliError("Option '--concurrency' may not exceed 10.", 2);
  }

  return {
    comment: values.get("--comment"),
    component: values.get("--component"),
    concurrency,
    dueDate,
    notify,
    releaseId: values.has("--release-id")
      ? positiveInteger(values.get("--release-id") as string, "--release-id")
      : undefined,
    roleIds: [...new Set(roleIds)],
    search: values.get("--search"),
    spaceId: values.get("--space-id"),
    stage,
    startsWith: values.get("--starts-with"),
    storiesFile: values.get("--stories-from"),
    storyIds: [...new Set(storyIds)],
    userIds: [...new Set(userIds)],
    workflow: values.get("--workflow"),
    withoutStage,
    yes,
  };
}

export async function loadStoryIds(
  ids: number[],
  path?: string,
): Promise<number[]> {
  if (!path) return ids;
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      throw new CliError(`Story ID file not found: ${path}`, 2);
    throw error;
  }
  const tokens = text.split(/[\s,]+/).filter(Boolean);
  const fileIds = tokens.map((token) =>
    positiveInteger(token, "--stories-from"),
  );
  return [...new Set([...ids, ...fileIds])];
}
