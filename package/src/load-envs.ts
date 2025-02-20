import { readFileSync } from "fs";
import { OnePasswordVault } from "./one-password";

export class EnvLoader {
  private vault: OnePasswordVault;
  private configPath: string;

  constructor(vaultName: string, configPath: string = ".env0") {
    this.vault = new OnePasswordVault(vaultName);
    this.configPath = configPath;
  }

  private readEnvKeys(): string[] {
    try {
      const content = readFileSync(this.configPath, "utf-8");
      return content
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#"));
    } catch (error) {
      throw new Error(`Failed to read env0 file ${this.configPath}: ${error}`);
    }
  }

  private maskSecret(value: string): void {
    if (process.env["GITHUB_ACTIONS"]) {
      console.log(`::add-mask::${value}`);
    }
  }

  async loadEnvs() {
    const keys = this.readEnvKeys();
    const envs: Record<string, string> = {};

    for (const key of keys) {
      const item = this.vault.getItem(key);

      if (!item) {
        throw new Error(`No item found for ${key}`);
      }

      if (item.type === "CONCEALED") {
        this.maskSecret(item.value);
      }

      envs[key] = item.value;
    }

    return envs;
  }
}
