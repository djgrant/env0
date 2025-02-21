import { $ } from "bun";

export const op = {
  check() {
    try {
      $`op --version`;
      return true;
    } catch (error) {
      throw new Error("1Password CLI (op) is not installed or not in PATH");
    }
  },
  createVault(vaultName: string): Promise<{ id: string }> {
    return $`op vault create ${vaultName} --format json`.json();
  },
  async deleteVault(vaultId: string) {
    await $`op vault delete ${vaultId}`;
  },
  async createItem(opts: { vaultId: string; key: string; value: string }) {
    await $`op item create --vault ${opts.vaultId} --category 003 --title ${opts.key} password=${opts.value}`.quiet();
  },
};
