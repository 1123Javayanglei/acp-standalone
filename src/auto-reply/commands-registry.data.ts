export type ChatCommandDefinition = {
  key: string;
  textAliases: string[];
  description: string;
};

export function getChatCommands(): ChatCommandDefinition[] {
  return [];
}
