# Prepare a campaign launch with Unblok

A campaign launch often brings several content changes together: a new landing page, an updated home page and a shared image. With Unblok, a team can prepare those pieces through one reusable YAML recipe and then review the campaign in Storyblok.

Imagine a marketing team preparing a **Spring Campaign**. The recipe creates a Storyblok release, adds a landing page with the campaign image, and updates the home page hero for that release. It also assigns the existing home story to a review stage and adds a campaign tag, giving editors a familiar way to find and organize the work.

## The handoff

1. Choose a campaign name, landing-page slug and image URL.
2. Run the Unblok recipe against the target space.
3. Unblok creates or reuses a release scheduled seven days from creation, uploads the image and creates a campaign landing page in the release.
4. Unblok assigns the existing home story to review, adds the campaign tag and updates the home hero in that release.
5. The team opens the release in Storyblok to review the campaign content together.

The workflow stage and tag are applied to the existing story; the page creation and home hero content update target the release. [Storyblok Releases](https://www.storyblok.com/docs/apps/releases) brings the release content together for the editorial team.

## Prepare your space

This example uses the demo content model: an existing `home` story with a `hero-section` block, and a `default-page` content type that accepts that block. It also expects a `Default` workflow with a `Reviewing` stage. Adapt the [recipe](../../examples/recipes/campaign-launch.yaml) to match your own story components, fields and workflow.

You’ll need a Storyblok Management API token with access to the space, and a publicly reachable HTTPS image URL that the machine running Unblok can download. Unblok installs the Releases app if needed. The [getting started guide](../getting-started.md) covers token setup.

## Plan and apply the campaign

The example uses the installed `unblok` command. From a source checkout, replace `unblok` with `bun run start`.

First, review the recipe with your image URL:

```bash
unblok space setup plan \
  --config examples/recipes/campaign-launch.yaml \
  --input 'asset_url=https://example.com/campaign.jpg'
```

The plan validates the configuration locally and displays its operations. To prepare the campaign in an existing space:

```bash
unblok space setup apply \
  --config examples/recipes/campaign-launch.yaml \
  --space-id YOUR_SPACE_ID \
  --input 'asset_url=https://example.com/campaign.jpg' \
  --yes
```

Replace the example URL with a real image URL. The defaults are `Spring Campaign`, `spring-campaign` and `Reviewing`. Supply different values for another campaign:

```bash
unblok space setup apply \
  --config examples/recipes/campaign-launch.yaml \
  --space-id YOUR_SPACE_ID \
  --input 'campaign_name=Summer Launch' \
  --input 'campaign_slug=summer-launch' \
  --input 'asset_url=https://example.com/summer.jpg' \
  --input 'review_stage=Reviewing' \
  --yes
```

The release schedule is declared in the YAML as `release_in_days: 7`; change the number or use a fixed `release_at` when adapting the recipe. The campaign name is also used as the home story’s tag.

## What happens behind the scenes

The recipe refers to the release by name, so it can use the ID that Storyblok returns in the target space. It also gives the uploaded image a symbolic name and uses that reference in the new landing page. Editors can open the **Spring Campaign** release and review the page and home hero together.

The same building blocks are available across Unblok’s CLI, YAML runner and JavaScript library. The [release story example](../../examples/features/setup-release-stories.yaml), [library guide](../library.md) and [command reference](../commands.md) provide the individual operations.

When a release with the same name already exists, Unblok preserves its existing schedule. Repeat runs reuse matching assets and stories where their state can be verified; inspect the report if an operation cannot confirm the existing state. The release-scoped story flow in this recipe is covered by mocked tests and still needs live end-to-end verification. Check the scheduled release time in Storyblok before relying on it.
