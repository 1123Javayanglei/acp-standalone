import { randomUUID } from "node:crypto";
import type { AcpBridge } from "./handler.js";
import type {
  ChatMessage,
  ClaudeContentBlock,
  ClaudeMessagesRequest,
  ClaudeMessagesResponse,
  ClaudeStreamEvent,
} from "./types.js";

function makeMessageId(): string {
  return `msg_${randomUUID().replace(/-/g, "").slice(0, 24)}`;
}

function claudeMessagesToChatMessages(req: ClaudeMessagesRequest): ChatMessage[] {
  const messages: ChatMessage[] = [];

  if (req.system) {
    messages.push({ role: "system", content: req.system });
  }

  for (const msg of req.messages) {
    let text: string;
    if (typeof msg.content === "string") {
      text = msg.content;
    } else {
      text = msg.content
        .filter((block): block is Extract<ClaudeContentBlock, { type: "text" }> => block.type === "text")
        .map((block) => block.text)
        .join("\n");
    }
    messages.push({ role: msg.role, content: text });
  }

  return messages;
}

export async function handleClaudeMessagesNonStreaming(
  req: ClaudeMessagesRequest,
  bridge: AcpBridge,
): Promise<ClaudeMessagesResponse> {
  const chatMessages = claudeMessagesToChatMessages(req);
  const { text, stopReason } = await bridge.prompt(chatMessages);

  const claudeStopReason =
    stopReason === "max_tokens" ? "max_tokens" : "end_turn";

  return {
    id: makeMessageId(),
    type: "message",
    role: "assistant",
    content: [{ type: "text", text: text || "" }],
    model: req.model,
    stop_reason: claudeStopReason,
    stop_sequence: null,
    usage: {
      input_tokens: 0,
      output_tokens: 0,
    },
  };
}

export async function* handleClaudeMessagesStreaming(
  req: ClaudeMessagesRequest,
  bridge: AcpBridge,
): AsyncGenerator<ClaudeStreamEvent> {
  const chatMessages = claudeMessagesToChatMessages(req);
  const messageId = makeMessageId();

  // message_start
  yield {
    type: "message_start",
    message: {
      id: messageId,
      type: "message",
      role: "assistant",
      content: [],
      model: req.model,
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 0, output_tokens: 0 },
    },
  };

  // content_block_start
  yield {
    type: "content_block_start",
    index: 0,
    content_block: { type: "text", text: "" },
  };

  // Stream text deltas
  for await (const chunk of bridge.streamPrompt(chatMessages)) {
    if (chunk.type === "text" && chunk.text) {
      yield {
        type: "content_block_delta",
        index: 0,
        delta: { type: "text_delta", text: chunk.text },
      };
    } else if (chunk.type === "done") {
      // content_block_stop
      yield { type: "content_block_stop", index: 0 };

      // message_delta
      const stopReason = chunk.stopReason === "max_tokens" ? "max_tokens" : "end_turn";
      yield {
        type: "message_delta",
        delta: { stop_reason: stopReason, stop_sequence: null },
        usage: { output_tokens: 0 },
      };

      // message_stop
      yield { type: "message_stop" };
    }
  }
}
