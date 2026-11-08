import type { Command } from "../../cli/command.ts";
import { dispatch } from "../../cli/dispatch.ts";
import { storyWorkflowCommand } from "./workflow.ts";
import { storyTagsCommand } from "./tags.ts";
import { storyGetCommand, storyBlockUpdateCommand } from "./content.ts";
import { storyPublishCommand } from "./publish.ts";

export const storyCommand: Command = {
  name: "story",
  description: "Manage stories",
  usage: "space-man story <command>",
  async run(args, context) {
    await dispatch(
      "unblok story",
      [
        storyGetCommand,
        storyBlockUpdateCommand,
        storyPublishCommand,
        storyWorkflowCommand,
        storyTagsCommand,
      ],
      args,
      context,
    );
  },
};
