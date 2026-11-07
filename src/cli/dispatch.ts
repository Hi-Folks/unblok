import { CliError } from "../errors.ts";
import type { Command, CommandContext } from "./command.ts";

export function commandHelp(program: string, commands: Command[]): string {
  const commandLines = commands
    .map((command) => `  ${command.name.padEnd(12)} ${command.description}`)
    .join("\n");

  const versionOption =
    program === "unblok" ? "  --version    Show the installed version\n" : "";
  return `Usage: ${program} <command> [options]\n\nCommands:\n${commandLines}\n\nOptions:\n  --json       Emit machine-readable JSON\n${versionOption}  -h, --help   Show command help\n\nRun '${program} <command> --help' for command details.`;
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
