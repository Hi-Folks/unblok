import type { Command } from "../../cli/command.ts";
import { dispatch } from "../../cli/dispatch.ts";
import { installSkill, type SkillAgent } from "../../actions/skills/install.ts";
import { CliError } from "../../errors.ts";
import { version } from "../../version.ts";

const install: Command = {
  name: "install",
  description: "Install the Unblok skill in the current project",
  usage: "unblok skill install --agent <codex|claude> [--json]",
  async run(args, context) {
    if (args.includes("--help") || args.includes("-h")) {
      context.output.text(
        `Usage: ${this.usage}\n\nDownload the skill from the GitHub tag matching this Unblok version into the current project. Existing skills are never overwritten. No Storyblok token is required.\n\n  --agent <codex|claude>  Choose the coding agent\n  --json                  Emit a machine-readable result\n  -h, --help              Show command help\n\nExample:\n  unblok skill install --agent codex`,
      );
      return;
    }
    let agent: SkillAgent | undefined;
    for (let index = 0; index < args.length; index++) {
      const arg = args[index]!;
      const separator = arg.indexOf("=");
      const key = separator < 0 ? arg : arg.slice(0, separator);
      if (key !== "--agent")
        throw new CliError(`Unknown argument '${arg}'.`, 2);
      const value = separator < 0 ? args[++index] : arg.slice(separator + 1);
      if (agent || (value !== "codex" && value !== "claude"))
        throw new CliError(
          "Provide one '--agent codex' or '--agent claude'.",
          2,
        );
      agent = value;
    }
    if (!agent)
      throw new CliError("Option '--agent <codex|claude>' is required.", 2);
    const result = await context.output.activity(
      "Downloading the Unblok skill",
      "Skill installed",
      () => installSkill({ agent: agent!, version, directory: process.cwd() }),
    );
    if (context.output.mode === "json") context.output.data(result);
    else
      context.output.info(
        `Installed the Unblok skill in ${result.path}. Start a new ${agent === "codex" ? "Codex" : "Claude Code"} session to use it.`,
      );
  },
};

export const skillCommand: Command = {
  name: "skill",
  description: "Install guidance for AI coding agents",
  async run(args, context) {
    await dispatch("unblok skill", [install], args, context);
  },
};
