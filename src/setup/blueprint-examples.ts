import campaign from "../../examples/recipes/campaign-launch.yaml" with { type: "text" };
import translation from "../../examples/features/setup-translation-from-event.yaml" with { type: "text" };

// Remove the checkout-relative editor schema hint when exporting an example.
function portable(content: string): string {
  return content.replace(/^# yaml-language-server:.*\r?\n/, "").trimEnd();
}

export const blueprintExamples = [
  {
    name: "campaign-launch",
    description:
      "Prepare a campaign release with a story, asset, workflow and tags.",
    content: portable(campaign),
  },
  {
    name: "translation-review",
    description:
      "Request AI translation and assign the language to a review stage.",
    content: portable(translation),
  },
] as const;
