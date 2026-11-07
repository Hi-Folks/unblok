import { installAppBySlug } from "../../actions/apps/apps.ts";
import type { Command } from "../../cli/command.ts";
import { dispatch } from "../../cli/dispatch.ts";
import { getStoryblokToken } from "../../config/environment.ts";
import { resolveSpaceId } from "../../config/space-id.ts";
import { CliError } from "../../errors.ts";
import { aiTranslationCommand } from "./ai-translation.ts";

function parse(args: string[]) {
  let spaceId: string | undefined;
  let slug: string | undefined;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const option = arg?.split("=", 1)[0];
    if (
      option !== "--space-id" &&
      option !== "--slug" &&
      option !== "--by-slug"
    )
      throw new CliError(`Unknown argument '${arg}'.`, 2);
    const inline = arg?.includes("=")
      ? arg.slice(arg.indexOf("=") + 1)
      : undefined;
    const value = inline ?? args[++i];
    if (!value || value.startsWith("--"))
      throw new CliError(`Option '${option}' requires a value.`, 2);
    if (option === "--space-id") spaceId = value;
    else if (slug) throw new CliError("Provide one app slug.", 2);
    else slug = value;
  }
  return { spaceId, slug };
}

const list: Command = {
  name: "list",
  description: "List installed apps",
  usage: "unblok app list [--space-id <id>]",
  async run(args, context) {
    if (args.includes("--help") || args.includes("-h")) {
      context.output.text(
        `Usage: ${this.usage}\n\nList installed apps. Use --json for structured output.`,
      );
      return;
    }
    const options = parse(args);
    if (options.slug)
      throw new CliError("The app list command does not accept a slug.", 2);
    const spaceId = resolveSpaceId({
      environment: context.environment,
      option: options.spaceId,
    });
    const apps = await context
      .createGateway(getStoryblokToken(context.environment))
      .listInstalledApps(spaceId);
    if (context.output.mode === "json")
      context.output.data(
        apps.map(({ app_id, name, slug }) => ({ appId: app_id, name, slug })),
      );
    else if (!apps.length) context.output.info("No installed apps found.");
    else
      context.output.text(
        apps
          .map((app) => `${app.slug}  ${app.name}  (${app.app_id})`)
          .join("\n"),
      );
  },
};
const install: Command = {
  name: "install",
  description: "Install an app by slug",
  usage: "unblok app install --slug <slug> [--space-id <id>]",
  async run(args, context) {
    if (args.includes("--help") || args.includes("-h")) {
      context.output.text(
        `Usage: ${this.usage}\n\nInstall an available app. Existing installations are left unchanged. --by-slug is an alias for --slug.`,
      );
      return;
    }
    const options = parse(args);
    if (!options.slug?.trim())
      throw new CliError("Option '--slug <slug>' is required.", 2);
    const spaceId = resolveSpaceId({
      environment: context.environment,
      option: options.spaceId,
    });
    const result = await context.output.activity(
      "Checking app installation",
      "App checked",
      () =>
        installAppBySlug(
          context.createGateway(getStoryblokToken(context.environment)),
          spaceId,
          options.slug as string,
        ),
    );
    const data = {
      status: result.status,
      app: {
        appId: result.app.app_id,
        name: result.app.name,
        slug: result.app.slug,
      },
    };
    if (context.output.mode === "json") context.output.data(data);
    else
      context.output.info(
        result.status === "installed"
          ? `Installed ${data.app.name} (${data.app.slug}).`
          : `${data.app.name} (${data.app.slug}) is already installed.`,
      );
  },
};
export const appCommand: Command = {
  name: "app",
  description: "Manage installed space apps",
  usage: "unblok app <command>",
  async run(args, context) {
    await dispatch("unblok app", [list, install, aiTranslationCommand], args, context);
  },
};
