import type { GatewayClient } from "./client.js";

export type ExplicitGatewayAuth = {
  token?: string;
  password?: string;
};

export async function resolveGatewayClientBootstrap(_params: {
  config: unknown;
  gatewayUrl?: string;
  explicitAuth?: ExplicitGatewayAuth;
  env?: NodeJS.ProcessEnv;
}): Promise<{
  url: string;
  urlSource: string;
  preauthHandshakeTimeoutMs?: number;
  auth: {
    token?: string;
    password?: string;
  };
}> {
  throw new Error("resolveGatewayClientBootstrap() not implemented in standalone mode");
}

export type { GatewayClient };
