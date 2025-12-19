import { EnvLoader } from "./load-envs";
import type { ReadOptions } from "./types";

export { parse, ParseResult } from "./parser";
export type { ExpressionNode, ExpressionType } from "./parser";

export { parseFile, parseFiles } from "./file-resolver";
export type { ParseFilesOptions } from "./file-resolver";

export type { ReadOptions } from "./types";

export async function read(options: ReadOptions): Promise<Record<string, string>> {
  const { source, files = [".env0"], entries = [] } = options;

  const sourceParts = source.split(":");

  if (sourceParts.length !== 2) {
    throw new Error("source must be in format platform:vault");
  }

  const [platform, vault] = sourceParts;

  if (platform !== "op") {
    throw new Error("source platform must be one of: [op]");
  }

  if (!vault) {
    throw new Error("source vault is required");
  }

  const shouldLoadFiles = files.length > 0;
  const loader = new EnvLoader(vault, files);

  return loader.loadEnvs(entries, shouldLoadFiles);
}
