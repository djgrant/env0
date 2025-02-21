import { $ } from "bun";

export class OnePassword {
  checkCli() {
    try {
      $`op --version`;
      return true;
    } catch (error) {
      throw new Error("1Password CLI (op) is not installed or not in PATH");
    }
  }

  async createVault(vaultName: string) {
    const vault = await $`op vault create ${vaultName} --format json`.json();
    return new OnePasswordVault(vault);
  }
}

export class OnePasswordVault {
  id: string;

  constructor(vault: { id: string }) {
    this.id = vault.id;
  }

  async createItem(opts: { key: string; value: string }) {
    await $`op item create --vault ${this.id} --category 003 --title ${opts.key} password=${opts.value}`.quiet();
  }

  async remove() {
    await $`op vault delete ${this.id}`;
  }
}
