import type { Command } from "../../cli/command.ts";
import { dispatch } from "../../cli/dispatch.ts";
import { editWorkflowCommand } from "./edit.ts";
import { listWorkflowsCommand } from "./list.ts";
import { workflowStageCommand } from "./stage.ts";
import { ensureDefaultWorkflowCommand } from "./ensure-default.ts";

export const workflowCommand: Command = {
  name: "workflow",
  description: "Inspect workflows and stages",
  usage: "space-man workflow <command>",
  async run(args, context) {
    await dispatch(
      "space-man workflow",
      [
        listWorkflowsCommand,
        editWorkflowCommand,
        workflowStageCommand,
        ensureDefaultWorkflowCommand,
      ],
      args,
      context,
    );
  },
};
