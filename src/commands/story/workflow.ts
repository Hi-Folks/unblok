import {
  assignWorkflowStage,
  planWorkflowAssignment,
  type WorkflowAssignmentInput,
  type WorkflowAssignmentPlanOperation,
  type WorkflowAssignmentResult,
} from "../../actions/stories/workflow-assignment.ts";
import type { Command, CommandContext } from "../../cli/command.ts";
import { dispatch } from "../../cli/dispatch.ts";
import { getStoryblokToken } from "../../config/environment.ts";
import { resolveSpaceId } from "../../config/space-id.ts";
import { CliError } from "../../errors.ts";
import { formatStatus } from "../../reporting.ts";
import {
  loadStoryIds,
  parseStoryWorkflowOptions,
  type StoryWorkflowOptions,
} from "./workflow-options.ts";

const OPTIONS_HELP = `  --stage <name-or-id>      Target workflow stage (required)
  --workflow <name-or-id>   Disambiguate the stage's workflow
  --story <id>              Select a story; repeatable
  --stories-from <path>     Read story IDs separated by whitespace or commas
  --search <text>           Select stories by search term
  --starts-with <path>      Select stories below a full-slug prefix
  --component <name>        Select stories containing a component
  --without-stage           Select only stories without a workflow stage
  --due-date <date>         Optional ISO date or datetime
  --comment <message>       Workflow transition comment
  --notify                  Notify assigned users and roles
  --user-id <id>            Assign a user; repeatable
  --role-id <id>            Assign a space role; repeatable
  --release-id <id>         Apply the transition within a release
  --space-id <id>           Target space; defaults to STORYBLOK_SPACE_ID
  --json                    Emit machine-readable JSON
  -h, --help                Show command help`;

function formatOperation(
  operation: WorkflowAssignmentPlanOperation | WorkflowAssignmentResult,
): string {
  const error =
    "error" in operation && operation.error ? ` · ${operation.error}` : "";
  return `${operation.status.padEnd(9)} ${String(operation.storyId).padEnd(12)} ${operation.fullSlug}${error}`;
}

async function prepare(
  args: string[],
  context: CommandContext,
  mode: "assign" | "plan",
): Promise<{
  concurrency: number;
  gateway: ReturnType<CommandContext["createGateway"]>;
  input: WorkflowAssignmentInput;
  spaceId: number;
}> {
  const options: StoryWorkflowOptions = parseStoryWorkflowOptions(args, mode);
  const ids = await loadStoryIds(options.storyIds, options.storiesFile);
  if (options.storiesFile && ids.length === 0) {
    throw new CliError("The story ID file contains no IDs.", 2);
  }
  const spaceId = resolveSpaceId({
    environment: context.environment,
    option: options.spaceId,
  });
  const gateway = context.createGateway(getStoryblokToken(context.environment));
  return {
    concurrency: options.concurrency,
    gateway,
    input: {
      comment: options.comment,
      component: options.component,
      dueDate: options.dueDate,
      ids: ids.length > 0 ? ids : undefined,
      notify: options.notify,
      releaseId: options.releaseId,
      roleIds: options.roleIds,
      search: options.search,
      stage: options.stage,
      startsWith: options.startsWith,
      userIds: options.userIds,
      workflow: options.workflow,
      withoutStage: options.withoutStage,
    },
    spaceId,
  };
}

const planCommand: Command = {
  name: "plan",
  description: "Preview workflow stage assignments",
  usage: "space-man story workflow plan --stage <stage> <selector>",
  async run(args, context) {
    if (args.includes("--help") || args.includes("-h")) {
      context.output.text(
        `Usage: ${this.usage} [options]\n\n${this.description}; no changes are made.\n\nOptions:\n${OPTIONS_HELP}`,
      );
      return;
    }
    const prepared = await prepare(args, context, "plan");
    const plan = await context.output.activity(
      "Resolving workflow stage and stories",
      "Assignment plan ready",
      () =>
        planWorkflowAssignment(
          prepared.gateway,
          prepared.spaceId,
          prepared.input,
        ),
    );
    if (context.output.mode === "json") context.output.data(plan);
    else
      context.output.note(
        `Workflow plan: ${plan.stage.name}`,
        `${plan.operations.map(formatOperation).join("\n") || "No stories matched."}\n\n${plan.summary.changes} change(s), ${plan.summary.unchanged} unchanged; no changes were made.`,
      );
  },
};

const assignCommand: Command = {
  name: "assign",
  description: "Assign a workflow stage to selected stories",
  usage: "space-man story workflow assign --stage <stage> <selector> --yes",
  async run(args, context) {
    if (args.includes("--help") || args.includes("-h")) {
      context.output.text(
        `Usage: ${this.usage} [options]\n\n${this.description}.\n\nOptions:\n${OPTIONS_HELP}\n  --concurrency <n>         Parallel assignments, 1-10 (default: 4)\n  --yes                     Confirm workflow mutations (required)`,
      );
      return;
    }
    const prepared = await prepare(args, context, "assign");
    const progress = context.output.task("Assigning workflow stages");
    const report = await assignWorkflowStage(
      prepared.gateway,
      prepared.spaceId,
      prepared.input,
      {
        concurrency: prepared.concurrency,
        onOperation(operation) {
          progress.message(formatOperation(operation));
        },
      },
    );
    if (report.summary.failed > 0)
      progress.error("Workflow assignment finished with failures");
    else progress.success("Workflow assignment finished");
    if (context.output.mode === "json") context.output.data(report);
    else {
      const summary = `${report.summary.assigned} assigned · ${report.summary.unchanged} unchanged · ${report.summary.failed} failed`;
      const title =
        report.operations.length === 0
          ? "No stories matched"
          : report.summary.failed === 0
            ? "Workflow: complete"
            : report.summary.failed === report.operations.length
              ? "Workflow: failed"
              : "Workflow: partial";
      const details = report.operations.map((operation) =>
        formatStatus(
          operation.status,
          `${operation.fullSlug} (ID ${operation.storyId})`,
          operation.error ??
            (operation.status === "unchanged"
              ? "Already in the requested stage."
              : undefined),
          context.output.style,
        ),
      );
      context.output.summary(
        title,
        [
          `Space  ${prepared.spaceId}`,
          `Stage  ${report.stage.name} (${report.stage.id})`,
          "",
          ...(details.length ? details : ["No stories matched the selection."]),
          "",
          summary,
        ].join("\n"),
      );
    }
    if (report.summary.failed > 0) {
      throw new CliError(
        `${report.summary.failed} workflow assignment(s) failed.`,
      );
    }
  },
};

export const storyWorkflowCommand: Command = {
  name: "workflow",
  description: "Plan or assign story workflow stages",
  usage: "space-man story workflow <command>",
  async run(args, context) {
    await dispatch(
      "space-man story workflow",
      [planCommand, assignCommand],
      args,
      context,
    );
  },
};
