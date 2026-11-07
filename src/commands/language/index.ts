import type { Command } from "../../cli/command.ts";
import { dispatch } from "../../cli/dispatch.ts";
import { addLanguageCommand } from "./add.ts";
import { listLanguagesCommand } from "./list.ts";

const commands = [listLanguagesCommand, addLanguageCommand];

export const languageCommand: Command = {
  name: "language",
  description: "Manage space languages",
  usage: "space-man language <command>",
  async run(args, context) {
    await dispatch("space-man language", commands, args, context);
  },
};
