import type { Command } from "../../cli/command.ts";
import { dispatch } from "../../cli/dispatch.ts";
import { storyWorkflowCommand } from "./workflow.ts";
import { storyTagsCommand } from "./tags.ts";
import { storyGetCommand, storyBlockUpdateCommand } from "./content.ts";
import { storyPublishCommand } from "./publish.ts";
import { storyCreateCommand } from "./create.ts";
import { storyFolderCommand } from "./folder.ts";
import { storyMoveCommand } from "./move.ts";
import { storyCreateVariantCommand } from "./create-variant.ts";
import { storySyncPathCommand } from "./sync-path.ts";
import { storyMergeCommand } from "./merge.ts";
import { storySyncBlockCommand } from "./sync-block.ts";
import { storyUpdateMatchingCommand } from "./update-matching-blocks.ts";
import { storyAiTranslateCommand } from "./ai-translate.ts";
import { storyListCommand } from "./list.ts";
import { storyCompareLanguagesCommand } from "./compare-languages.ts";
import { storyCompareDimensionsCommand } from "./compare-dimensions.ts";
import {
  storyVersionsCommand,
  storyCompareVersionsCommand,
} from "./versions.ts";

export const storyCommand: Command = {
  name: "story",
  description: "Manage stories",
  usage: "space-man story <command>",
  async run(args, context) {
    await dispatch(
      "unblok story",
      [
        storyListCommand,
        storyCompareLanguagesCommand,
        storyCompareDimensionsCommand,
        storyVersionsCommand,
        storyCompareVersionsCommand,
        storyGetCommand,
        storyCreateCommand,
        storyCreateVariantCommand,
        storyMergeCommand,
        storySyncBlockCommand,
        storySyncPathCommand,
        storyUpdateMatchingCommand,
        storyAiTranslateCommand,
        storyFolderCommand,
        storyMoveCommand,
        storyBlockUpdateCommand,
        storyPublishCommand,
        storyWorkflowCommand,
        storyTagsCommand,
      ],
      args,
      context,
    );
  },
};
