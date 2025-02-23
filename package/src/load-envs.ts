import { readFileSync } from "fs";
import { OnePasswordVault } from "./one-password";

export class EnvLoader {
  private vault: OnePasswordVault;
  private configPath: string;

  constructor(vaultName: string, configPath: string = ".env0") {
    this.vault = new OnePasswordVault(vaultName);
    this.configPath = configPath;
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

  private readEnvKeys(): Array<{
    key: string;
    type: "shorthand" | "literal" | "reference";
    value?: string;
  }> {
    try {
      const content = readFileSync(this.configPath, "utf-8");
      return content
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"))
        .map((line) => this.parseEnvExpression(line));
    } catch (error) {
      throw new Error(`Failed to read env0 file ${this.configPath}: ${error}`);
    }
  }

  private maskSecret(value: string): void {
    if (process.env["GITHUB_ACTIONS"]) {
      console.log(`::add-mask::${value}`);
    }
  }

  async loadEnvs(items: string[], readConfig: boolean = true) {
    const envExpressions: Array<{
      key: string;
      type: "shorthand" | "literal" | "reference";
      value?: string;
    }> = [];
    const envs: Record<string, string> = {};

    if (readConfig) {
      envExpressions.push(...this.readEnvKeys());
    }

    if (items && items.length > 0) {
      envExpressions.push(
        ...items.map((item) => this.parseEnvExpression(item))
      );
    }

    const uniqueExpressions = [
      ...new Set(envExpressions.map((e) => JSON.stringify(e))),
    ].map((e) => JSON.parse(e));

    for (const expr of uniqueExpressions) {
      if (expr.type === "literal") {
        envs[expr.key] = expr.value!;
        continue;
      }

      if (expr.type === "reference") {
        const sourceItem = this.vault.getItem(expr.value!);
        if (!sourceItem) {
          throw new Error(`No item found for reference ${expr.value}`);
        }
        if (sourceItem.type === "CONCEALED") {
          this.maskSecret(sourceItem.value);
        }
        envs[expr.key] = sourceItem.value;
        continue;
      }

      // Shorthand type
      const item = this.vault.getItem(expr.key);
      if (!item) {
        throw new Error(`No item found for ${expr.key}`);
      }
      if (item.type === "CONCEALED") {
        this.maskSecret(item.value);
      }
      envs[expr.key] = item.value;
    }

    return envs;
  }
}
