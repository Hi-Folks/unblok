import type { Command } from "../cli/command.ts";
import { getStoryblokToken } from "../config/environment.ts";
import { resolveSpaceId } from "../config/space-id.ts";
import { CliError } from "../errors.ts";
import type { StoryblokGateway } from "../storyblok/gateway.ts";

export function resourceGetCommand<T>(options: {
  resource: string;
  description: string;
  lookup: (
    gateway: StoryblokGateway,
    input: { spaceId: number; reference: string },
  ) => Promise<T>;
  render: (item: T) => { title: string; details: string };
}): Command {
  const usage = `unblok ${options.resource} get --ref <id-or-name> [--space-id <id>]`;
  return {
    name: "get",
    description: options.description,
    usage,
    async run(args, context) {
      if (args.includes("--help") || args.includes("-h")) {
        context.output.text(
          `Usage: ${usage}\n\n${options.description} by numeric ID or exact name. Numeric-only references are IDs.\n\n  --ref <id-or-name>  Resource ID or exact name\n  --space-id <id>     Target space; defaults to STORYBLOK_SPACE_ID\n  --json              Emit machine-readable JSON\n  -h, --help          Show command help`,
        );
        return;
      }
      let reference: string | undefined;
      let spaceIdOption: string | undefined;
      for (let index = 0; index < args.length; index++) {
        const arg = args[index]!;
        const equal = arg.indexOf("=");
        const key = equal < 0 ? arg : arg.slice(0, equal);
        if (key !== "--ref" && key !== "--space-id")
          throw new CliError(`Unknown argument '${arg}'.`, 2);
        const value = equal < 0 ? args[++index] : arg.slice(equal + 1);
        if (!value?.trim() || value.startsWith("--"))
          throw new CliError(`Option '${key}' requires a value.`, 2);
        if (key === "--ref") {
          if (reference !== undefined)
            throw new CliError("Provide one reference.", 2);
          reference = value;
        } else {
          if (spaceIdOption !== undefined)
            throw new CliError("Provide one space ID.", 2);
          spaceIdOption = value;
        }
      }
      if (!reference)
        throw new CliError("Option '--ref <id-or-name>' is required.", 2);
      const spaceId = resolveSpaceId({
        environment: context.environment,
        option: spaceIdOption,
      });
      const gateway = context.createGateway(
        getStoryblokToken(context.environment),
      );
      const result = await context.output.activity(
        `Loading ${options.resource}`,
        `${options.resource} loaded`,
        () => options.lookup(gateway, { spaceId, reference: reference! }),
      );
      if (context.output.mode === "json") context.output.data(result);
      else {
        const rendered = options.render(result);
        context.output.note(rendered.title, rendered.details);
      }
    },
  };
}
