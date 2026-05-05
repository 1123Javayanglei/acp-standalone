import os from "node:os";

export function shortenHomePath(input: string): string {
  const home = os.homedir();
  if (input === home) {
    return "~";
  }
  if (input.startsWith(home + "/") || input.startsWith(home + "\\")) {
    return "~" + input.slice(home.length);
  }
  return input;
}
