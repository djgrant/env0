import { exec } from "child_process";
import { promisify } from "util";
import { promises as fs } from "fs";
const execAsync = promisify(exec);

export const run = async (cmd: string): Promise<string> => {
  const { stdout } = await execAsync(cmd);
  return stdout.trim();
};

export const rm = async (path: string) => {
  try {
    await fs.unlink(path);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
};
