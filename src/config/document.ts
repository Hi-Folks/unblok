import { resolve } from "node:path";
import { CliError } from "../errors.ts";

export async function loadDocument(
  path: string,
  label: string,
): Promise<unknown> {
  const file = Bun.file(resolve(path));
  if (!(await file.exists())) {
    throw new CliError(`${label} file not found: ${path}`, 2);
  }

  try {
    return Bun.YAML.parse(await file.text());
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "unknown YAML error";
    throw new CliError(
      `Could not parse ${label.toLowerCase()} file '${path}': ${detail}`,
      2,
    );
  }
}
