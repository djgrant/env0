import { $ } from "bun";
import { expect, test, beforeAll, afterAll, afterEach } from "bun:test";
import { OnePassword } from "./op-test-utils";

const op = new OnePassword();

const testVaultName = "env0-test";
const testVault = await op.createVault(testVaultName);

beforeAll(async () => {
  op.checkCli();

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
  const env0File = Bun.file(".env0");
  if (await env0File.exists()) await env0File.delete();
});

test("executes command with loaded environment variables", async () => {
  await Bun.file(".env0").write("TEST_SECRET");
  const command = `bun -e 'console.log(process.env.TEST_SECRET)'`;
  const output = await $`bunx env0 -V ${testVaultName} ${command}`.text();
  expect(output.trim()).toEndWith("test-value");
});

test("loads environment variables from .env0 file", async () => {
  await Bun.file(".env0").write("TEST_SECRET");
  const output = await $`bunx env0 -V ${testVaultName} --print`.text();
  expect(output).toBe('export TEST_SECRET="test-value"\n');
});

test("loads inline keys", async () => {
  const output =
    await $`bunx env0 -V ${testVaultName} -e TEST_SECRET --print`.text();
  expect(output).toBe('export TEST_SECRET="test-value"\n');
});

test("combines file and inline keys", async () => {
  await Bun.file(".env0").write("TEST_SECRET");
  const output =
    await $`bunx env0 -V ${testVaultName} -F .env0 -e ANOTHER_TEST_SECRET --print`.text();
  expect(output).toBe(
    'export TEST_SECRET="test-value"\nexport ANOTHER_TEST_SECRET="another-test-value"\n'
  );
});

test("supports literal string assignments", async () => {
  await Bun.file(".env0").write('LITERAL_VAR="hello world"');
  const output = await $`bunx env0 -V ${testVaultName} --print`.text();
  expect(output).toBe('export LITERAL_VAR="hello world"\n');
});

test("supports reference assignments", async () => {
  await Bun.file(".env0").write("RENAMED_SECRET=TEST_SECRET");
  const output = await $`bunx env0 -V ${testVaultName} --print`.text();
  expect(output).toBe('export RENAMED_SECRET="test-value"\n');
});

test("supports mixed assignment types", async () => {
  await Bun.file(".env0").write(`TEST_SECRET
LITERAL_VAR="hello world"
RENAMED_SECRET=ANOTHER_TEST_SECRET`);
  const output = await $`bunx env0 -V ${testVaultName} --print`.text();
  expect(output).toBe(
    'export TEST_SECRET="test-value"\nexport LITERAL_VAR="hello world"\nexport RENAMED_SECRET="another-test-value"\n'
  );
});

test("validates environment variable names", async () => {
  await Bun.file(".env0").write("invalid-name=TEST_SECRET");
  const process = await $`bunx env0 -V ${testVaultName} --print`.nothrow();
  await expect(process.exitCode).toBe(1);
});

test("ignores commented lines in .env0 file", async () => {
  await Bun.file(".env0").write("TEST_SECRET\n# IGNORED_SECRET");
  const output = await $`bunx env0 -V ${testVaultName} --print`.text();
  expect(output).toBe('export TEST_SECRET="test-value"\n');
});
