import { expect, test, beforeAll, afterAll, afterEach } from "vitest";
import { OnePassword } from "./op-test-utils";
import { run, rm } from "./sh-test-utils";
import { promises as fs } from "fs";
import dedent from "dedent";

const op = new OnePassword();
const testVault = await op.createVault("env-zero-test-vault");

const runEnv0 = async (args: string) => {
  return run(`env0 -s op:env-zero-test-vault ${args}`);
};

const cleanUp = async () => {
  await rm(".env0");
  await rm(".env0.local");
  await rm(".env0.multi1");
  await rm(".env0.multi2");
  await rm(".env0.override1");
  await rm(".env0.override2");
  await rm(".env0.localtest1");
  await rm(".env0.localtest1.local");
  await rm(".env0.localtest2");
  await rm(".env0.precedence1");
  await rm(".env0.precedence1.local");
  await rm(".env0.precedence2");
  await rm(".env0.precedence2.local");
  await rm(".env0.section1");
  await rm(".env0.section2");
};

beforeAll(async () => {
  await cleanUp();
  await op.checkCli();

  await testVault.createItem({
    key: "TEST_SECRET",
    value: "test-value",
  });

  await testVault.createItem({
    key: "ANOTHER_TEST_SECRET",
    value: "another-test-value",
  });

  // Items with multiple fields for section syntax tests
  await testVault.createItemWithFields({
    title: "supabase",
    fields: [
      { label: "SUPABASE_SECRET_KEY", value: "secret-123" },
      { label: "SUPABASE_URL", value: "https://example.supabase.co" },
    ],
  });

  await testVault.createItemWithFields({
    title: "stripe",
    fields: [{ label: "STRIPE_KEY", value: "sk_test_123" }],
  });
}, 30000);

afterAll(async () => {
  await testVault.remove();
});

afterEach(async () => {
  await cleanUp();
});

test("loads environment variables from .env0 file", async () => {
  await fs.writeFile(".env0", "TEST_SECRET");
  const output = await runEnv0("--print");
  expect(output).toBe('export TEST_SECRET="test-value"');
});

test("loads inline expressions", async () => {
  const output = await runEnv0("-e TEST_SECRET --print");
  expect(output).toBe('export TEST_SECRET="test-value"');
});

test("combines file and inline expressions", async () => {
  await fs.writeFile(".env0", "TEST_SECRET");
  const output = await runEnv0("-f .env0 -e ANOTHER_TEST_SECRET --print");
  expect(output).toBe(
    'export TEST_SECRET="test-value"\nexport ANOTHER_TEST_SECRET="another-test-value"'
  );
});

test("supports literal string assignments", async () => {
  await fs.writeFile(".env0", 'LITERAL_VAR="hello world"');
  const output = await runEnv0("--print");
  expect(output).toBe('export LITERAL_VAR="hello world"');
});

test("supports reference assignments", async () => {
  await fs.writeFile(".env0", "RENAMED_SECRET=TEST_SECRET");
  const output = await runEnv0("--print");
  expect(output).toBe('export RENAMED_SECRET="test-value"');
});

test("supports mixed assignment types", async () => {
  await fs.writeFile(
    ".env0",
    dedent`
      TEST_SECRET
      LITERAL_VAR="hello world"
      RENAMED_SECRET=ANOTHER_TEST_SECRET
    `
  );
  const output = await runEnv0("--print");
  expect(output).toBe(dedent`
    export TEST_SECRET="test-value"
    export LITERAL_VAR="hello world"
    export RENAMED_SECRET="another-test-value"
  `);
});

test("overrides environment variables with .env0.local file", async () => {
  await fs.writeFile(
    ".env0",
    dedent`
      TEST_SECRET
      ANOTHER_TEST_SECRET
    `
  );
  await fs.writeFile(".env0.local", 'TEST_SECRET="local-override"');
  const output = await runEnv0("--print");
  expect(output).toBe(dedent`
    export TEST_SECRET="local-override"
    export ANOTHER_TEST_SECRET="another-test-value"
  `);
});

test("adds new variables from .env0.local file", async () => {
  await fs.writeFile(".env0", "TEST_SECRET");
  await fs.writeFile(".env0.local", 'LOCAL_VAR="local-only"');
  const output = await runEnv0("--print");
  expect(output).toBe(
    'export TEST_SECRET="test-value"\nexport LOCAL_VAR="local-only"'
  );
});

test("overrides .env0 and .env0.local files with inline expressions", async () => {
  await fs.writeFile(".env0", "TEST_SECRET");
  await fs.writeFile(".env0.local", 'TEST_SECRET="local-only"');
  const output = await runEnv0(`-e TEST_SECRET --print`);
  expect(output).toBe('export TEST_SECRET="test-value"');
});

test("validates environment variable names", async () => {
  await fs.writeFile(".env0", "invalid-name=TEST_SECRET");
  await expect(runEnv0("--print")).rejects.toThrow();
});

test("ignores commented lines in .env0 file", async () => {
  await fs.writeFile(".env0", "TEST_SECRET\n# IGNORED_SECRET");
  const output = await runEnv0("--print");
  expect(output).toBe('export TEST_SECRET="test-value"');
});

test("executes command with loaded environment variables", async () => {
  await fs.writeFile(".env0", "TEST_SECRET");
  const output = await runEnv0("--print");
  expect(output.trim()).toContain("test-value");
});

test("executes command in shell with loaded environment variables", async () => {
  await fs.writeFile(".env0", "TEST_SECRET");
  const output = await runEnv0("-sh 'echo $TEST_SECRET'");
  expect(output.trim()).toContain("test-value");
});

test("loads environment variables from multiple -f files", async () => {
  await fs.writeFile(".env0.multi1", "TEST_SECRET");
  await fs.writeFile(".env0.multi2", "ANOTHER_TEST_SECRET");
  const output = await runEnv0("-f .env0.multi1 -f .env0.multi2 --print");
  expect(output).toBe(
    'export TEST_SECRET="test-value"\nexport ANOTHER_TEST_SECRET="another-test-value"'
  );
});

test("later -f files override earlier -f files", async () => {
  await fs.writeFile(".env0.override1", 'TEST_SECRET="base-value"');
  await fs.writeFile(".env0.override2", 'TEST_SECRET="extra-value"');
  const output = await runEnv0("-f .env0.override1 -f .env0.override2 --print");
  expect(output).toBe('export TEST_SECRET="extra-value"');
});

test("each -f file supports its own .local override", async () => {
  await fs.writeFile(".env0.localtest1", "TEST_SECRET");
  await fs.writeFile(".env0.localtest1.local", 'TEST_SECRET="base-local-value"');
  await fs.writeFile(".env0.localtest2", "ANOTHER_TEST_SECRET");
  const output = await runEnv0("-f .env0.localtest1 -f .env0.localtest2 --print");
  expect(output).toBe(
    'export TEST_SECRET="base-local-value"\nexport ANOTHER_TEST_SECRET="another-test-value"'
  );
});

test("later -f file's .local override takes precedence", async () => {
  await fs.writeFile(".env0.precedence1", 'TEST_SECRET="base-value"');
  await fs.writeFile(".env0.precedence1.local", 'TEST_SECRET="base-local-value"');
  await fs.writeFile(".env0.precedence2", 'TEST_SECRET="extra-value"');
  await fs.writeFile(".env0.precedence2.local", 'TEST_SECRET="extra-local-value"');
  const output = await runEnv0("-f .env0.precedence1 -f .env0.precedence2 --print");
  expect(output).toBe('export TEST_SECRET="extra-local-value"');
});

// Section syntax tests
test("loads field from item using section syntax (shorthand)", async () => {
  await fs.writeFile(
    ".env0",
    dedent`
      [item:supabase]
      SUPABASE_SECRET_KEY
    `
  );

  const output = await runEnv0("--print");
  expect(output).toBe('export SUPABASE_SECRET_KEY="secret-123"');
});

test("loads multiple fields from item using section syntax", async () => {
  await fs.writeFile(
    ".env0",
    dedent`
      [item:supabase]
      SUPABASE_SECRET_KEY
      SUPABASE_URL
    `
  );

  const output = await runEnv0("--print");
  expect(output).toBe(dedent`
    export SUPABASE_SECRET_KEY="secret-123"
    export SUPABASE_URL="https://example.supabase.co"
  `);
});

test("loads field with reference syntax inside section", async () => {
  await fs.writeFile(
    ".env0",
    dedent`
      [item:supabase]
      MY_SECRET=SUPABASE_SECRET_KEY
    `
  );

  const output = await runEnv0("--print");
  expect(output).toBe('export MY_SECRET="secret-123"');
});

test("supports literal values inside section", async () => {
  await fs.writeFile(
    ".env0",
    dedent`
      [item:supabase]
      SUPABASE_SECRET_KEY
      MODE="production"
    `
  );

  const output = await runEnv0("--print");
  expect(output).toBe(dedent`
    export SUPABASE_SECRET_KEY="secret-123"
    export MODE="production"
  `);
});

test("supports multiple sections", async () => {
  await fs.writeFile(
    ".env0",
    dedent`
      [item:supabase]
      SUPABASE_SECRET_KEY

      [item:stripe]
      STRIPE_KEY
    `
  );

  const output = await runEnv0("--print");
  expect(output).toBe(dedent`
    export SUPABASE_SECRET_KEY="secret-123"
    export STRIPE_KEY="sk_test_123"
  `);
});

test("supports mixing top-level and section syntax", async () => {
  await fs.writeFile(
    ".env0",
    dedent`
      TEST_SECRET

      [item:supabase]
      SUPABASE_SECRET_KEY
    `
  );

  const output = await runEnv0("--print");
  expect(output).toBe(dedent`
    export TEST_SECRET="test-value"
    export SUPABASE_SECRET_KEY="secret-123"
  `);
});

test("throws error for missing field in section", async () => {
  await fs.writeFile(
    ".env0",
    dedent`
      [item:supabase]
      NON_EXISTENT_FIELD
    `
  );

  await expect(runEnv0("--print")).rejects.toThrow();
});

test("section context resets between files", async () => {
  // First file ends in a section context
  await fs.writeFile(
    ".env0.section1",
    dedent`
      [item:supabase]
      SUPABASE_SECRET_KEY
    `
  );
  // Second file should start fresh (no section context)
  // TEST_SECRET is a top-level item, not a field in supabase
  await fs.writeFile(
    ".env0.section2",
    dedent`
      TEST_SECRET
    `
  );

  const output = await runEnv0("-f .env0.section1 -f .env0.section2 --print");
  expect(output).toBe(dedent`
    export SUPABASE_SECRET_KEY="secret-123"
    export TEST_SECRET="test-value"
  `);
});
