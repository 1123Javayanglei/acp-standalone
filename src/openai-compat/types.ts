/** OpenAI-compatible API request/response types. */

export type ChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  name?: string;
  tool_calls?: ToolCallMessage[];
  tool_call_id?: string;
};

export type ToolCallMessage = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type ToolDefinition = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, unknown>;
  };
};

export type ChatCompletionRequest = {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  tools?: ToolDefinition[];
  tool_choice?: "none" | "auto" | "required" | { type: "function"; function: { name: string } };
  stop?: string | string[];
};

export type ChatCompletionChoice = {
  index: number;
  message: ChatMessage;
  finish_reason: "stop" | "length" | "tool_calls" | null;
};

export type ChatCompletionUsage = {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
};

export type ChatCompletionResponse = {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage: ChatCompletionUsage;
};

export type ChatCompletionChunkDelta = {
  role?: "assistant";
  content?: string | null;
  tool_calls?: ChunkToolCall[];
};

export type ChunkToolCall = {
  index: number;
  id?: string;
  type?: "function";
  function?: {
    name?: string;
    arguments?: string;
  };
};

export type ChatCompletionChunkChoice = {
  index: number;
  delta: ChatCompletionChunkDelta;
  finish_reason: "stop" | "length" | "tool_calls" | null;
};

export type ChatCompletionChunk = {
  id: string;
  object: "chat.completion.chunk";
  created: number;
  model: string;
  choices: ChatCompletionChunkChoice[];
};

export type ModelObject = {
  id: string;
  object: "model";
  created: number;
  owned_by: string;
};

export type ModelsResponse = {
  object: "list";
  data: ModelObject[];
};

// --- Claude (Anthropic) API Types ---

export type ClaudeContentBlock =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

export type ClaudeMessage = {
  role: "user" | "assistant";
  content: string | ClaudeContentBlock[];
};

export type ClaudeMessagesRequest = {
  model: string;
  messages: ClaudeMessage[];
  system?: string;
  max_tokens: number;
  stream?: boolean;
  temperature?: number;
  top_p?: number;
  stop_sequences?: string[];
  metadata?: { user_id?: string };
};

export type ClaudeResponseContentBlock = {
  type: "text";
  text: string;
};

export type ClaudeUsage = {
  input_tokens: number;
  output_tokens: number;
};

export type ClaudeMessagesResponse = {
  id: string;
  type: "message";
  role: "assistant";
  content: ClaudeResponseContentBlock[];
  model: string;
  stop_reason: "end_turn" | "max_tokens" | "stop_sequence" | null;
  stop_sequence: string | null;
  usage: ClaudeUsage;
};

// Claude streaming event types
export type ClaudeStreamEvent =
  | { type: "message_start"; message: ClaudeMessagesResponse }
  | { type: "content_block_start"; index: number; content_block: { type: "text"; text: string } }
  | { type: "content_block_delta"; index: number; delta: { type: "text_delta"; text: string } }
  | { type: "content_block_stop"; index: number }
  | { type: "message_delta"; delta: { stop_reason: string | null; stop_sequence: string | null }; usage: { output_tokens: number } }
  | { type: "message_stop" };

