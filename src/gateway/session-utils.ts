export type GatewayThinkingLevelOption = {
  id: string;
  label: string;
};

export type GatewaySessionRow = {
  key: string;
  kind?: string;
  channel?: string;
  displayName?: string;
  label?: string;
  derivedTitle?: string;
  updatedAt: number | null;
  thinkingLevel?: string;
  thinkingLevels?: GatewayThinkingLevelOption[];
  fastMode?: boolean;
  modelProvider?: string;
  model?: string;
  verboseLevel?: string;
  traceLevel?: string;
  reasoningLevel?: string;
  responseUsage?: "on" | "off" | "tokens" | "full";
  elevatedLevel?: string;
  totalTokens?: number;
  totalTokensFresh?: boolean;
  contextTokens?: number;
};

export type SessionsListResult = {
  ts?: number;
  sessions: GatewaySessionRow[];
  defaults?: unknown;
  agents?: unknown[];
  totalCount?: number;
  limitApplied?: number;
};
