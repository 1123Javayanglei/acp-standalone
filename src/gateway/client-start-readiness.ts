import type { GatewayClient } from "./client.js";

export type GatewayClientStartReadinessOptions = {
  timeoutMs?: number;
  clientOptions?: {
    connectChallengeTimeoutMs?: number;
    connectDelayMs?: number;
    preauthHandshakeTimeoutMs?: number;
  };
  signal?: AbortSignal;
};

export type EventLoopReadyResult = {
  ready: boolean;
  aborted?: boolean;
};

export async function startGatewayClientWhenEventLoopReady(
  _client: GatewayClient,
  _options?: GatewayClientStartReadinessOptions,
): Promise<EventLoopReadyResult> {
  throw new Error("startGatewayClientWhenEventLoopReady() not implemented in standalone mode");
}
