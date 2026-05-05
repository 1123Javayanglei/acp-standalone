import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { isMainModule } from "../infra/is-main.js";
import {
  handleClaudeMessagesNonStreaming,
  handleClaudeMessagesStreaming,
} from "./claude-handler.js";
import {
  AcpBridge,
  handleChatCompletionNonStreaming,
  handleChatCompletionStreaming,
  type AcpBridgeOptions,
} from "./handler.js";
import type { ChatCompletionRequest, ClaudeMessagesRequest, ModelsResponse } from "./types.js";

export type OpenAICompatServerOptions = AcpBridgeOptions & {
  port?: number;
  host?: string;
  /** Optional API key for Bearer auth validation. If not set, no auth required. */
  apiKey?: string;
};

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    const maxSize = 2 * 1024 * 1024; // 2MB
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxSize) {
        req.destroy();
        reject(new Error("Request body too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(body);
}

function sendError(res: ServerResponse, status: number, message: string, type?: string): void {
  sendJson(res, status, {
    error: {
      message,
      type: type ?? "invalid_request_error",
      code: null,
    },
  });
}

function validateAuth(req: IncomingMessage, apiKey: string | undefined): boolean {
  if (!apiKey) return true;
  // Support both OpenAI style (Authorization: Bearer) and Claude style (x-api-key)
  const auth = req.headers.authorization;
  const xApiKey = req.headers["x-api-key"];
  if (typeof xApiKey === "string" && xApiKey === apiKey) return true;
  if (!auth) return false;
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : auth;
  return token === apiKey;
}

async function handleChatCompletions(
  req: IncomingMessage,
  res: ServerResponse,
  bridge: AcpBridge,
  log: (msg: string) => void,
): Promise<void> {
  const body = await readBody(req);
  let request: ChatCompletionRequest;
  try {
    request = JSON.parse(body) as ChatCompletionRequest;
  } catch {
    sendError(res, 400, "Invalid JSON in request body");
    return;
  }

  if (!request.messages || !Array.isArray(request.messages)) {
    sendError(res, 400, "messages field is required and must be an array");
    return;
  }

  if (!request.model) {
    request.model = "acp-agent";
  }

  log(
    `chat/completions: model=${request.model} messages=${request.messages.length} stream=${Boolean(request.stream)}`,
  );

  if (request.stream) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    try {
      for await (const chunk of handleChatCompletionStreaming(request, bridge)) {
        const data = JSON.stringify(chunk);
        res.write(`data: ${data}\n\n`);
      }
      res.write("data: [DONE]\n\n");
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log(`stream error: ${errMsg}`);
      const errorChunk = JSON.stringify({
        error: { message: errMsg, type: "server_error" },
      });
      res.write(`data: ${errorChunk}\n\n`);
    }
    res.end();
  } else {
    try {
      const response = await handleChatCompletionNonStreaming(request, bridge);
      sendJson(res, 200, response);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log(`completion error: ${errMsg}`);
      sendError(res, 500, errMsg, "server_error");
    }
  }
}

function handleModels(res: ServerResponse): void {
  const response: ModelsResponse = {
    object: "list",
    data: [
      {
        id: "acp-agent",
        object: "model",
        created: Math.floor(Date.now() / 1000),
        owned_by: "acp-standalone",
      },
    ],
  };
  sendJson(res, 200, response);
}

async function handleClaudeMessages(
  req: IncomingMessage,
  res: ServerResponse,
  bridge: AcpBridge,
  log: (msg: string) => void,
): Promise<void> {
  const body = await readBody(req);
  let request: ClaudeMessagesRequest;
  try {
    request = JSON.parse(body) as ClaudeMessagesRequest;
  } catch {
    sendJson(res, 400, {
      type: "error",
      error: { type: "invalid_request_error", message: "Invalid JSON in request body" },
    });
    return;
  }

  if (!request.messages || !Array.isArray(request.messages)) {
    sendJson(res, 400, {
      type: "error",
      error: { type: "invalid_request_error", message: "messages field is required" },
    });
    return;
  }

  if (!request.model) {
    request.model = "acp-agent";
  }
  if (!request.max_tokens) {
    request.max_tokens = 4096;
  }

  log(
    `messages: model=${request.model} messages=${request.messages.length} stream=${Boolean(request.stream)}`,
  );

  if (request.stream) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    try {
      for await (const event of handleClaudeMessagesStreaming(request, bridge)) {
        const data = JSON.stringify(event);
        res.write(`event: ${event.type}\ndata: ${data}\n\n`);
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log(`claude stream error: ${errMsg}`);
      const errorEvent = JSON.stringify({
        type: "error",
        error: { type: "server_error", message: errMsg },
      });
      res.write(`event: error\ndata: ${errorEvent}\n\n`);
    }
    res.end();
  } else {
    try {
      const response = await handleClaudeMessagesNonStreaming(request, bridge);
      sendJson(res, 200, response);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      log(`claude error: ${errMsg}`);
      sendJson(res, 500, {
        type: "error",
        error: { type: "server_error", message: errMsg },
      });
    }
  }
}

export async function startOpenAICompatServer(
  opts: OpenAICompatServerOptions = {},
): Promise<void> {
  const port = opts.port ?? 8965;
  const host = opts.host ?? "127.0.0.1";
  const apiKey = opts.apiKey;
  const log = opts.verbose
    ? (msg: string) => process.stderr.write(`[openai-compat] ${msg}\n`)
    : () => {};

  // Connect to ACP agent (spawn qodercli --acp)
  log("connecting to ACP agent...");
  const bridge = new AcpBridge({
    serverCommand: opts.serverCommand,
    serverArgs: opts.serverArgs,
    cwd: opts.cwd,
    verbose: opts.verbose,
  });
  await bridge.connect();
  log("ACP agent connected");

  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      const pathname = url.pathname;
      const method = req.method?.toUpperCase() ?? "GET";

      // CORS preflight
      if (method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key, anthropic-version",
        });
        res.end();
        return;
      }

      // Auth check
      if (!validateAuth(req, apiKey)) {
        sendError(res, 401, "Invalid API key", "authentication_error");
        return;
      }

      try {
        if (
          (pathname === "/v1/chat/completions" || pathname === "/chat/completions") &&
          method === "POST"
        ) {
          await handleChatCompletions(req, res, bridge, log);
        } else if (
          (pathname === "/v1/messages" || pathname === "/messages") &&
          method === "POST"
        ) {
          await handleClaudeMessages(req, res, bridge, log);
        } else if ((pathname === "/v1/models" || pathname === "/models") && method === "GET") {
          handleModels(res);
        } else if (pathname === "/health" || pathname === "/") {
          sendJson(res, 200, { status: "ok", service: "acp-openai-compat" });
        } else {
          sendError(res, 404, `Unknown endpoint: ${method} ${pathname}`);
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        log(`unhandled error: ${errMsg}`);
        if (!res.headersSent) {
          sendError(res, 500, errMsg, "server_error");
        }
      }
    });

    server.on("error", (err) => {
      reject(err);
    });

    server.listen(port, host, () => {
      const addr = `http://${host}:${port}`;
      console.log(`ACP OpenAI/Claude-Compatible API server listening on ${addr}`);
      console.log(`  POST ${addr}/v1/chat/completions  (OpenAI)`);
      console.log(`  POST ${addr}/v1/messages          (Claude)`);
      console.log(`  GET  ${addr}/v1/models`);
      console.log(`  GET  ${addr}/health`);
      resolve();
    });

    const shutdown = () => {
      log("shutting down");
      server.close();
      void bridge.close();
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  });
}

function parseArgs(args: string[]): OpenAICompatServerOptions {
  const opts: OpenAICompatServerOptions = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--port" || arg === "-p") {
      const val = parseInt(args[i + 1], 10);
      if (Number.isFinite(val) && val > 0) {
        opts.port = val;
      }
      i += 1;
    } else if (arg === "--host" || arg === "-H") {
      opts.host = args[i + 1];
      i += 1;
    } else if (arg === "--api-key") {
      opts.apiKey = args[i + 1];
      i += 1;
    } else if (arg === "--server-command") {
      opts.serverCommand = args[i + 1];
      i += 1;
    } else if (arg === "--server-args") {
      opts.serverArgs = args[i + 1]?.split(" ");
      i += 1;
    } else if (arg === "--cwd") {
      opts.cwd = args[i + 1];
      i += 1;
    } else if (arg === "--verbose" || arg === "-v") {
      opts.verbose = true;
    } else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }
  return opts;
}

function printHelp(): void {
  console.log(`Usage: acp-openai-compat [options]

ACP Runtime Adapter - Exposes ACP agent (qodercli --acp) as OpenAI/Claude-compatible API.

Options:
  --port, -p <port>           Listen port (default: 8965)
  --host, -H <host>           Listen host (default: 127.0.0.1)
  --api-key <key>             Optional API key for auth (Bearer token or x-api-key)
  --server-command <cmd>      ACP server command (default: qodercli)
  --server-args <args>        ACP server args, space-separated (default: --acp --yolo)
  --cwd <path>                Working directory for the ACP session
  --verbose, -v               Verbose logging to stderr
  --help, -h                  Show this help message

Endpoints:
  POST /v1/chat/completions   OpenAI Chat Completions (streaming & non-streaming)
  POST /v1/messages           Claude Messages API (streaming & non-streaming)
  GET  /v1/models             List available models
  GET  /health                Health check

Example:
  # Start server
  npx tsx src/openai-compat/server.ts --verbose

  # OpenAI-style call
  curl http://127.0.0.1:8965/v1/chat/completions \\
    -H "Content-Type: application/json" \\
    -d '{"model":"acp-agent","messages":[{"role":"user","content":"Hello"}],"stream":true}'

  # Claude-style call
  curl http://127.0.0.1:8965/v1/messages \\
    -H "Content-Type: application/json" \\
    -H "x-api-key: any" \\
    -H "anthropic-version: 2023-06-01" \\
    -d '{"model":"acp-agent","max_tokens":1024,"messages":[{"role":"user","content":"Hello"}],"stream":true}'
`);
}

if (isMainModule({ currentFile: fileURLToPath(import.meta.url) })) {
  const argv = process.argv.slice(2);
  const opts = parseArgs(argv);
  startOpenAICompatServer(opts).catch((err) => {
    console.error(`Failed to start server: ${String(err)}`);
    process.exit(1);
  });
}
