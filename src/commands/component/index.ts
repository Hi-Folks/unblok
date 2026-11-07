import type { Command } from "../../cli/command.ts";
import { dispatch } from "../../cli/dispatch.ts";
import { createComponentCommand } from "./create.ts";
import { getComponentCommand } from "./get.ts";
import { listComponentsCommand } from "./list.ts";
import { updateComponentCommand } from "./update.ts";
import { componentFieldAddCommand } from "./field-add.ts";

const commands = [
  listComponentsCommand,
  getComponentCommand,
  createComponentCommand,
  updateComponentCommand,
  componentFieldAddCommand,
];

export const componentCommand: Command = {
  name: "component",
  description: "Manage component schemas",
  usage: "space-man component <command>",
  async run(args, context) {
    await dispatch("space-man component", commands, args, context);
  },
};
