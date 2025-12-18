import { expect, test, afterEach } from "vitest";
import { parse, parseFile, parseFiles } from "../package/src/index";
import { promises as fs } from "fs";
import dedent from "dedent";

const rm = async (path: string) => {
  try {
    await fs.unlink(path);
  } catch {}
};

const cleanUp = async () => {
  await rm(".env0.parser-test");
  await rm(".env0.parser-test.local");
  await rm(".env0.parser-test2");
};

afterEach(async () => {
  await cleanUp();
});

// parse() - string parsing tests

test("parse: returns empty result for empty string", () => {
  const result = parse("");
  expect(result.getKeys()).toEqual([]);
  expect(result.getExpressions()).toEqual({});
});

test("parse: parses shorthand expressions", () => {
  const result = parse("API_KEY");
  expect(result.getKeys()).toEqual(["API_KEY"]);
  expect(result.getExpressions()).toEqual({
    API_KEY: { key: "API_KEY", type: "shorthand", itemContext: undefined },
  });
});

test("parse: parses literal expressions", () => {
  const result = parse('DB_URL="localhost:5432"');
  expect(result.getKeys()).toEqual(["DB_URL"]);
  expect(result.getExpressions()).toEqual({
    DB_URL: { key: "DB_URL", type: "literal", value: "localhost:5432" },
  });
});

test("parse: parses reference expressions", () => {
  const result = parse("MY_KEY=SOURCE_KEY");
  expect(result.getKeys()).toEqual(["MY_KEY"]);
  expect(result.getExpressions()).toEqual({
    MY_KEY: {
      key: "MY_KEY",
      type: "reference",
      value: "SOURCE_KEY",
      itemContext: undefined,
    },
  });
});

test("parse: parses multiple expressions", () => {
  const result = parse(dedent`
    API_KEY
    DB_URL="localhost"
    RENAMED=SOURCE_KEY
  `);
  expect(result.getKeys()).toEqual(["API_KEY", "DB_URL", "RENAMED"]);
});

test("parse: returns sorted keys", () => {
  const result = parse(dedent`
    ZEBRA
    ALPHA
    BETA
  `);
  expect(result.getKeys()).toEqual(["ALPHA", "BETA", "ZEBRA"]);
});

test("parse: ignores comments", () => {
  const result = parse(dedent`
    API_KEY
    # This is a comment
    DB_URL="localhost"
  `);
  expect(result.getKeys()).toEqual(["API_KEY", "DB_URL"]);
});

test("parse: ignores empty lines", () => {
  const result = parse(`API_KEY\n\n\nDB_URL="localhost"`);
  expect(result.getKeys()).toEqual(["API_KEY", "DB_URL"]);
});

test("parse: parses section syntax", () => {
  const result = parse(dedent`
    [item:supabase]
    SUPABASE_KEY
    RENAMED=SUPABASE_URL
  `);
  expect(result.getExpressions()).toEqual({
    SUPABASE_KEY: {
      key: "SUPABASE_KEY",
      type: "shorthand",
      itemContext: "supabase",
    },
    RENAMED: {
      key: "RENAMED",
      type: "reference",
      value: "SUPABASE_URL",
      itemContext: "supabase",
    },
  });
});

test("parse: supports multiple sections", () => {
  const result = parse(dedent`
    [item:supabase]
    SUPABASE_KEY

    [item:stripe]
    STRIPE_KEY
  `);
  expect(result.getExpressions()["SUPABASE_KEY"].itemContext).toBe("supabase");
  expect(result.getExpressions()["STRIPE_KEY"].itemContext).toBe("stripe");
});

test("parse: literals inside sections have no itemContext", () => {
  const result = parse(dedent`
    [item:supabase]
    MODE="production"
  `);
  expect(result.getExpressions()["MODE"]).toEqual({
    key: "MODE",
    type: "literal",
    value: "production",
  });
});

test("parse: throws on invalid expression", () => {
  expect(() => parse("invalid-name")).toThrow(
    "Invalid environment variable expression"
  );
});

test("parse: throws on empty section name", () => {
  expect(() => parse("[item:]")).toThrow(
    "Invalid section: item name cannot be empty"
  );
});

// has() method tests

test("has: returns true for existing key", () => {
  const result = parse("API_KEY");
  expect(result.has("API_KEY")).toBe(true);
});

test("has: returns false for non-existing key", () => {
  const result = parse("API_KEY");
  expect(result.has("OTHER_KEY")).toBe(false);
});

test("has: is case-sensitive", () => {
  const result = parse("API_KEY");
  expect(result.has("api_key")).toBe(false);
});

// parseFile() tests

test("parseFile: reads and parses a file", async () => {
  await fs.writeFile(".env0.parser-test", "API_KEY\nDB_URL=\"localhost\"");
  const result = parseFile(".env0.parser-test");
  expect(result.getKeys()).toEqual(["API_KEY", "DB_URL"]);
});

test("parseFile: throws on missing file", () => {
  expect(() => parseFile(".env0.nonexistent")).toThrow("Failed to read file");
});

// parseFiles() tests

test("parseFiles: reads and parses multiple files", async () => {
  await fs.writeFile(".env0.parser-test", "API_KEY");
  await fs.writeFile(".env0.parser-test2", "DB_URL=\"localhost\"");
  const result = parseFiles([".env0.parser-test", ".env0.parser-test2"]);
  expect(result.getKeys()).toEqual(["API_KEY", "DB_URL"]);
});

test("parseFiles: later files override earlier files", async () => {
  await fs.writeFile(".env0.parser-test", 'API_KEY="first"');
  await fs.writeFile(".env0.parser-test2", 'API_KEY="second"');
  const result = parseFiles([".env0.parser-test", ".env0.parser-test2"]);
  expect(result.getExpressions()["API_KEY"].value).toBe("second");
});

test("parseFiles: reads .local files by default", async () => {
  await fs.writeFile(".env0.parser-test", 'API_KEY="base"');
  await fs.writeFile(".env0.parser-test.local", 'API_KEY="local"');
  const result = parseFiles([".env0.parser-test"]);
  expect(result.getExpressions()["API_KEY"].value).toBe("local");
});

test("parseFiles: resolveLocalOverrides=false ignores .local files", async () => {
  await fs.writeFile(".env0.parser-test", 'API_KEY="base"');
  await fs.writeFile(".env0.parser-test.local", 'API_KEY="local"');
  const result = parseFiles([".env0.parser-test"], {
    resolveLocalOverrides: false,
  });
  expect(result.getExpressions()["API_KEY"].value).toBe("base");
});

test("parseFiles: section context resets between files", async () => {
  await fs.writeFile(
    ".env0.parser-test",
    dedent`
      [item:supabase]
      SUPABASE_KEY
    `
  );
  await fs.writeFile(".env0.parser-test2", "API_KEY");
  const result = parseFiles([".env0.parser-test", ".env0.parser-test2"]);
  expect(result.getExpressions()["SUPABASE_KEY"].itemContext).toBe("supabase");
  expect(result.getExpressions()["API_KEY"].itemContext).toBeUndefined();
});
