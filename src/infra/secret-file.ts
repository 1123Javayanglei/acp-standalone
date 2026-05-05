import fs from "node:fs";

export const DEFAULT_SECRET_FILE_MAX_BYTES = 16 * 1024;

export function readSecretFileSync(
  filePath: string,
  _label?: string,
  _options?: { maxBytes?: number; rejectSymlink?: boolean },
): string {
  const content = fs.readFileSync(filePath, "utf8");
  return content.trim();
}
