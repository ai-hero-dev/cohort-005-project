import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { RunCommand } from "./feedback";

const execFileAsync = promisify(execFile);

export const runCommand: RunCommand = async (command, args) => {
  const { stdout } = await execFileAsync(command, args);
  return stdout;
};
