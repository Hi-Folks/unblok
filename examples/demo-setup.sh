#!/usr/bin/env bash
set -uo pipefail

if [[ $# -ne 1 || -z "${1//[[:space:]]/}" ]]; then
  printf 'Usage: bash examples/demo-setup.sh <new-space-name>\n' >&2
  exit 2
fi
if [[ ! -t 0 || ! -t 1 ]]; then
  printf 'This guided script requires an interactive terminal.\n' >&2
  exit 2
fi

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
PROJECT_DIR=$(cd -- "$SCRIPT_DIR/.." && pwd)
cd -- "$PROJECT_DIR" || exit 1
SOURCE_SPACE_ID=286863409930127
SPACE_NAME=$1
WORKFLOW_STAGE=${WORKFLOW_STAGE:-Reviewing}
SPACE_ID=""
PREVIEW_TOKEN=""
SEO_APP_READY=false
FAILURES=0

confirm_continue() {
  local answer
  while true; do
    printf '\nContinue with the remaining setup? [y/N]: '
    if ! IFS= read -r answer; then printf '\nInput closed; stopping.\n' >&2; exit 1; fi
    case "$answer" in
      y|Y|yes|YES) return 0 ;;
      ''|n|N|no|NO|q|Q) return 1 ;;
      *) printf 'Please enter y or n.\n' ;;
    esac
  done
}

run_step() {
  local label=$1
  shift
  printf '\nRunning: %s\n' "$label"
  if "$@"; then
    printf 'Completed: %s\n' "$label"
    return 0
  else
    local status=$?
    FAILURES=$((FAILURES + 1))
    printf 'Failed (exit %s): %s\n' "$status" "$label" >&2
    return "$status"
  fi
}

cli() {
  bun run index.ts "$@"
}

check_workflow_stage() {
  local stages status
  printf 'Checking for workflow stage "%s"...\n' "$WORKFLOW_STAGE"
    if ! stages=$(cli workflow stage list --space-id "$SPACE_ID" --json); then
      printf 'Could not retrieve workflow stages; stopping the workflow step.\n' >&2
      return 2
    fi
    if printf '%s' "$stages" | bun -e '
      const stages = await Bun.stdin.json();
      if (!Array.isArray(stages)) process.exit(2);
      const target = process.argv[1];
      const found = stages.some((stage) => /^\d+$/.test(target)
        ? String(stage.id) === target
        : stage.name === target);
      process.exit(found ? 0 : 1);
    ' "$WORKFLOW_STAGE"; then
      printf 'Workflow stage "%s" is available.\n' "$WORKFLOW_STAGE"
      return 0
    else
      status=$?
      if (( status != 1 )); then
        printf 'Could not interpret workflow stage data; stopping the workflow step.\n' >&2
        return 2
      fi
    fi
    printf 'Workflow stage "%s" was not found.\n' "$WORKFLOW_STAGE" >&2
    return 1
}

printf 'Storyblok demo setup\n'
printf 'Source space ID: %s\nNew space name: %s\nWorkflow stage: %s\n' "$SOURCE_SPACE_ID" "$SPACE_NAME" "$WORKFLOW_STAGE"
printf 'The space will be duplicated first; you can review it before continuing the setup.\n'
printf 'Preview URLs contain a preview token. The script does not print it, but the URL is passed as a process argument.\n'

printf '\n=== 1. Duplicate the source space ===\n'
printf 'Create a new space in the current organization. This can have plan or billing implications.\n'
printf 'Storyblok duplicates content and components; assets remain references to the source space.\n'
if SPACE_ID=$(cli space duplicate "$SOURCE_SPACE_ID" "$SPACE_NAME" --in-org --only-id); then
  if [[ ! "$SPACE_ID" =~ ^[0-9]+$ || "$SPACE_ID" == 0 || "$SPACE_ID" == "$SOURCE_SPACE_ID" ]]; then
    printf 'Duplication returned an invalid target ID. Stop and inspect the organization before retrying.\n' >&2
    exit 1
  fi
  printf 'New space created: %s (ID: %s).\n' "$SPACE_NAME" "$SPACE_ID"
else
  printf 'Duplication failed. No further steps will run; inspect the organization before retrying.\n' >&2
  exit 1
fi

printf '\n=== 2. Inspect the new space ===\n'
if ! cli space get --space-id "$SPACE_ID"; then
  printf 'Could not load the new space. Setup stopped; inspect space ID %s before retrying.\n' "$SPACE_ID" >&2
  exit 1
fi
printf '\nDuplication may continue asynchronously. Check the Storyblok UI and wait until it finishes successfully before continuing.\n'
if ! confirm_continue; then
  printf 'Setup stopped. The duplicated space remains available with ID %s.\n' "$SPACE_ID"
  exit 0
fi

printf '\n=== 3. Retrieve the preview token ===\n'
printf 'Read the first preview token into memory for the preview URL step. It will not be printed.\n'
if PREVIEW_TOKEN=$(cli space token --space-id "$SPACE_ID" --only-token) && [[ -n "$PREVIEW_TOKEN" ]]; then
  printf 'Preview token retrieved; its value is hidden.\n'
else
  PREVIEW_TOKEN=""
  FAILURES=$((FAILURES + 1))
  printf 'Could not retrieve a preview token; the preview URL step will be unavailable.\n' >&2
fi

printf '\n=== 4. Configure preview URLs ===\n'
printf 'Set the default demo URL and replace all additional frontend environments with Local Development.\n'
printf 'Check Settings > Visual Editor before and after; existing additional environments will be replaced.\n'
if [[ -n "$PREVIEW_TOKEN" ]]; then
  run_step 'Replace preview URLs and additional environments' cli space preview-set \
    "https://storyblok-demo-default-se.netlify.app/?token=${PREVIEW_TOKEN}&path=" \
    --environment "Local Development=https://localhost:3000/?token=${PREVIEW_TOKEN}&path=" \
    --space-id "$SPACE_ID"
else
  printf 'Skipped: a preview token was not retrieved.\n'
fi
PREVIEW_TOKEN=""

printf '\n=== 5. Disable demo mode ===\n'
printf 'Disable the demo flag so the configured preview URLs can be used.\n'
run_step 'Remove demo mode' cli space demo-remove --space-id "$SPACE_ID"

printf '\n=== 6. Assign an initial workflow stage ===\n'
printf 'Inspect available stages, then preview and assign the chosen stage to unstaged stories.\n'
run_step 'List workflow stages' cli workflow stage list --space-id "$SPACE_ID"
WORKFLOW_PLAN_OK=false
WORKFLOW_STAGE_READY=false
if check_workflow_stage; then
  WORKFLOW_STAGE_READY=true
else
  wait_status=$?
  if (( wait_status == 1 )) && [[ "$WORKFLOW_STAGE" == Drafting || "$WORKFLOW_STAGE" == Reviewing || "$WORKFLOW_STAGE" == 'Ready to Publish' ]]; then
    printf 'The standard stage is missing; checking the default workflow and creating missing standard stages.\n'
    if run_step 'Ensure default workflow stages' cli workflow ensure-default --space-id "$SPACE_ID" --yes; then
      if check_workflow_stage; then
        WORKFLOW_STAGE_READY=true
      else
        FAILURES=$((FAILURES + 1))
      fi
    fi
  else
    FAILURES=$((FAILURES + 1))
  fi
fi
if [[ "$WORKFLOW_STAGE_READY" == true ]]; then
  if run_step 'Preview workflow assignments for unstaged stories' cli story workflow plan --stage "$WORKFLOW_STAGE" --without-stage --space-id "$SPACE_ID"; then
    WORKFLOW_PLAN_OK=true
  else
    printf 'Workflow preview failed; assignment will be skipped.\n' >&2
  fi
else
  printf 'Workflow stage unavailable; assignment will be skipped.\n' >&2
fi
if [[ "$WORKFLOW_PLAN_OK" == true ]]; then
  printf 'Assignment re-reads the selection; stories may change between preview and execution.\n'
  run_step 'Assign the workflow stage to currently unstaged stories' cli story workflow assign \
    --stage "$WORKFLOW_STAGE" --without-stage --space-id "$SPACE_ID" --yes
fi

printf '\n=== 7. Install apps ===\n'
printf 'Existing installations are skipped by the CLI.\n'
run_step 'List currently installed apps' cli app list --space-id "$SPACE_ID"
for slug in releases_only storyblok-gmbh@ai-seo replace_asset export import backups; do
  if run_step "Install or check app: $slug" cli app install --slug "$slug" --space-id "$SPACE_ID"; then
    if [[ "$slug" == storyblok-gmbh@ai-seo ]]; then SEO_APP_READY=true; fi
  fi
done

printf '\n=== 8. Add the SEO field ===\n'
printf 'Add the sb-ai-seo custom field to article-page in the SEO tab. Existing fields are preserved.\n'
if [[ "$SEO_APP_READY" == true ]]; then
  run_step 'Add or check the SEO component field' cli component field-add \
    --component article-page --field SEO --type custom --field-type sb-ai-seo \
    --tab SEO --space-id "$SPACE_ID"
else
  printf 'Skipped: the AI SEO app was not confirmed installed during this run.\n'
fi

printf '\n=== 9. Add story tags ===\n'
printf 'Tags are added without removing existing tags. Preview and apply each group separately.\n'
for group in configuration landing; do
  if [[ "$group" == configuration ]]; then
    TAG_ARGS=(--slug error-404 --slug site-config --tag Configuration)
    LABEL='Configuration tags for error-404 and site-config'
  else
    TAG_ARGS=(--slug home --slug contact --tag Landing --tag Marketing)
    LABEL='Landing and Marketing tags for home and contact'
  fi
  TAG_PLAN_OK=false
  if run_step "Preview $LABEL" cli story tags plan "${TAG_ARGS[@]}" --space-id "$SPACE_ID"; then
    TAG_PLAN_OK=true
  else
    printf 'Tag preview failed; this group will not be updated.\n' >&2
  fi
  if [[ "$TAG_PLAN_OK" == true ]]; then
    run_step "Apply $LABEL" cli story tags assign "${TAG_ARGS[@]}" --space-id "$SPACE_ID" --yes
  fi
done

printf '\nSetup finished for space %s (ID: %s), with %s failed command(s).\n' "$SPACE_NAME" "$SPACE_ID" "$FAILURES"
printf 'Storyblok dashboard: https://app.storyblok.com/#/me/spaces/%s/dashboard\n' "$SPACE_ID"
if (( FAILURES > 0 )); then exit 1; fi
