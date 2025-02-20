import { execSync } from "child_process";
import { OnePasswordItem } from "./types";

export class OnePasswordVault {
  private vaultName: string;

  constructor(vaultName: string) {
    this.vaultName = vaultName;
  }

  getItem(key: string) {
    const cmd = `op item get "${key}" --vault ${this.vaultName} --format json`;
    const itemJson: string = execSync(cmd, { encoding: "utf-8" }).trim();
    const item = JSON.parse(itemJson) as OnePasswordItem;

    const firstField = item.fields.find((f) => f.purpose !== "NOTES");

    if (!firstField) {
      return null;
    }

    return {
      type: firstField.type,
      value: firstField.value,
    };
  }
}
