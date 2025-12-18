import { readFileSync } from "fs";
import { OnePasswordVault } from "./one-password";

type ExpressionNode = {
  key: string;
  type: "shorthand" | "literal" | "reference";
  value?: string;
  itemContext?: string; // The 1Password item title when inside a [item:NAME] section
};

export class EnvLoader {
  private vault: OnePasswordVault;
  private configPaths: string[];

  constructor(vaultName: string, configPaths: string[] = [".env0"]) {
    this.vault = new OnePasswordVault(vaultName);
    this.configPaths = configPaths;
  }

  private parseItemSection(line: string): string | null {
    const match = line.match(/^\[item:([^\]]+)\]$/);
    if (!match) return null;
    const itemName = match[1].trim();
    if (!itemName) {
      throw new Error("Invalid section: item name cannot be empty");
    }
    return itemName;
  }

  private parseEnvExpression(
    line: string,
    itemContext?: string
  ): {
    key: string;
    type: "shorthand" | "literal" | "reference";
    value?: string;
    itemContext?: string;
  } {
    // Literal assignment (e.g., VAR="value" or VAR='value')
    const literalMatch = line.match(
      /^([a-zA-Z][a-zA-Z0-9_]*)\s*=\s*["'](.+)["']$/
    );
    if (literalMatch) {
      return { key: literalMatch[1], type: "literal", value: literalMatch[2] };
    }

    // Reference assignment (e.g., VAR=SOURCE_VAR)
    const referenceMatch = line.match(
      /^([a-zA-Z][a-zA-Z0-9_]*)\s*=\s*([a-zA-Z][a-zA-Z0-9_]*)$/
    );
    if (referenceMatch) {
      return {
        key: referenceMatch[1],
        type: "reference",
        value: referenceMatch[2],
        itemContext,
      };
    }

    // Shorthand assignment (e.g., VAR)
    if (/^[a-zA-Z][a-zA-Z0-9_]*$/.test(line)) {
      return { key: line, type: "shorthand", itemContext };
    }

    throw new Error(`Invalid environment variable expression: ${line}`);
  }

  private static readFileContents(
    filePath: string,
    required: boolean = true
  ): string[] {
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

  private parseLines(lines: string[]): Record<string, ExpressionNode> {
    const expressionNodes: Record<string, ExpressionNode> = {};
    let currentItemContext: string | undefined;

    for (const line of lines) {
      // Check for section header
      const sectionItem = this.parseItemSection(line);
      if (sectionItem !== null) {
        currentItemContext = sectionItem;
        continue;
      }

      // Parse the expression with current context
      const env = this.parseEnvExpression(line, currentItemContext);
      expressionNodes[env.key] = env;
    }

    return expressionNodes;
  }

  private readAndParseEnvFiles(): Record<string, ExpressionNode> {
    const expressionNodes: Record<string, ExpressionNode> = {};

    for (const configPath of this.configPaths) {
      // Parse each file separately so section context resets between files
      const baseLines = EnvLoader.readFileContents(configPath);
      const baseParsed = this.parseLines(baseLines);
      Object.assign(expressionNodes, baseParsed);

      const overrideLines = EnvLoader.readFileContents(
        `${configPath}.local`,
        false
      );
      const overrideParsed = this.parseLines(overrideLines);
      Object.assign(expressionNodes, overrideParsed);
    }

    return expressionNodes;
  }

  async loadEnvs(items: string[], readConfig: boolean = true) {
    const expressionNodes: Record<string, ExpressionNode> = {};

    if (readConfig) {
      const parsed = this.readAndParseEnvFiles();
      Object.assign(expressionNodes, parsed);
    }

    if (items && items.length > 0) {
      // CLI items don't support section syntax, parse without context
      for (const item of items) {
        const env = this.parseEnvExpression(item);
        expressionNodes[env.key] = env;
      }
    }

    const envs: Record<string, string> = {};

    for (const expr of Object.values(expressionNodes)) {
      if (expr.type === "literal") {
        envs[expr.key] = expr.value!;
        continue;
      }

      // If we have an item context, resolve field from that item
      if (expr.itemContext) {
        if (expr.type === "reference") {
          // VAR=FIELD_NAME inside [item:X] → look up field FIELD_NAME in item X
          const field = this.vault.getField(expr.itemContext, expr.value!);
          if (!field) {
            throw new Error(
              `No field "${expr.value}" found in item "${expr.itemContext}"`
            );
          }
          envs[expr.key] = field.value;
        } else {
          // Shorthand inside [item:X] → look up field with same name as env var
          const field = this.vault.getField(expr.itemContext, expr.key);
          if (!field) {
            throw new Error(
              `No field "${expr.key}" found in item "${expr.itemContext}"`
            );
          }
          envs[expr.key] = field.value;
        }
        continue;
      }

      // No item context - use original behavior (item title lookup)
      if (expr.type === "reference") {
        const sourceItem = this.vault.getItem(expr.value!);
        if (!sourceItem) {
          throw new Error(`No item found for reference ${expr.value}`);
        }
        envs[expr.key] = sourceItem.value;
        continue;
      }

      // Shorthand type without context
      const item = this.vault.getItem(expr.key);
      if (!item) {
        throw new Error(`No item found for ${expr.key}`);
      }
      envs[expr.key] = item.value;
    }

    return envs;
  }
}
