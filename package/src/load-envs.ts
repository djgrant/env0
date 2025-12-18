import { OnePasswordVault } from "./one-password";
import { parse, ExpressionNode } from "./parser";
import { parseFiles } from "./file-resolver";

export class EnvLoader {
  private vault: OnePasswordVault;
  private configPaths: string[];

  constructor(vaultName: string, configPaths: string[] = [".env0"]) {
    this.vault = new OnePasswordVault(vaultName);
    this.configPaths = configPaths;
  }

  async loadEnvs(items: string[], readConfig: boolean = true) {
    const expressionNodes: Record<string, ExpressionNode> = {};

    if (readConfig) {
      const parsed = parseFiles(this.configPaths);
      Object.assign(expressionNodes, parsed.getExpressions());
    }

    if (items && items.length > 0) {
      // Each CLI entry is a single expression (e.g., -e API_KEY -e DB_URL)
      for (const item of items) {
        const parsed = parse(item);
        Object.assign(expressionNodes, parsed.getExpressions());
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
    ): Promise<
      { key: string; value: string } | { key: string; error: string }
    > => {
      try {
        // If we have an item context, resolve field from that item
        if (expr.itemContext) {
          if (expr.type === "reference") {
            // VAR=FIELD_NAME inside [item:X] → look up field FIELD_NAME in item X
            const field = await this.vault.getField(
              expr.itemContext,
              expr.value!
            );
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

    // Return envs sorted by key for consistent output
    const sortedEnvs: Record<string, string> = {};
    for (const key of Object.keys(resolvedValues).sort()) {
      sortedEnvs[key] = resolvedValues[key];
    }
    return sortedEnvs;
  }
}
