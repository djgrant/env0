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
  .option(
    "-s, --source <platform:vault>",
    "Source in format platform:vault (e.g. op:secrets-staging)"
  )
  .option("-f, --file <path>", "Path to keys file", ".env0")
  .option("-e, --entry [entry]", "Specify a env key or assignment", collect, [])
  .option("-p, --print", "Print environment variables for shell export")
  .option("-sh, --shell", "Run the command in a shell")
  .version(packageJson.version)
  .argument(
    "[command...]",
    "Command to execute with loaded environment variables"
  )
  .action(async (command, options) => {
    const { print, source, file, entry: entries, shell } = options;

    if (!print && (!command || command.length === 0)) {
      console.error(
        "[env0] Error: a command, -sh/--shell or -p/--print is required"
      );
      process.exit(1);
    }

    if (!source) {
      console.error("[env0] Error: --source or -s is required");
      process.exit(1);
    }

    let shouldLoadFile = true;

    if (entries.length > 0) {
      shouldLoadFile = process.argv.some(
        (arg) => arg === "-f" || arg === "--file"
      );
    }

    let envs: Record<string, string> = {};

    const sourceParts = source.split(":");

    if (sourceParts.length !== 2) {
      console.error("[env0]: Error: source must be in format platform:vault");
      process.exit(1);
    }

    const [platform, vault] = sourceParts;

    if (platform !== "op") {
      console.error("[env0]: Error: source platform must be one of: [op]");
      process.exit(1);
    }

    if (!vault) {
      console.error("[env0]: Error: source vault is required");
      process.exit(1);
    }

    const loader = new EnvLoader(vault, file);

    try {
      envs = await loader.loadEnvs(entries, shouldLoadFile);
    } catch (error: any) {
      console.error("[env0] Failed to load envs");
      console.error(error.message);
      process.exit(1);
    }

    if (print) {
      const output = Object.entries(envs)
        .map(([key, value]) => `export ${key}="${value}"`)
        .join("\n");

      console.log(output);
      process.exit(0);
    }

    console.log("[env0] Envs loaded from 1Password");

    const childProcess = shell
      ? spawn(command.join(" "), [], {
          stdio: "inherit",
          shell: true,
          env: { ...process.env, ...envs },
        })
      : spawn(command[0], command.slice(1), {
          stdio: "inherit",
          shell: false,
          env: { ...process.env, ...envs },
        });

    childProcess.on("exit", (code) => {
      process.exit(code || 0);
    });
  });

// Enable -- for command separation
program.enablePositionalOptions();
program.parse();
