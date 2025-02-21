import { $ } from "bun";
import { expect, test, beforeAll, afterAll } from "bun:test";
import fs from "fs/promises";
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
  await fs.unlink(".env0");
});

test("executes command with loaded environment variables", async () => {
  fs.writeFile(".env0", "MY_TEST_SECRET");
  const command = `bun -e 'console.log(process.env.MY_TEST_SECRET)'`;
  const output = await $`bunx env0 -V ${testVaultName} ${command}`.text();
  expect(output.trim()).toEndWith("test-value");
});

test("loads environment variables from .env0 file", async () => {
  fs.writeFile(".env0", "MY_TEST_SECRET");
  const output = await $`bunx env0 -V ${testVaultName} --print`.text();
  expect(output).toBe('export MY_TEST_SECRET="test-value"\n');
});

test("loads inline keys", async () => {
  const output =
    await $`bunx env0 -V ${testVaultName} MY_TEST_SECRET --print`.text();
  expect(output).toBe('export MY_TEST_SECRET="test-value"\n');
});

test("combines file and inline keys", async () => {
  fs.writeFile(".env0", "MY_TEST_SECRET");
  const output =
    await $`bunx env0 -V ${testVaultName} ANOTHER_SECRET --print`.text();
  expect(output).toBe(
    'export MY_TEST_SECRET="test-value"\nexport ANOTHER_SECRET="another-value"\n'
  );
});

test("ignores commented lines in .env0 file", async () => {
  fs.writeFile(".env0", "MY_TEST_SECRET\n# IGNORED_SECRET");
  const output = await $`bunx env0 -V ${testVaultName} --print`.text();
  expect(output).toBe('export MY_TEST_SECRET="test-value"\n');
});
