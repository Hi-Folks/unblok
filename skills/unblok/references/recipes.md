# Recipes

Read the recipe that matches the user's goal and verify its prerequisites against the target space and installed version:

- [AI translation and review](https://github.com/Hi-Folks/unblok/blob/main/docs/recipes/ai-translation-review.md): request translations and assign accepted language versions to a review stage. Find the story ID and configured languages before choosing flags. `--review-stage` uses an existing stage and enables language-based stages on the selected workflow if needed; assignment happens as soon as the request is accepted. Background tasks may still be running, so report task and review outcomes separately. Retrying submits new translation requests. A webhook receiver is a separate integration.
- [Prepare a campaign launch](https://github.com/Hi-Folks/unblok/blob/main/docs/recipes/campaign-launch.md): combine a release, story, asset, workflow, and tags in a blueprint. Adapt the sample's component fields to the actual space and do not publish unless requested.

If repository files are available locally, use the corresponding `docs/recipes/` guides and examples for that checkout. The online guides track the main branch and can describe a newer version than the installed package.
