import { expect, test, beforeAll, afterAll, afterEach } from "vitest";
import { OnePassword } from "./op-test-utils";
import { run, rm } from "./sh-test-utils";
import { promises as fs } from "fs";

const op = new OnePassword();
const testVault = await op.createVault("env-zero-test-vault");

const runEnv0 = async (args: string) => {
  return run(`bunx env0 -s op:env-zero-test-vault ${args}`);
};

const cleanUp = async () => {
  await rm(".env0");
  await rm(".env0.local");
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
});

afterAll(async () => {
  await testVault.remove();
});

afterEach(async () => {
  cleanUp();
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
    `TEST_SECRET
LITERAL_VAR="hello world"
RENAMED_SECRET=ANOTHER_TEST_SECRET`
  );
  const output = await runEnv0("--print");
  expect(output).toBe(
    'export TEST_SECRET="test-value"\nexport LITERAL_VAR="hello world"\nexport RENAMED_SECRET="another-test-value"'
  );
});

test("overrides environment variables with .env0.local file", async () => {
  await fs.writeFile(
    ".env0",
    `TEST_SECRET
ANOTHER_TEST_SECRET`
  );
  await fs.writeFile(".env0.local", 'TEST_SECRET="local-override"');
  const output = await runEnv0("--print");
  expect(output).toBe(
    'export TEST_SECRET="local-override"\nexport ANOTHER_TEST_SECRET="another-test-value"'
  );
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
