#!/usr/bin/env bun

import { runCli } from "./src/cli/main.ts";

process.exitCode = await runCli(Bun.argv.slice(2));
