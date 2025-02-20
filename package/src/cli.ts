#!/usr/bin/env node

import { Command } from "commander";
import { spawn } from "child_process";
import { EnvLoader } from "./load-envs";

const program = new Command();

program
  .name("env0")
  .description("Load environment variables from 1Password")
  .option("-V, --vault <name>", "1Password vault name")
  .option("-K, --keys <path>", "Path to keys file", ".env0")
  .option("-P, --print", "Print environment variables for shell export")

  .allowExcessArguments(true)
  .action(async (options, command) => {
    const args = command.args;
    const { print, vault, keys } = program.opts();

    if (!print && (!command || args.length === 0)) {
      console.error("[env0] Error: Command is required unless using --print");
      process.exit(1);
    }

    let envs: Record<string, string> = {};

    try {
      const loader = new EnvLoader(vault, keys);
      envs = await loader.loadEnvs();

      if (print) {
        Object.entries(envs).forEach(([key, value]) => {
          console.log(`export ${key}="${value}"`);
        });
        process.exit(0);
      }

      console.log("[env0] Envs loaded from 1Password");
    } catch (error) {
      console.error("[env0] Failed to load envs");
      console.error(error);
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
