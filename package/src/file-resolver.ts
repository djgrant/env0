import { readFileSync } from "fs";
import { ParseResult, ExpressionNode, parseLines } from "./parser";

export type ParseFilesOptions = {
  /** Whether to also read .local override files (default: true) */
  resolveLocalOverrides?: boolean;
};

function readFileContents(filePath: string, required: boolean = true): string[] {
  try {
    const content = readFileSync(filePath, "utf-8");
    return content
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"));
  } catch (error) {
    if (required && (error as { code?: string }).code === "ENOENT") {
      throw new Error(`Failed to read file ${filePath}: ${error}`);
    }
    return [];
  }
}

export function parseFile(path: string): ParseResult {
  const lines = readFileContents(path);
  return new ParseResult(parseLines(lines));
}

export function parseFiles(
  paths: string[],
  options: ParseFilesOptions = {}
): ParseResult {
  const { resolveLocalOverrides = true } = options;
  const expressions: Record<string, ExpressionNode> = {};

  for (const path of paths) {
    // Parse each file separately so section context resets between files
    const baseLines = readFileContents(path);
    const baseParsed = parseLines(baseLines);
    Object.assign(expressions, baseParsed);

    if (resolveLocalOverrides) {
      const localLines = readFileContents(`${path}.local`, false);
      const localParsed = parseLines(localLines);
      Object.assign(expressions, localParsed);
    }
  }

  return new ParseResult(expressions);
}
