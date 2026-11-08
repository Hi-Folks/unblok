#!/usr/bin/env node

import { runCli } from "./src/cli/main.ts";

try {
  process.loadEnvFile();
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
process.exitCode = await runCli(process.argv.slice(2));
