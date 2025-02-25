import { readFileSync } from "fs";
import { OnePasswordVault } from "./one-password";

type ExpressionNode = {
  key: string;
  type: "shorthand" | "literal" | "reference";
  value?: string;
};

export class EnvLoader {
  private vault: OnePasswordVault;
  private configPath: string;
  private overrideConfigPath: string;

  constructor(vaultName: string, configPath: string = ".env0") {
    this.vault = new OnePasswordVault(vaultName);
    this.configPath = configPath;
    this.overrideConfigPath = `${configPath}.local`;
  }

  private parseEnvExpression(line: string): {
    key: string;
    type: "shorthand" | "literal" | "reference";
    value?: string;
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
      };
    }

    // Shorthand assignment (e.g., VAR)
    if (/^[a-zA-Z][a-zA-Z0-9_]*$/.test(line)) {
      return { key: line, type: "shorthand" };
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

  private readEnvFiles() {
    const baseLines = EnvLoader.readFileContents(this.configPath);
    const overrideLines = EnvLoader.readFileContents(
      this.overrideConfigPath,
      false
    );

    return [...baseLines, ...overrideLines];
  }

  async loadEnvs(items: string[], readConfig: boolean = true) {
    const expressionNodes: Record<string, ExpressionNode> = {};

    if (readConfig) {
      const configExpressions = this.readEnvFiles();
      for (const exp of configExpressions) {
        const env = this.parseEnvExpression(exp);
        expressionNodes[env.key] = env;
      }
    }

    if (items && items.length > 0) {
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

      if (expr.type === "reference") {
        const sourceItem = this.vault.getItem(expr.value!);
        if (!sourceItem) {
          throw new Error(`No item found for reference ${expr.value}`);
        }
        envs[expr.key] = sourceItem.value;
        continue;
      }

      // Shorthand type
      const item = this.vault.getItem(expr.key);
      if (!item) {
        throw new Error(`No item found for ${expr.key}`);
      }
      envs[expr.key] = item.value;
    }

    return envs;
  }
}
