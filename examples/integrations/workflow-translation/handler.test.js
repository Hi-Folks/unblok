import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import {
  handleWebhook,
  readConfig,
  runRecipe,
  validSignature,
} from "./handler.mjs";

const config = readConfig({
  STORYBLOK_WEBHOOK_SECRET: "test-secret",
  STORYBLOK_SPACE_ID: "42",
  TRANSLATION_LANGUAGE: "de",
});
const event = {
  action: "stage.changed",
  space_id: 42,
  story_id: 77,
  workflow_name: "Default",
  workflow_stage_name: "Translating",
};
function signedRequest(value = event) {
  const body = Buffer.from(JSON.stringify(value));
  return {
    method: "POST",
    path: "/webhooks/storyblok",
    body,
    signature: createHmac("sha1", config.secret).update(body).digest("hex"),
  };
}

describe("workflow translation webhook example", () => {
  test("checks the HMAC against the exact raw bytes", () => {
    const request = signedRequest();
    expect(validSignature(request.body, request.signature, config.secret)).toBe(
      true,
    );
    expect(
      validSignature(
        Buffer.concat([request.body, Buffer.from(" ")]),
        request.signature,
        config.secret,
      ),
    ).toBe(false);
    expect(validSignature(request.body, "bad", config.secret)).toBe(false);
  });

  test("passes the story ID and configured language to the runner", async () => {
    const calls = [];
    const result = await handleWebhook(
      signedRequest(),
      config,
      async (settings, storyId) => {
        calls.push({ storyId, language: settings.language });
      },
    );
    expect(result).toEqual({
      status: 200,
      body: { status: "submitted", storyId: "77", language: "de" },
    });
    expect(calls).toEqual([{ storyId: "77", language: "de" }]);
  });

  test("ignores unrelated workflow events and rejects forged or invalid requests", async () => {
    let calls = 0;
    const runner = async () => {
      calls++;
    };
    for (const patch of [
      { action: "published" },
      { space_id: 99 },
      { workflow_name: "Other" },
      { workflow_stage_name: "Reviewing" },
    ])
      expect(
        (
          await handleWebhook(
            signedRequest({ ...event, ...patch }),
            config,
            runner,
          )
        ).body.status,
      ).toBe("ignored");
    const invalid = signedRequest();
    invalid.signature = "0".repeat(40);
    expect((await handleWebhook(invalid, config, runner)).status).toBe(401);
    expect(
      (
        await handleWebhook(
          signedRequest({ ...event, story_id: "7; touch nope" }),
          config,
          runner,
        )
      ).status,
    ).toBe(400);
    expect(calls).toBe(0);
  });

  test("returns a failure without exposing runner errors", async () => {
    const result = await handleWebhook(signedRequest(), config, async () => {
      throw new Error("secret details");
    });
    expect(result).toEqual({
      status: 500,
      body: { status: "setup_failed", storyId: "77" },
    });
  });

  test("does not report a failed CLI invocation as submitted", async () => {
    await expect(
      runRecipe(config, "77", (_program, _args, _options, callback) =>
        callback(new Error("private output"), "", ""),
      ),
    ).rejects.toThrow("Unblok setup failed");
  });

  test("invokes the built CLI with separate arguments and configured recipe inputs", async () => {
    let invocation;
    await runRecipe(config, "77", (program, args, options, callback) => {
      invocation = { program, args, options };
      callback(null, "", "");
    });
    expect(invocation.program).toBe(process.execPath);
    expect(invocation.args).toContain("story_id=77");
    expect(invocation.args).toContain("language=de");
    expect(invocation.args).toContain("workflow=Default");
    expect(invocation.args).toContain("review_stage=Reviewing");
    expect(invocation.args).toContain("--yes");
    expect(invocation.options.shell).toBeUndefined();
  });

  test("requires a secret, a configured language and distinct trigger and review stages", () => {
    expect(() =>
      readConfig({
        ...config,
        STORYBLOK_SPACE_ID: "42",
        TRANSLATION_LANGUAGE: "de",
      }),
    ).toThrow("STORYBLOK_WEBHOOK_SECRET");
    expect(() =>
      readConfig({
        STORYBLOK_WEBHOOK_SECRET: "s",
        STORYBLOK_SPACE_ID: "42",
        TRANSLATION_LANGUAGE: "de",
        TRANSLATION_REVIEW_STAGE: "Translating",
      }),
    ).toThrow("must differ");
    expect(() =>
      readConfig({
        STORYBLOK_WEBHOOK_SECRET: "s",
        STORYBLOK_SPACE_ID: "42",
        TRANSLATION_LANGUAGE: "fr-be",
      }),
    ).toThrow("TRANSLATION_LANGUAGE");
  });
});
