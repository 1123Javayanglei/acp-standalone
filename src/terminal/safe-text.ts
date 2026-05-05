const ANSI_REGEX = /\x1b\[[0-9;]*[a-zA-Z]/g;
const CONTROL_REGEX = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;

export function sanitizeTerminalText(text: string): string {
  return text.replace(ANSI_REGEX, "").replace(CONTROL_REGEX, "");
}
