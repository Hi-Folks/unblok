import { describe, expect, test } from "bun:test";
import { PassThrough } from "node:stream";
import { stripVTControlCharacters, styleText } from "node:util";
import { createOutput } from "./output.ts";

function capture(stream: PassThrough): () => string {
  let value = "";
  stream.on("data", (chunk) => {
    value += chunk.toString();
  });
  return () => value;
}

describe("createOutput", () => {
  test("rejects confirmation and input outside an interactive terminal", async () => {
    const output = createOutput({ interactive: false });
    await expect(output.confirm("Delete?")).rejects.toThrow(
      "interactive terminal",
    );
    await expect(output.input("Space ID?", () => undefined)).rejects.toThrow(
      "interactive terminal",
    );
  });
  test("keeps JSON output clean and sends errors to stderr", () => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const stdoutValue = capture(stdout);
    const stderrValue = capture(stderr);
    const output = createOutput({ json: true, stdout, stderr });

    output.data({ id: 42 });
    output.error("Not found");

    expect(stdoutValue()).toBe('{\n  "id": 42\n}\n');
    expect(JSON.parse(stderrValue())).toEqual({
      error: { code: "UNKNOWN", message: "Not found", exitCode: 1 },
    });
  });

  test("uses Clack semantics for human messages", () => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const stdoutValue = capture(stdout);
    const stderrValue = capture(stderr);
    const output = createOutput({ interactive: false, stdout, stderr });

    output.info("Nothing to update");
    output.error("Request failed");

    expect(stdoutValue()).toContain("Nothing to update");
    expect(stderrValue()).toContain("Request failed");
  });

  test("does not render a spinner in non-interactive output", async () => {
    const stdout = new PassThrough();
    const output = createOutput({ interactive: false, stdout });

    expect(await output.activity("Loading", "Loaded", async () => 42)).toBe(42);
  });

  test("keeps task progress out of JSON output", () => {
    const stdout = new PassThrough();
    const stdoutValue = capture(stdout);
    const output = createOutput({ json: true, stdout });
    const task = output.task("Checking spaces");

    task.message("1/2");
    task.success("Done");

    expect(stdoutValue()).toBe("");
  });

  test("keeps task progress out of non-interactive output", () => {
    const stdout = new PassThrough();
    const stdoutValue = capture(stdout);
    const output = createOutput({ interactive: false, stdout });
    const task = output.task("Checking spaces");

    task.message("1/2");
    task.success("Done");

    expect(stdoutValue()).toBe("");
  });

  test("wraps a summary within a narrow redirected stream without ANSI", () => {
    const stdout = new PassThrough();
    Object.assign(stdout, { columns: 28 });
    const captured = capture(stdout);
    const output = createOutput({ interactive: false, stdout });
    output.summary(
      "Workflow assignment",
      "Space 123456\nA long operation failed because permission was denied.",
    );
    const value = captured();
    expect(value).toContain("Space 123456");
    expect(value).toContain("permission was");
    expect(value).toContain("denied.");
    expect(value).not.toContain("\u001b[");
    for (const line of value.trimEnd().split("\n"))
      expect(Bun.stringWidth(line)).toBeLessThanOrEqual(28);
  });

  test("never writes presentation summaries or styling into JSON output", () => {
    const stdout = new PassThrough();
    const captured = capture(stdout);
    const output = createOutput({ json: true, stdout });
    output.summary("Summary", "Presentation only");
    expect(output.style?.("red", "Failed")).toBe("Failed");
    output.data({ status: "failed" });
    expect(JSON.parse(captured())).toEqual({ status: "failed" });
    expect(captured()).not.toContain("\u001b[");
  });

  test("wraps ANSI-styled content without exceeding the terminal width", () => {
    const stdout = new PassThrough();
    Object.assign(stdout, { columns: 28 });
    const captured = capture(stdout);
    const message = styleText(
      "red",
      "A long failed operation with a useful explanation",
      { validateStream: false },
    );
    createOutput({ interactive: false, stdout }).summary("Failure", message);
    const value = captured();
    expect(stripVTControlCharacters(value)).toContain("useful");
    for (const line of value.trimEnd().split("\n"))
      expect(
        Bun.stringWidth(stripVTControlCharacters(line)),
      ).toBeLessThanOrEqual(28);
  });

  test("respects NO_COLOR even when the output is a TTY", () => {
    const previous = process.env.NO_COLOR;
    const stdout = new PassThrough();
    Object.assign(stdout, { isTTY: true });
    try {
      process.env.NO_COLOR = "1";
      expect(createOutput({ stdout }).style?.("red", "Failed")).toBe("Failed");
    } finally {
      if (previous === undefined) delete process.env.NO_COLOR;
      else process.env.NO_COLOR = previous;
    }
  });
});
