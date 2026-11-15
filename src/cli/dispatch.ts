import { CliError } from "../errors.ts";
import type { Command, CommandContext } from "./command.ts";

export function commandHelp(program: string, commands: Command[]): string {
  const commandLines = commands
    .map((command) => `  ${command.name.padEnd(12)} ${command.description}`)
    .join("\n");

  const versionOption =
    program === "unblok" ? "  --version    Show the installed version\n" : "";
  const discover =
    program === "unblok"
      ? `\n\nI want to...\n  List my spaces              unblok space list\n  Find stories in a folder    unblok story list --starts-with articles/\n  Check country variants      unblok dimensions coverage --starts-with global/\n  Explore setup recipes       unblok space setup examples\n  Install the AI agent skill  unblok skill install --agent codex\n                              unblok skill install --agent claude\n\nSpace commands require a token; use --space-id or set STORYBLOK_SPACE_ID where needed.`
      : "";
  return `Usage: ${program} <command> [options]\n\nCommands:\n${commandLines}\n\nOptions:\n  --json       Emit machine-readable JSON\n  --verbose    Show safe error diagnostics\n${versionOption}  -h, --help   Show command help.${discover}\n\nRun '${program} <command> --help' for command details.`;
}

export async function dispatch(
  program: string,
  commands: Command[],
  args: string[],
  context: CommandContext,
): Promise<void> {
  const [commandName, ...commandArgs] = args;

  if (!commandName || commandName === "--help" || commandName === "-h") {
    context.output.text(commandHelp(program, commands));
    return;
  }

  const command = commands.find((candidate) => candidate.name === commandName);

  if (!command) {
    throw new CliError(
      `Unknown command '${commandName}'. Run '${program} --help'.`,
      2,
    );
  }

  await command.run(commandArgs, context);
}
