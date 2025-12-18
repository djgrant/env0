export type ExpressionType = "shorthand" | "literal" | "reference";

export type ExpressionNode = {
  key: string;
  type: ExpressionType;
  value?: string;
  itemContext?: string;
};

export class ParseResult {
  private expressions: Record<string, ExpressionNode>;

  constructor(expressions: Record<string, ExpressionNode>) {
    // Store expressions sorted by key for consistent iteration order
    this.expressions = Object.keys(expressions)
      .sort()
      .reduce(
        (sorted, key) => {
          sorted[key] = expressions[key];
          return sorted;
        },
        {} as Record<string, ExpressionNode>
      );
  }

  getKeys(): string[] {
    return Object.keys(this.expressions);
  }

  getExpressions(): Record<string, ExpressionNode> {
    return this.expressions;
  }

  has(key: string): boolean {
    return key in this.expressions;
  }
}

function parseItemSection(line: string): string | null {
  const match = line.match(/^\[item:([^\]]*)\]$/);
  if (!match) return null;
  const itemName = match[1].trim();
  if (!itemName) {
    throw new Error("Invalid section: item name cannot be empty");
  }
  return itemName;
}

function parseEnvExpression(
  line: string,
  itemContext?: string
): ExpressionNode {
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

export function parseLines(lines: string[]): Record<string, ExpressionNode> {
  const expressionNodes: Record<string, ExpressionNode> = {};
  let currentItemContext: string | undefined;

  for (const line of lines) {
    // Check for section header
    const sectionItem = parseItemSection(line);
    if (sectionItem !== null) {
      currentItemContext = sectionItem;
      continue;
    }

    // Parse the expression with current context
    const env = parseEnvExpression(line, currentItemContext);
    expressionNodes[env.key] = env;
  }

  return expressionNodes;
}

export function parse(content: string): ParseResult {
  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"));

  return new ParseResult(parseLines(lines));
}
