import { exec } from "child_process";
import { promisify } from "util";
import { OnePasswordItem } from "./types";

const execAsync = promisify(exec);

export class OnePasswordVault {
  private vaultName: string;

  constructor(vaultName: string) {
    this.vaultName = vaultName;
  }

  async getItem(key: string) {
    const cmd = `op item get "${key}" --vault ${this.vaultName} --format json`;
    const { stdout } = await execAsync(cmd);
    const item = JSON.parse(stdout.trim()) as OnePasswordItem;

    const firstField = item.fields.find((f) => f.purpose !== "NOTES");

    if (!firstField) {
      return null;
    }

    return {
      type: firstField.type,
      value: firstField.value,
    };
  }

  async getField(itemTitle: string, fieldLabel: string) {
    const cmd = `op item get "${itemTitle}" --vault ${this.vaultName} --format json`;
    const { stdout } = await execAsync(cmd);
    const item = JSON.parse(stdout.trim()) as OnePasswordItem;

    const field = item.fields.find((f) => f.label === fieldLabel);

    if (!field) {
      return null;
    }

    return {
      type: field.type,
      value: field.value,
    };
  }
}
