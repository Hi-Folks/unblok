import {
  isTTY,
  confirm as clackConfirm,
  isCancel,
  text as clackText,
  log,
  note as clackNote,
  spinner,
  taskLog,
  box as clackBox,
} from "@clack/prompts";
import type { Writable } from "node:stream";
import { styleText } from "node:util";
import { CliError } from "./errors.ts";

export type OutputMode = "human" | "json";

export interface OutputTask {
  error(message: string): void;
  message(message: string): void;
  success(message: string): void;
}

export interface Output {
  readonly mode: OutputMode;
  readonly canPrompt?: boolean;
  width?(): number | undefined;
  style?(color: "green" | "yellow" | "red" | "gray", text: string): string;
  activity<T>(
    message: string,
    successMessage: string,
    operation: () => Promise<T>,
  ): Promise<T>;
  data(value: unknown): void;
  confirm(message: string): Promise<boolean>;
  input(
    message: string,
    validate: (value: string) => string | undefined,
  ): Promise<string | null>;
  error(message: string): void;
  info(message: string): void;
  note(title: string, message: string): void;
  summary(title: string, message: string): void;
  task(title: string): OutputTask;
  text(message: string): void;
}

export interface OutputOptions {
  interactive?: boolean;
  json?: boolean;
  stderr?: Writable;
  stdout?: Writable;
}

function writeLine(stream: Writable, message: string): void {
  stream.write(`${message}\n`);
}

export function createOutput(options: OutputOptions = {}): Output {
  const stdout = options.stdout ?? process.stdout;
  const stderr = options.stderr ?? process.stderr;
  const mode: OutputMode = options.json ? "json" : "human";
  const interactive =
    mode === "human" && (options.interactive ?? isTTY(stdout));

  return {
    mode,
    canPrompt: interactive && isTTY(process.stdin),
    width() {
      return mode === "human" &&
        isTTY(stdout) &&
        "columns" in stdout &&
        typeof stdout.columns === "number" &&
        stdout.columns > 0
        ? stdout.columns
        : undefined;
    },
    style(color, text) {
      return mode === "json" || process.env.NO_COLOR !== undefined
        ? text
        : styleText(color, text, { stream: stdout });
    },
    async activity(message, successMessage, operation) {
      if (!interactive) {
        return operation();
      }

      const indicator = spinner({ output: stdout, withGuide: false });
      indicator.start(message);

      try {
        const result = await operation();
        indicator.stop(successMessage);
        return result;
      } catch (error) {
        indicator.clear();
        throw error;
      }
    },
    data(value) {
      writeLine(stdout, JSON.stringify(value, null, 2));
    },
    async confirm(message) {
      if (!interactive || !isTTY(process.stdin)) {
        throw new CliError(
          "Confirmation requires an interactive terminal; no changes were made.",
          2,
        );
      }
      const answer = await clackConfirm({
        message,
        initialValue: false,
        output: stdout,
      });
      return !isCancel(answer) && answer === true;
    },
    async input(message, validate) {
      if (!interactive || !isTTY(process.stdin)) {
        throw new CliError(
          "Input requires an interactive terminal; no changes were made.",
          2,
        );
      }
      const answer = await clackText({
        message,
        validate: (value) => validate(value ?? ""),
        output: stdout,
      });
      return isCancel(answer) ? null : answer;
    },
    error(message) {
      if (mode === "json") {
        writeLine(stderr, `Error: ${message}`);
        return;
      }

      log.error(message, { output: stderr, withGuide: false });
    },
    info(message) {
      if (mode === "json") {
        writeLine(stdout, message);
        return;
      }

      log.info(message, { output: stdout, withGuide: false });
    },
    note(title, message) {
      if (mode === "json") {
        writeLine(stdout, message);
        return;
      }

      clackNote(message, title, { output: stdout, withGuide: false });
    },
    summary(title, message) {
      if (mode === "json") return;
      const columns =
        "columns" in stdout && typeof stdout.columns === "number"
          ? stdout.columns
          : 80;
      if (columns < 12) {
        writeLine(stdout, `${title}\n${message}`);
        return;
      }
      clackBox(message, title, {
        output: stdout,
        width: "auto",
        contentAlign: "left",
        titleAlign: "left",
        contentPadding: 1,
        titlePadding: 1,
        rounded: true,
        withGuide: false,
      });
    },
    task(title) {
      if (mode === "json" || !interactive) {
        return {
          error() {},
          message() {},
          success() {},
        };
      }

      const task = taskLog({
        title,
        limit: 6,
        output: stdout,
        retainLog: false,
        withGuide: false,
      });

      return {
        error(message) {
          task.error(message);
        },
        message(message) {
          task.message(message);
        },
        success(message) {
          task.success(message);
        },
      };
    },
    text(message) {
      writeLine(stdout, message);
    },
  };
}
