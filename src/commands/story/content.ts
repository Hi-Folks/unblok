import type { Command } from "../../cli/command.ts";
import { loadDocument } from "../../config/document.ts";
import { object } from "../../actions/experiments/experiments.ts";
import { getStory, updateStoryBlock } from "../../actions/stories/content.ts";
import {
  id,
  parseOptions,
  required,
  setup,
  show,
} from "../experiment/index.ts";

export const storyGetCommand: Command = {
  name: "get",
  description: "Get a story by ID or exact full slug",
  async run(args, ctx) {
    if (args.includes("--help") || args.includes("-h")) {
      ctx.output.text(
        "Usage: unblok story get --ref <id-or-full-slug> [--space-id <id>] [--json]",
      );
      return;
    }
    const o = parseOptions(args, ["--ref", "--space-id"]);
    const reference = required(o, "--ref");
    const { gateway, spaceId } = setup(ctx, o);
    show(ctx, "Story", await getStory(gateway, spaceId, reference));
  },
};
export const storyBlockUpdateCommand: Command = {
  name: "block-update",
  description: "Update existing fields on one block in a story draft",
  async run(args, ctx) {
    if (args.includes("--help") || args.includes("-h")) {
      ctx.output.text(
        "Usage: unblok story block-update --id <story-id> --uid <block-uid> --file <fields.yaml> --yes [--space-id <id>] [--json]\n\nReplaces supplied field values and saves without publishing.",
      );
      return;
    }
    const o = parseOptions(
      args,
      ["--id", "--uid", "--file", "--space-id", "--yes"],
      true,
    );
    const storyId = id(o, "--id"),
      uid = required(o, "--uid");
    const fields = object(
      await loadDocument(required(o, "--file"), "Block fields"),
      "Block fields",
    );
    const { gateway, spaceId } = setup(ctx, o);
    show(
      ctx,
      "Story updated",
      await updateStoryBlock(gateway, spaceId, storyId, uid, fields),
    );
  },
};
