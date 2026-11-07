import type { Command } from "../../cli/command.ts";
import { dispatch } from "../../cli/dispatch.ts";
import { duplicateSpaceCommand } from "./duplicate.ts";
import { deleteSpaceCommand } from "./delete.ts";
import { applySpaceCommand } from "./apply.ts";
import {
  spaceDemoRemoveCommand,
  spacePreviewSetCommand,
  spaceTokenCommand,
} from "./configuration.ts";
import { getSpaceCommand } from "./get.ts";
import { listSpacesCommand } from "./list.ts";
import { planSpaceCommand } from "./plan.ts";
import { spaceSetupCommand } from "./setup.ts";

const commands = [
  listSpacesCommand,
  getSpaceCommand,
  duplicateSpaceCommand,
  deleteSpaceCommand,
  planSpaceCommand,
  applySpaceCommand,
  spaceTokenCommand,
  spacePreviewSetCommand,
  spaceDemoRemoveCommand,
  spaceSetupCommand,
];

export const spaceCommand: Command = {
  name: "space",
  description: "Inspect Storyblok spaces",
  usage: "space-man space <command>",
  async run(args, context) {
    await dispatch("space-man space", commands, args, context);
  },
};
