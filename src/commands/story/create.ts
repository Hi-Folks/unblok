import { readFile } from "node:fs/promises";
import { ensureStoryCreated } from "../../actions/stories/create-story.ts";
import type { Command } from "../../cli/command.ts";
import { getStoryblokToken } from "../../config/environment.ts";
import { resolveSpaceId } from "../../config/space-id.ts";
import { CliError } from "../../errors.ts";

export const storyCreateCommand: Command = {
  name: "create",
  description: "Create a draft story from JSON",
  usage:
    "unblok story create --file <path> [--release-id <id>] [--space-id <id>] --yes",
  async run(args, context) {
    if (args.includes("--help") || args.includes("-h")) {
      context.output.text(
        `Usage: ${this.usage}\n\nCreate a draft story at the root or in an existing folder. An existing story with the same full slug is preserved.\n\nOptions:\n  --file <path>      JSON definition with name, full slug, and content\n  --release-id <id>  Create the story in this release\n  --space-id <id>    Target space; defaults to STORYBLOK_SPACE_ID\n  --yes              Confirm creation (required)\n  --json             Emit machine-readable JSON\n  -h, --help         Show command help`,
      );
      return;
    }
    let file: string | undefined;
    let spaceIdOption: string | undefined;
    let releaseId: number | undefined;
    let yes = false;
    for (let i = 0; i < args.length; i++) {
      const arg = args[i]!;
      if (arg === "--yes") {
        yes = true;
        continue;
      }
      const equal = arg.indexOf("=");
      const key = equal < 0 ? arg : arg.slice(0, equal);
      if (key !== "--file" && key !== "--space-id" && key !== "--release-id")
        throw new CliError(`Unknown argument '${arg}'.`, 2);
      const value = equal < 0 ? args[++i] : arg.slice(equal + 1);
      if (!value?.trim() || value.startsWith("--"))
        throw new CliError(`Option '${key}' requires a value.`, 2);
      if (key === "--file") {
        if (file !== undefined)
          throw new CliError("Provide one definition file.", 2);
        file = value;
      } else if (key === "--release-id") {
        if (
          releaseId !== undefined ||
          !/^\d+$/.test(value) ||
          !Number.isSafeInteger(Number(value)) ||
          Number(value) < 1
        )
          throw new CliError("Provide one positive release ID.", 2);
        releaseId = Number(value);
      } else {
        if (spaceIdOption !== undefined)
          throw new CliError("Provide one space ID.", 2);
        spaceIdOption = value;
      }
    }
    if (!file) throw new CliError("Option '--file <path>' is required.", 2);
    if (!yes)
      throw new CliError("Refusing to create a story without '--yes'.", 2);
    const spaceId = resolveSpaceId({
      environment: context.environment,
      option: spaceIdOption,
    });
    let source: string;
    try {
      source = await readFile(file, "utf8");
    } catch {
      throw new CliError(`Could not read story definition '${file}'.`, 2);
    }
    let definition: unknown;
    try {
      definition = JSON.parse(source);
    } catch {
      throw new CliError(
        `Story definition '${file}' must contain valid JSON.`,
        2,
      );
    }
    if (
      !definition ||
      typeof definition !== "object" ||
      Array.isArray(definition) ||
      Object.keys(definition).some(
        (key) => !["name", "slug", "content"].includes(key),
      )
    )
      throw new CliError(
        "Story definition must contain only name, slug, and content.",
        2,
      );
    const { name, slug, content } = definition as Record<string, unknown>;
    const gateway = context.createGateway(
      getStoryblokToken(context.environment),
    );
    const result = await context.output.activity(
      "Checking story",
      "Story checked",
      () =>
        ensureStoryCreated(gateway, {
          spaceId,
          name: name as string,
          slug: slug as string,
          content: content as Record<string, unknown>,
          releaseId,
        }),
    );
    if (context.output.mode === "json") context.output.data(result);
    else
      context.output.info(
        result.status === "created"
          ? `Created draft story ${String(slug).trim()}.`
          : `Story ${String(slug).trim()} already exists; its content was preserved.`,
      );
  },
};
