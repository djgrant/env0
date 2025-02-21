#!/usr/bin/env node

import { Command } from "commander";
import { spawn } from "child_process";
import { EnvLoader } from "./load-envs";
import packageJson from "../package.json";

const program = new Command();

function collect(value: string, previous: string[]) {
  return previous.concat([value]);
}

program
  .name("env0")
  .description("Load environment variables from 1Password")
  .option("-V, --vault <name>", "1Password vault name")
  .option("-F, --file <path>", "Path to keys file", ".env0")
  .option("-K, --key [key]", "Specify a key", collect, [])
  .option("-P, --print", "Print environment variables for shell export")
  .version(packageJson.version)
  .allowExcessArguments(true)
  .action(async (options, command) => {
    const args = command.args;
    const { print, vault, file, key: keys } = options;

    if (!print && (!command || args.length === 0)) {
      console.error("[env0] Error: Command is required unless using --print");
      process.exit(1);
    }

    let shouldLoadFile = true;
    if (keys.length > 0) {
      shouldLoadFile = process.argv.some(
        (arg) => arg === "-F" || arg === "--file"
      );
    }

    let envs: Record<string, string> = {};

    try {
      const loader = new EnvLoader(vault, file);
      envs = await loader.loadEnvs(keys, shouldLoadFile);

      if (print) {
        Object.entries(envs).forEach(([key, value]) => {
          console.log(`export ${key}="${value}"`);
        });
        process.exit(0);
      }

      console.log("[env0] Envs loaded from 1Password");
    } catch (error: any) {
      console.error("[env0] Failed to load envs");
      process.exit(1);
    }

    const childProcess = spawn(args[0], args.slice(1), {
      stdio: "inherit",
      shell: true,
      env: { ...process.env, ...envs },
    });

    childProcess.on("exit", (code) => {
      process.exit(code || 0);
    });
  });

program.parse();
