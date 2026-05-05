export type GatewayClientMode = "webchat" | "cli" | "ui" | "backend" | "node" | "probe" | "test";
export type GatewayClientName = string;

export type EventFrame = {
  type: string;
  event: string;
  seq?: number;
  payload?: unknown;
};

export type GatewayClientOptions = {
  url?: string;
  connectChallengeTimeoutMs?: number;
  connectDelayMs?: number;
  preauthHandshakeTimeoutMs?: number;
  tickWatchMinIntervalMs?: number;
  requestTimeoutMs?: number;
  token?: string;
  bootstrapToken?: string;
  deviceToken?: string;
  password?: string;
  instanceId?: string;
  clientName?: GatewayClientName;
  clientDisplayName?: string;
  clientVersion?: string;
  platform?: string;
  deviceFamily?: string;
  mode?: GatewayClientMode;
  role?: string;
  scopes?: string[];
  caps?: string[];
  commands?: string[];
  permissions?: Record<string, boolean>;
  pathEnv?: string;
  minProtocol?: number;
  maxProtocol?: number;
  onEvent?: (evt: EventFrame) => void;
  onHelloOk?: (hello: unknown) => void;
  onConnectError?: (err: Error) => void;
  onReconnectPaused?: (info: { code: number; reason: string; detailCode: string | null }) => void;
  onClose?: (code: number, reason: string) => void;
  onGap?: (info: { expected: number; received: number }) => void;
};

export class GatewayClient {
  constructor(_opts: GatewayClientOptions) {}

  start(): void {
    throw new Error("GatewayClient.start() not implemented in standalone mode");
  }

  stop(): void {
    throw new Error("GatewayClient.stop() not implemented in standalone mode");
  }

  async stopAndWait(_opts?: { timeoutMs?: number }): Promise<void> {
    throw new Error("GatewayClient.stopAndWait() not implemented in standalone mode");
  }

  async request<T = Record<string, unknown>>(
    _method: string,
    _params?: unknown,
    _opts?: { expectFinal?: boolean; timeoutMs?: number | null },
  ): Promise<T> {
    throw new Error("GatewayClient.request() not implemented in standalone mode");
  }
}
