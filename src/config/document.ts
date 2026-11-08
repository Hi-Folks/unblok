import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { parse } from "yaml";
import { CliError } from "../errors.ts";

export async function loadDocument(
  path: string,
  label: string,
): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(resolve(path), "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      throw new CliError(`${label} file not found: ${path}`, 2);
    throw error;
  }

  try {
    return parse(text);
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "unknown YAML error";
    throw new CliError(
      `Could not parse ${label.toLowerCase()} file '${path}': ${detail}`,
      2,
    );
  }
}
