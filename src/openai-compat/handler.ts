import { spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as nodePath from "node:path";
import { Readable, Writable } from "node:stream";
import {
  ClientSideConnection,
  PROTOCOL_VERSION,
  ndJsonStream,
  type CreateTerminalRequest,
  type CreateTerminalResponse,
  type KillTerminalRequest,
  type KillTerminalResponse,
  type ReadTextFileRequest,
  type ReadTextFileResponse,
  type ReleaseTerminalRequest,
  type ReleaseTerminalResponse,
  type RequestPermissionRequest,
  type RequestPermissionResponse,
  type SessionNotification,
  type TerminalOutputRequest,
  type TerminalOutputResponse,
  type WaitForTerminalExitRequest,
  type WaitForTerminalExitResponse,
  type WriteTextFileRequest,
  type WriteTextFileResponse,
} from "@agentclientprotocol/sdk";
import type {
  ChatCompletionChunk,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatMessage,
} from "./types.js";

export type AcpBridgeOptions = {
  serverCommand?: string;
  serverArgs?: string[];
  cwd?: string;
  verbose?: boolean;
};

type PendingChunk = {
  type: "text" | "thought" | "tool_call" | "tool_update" | "done";
  text?: string;
  toolCallId?: string;
  toolTitle?: string;
  toolStatus?: string;
  stopReason?: string;
};

/** Managed terminal process */
type ManagedTerminal = {
  id: string;
  process: ChildProcess;
  output: string;
  truncated: boolean;
  exitCode: number | null;
  signal: string | null;
  exited: boolean;
  exitPromise: Promise<void>;
  outputByteLimit: number;
};

export class AcpBridge {
  private client: ClientSideConnection | null = null;
  private agentProcess: ChildProcess | null = null;
  private sessionId: string | null = null;
  private opts: AcpBridgeOptions;
  private log: (msg: string) => void;
  private pendingChunks: PendingChunk[] = [];
  private chunkResolve: (() => void) | null = null;
  private terminals: Map<string, ManagedTerminal> = new Map();
  private promptLock: Promise<void> = Promise.resolve();

  constructor(opts: AcpBridgeOptions = {}) {
    this.opts = opts;
    this.log = opts.verbose
      ? (msg: string) => process.stderr.write(`[acp-bridge] ${msg}\n`)
      : () => {};
  }

  async connect(): Promise<void> {
    const cwd = this.opts.cwd ?? process.cwd();
    const serverCommand = this.opts.serverCommand ?? "qodercli";
    const serverArgs = this.opts.serverArgs ?? ["--acp", "--yolo"];

    this.log(`spawning: ${serverCommand} ${serverArgs.join(" ")}`);

    this.agentProcess = spawn(serverCommand, serverArgs, {
      stdio: ["pipe", "pipe", "inherit"],
      cwd,
      env: process.env,
    });

    if (!this.agentProcess.stdin || !this.agentProcess.stdout) {
      throw new Error("Failed to create ACP stdio pipes");
    }

    const input = Writable.toWeb(this.agentProcess.stdin);
    const output = Readable.toWeb(
      this.agentProcess.stdout,
    ) as unknown as ReadableStream<Uint8Array>;
    const stream = ndJsonStream(input, output);

    this.client = new ClientSideConnection(
      () => ({
        sessionUpdate: async (params: SessionNotification) => {
          this.handleSessionUpdate(params);
        },
        requestPermission: async (params: RequestPermissionRequest): Promise<RequestPermissionResponse> => {
          return this.handleRequestPermission(params);
        },
        readTextFile: async (params: ReadTextFileRequest): Promise<ReadTextFileResponse> => {
          return this.handleReadTextFile(params);
        },
        writeTextFile: async (params: WriteTextFileRequest): Promise<WriteTextFileResponse> => {
          return this.handleWriteTextFile(params);
        },
        createTerminal: async (params: CreateTerminalRequest): Promise<CreateTerminalResponse> => {
          return this.handleCreateTerminal(params);
        },
        terminalOutput: async (params: TerminalOutputRequest): Promise<TerminalOutputResponse> => {
          return this.handleTerminalOutput(params);
        },
        waitForTerminalExit: async (params: WaitForTerminalExitRequest): Promise<WaitForTerminalExitResponse> => {
          return this.handleWaitForTerminalExit(params);
        },
        releaseTerminal: async (params: ReleaseTerminalRequest): Promise<ReleaseTerminalResponse> => {
          return this.handleReleaseTerminal(params);
        },
        killTerminal: async (params: KillTerminalRequest): Promise<KillTerminalResponse> => {
          return this.handleKillTerminal(params);
        },
      }),
      stream,
    );

    this.log("initializing ACP connection");
    await this.client.initialize({
      protocolVersion: PROTOCOL_VERSION,
      clientCapabilities: {
        fs: { readTextFile: true, writeTextFile: true },
        terminal: true,
      },
      clientInfo: { name: "acp-openai-compat", version: "1.0.0" },
    });

    this.log("creating ACP session");
    const session = await this.client.newSession({
      cwd,
      mcpServers: [],
    });

    this.sessionId = session.sessionId;
    this.log(`session created: ${this.sessionId}`);
  }

  // --- Permission handler ---

  private handleRequestPermission(params: RequestPermissionRequest): RequestPermissionResponse {
    const options = params.options ?? [];
    // Auto-approve: pick the first "allow" option
    const allowOption = options.find(
      (o) => o.kind === "allow_once" || o.kind === "allow_always",
    );
    if (allowOption) {
      this.log(`permission auto-approved: ${params.toolCall?.title ?? "tool"} -> ${allowOption.optionId}`);
      return { outcome: { outcome: "selected", optionId: allowOption.optionId } };
    }
    // Fallback: select the first option
    if (options.length > 0) {
      this.log(`permission selected first option: ${options[0].optionId}`);
      return { outcome: { outcome: "selected", optionId: options[0].optionId } };
    }
    this.log("permission cancelled: no options available");
    return { outcome: { outcome: "cancelled" } };
  }

  // --- File system handlers ---

  private async handleReadTextFile(params: ReadTextFileRequest): Promise<ReadTextFileResponse> {
    this.log(`readTextFile: ${params.path} (line=${params.line ?? 1}, limit=${params.limit ?? "all"})`);
    try {
      const content = await fs.readFile(params.path, "utf-8");
      if (params.line || params.limit) {
        const lines = content.split("\n");
        const startLine = Math.max(0, (params.line ?? 1) - 1);
        const endLine = params.limit ? startLine + params.limit : lines.length;
        return { content: lines.slice(startLine, endLine).join("\n") };
      }
      return { content };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log(`readTextFile error: ${msg}`);
      return { content: `[Error reading file: ${msg}]` };
    }
  }

  private async handleWriteTextFile(params: WriteTextFileRequest): Promise<WriteTextFileResponse> {
    this.log(`writeTextFile: ${params.path}`);
    try {
      const dir = nodePath.dirname(params.path);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(params.path, params.content, "utf-8");
      return {};
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log(`writeTextFile error: ${msg}`);
      return {};
    }
  }

  // --- Terminal handlers ---

  private handleCreateTerminal(params: CreateTerminalRequest): Promise<CreateTerminalResponse> {
    const terminalId = `term_${randomUUID().replace(/-/g, "").slice(0, 16)}`;
    const cwd = params.cwd ?? this.opts.cwd ?? process.cwd();
    const outputByteLimit = params.outputByteLimit ?? 1024 * 1024; // 1MB default

    this.log(`createTerminal: ${params.command} ${(params.args ?? []).join(" ")} in ${cwd}`);

    const env: Record<string, string | undefined> = { ...process.env };
    if (params.env) {
      for (const { name, value } of params.env) {
        env[name] = value;
      }
    }

    const proc = spawn(params.command, params.args ?? [], {
      cwd,
      env,
      shell: true,
      stdio: ["ignore", "pipe", "pipe"],
    });

    const terminal: ManagedTerminal = {
      id: terminalId,
      process: proc,
      output: "",
      truncated: false,
      exitCode: null,
      signal: null,
      exited: false,
      outputByteLimit,
      exitPromise: Promise.resolve(),
    };

    const appendOutput = (data: Buffer) => {
      terminal.output += data.toString("utf-8");
      const byteLen = Buffer.byteLength(terminal.output, "utf-8");
      if (byteLen > terminal.outputByteLimit) {
        // Truncate from beginning
        const excess = byteLen - terminal.outputByteLimit;
        const chars = terminal.output;
        let cutIdx = 0;
        let bytesCount = 0;
        for (let i = 0; i < chars.length; i++) {
          bytesCount += Buffer.byteLength(chars[i], "utf-8");
          if (bytesCount >= excess) {
            cutIdx = i + 1;
            break;
          }
        }
        terminal.output = terminal.output.slice(cutIdx);
        terminal.truncated = true;
      }
    };

    proc.stdout?.on("data", appendOutput);
    proc.stderr?.on("data", appendOutput);

    terminal.exitPromise = new Promise<void>((resolve) => {
      proc.on("exit", (code, signal) => {
        terminal.exitCode = code;
        terminal.signal = signal;
        terminal.exited = true;
        resolve();
      });
      proc.on("error", (err) => {
        terminal.output += `\n[Process error: ${err.message}]`;
        terminal.exited = true;
        terminal.exitCode = 1;
        resolve();
      });
    });

    this.terminals.set(terminalId, terminal);
    return Promise.resolve({ terminalId });
  }

  private handleTerminalOutput(params: TerminalOutputRequest): Promise<TerminalOutputResponse> {
    const terminal = this.terminals.get(params.terminalId);
    if (!terminal) {
      return Promise.resolve({ output: "[Terminal not found]", truncated: false });
    }
    return Promise.resolve({
      output: terminal.output,
      truncated: terminal.truncated,
      ...(terminal.exited
        ? { exitStatus: { exitCode: terminal.exitCode, signal: terminal.signal } }
        : {}),
    });
  }

  private async handleWaitForTerminalExit(params: WaitForTerminalExitRequest): Promise<WaitForTerminalExitResponse> {
    const terminal = this.terminals.get(params.terminalId);
    if (!terminal) {
      return { exitCode: 1, signal: null };
    }
    await terminal.exitPromise;
    return { exitCode: terminal.exitCode, signal: terminal.signal };
  }

  private handleReleaseTerminal(params: ReleaseTerminalRequest): Promise<ReleaseTerminalResponse> {
    const terminal = this.terminals.get(params.terminalId);
    if (terminal) {
      if (!terminal.exited) {
        terminal.process.kill();
      }
      this.terminals.delete(params.terminalId);
    }
    return Promise.resolve({});
  }

  private handleKillTerminal(params: KillTerminalRequest): Promise<KillTerminalResponse> {
    const terminal = this.terminals.get(params.terminalId);
    if (terminal && !terminal.exited) {
      terminal.process.kill();
    }
    return Promise.resolve({});
  }

  // --- Session update handler ---

  private handleSessionUpdate(params: SessionNotification): void {
    const update = params.update as Record<string, unknown>;
    if (!("sessionUpdate" in update)) return;

    const updateType = update.sessionUpdate as string;

    switch (updateType) {
      case "agent_message_chunk": {
        const content = update.content as { type?: string; text?: string } | undefined;
        if (content?.type === "text" && content.text) {
          this.pushChunk({ type: "text", text: content.text });
        }
        break;
      }
      case "agent_thought_chunk": {
        const content = update.content as { type?: string; text?: string } | undefined;
        if (content?.type === "text" && content.text) {
          this.pushChunk({ type: "thought", text: content.text });
        }
        break;
      }
      case "tool_call": {
        this.pushChunk({
          type: "tool_call",
          toolCallId: update.toolCallId as string | undefined,
          toolTitle: update.title as string | undefined,
          toolStatus: update.status as string | undefined,
        });
        break;
      }
      case "tool_call_update": {
        this.pushChunk({
          type: "tool_update",
          toolCallId: update.toolCallId as string | undefined,
          toolStatus: update.status as string | undefined,
        });
        break;
      }
    }
  }

  private pushChunk(chunk: PendingChunk): void {
    this.pendingChunks.push(chunk);
    if (this.chunkResolve) {
      const resolve = this.chunkResolve;
      this.chunkResolve = null;
      resolve();
    }
  }

  private signalDone(stopReason: string): void {
    this.pushChunk({ type: "done", stopReason });
  }

  async *streamPrompt(messages: ChatMessage[]): AsyncGenerator<PendingChunk> {
    // Acquire lock - wait for any previous prompt to finish
    let releaseLock: () => void;
    const prevLock = this.promptLock;
    this.promptLock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    await prevLock;

    try {
      if (!this.client || !this.sessionId) {
        throw new Error("ACP bridge not connected");
      }

      this.pendingChunks = [];

      const promptText = this.buildPromptText(messages);
      this.log(`sending prompt: ${promptText.slice(0, 100)}...`);

      // Start prompt in background - it resolves when the turn completes
      const promptPromise = this.client
        .prompt({
          sessionId: this.sessionId,
          prompt: [{ type: "text", text: promptText }],
        })
        .then((response) => {
          this.signalDone(response.stopReason ?? "end_turn");
        })
        .catch((err) => {
          this.pushChunk({
            type: "text",
            text: `\n[Error: ${err instanceof Error ? err.message : String(err)}]`,
          });
          this.signalDone("error");
        });

      // Yield chunks as they arrive
      while (true) {
        if (this.pendingChunks.length > 0) {
          const chunk = this.pendingChunks.shift()!;
          yield chunk;
          if (chunk.type === "done") break;
        } else {
          await new Promise<void>((resolve) => {
            this.chunkResolve = resolve;
          });
        }
      }

      await promptPromise;
    } finally {
      releaseLock!();
    }
  }

  async prompt(messages: ChatMessage[]): Promise<{ text: string; stopReason: string }> {
    let text = "";
    let stopReason = "end_turn";
    for await (const chunk of this.streamPrompt(messages)) {
      if (chunk.type === "text") {
        text += chunk.text ?? "";
      } else if (chunk.type === "done") {
        stopReason = chunk.stopReason ?? "end_turn";
      }
    }
    return { text, stopReason };
  }

  private buildPromptText(messages: ChatMessage[]): string {
    // Send only the last user message - ACP session maintains its own context
    const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUserMsg?.content) {
      return messages
        .filter((m) => m.content)
        .map((m) => m.content!)
        .join("\n");
    }

    // If there's a system message and this looks like a fresh conversation,
    // prepend it
    const systemMsg = messages.find((m) => m.role === "system");
    if (systemMsg?.content && messages.filter((m) => m.role === "user").length <= 1) {
      return `[System Instructions]\n${systemMsg.content}\n\n[User Message]\n${lastUserMsg.content}`;
    }

    return lastUserMsg.content;
  }

  async close(): Promise<void> {
    // Kill all terminals
    for (const terminal of this.terminals.values()) {
      if (!terminal.exited) {
        terminal.process.kill();
      }
    }
    this.terminals.clear();

    if (this.agentProcess) {
      this.agentProcess.kill();
      this.agentProcess = null;
    }
    this.client = null;
    this.sessionId = null;
  }

  get connected(): boolean {
    return this.client !== null && this.sessionId !== null;
  }
}

// --- HTTP handler functions ---

export function makeCompletionId(): string {
  return `chatcmpl-${randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

export async function handleChatCompletionNonStreaming(
  req: ChatCompletionRequest,
  bridge: AcpBridge,
): Promise<ChatCompletionResponse> {
  const { text, stopReason } = await bridge.prompt(req.messages);

  return {
    id: makeCompletionId(),
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model: req.model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text || null },
        finish_reason: stopReason === "cancelled" ? "stop" : "stop",
      },
    ],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  };
}

export async function* handleChatCompletionStreaming(
  req: ChatCompletionRequest,
  bridge: AcpBridge,
): AsyncGenerator<ChatCompletionChunk> {
  const completionId = makeCompletionId();
  const created = Math.floor(Date.now() / 1000);

  // Initial role chunk
  yield {
    id: completionId,
    object: "chat.completion.chunk",
    created,
    model: req.model,
    choices: [
      {
        index: 0,
        delta: { role: "assistant", content: "" },
        finish_reason: null,
      },
    ],
  };

  for await (const chunk of bridge.streamPrompt(req.messages)) {
    if (chunk.type === "text" && chunk.text) {
      yield {
        id: completionId,
        object: "chat.completion.chunk",
        created,
        model: req.model,
        choices: [
          {
            index: 0,
            delta: { content: chunk.text },
            finish_reason: null,
          },
        ],
      };
    } else if (chunk.type === "done") {
      yield {
        id: completionId,
        object: "chat.completion.chunk",
        created,
        model: req.model,
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: "stop",
          },
        ],
      };
    }
  }
}
