import { deleteSpace } from "../../actions/spaces/delete-space.ts";
import { getSpace } from "../../actions/spaces/get-space.ts";
import type { Command } from "../../cli/command.ts";
import { getStoryblokToken } from "../../config/environment.ts";
import { CliError } from "../../errors.ts";
import { formatSpaceDetails } from "./presentation.ts";

export const deleteSpaceCommand: Command = {
  name: "delete",
  description: "Delete a space after interactive confirmation",
  usage: "unblok space delete [space-id]",
  async run(args, context) {
    if (args.includes("--help") || args.includes("-h")) {
      context.output.text(
        `Usage: ${this.usage}\n\nPrompt for the space ID if omitted, show its details, then ask for confirmation.\nRequires an interactive terminal. Cancellation leaves the space unchanged.`,
      );
      return;
    }
    if (context.output.mode === "json") {
      throw new CliError(
        "Space deletion requires an interactive confirmation and cannot use --json.",
        2,
      );
    }
    if (args.length > 1) {
      throw new CliError(
        "Provide at most one space ID: unblok space delete [space-id].",
        2,
      );
    }
    const validate = (value: string): string | undefined => {
      const trimmed = value.trim();
      const id = Number(trimmed);
      return /^\d+$/.test(trimmed) && Number.isSafeInteger(id) && id > 0
        ? undefined
        : "The space ID must be a positive safe integer.";
    };
    const value =
      args[0] ??
      (await context.output.input(
        "Which space ID do you want to delete?",
        validate,
      ));
    if (value === null) {
      context.output.info("Deletion cancelled; no space was deleted.");
      return;
    }
    const validationError = validate(value);
    if (validationError) throw new CliError(validationError, 2);
    const spaceId = Number(value.trim());
    const gateway = context.createGateway(
      getStoryblokToken(context.environment),
    );
    const space = await context.output.activity(
      `Loading Storyblok space ${spaceId}`,
      "Space loaded",
      () => getSpace(gateway, spaceId),
    );
    if (space.id !== spaceId)
      throw new CliError(
        "The returned space ID does not match the requested space; deletion cancelled.",
      );
    context.output.note(
      `Space to delete: ${space.name}`,
      formatSpaceDetails(space),
    );
    if (
      !(await context.output.confirm(
        `Delete '${space.name}' (ID: ${spaceId})? This cannot be undone.`,
      ))
    ) {
      context.output.info("Deletion cancelled; the space was not deleted.");
      return;
    }
    await context.output.activity(
      `Deleting Storyblok space ${spaceId}`,
      "Space deleted",
      () => deleteSpace(gateway, spaceId),
    );
    context.output.info(`Space '${space.name}' (ID: ${spaceId}) deleted.`);
  },
};
