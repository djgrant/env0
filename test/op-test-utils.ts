import { run } from "./sh-test-utils";

export class OnePassword {
  async checkCli() {
    try {
      await run("op --version");
      return true;
    } catch (error) {
      throw new Error("1Password CLI (op) is not installed or not in PATH");
    }
  }

  async createVault(vaultName: string) {
    const vaultStr = await run(`op vault create ${vaultName} --format json`);
    const vault = JSON.parse(vaultStr);
    return new OnePasswordVault(vault);
  }
}

export class OnePasswordVault {
  id: string;

  constructor(vault: { id: string }) {
    this.id = vault.id;
  }

  async createItem(opts: { key: string; value: string }) {
    try {
      await run(
        `op item create --vault ${this.id} --category 003 --title ${opts.key} password=${opts.value}`
      );
    } catch (error) {
      console.error(error.stderr.toString());
    }
  }

  async remove() {
    await run(`op vault delete ${this.id}`);
  }
}
