// ACP Standalone - Public API
export { AcpGatewayAgent } from "./acp/translator.js";
export { serveAcpGateway } from "./acp/server.js";
export { runAcpClientInteractive } from "./acp/client.js";
export { createInMemorySessionStore, defaultAcpSessionStore } from "./acp/session.js";
export { AcpRuntimeError, isAcpRuntimeError } from "./acp/runtime/errors.js";
export { registerAcpRuntimeBackend, getAcpRuntimeBackend, requireAcpRuntimeBackend } from "./acp/runtime/registry.js";
export { formatAcpRuntimeErrorText } from "./acp/runtime/error-text.js";
export type {
  AcpRuntime,
  AcpRuntimeHandle,
  AcpRuntimeEnsureInput,
  AcpRuntimeTurnInput,
  AcpRuntimeTurnAttachment,
  AcpRuntimeEvent,
  AcpRuntimeCapabilities,
  AcpRuntimeStatus,
  AcpRuntimeDoctorReport,
  AcpRuntimeSessionMode,
  AcpRuntimePromptMode,
  AcpRuntimeControl,
  AcpSessionUpdateTag,
} from "./acp/runtime/types.js";
export type { AcpServerOptions, AcpSession } from "./acp/types.js";

// OpenAI-Compatible API Adapter
export { startOpenAICompatServer } from "./openai-compat/server.js";
export type { OpenAICompatServerOptions } from "./openai-compat/server.js";
