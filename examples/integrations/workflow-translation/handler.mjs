import { createHmac, timingSafeEqual } from "node:crypto";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";

const recipePath = fileURLToPath(
  new URL("../../features/setup-translation-from-event.yaml", import.meta.url),
);
const entryPath = fileURLToPath(
  new URL("../../../dist/package/index.js", import.meta.url),
);

function positiveId(value) {
  return (
    (typeof value === "number" || typeof value === "string") &&
    /^[0-9]+$/.test(String(value)) &&
    Number.isSafeInteger(Number(value)) &&
    Number(value) > 0
  );
}

export function readConfig(env) {
  const config = {
    secret: env.STORYBLOK_WEBHOOK_SECRET,
    spaceId: env.STORYBLOK_SPACE_ID,
    language: env.TRANSLATION_LANGUAGE,
    workflow: env.TRANSLATION_WORKFLOW ?? "Default",
    triggerStage: env.TRANSLATION_TRIGGER_STAGE ?? "Translating",
    reviewStage: env.TRANSLATION_REVIEW_STAGE ?? "Reviewing",
    port: env.PORT ?? "8787",
  };
  if (!config.secret || !config.secret.trim())
    throw new Error("STORYBLOK_WEBHOOK_SECRET is required.");
  if (!positiveId(config.spaceId))
    throw new Error("STORYBLOK_SPACE_ID must be a positive numeric ID.");
  if (!config.language || !/^[a-z]{2,3}$/.test(config.language))
    throw new Error(
      "TRANSLATION_LANGUAGE must be a lowercase AI and space language code such as de or it.",
    );
  if (
    ![config.workflow, config.triggerStage, config.reviewStage].every(
      (value) =>
        typeof value === "string" && value.trim() && value === value.trim(),
    )
  )
    throw new Error(
      "Workflow and stage names must not be empty or padded with spaces.",
    );
  if (config.triggerStage === config.reviewStage)
    throw new Error("The trigger and review stages must differ.");
  if (
    !/^[0-9]+$/.test(config.port) ||
    Number(config.port) < 1 ||
    Number(config.port) > 65535
  )
    throw new Error("PORT must be between 1 and 65535.");
  return config;
}

export function validSignature(rawBody, signature, secret) {
  if (typeof signature !== "string" || !/^[a-f0-9]{40}$/i.test(signature))
    return false;
  const expected = createHmac("sha1", secret).update(rawBody).digest();
  const received = Buffer.from(signature, "hex");
  return (
    received.length === expected.length && timingSafeEqual(received, expected)
  );
}

/** Invokes the built CLI without a shell; output is not returned to the webhook sender. */
export function runRecipe(config, storyId, execute = execFile) {
  const args = [
    entryPath,
    "space",
    "setup",
    "apply",
    "--config",
    recipePath,
    "--space-id",
    String(config.spaceId),
    "--input",
    `story_id=${storyId}`,
    "--input",
    `language=${config.language}`,
    "--input",
    `workflow=${config.workflow}`,
    "--input",
    `review_stage=${config.reviewStage}`,
    "--yes",
    "--json",
  ];
  return new Promise((resolve, reject) => {
    execute(
      process.execPath,
      args,
      { timeout: 90_000, maxBuffer: 1024 * 1024, windowsHide: true },
      (error) => {
        if (error)
          reject(
            new Error(
              "Unblok setup failed; inspect the story and local logs before retrying.",
            ),
          );
        else resolve();
      },
    );
  });
}

/** Accepts raw bytes so signature verification happens before JSON parsing. */
export async function handleWebhook(request, config, run = runRecipe) {
  if (request.method !== "POST" || request.path !== "/webhooks/storyblok")
    return { status: 404, body: { status: "not_found" } };
  if (!validSignature(request.body, request.signature, config.secret))
    return { status: 401, body: { status: "invalid_signature" } };
  let event;
  try {
    event = JSON.parse(request.body.toString("utf8"));
  } catch {
    return { status: 400, body: { status: "invalid_json" } };
  }
  if (!event || typeof event !== "object" || Array.isArray(event))
    return { status: 400, body: { status: "invalid_event" } };
  if (
    event.action !== "stage.changed" ||
    String(event.space_id) !== String(config.spaceId) ||
    event.workflow_name !== config.workflow ||
    event.workflow_stage_name !== config.triggerStage
  )
    return { status: 200, body: { status: "ignored" } };
  if (!positiveId(event.story_id))
    return { status: 400, body: { status: "invalid_story_id" } };
  try {
    await run(config, String(event.story_id));
    return {
      status: 200,
      body: {
        status: "submitted",
        storyId: String(event.story_id),
        language: config.language,
      },
    };
  } catch {
    return {
      status: 500,
      body: { status: "setup_failed", storyId: String(event.story_id) },
    };
  }
}
