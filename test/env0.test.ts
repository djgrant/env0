import { $ } from "bun";
import { expect, test, beforeAll, afterAll } from "bun:test";
import fs from "fs/promises";
import { op } from "./op-test-utils";

const testVaultName = "env0-test";
let testVaultId: string;

beforeAll(async () => {
  op.check();

  const vault = await op.createVault(testVaultName);
  testVaultId = vault.id;

  await op.createItem({
    vaultId: testVaultId,
    key: "TEST_SECRET",
    value: "test-value",
  });

  await op.createItem({
    vaultId: testVaultId,
    key: "ANOTHER_TEST_SECRET",
    value: "another-test-value",
  });
});

afterAll(async () => {
  await op.deleteVault(testVaultId);
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
