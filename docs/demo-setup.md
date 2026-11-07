# Demo Space Setup

The script duplicates a space, shows its details, and asks once whether to continue. After confirmation it runs the remaining operations automatically, with progress and errors displayed for each step.

```bash
bun install
bash examples/demo-setup.sh "Customer Demo"
```

The first step duplicates the configured source space into your current organization using the supplied name. It displays the new space ID and pauses; wait for duplication to finish in Storyblok before continuing. Content and components are duplicated, while assets continue to reference the source space. Creating a space may affect your plan or billing.

The workflow stage defaults to `Reviewing`. Set the `WORKFLOW_STAGE` environment variable to an exact stage name or ID to use another:

```bash
WORKFLOW_STAGE="Drafting" bash examples/demo-setup.sh "Customer Demo"
```

After confirmation, the script checks once for the requested workflow stage. If a standard stage is missing, it attempts to add missing standard stages to the default workflow, then checks again. Existing stages are left unchanged. If lookup or creation fails, workflow assignment is skipped and the script reports a failure. A custom stage name or ID is never created automatically.

Configure `STORYBLOK_TOKEN` in `.env` as described in [Getting started](getting-started.md). Run the script in an interactive terminal. If duplication fails, no subsequent step runs. If your organization's plan requires a space type, the duplicate command currently needs to be run separately with `--space-type`; this script does not yet accept that option.

After the new space details appear, enter `y` to run the rest of the setup or `n` to stop. Stopping leaves the duplicated space in place. Failed commands are reported and independent steps continue; the script exits non-zero if any command failed. The final summary includes a link to the new space's Storyblok dashboard.

The preview step replaces **all** additional frontend environments with the Local Development URL. The script reads the preview token into memory without printing it; the URLs containing it are passed as process arguments. Workflow and tag steps print a plan and then apply automatically. Assignment re-fetches the selection, so it may differ if the space changes between the plan and apply.

Each app is installed separately. The SEO field step runs only if the AI SEO app check or installation succeeded during that run. Tag steps require the exact full slugs shown in the script; a missing slug causes that group's preview to fail without changes. Edit the script for your space's content before running it.
