import { publishRelease } from "../../actions/releases/releases.ts";
import type { Command } from "../../cli/command.ts";
import { getStoryblokToken } from "../../config/environment.ts";
import { resolveSpaceId } from "../../config/space-id.ts";
import { CliError } from "../../errors.ts";

export const publishReleaseCommand: Command = {
  name: "publish",
  description: "Publish a Storyblok content release",
  usage: "unblok release publish --ref <id-or-name> [--space-id <id>] --yes",
  async run(args, context) {
    if (args.includes("--help") || args.includes("-h")) {
      context.output.text(
        `Usage: ${this.usage}\n\nPublish a release immediately by ID or unique exact name. Already published releases are unchanged. The Releases app must be installed and enabled.\n\n  --ref <id-or-name>  Release ID or unique exact name\n  --space-id <id>     Target space; defaults to STORYBLOK_SPACE_ID\n  --yes               Confirm immediate publication\n  --json              Emit a machine-readable result\n  -h, --help          Show command help\n\nExample:\n  unblok release publish --ref 'Campaign' --space-id YOUR_SPACE_ID --yes --json`,
      );
      return;
    }
    let reference: string | undefined;
    let spaceIdOption: string | undefined;
    let yes = false;
    for (let index = 0; index < args.length; index++) {
      const arg = args[index]!;
      if (arg === "--yes") {
        yes = true;
        continue;
      }
      const equal = arg.indexOf("=");
      const key = equal < 0 ? arg : arg.slice(0, equal);
      if (key !== "--ref" && key !== "--space-id")
        throw new CliError(`Unknown argument '${arg}'.`, 2);
      const value = equal < 0 ? args[++index] : arg.slice(equal + 1);
      if (!value?.trim() || value.startsWith("--"))
        throw new CliError(`Option '${key}' requires a value.`, 2);
      if (key === "--ref") {
        if (reference !== undefined)
          throw new CliError("Provide one release reference.", 2);
        reference = value;
      } else {
        if (spaceIdOption !== undefined)
          throw new CliError("Provide one space ID.", 2);
        spaceIdOption = value;
      }
    }
    if (!reference || !yes)
      throw new CliError("Provide --ref and --yes to publish a release.", 2);
    const spaceId = resolveSpaceId({
      environment: context.environment,
      option: spaceIdOption,
    });
    const gateway = context.createGateway(
      getStoryblokToken(context.environment),
    );
    const result = await context.output.activity(
      "Publishing release",
      "Release checked",
      () => publishRelease(gateway, { spaceId, reference: reference! }),
    );
    if (context.output.mode === "json") context.output.data(result);
    else
      context.output.info(
        result.status === "published"
          ? `Published release ${result.releaseId}.`
          : `Release ${result.releaseId} is already published.`,
      );
  },
};
