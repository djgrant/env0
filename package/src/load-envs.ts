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

    const errors: string[] = [];
    const resolvedValues: Record<string, string> = {};

    // Separate literals (no async needed) from secrets (need async resolution)
    const secrets: ExpressionNode[] = [];

    for (const expr of Object.values(expressionNodes)) {
      if (expr.type === "literal") {
        resolvedValues[expr.key] = expr.value!;
      } else {
        secrets.push(expr);
      }
    }

    // Resolve all secrets in parallel
    const resolveSecret = async (
      expr: ExpressionNode
    ): Promise<{ key: string; value: string } | { key: string; error: string }> => {
      try {
        // If we have an item context, resolve field from that item
        if (expr.itemContext) {
          if (expr.type === "reference") {
            // VAR=FIELD_NAME inside [item:X] → look up field FIELD_NAME in item X
            const field = await this.vault.getField(expr.itemContext, expr.value!);
            if (!field) {
              return {
                key: expr.key,
                error: `No field "${expr.value}" found in item "${expr.itemContext}"`,
              };
            }
            return { key: expr.key, value: field.value };
          } else {
            // Shorthand inside [item:X] → look up field with same name as env var
            const field = await this.vault.getField(expr.itemContext, expr.key);
            if (!field) {
              return {
                key: expr.key,
                error: `No field "${expr.key}" found in item "${expr.itemContext}"`,
              };
            }
            return { key: expr.key, value: field.value };
          }
        }

        // No item context - use original behavior (item title lookup)
        if (expr.type === "reference") {
          const sourceItem = await this.vault.getItem(expr.value!);
          if (!sourceItem) {
            return {
              key: expr.key,
              error: `No item found for reference ${expr.value}`,
            };
          }
          return { key: expr.key, value: sourceItem.value };
        }

        // Shorthand type without context
        const item = await this.vault.getItem(expr.key);
        if (!item) {
          return { key: expr.key, error: `No item found for ${expr.key}` };
        }
        return { key: expr.key, value: item.value };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { key: expr.key, error: message };
      }
    };

    // Resolve first secret synchronously to trigger biometric auth,
    // then resolve remaining secrets in parallel
    const [firstSecret, ...remainingSecrets] = secrets;

    if (firstSecret) {
      const firstResult = await resolveSecret(firstSecret);
      if ("error" in firstResult) {
        errors.push(firstResult.error);
      } else {
        resolvedValues[firstResult.key] = firstResult.value;
      }
    }

    const results = await Promise.all(remainingSecrets.map(resolveSecret));

    for (const result of results) {
      if ("error" in result) {
        errors.push(result.error);
      } else {
        resolvedValues[result.key] = result.value;
      }
    }

    if (errors.length > 0) {
      throw new Error(
        `Failed to load ${errors.length} secret(s):\n- ${errors.join("\n- ")}`
      );
    }

    // Build final envs object in alphabetical order
    const envs: Record<string, string> = {};
    for (const key of Object.keys(resolvedValues).sort()) {
      envs[key] = resolvedValues[key];
    }

    return envs;
  }
}
