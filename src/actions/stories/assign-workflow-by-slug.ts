import { CliError } from "../../errors.ts";
import type { StoryblokGateway } from "../../storyblok/gateway.ts";
import {
  errorInfo,
  toUnblokError,
  type UnblokErrorInfo,
} from "../action-error.ts";
import {
  assignWorkflowStage,
  planWorkflowAssignment,
  type WorkflowAssignmentInput,
  type WorkflowAssignmentPlan,
  type WorkflowAssignmentResult,
} from "./workflow-assignment.ts";

export type WorkflowStoryGateway = Pick<
  StoryblokGateway,
  | "findStoryBySlug"
  | "assignWorkflowStage"
  | "getWorkflowStage"
  | "listStories"
  | "listWorkflowStages"
  | "listWorkflows"
>;

export interface WorkflowStoriesInput {
  spaceId: number;
  stage: string;
  workflow?: string;
  stories: readonly string[];
}

export type StoryWorkflowResult = Omit<WorkflowAssignmentResult, "error"> & {
  error?: UnblokErrorInfo;
};
export type StoryWorkflowReport = Omit<
  Awaited<ReturnType<typeof assignWorkflowStage>>,
  "operations"
> & { operations: StoryWorkflowResult[] };

async function resolveInput(
  gateway: WorkflowStoryGateway,
  input: WorkflowStoriesInput,
): Promise<WorkflowAssignmentInput> {
  if (!Number.isSafeInteger(input.spaceId) || input.spaceId <= 0)
    throw new CliError(
      "spaceId must be a positive integer.",
      1,
      "INVALID_INPUT",
    );
  if (typeof input.stage !== "string" || !input.stage.trim())
    throw new CliError("A workflow stage is required.", 1, "INVALID_INPUT");
  if (
    !Array.isArray(input.stories) ||
    !input.stories.length ||
    input.stories.some(
      (slug) =>
        typeof slug !== "string" ||
        !slug.trim() ||
        slug !== slug.trim() ||
        /[*,]/.test(slug),
    )
  )
    throw new CliError(
      "Provide at least one exact story full slug.",
      1,
      "INVALID_INPUT",
    );
  const slugs = [...new Set(input.stories)];
  const ids: number[] = [];
  for (const slug of slugs) {
    const story = await gateway.findStoryBySlug(input.spaceId, slug);
    if (
      !story ||
      story.full_slug !== slug ||
      story.is_folder ||
      !Number.isSafeInteger(story.id) ||
      story.id <= 0
    )
      throw new CliError(
        `Story '${slug}' was not found or is invalid.`,
        1,
        "NOT_FOUND",
      );
    ids.push(story.id);
  }
  return { stage: input.stage, workflow: input.workflow, ids };
}

/** Preview assignment of exact story slugs without making changes. */
export async function planStoryWorkflow(
  gateway: WorkflowStoryGateway,
  input: WorkflowStoriesInput,
): Promise<WorkflowAssignmentPlan> {
  try {
    return await planWorkflowAssignment(
      gateway,
      input.spaceId,
      await resolveInput(gateway, input),
    );
  } catch (error) {
    throw toUnblokError(error);
  }
}

/** Assign an existing stage to exact story slugs; per-story failures are returned in the report. */
export async function assignStoryWorkflow(
  gateway: WorkflowStoryGateway,
  input: WorkflowStoriesInput,
  options: {
    concurrency?: number;
    onOperation?: (operation: StoryWorkflowResult) => void;
  } = {},
): Promise<StoryWorkflowReport> {
  try {
    if (
      options.concurrency !== undefined &&
      (!Number.isInteger(options.concurrency) ||
        options.concurrency < 1 ||
        options.concurrency > 10)
    )
      throw new CliError(
        "concurrency must be an integer between 1 and 10.",
        1,
        "INVALID_INPUT",
      );
    const failures = new Map<number, UnblokErrorInfo>();
    const convert = ({
      error: _message,
      ...operation
    }: WorkflowAssignmentResult): StoryWorkflowResult => ({
      ...operation,
      ...(failures.has(operation.storyId)
        ? { error: failures.get(operation.storyId)! }
        : {}),
    });
    const report = await assignWorkflowStage(
      gateway,
      input.spaceId,
      await resolveInput(gateway, input),
      {
        concurrency: options.concurrency,
        onFailure: (id, error) => failures.set(id, errorInfo(error)),
        onOperation: options.onOperation
          ? (operation) => options.onOperation!(convert(operation))
          : undefined,
      },
    );
    return { ...report, operations: report.operations.map(convert) };
  } catch (error) {
    throw toUnblokError(error);
  }
}
