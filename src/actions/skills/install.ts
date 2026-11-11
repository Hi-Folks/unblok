import { lstat, mkdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { CliError } from "../../errors.ts";

export type SkillAgent = "codex" | "claude";

const files = [
  "SKILL.md",
  "references/operations.md",
  "references/blueprints.md",
  "references/recipes.md",
] as const;

/** Download the version-matched skill into a project without overwriting files. */
export async function installSkill(input: {
  agent: SkillAgent;
  version: string;
  directory: string;
  fetch?: (url: string) => Promise<Response>;
}): Promise<{
  status: "installed";
  agent: SkillAgent;
  version: string;
  path: string;
}> {
  if (input.agent !== "codex" && input.agent !== "claude")
    throw new CliError(
      "Choose '--agent codex' or '--agent claude'.",
      2,
      "INVALID_INPUT",
    );
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(input.version))
    throw new CliError(
      "Cannot install a skill for an invalid release version.",
      1,
      "INVALID_INPUT",
    );
  const relativePath = join(
    input.agent === "codex" ? ".agents" : ".claude",
    "skills",
    "unblok",
  );
  const destination = resolve(input.directory, relativePath);
  try {
    await lstat(destination);
    throw new CliError(
      `Skill already exists at '${relativePath}'. Review it and remove or move it before installing again.`,
      1,
      "CONFLICT",
    );
  } catch (error) {
    if (
      !(error instanceof Error) ||
      (error as NodeJS.ErrnoException).code !== "ENOENT"
    )
      throw error;
  }

  const base = `https://raw.githubusercontent.com/Hi-Folks/unblok/v${input.version}/skills/unblok/`;
  const contents = await Promise.all(
    files.map(async (file) => {
      let response: Response;
      try {
        response = await (input.fetch ?? fetch)(`${base}${file}`);
      } catch {
        throw new CliError(
          `Could not download the skill for Unblok ${input.version}. Check your network connection and retry.`,
        );
      }
      if (response.status === 404)
        throw new CliError(
          `Skill file '${file}' was not found in GitHub tag v${input.version}. Check that this release includes the skill, or install it manually from the repository.`,
          1,
          "NOT_FOUND",
        );
      if (!response.ok)
        throw new CliError(
          `GitHub returned HTTP ${response.status} while downloading '${file}'. Retry when the service is available.`,
        );
      const content = await response.text();
      if (
        !content.trim() ||
        new TextEncoder().encode(content).length > 1_000_000
      )
        throw new CliError(
          `Downloaded skill file '${file}' is empty or too large.`,
        );
      return content;
    }),
  );

  await mkdir(
    resolve(
      input.directory,
      input.agent === "codex" ? ".agents/skills" : ".claude/skills",
    ),
    { recursive: true },
  );
  try {
    await mkdir(destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST")
      throw new CliError(
        `Skill already exists at '${relativePath}'. Review it and remove or move it before installing again.`,
        1,
        "CONFLICT",
      );
    throw error;
  }
  try {
    await mkdir(join(destination, "references"));
    for (const [index, file] of files.entries())
      await writeFile(join(destination, file), contents[index]!, {
        flag: "wx",
      });
  } catch (error) {
    await rm(destination, { recursive: true, force: true });
    throw error;
  }
  return {
    status: "installed",
    agent: input.agent,
    version: input.version,
    path: relativePath,
  };
}
