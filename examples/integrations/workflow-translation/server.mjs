import { createServer } from "node:http";
import { handleWebhook, readConfig } from "./handler.mjs";

const config = readConfig(process.env);
if (!process.env.STORYBLOK_TOKEN?.trim())
  throw new Error("STORYBLOK_TOKEN is required in the process environment.");
const limit = 64 * 1024;
const server = createServer(async (request, response) => {
  const send = (status, body) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  };
  try {
    let size = 0;
    const chunks = [];
    for await (const chunk of request) {
      size += chunk.length;
      if (size > limit) {
        send(413, { status: "body_too_large" });
        return;
      }
      chunks.push(chunk);
    }
    const result = await handleWebhook(
      {
        method: request.method,
        path: request.url,
        body: Buffer.concat(chunks),
        signature: request.headers["webhook-signature"],
      },
      config,
    );
    if (result.body.status === "submitted")
      console.log(
        `Translation request submitted for story ${result.body.storyId} (${result.body.language}).`,
      );
    if (result.body.status === "setup_failed")
      console.error(
        `Unblok failed for story ${result.body.storyId}; inspect the story before retrying.`,
      );
    send(result.status, result.body);
  } catch {
    if (!response.headersSent) send(500, { status: "internal_error" });
  }
});
server.listen(Number(config.port), "127.0.0.1", () =>
  console.log(
    `Webhook demo listening on http://127.0.0.1:${config.port}/webhooks/storyblok`,
  ),
);
