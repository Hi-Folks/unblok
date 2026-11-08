import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { ensureAssetUploaded } from "../../actions/assets/asset-upload.ts";
import type { Command } from "../../cli/command.ts";
import { dispatch } from "../../cli/dispatch.ts";
import { getStoryblokToken } from "../../config/environment.ts";
import { resolveSpaceId } from "../../config/space-id.ts";
import { CliError } from "../../errors.ts";

const upload: Command = {
  name: "upload",
  description: "Upload a local asset",
  usage:
    "unblok asset upload --file <path> [--folder <path>] [--space-id <id>] --yes",
  async run(args, context) {
    if (args.includes("--help") || args.includes("-h")) {
      context.output.text(
        `Usage: ${this.usage}\n\nUpload a file to the asset root or a folder (created if missing). Identical existing assets are unchanged; different content is a conflict. Use --json for structured output.`,
      );
      return;
    }
    const values: Record<string, string> = {};
    let yes = false;
    for (let i = 0; i < args.length; i++) {
      const arg = args[i]!;
      if (arg === "--yes") {
        yes = true;
        continue;
      }
      const [option, ...inline] = arg.split("=");
      if (!option || !["--file", "--folder", "--space-id"].includes(option))
        throw new CliError(`Unknown argument '${arg}'.`, 2);
      const value = inline.length ? inline.join("=") : args[++i];
      if (!value || value.startsWith("--"))
        throw new CliError(`Option '${option}' requires a value.`, 2);
      if (values[option] !== undefined)
        throw new CliError(`Option '${option}' can only be provided once.`, 2);
      values[option] = value;
    }
    const file = values["--file"];
    if (!file) throw new CliError("Option '--file <path>' is required.", 2);
    if (!yes) throw new CliError("Pass --yes to confirm the upload.", 2);
    const spaceId = resolveSpaceId({
      environment: context.environment,
      option: values["--space-id"],
    });
    let data: Uint8Array;
    try {
      data = await readFile(file);
    } catch {
      throw new CliError(`Could not read asset file '${file}'.`, 2);
    }
    const gateway = context.createGateway(
      getStoryblokToken(context.environment),
    );
    const result = await context.output.activity(
      "Checking asset",
      "Asset checked",
      () =>
        ensureAssetUploaded(gateway, {
          spaceId,
          filename: basename(file),
          data,
          folder: values["--folder"],
        }),
    );
    if (context.output.mode === "json") context.output.data(result);
    else
      context.output.info(
        result.status === "created"
          ? `Uploaded ${result.filename}.`
          : `${result.filename} is already present with identical content.`,
      );
  },
};

export const assetCommand: Command = {
  name: "asset",
  description: "Manage assets",
  usage: "unblok asset <command>",
  async run(args, context) {
    await dispatch("unblok asset", [upload], args, context);
  },
};
