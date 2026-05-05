# ACP Standalone

基于 [Agent Client Protocol (ACP)](https://agentclientprotocol.com/) 的独立运行时，核心功能是将 ACP 智能体暴露为 OpenAI / Claude 兼容的 HTTP API，供本机其他项目调用。

## 系统要求

- Node.js >= 22
- [qodercli](https://qoder.com) 已安装并可用（提供 ACP 智能体后端）

## 安装

```bash
npm install
```

## 架构

```
其他项目 (HTTP/OpenAI SDK/Claude SDK)
        │
        ▼
API server (:8965)              ← 本项目提供
        │
        ▼ (ACP 协议, stdio ndjson)
qodercli --acp                  ← Qoder CLI 提供的 ACP 智能体
```

本项目启动一个 HTTP 服务器，对外同时提供 OpenAI API 和 Claude API 接口。内部通过 ACP 协议与 `qodercli --acp` 子进程通信，将请求转发给实际的 AI Agent。

## 快速开始

### 启动服务

```bash
npx tsx src/openai-compat/server.ts
```

服务默认监听 `http://127.0.0.1:8965`。

### 启动参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--port, -p` | 监听端口 | 8965 |
| `--host, -H` | 监听地址 | 127.0.0.1 |
| `--api-key` | API Key 认证（Bearer Token 或 x-api-key） | 无（不校验） |
| `--server-command` | ACP 服务端命令 | qodercli |
| `--server-args` | ACP 服务端参数（空格分隔） | --acp |
| `--cwd` | 工作目录 | 当前目录 |
| `--verbose, -v` | 输出详细日志到 stderr | 关闭 |

### 示例

```bash
# 基本启动
npx tsx src/openai-compat/server.ts

# 自定义端口 + 详细日志
npx tsx src/openai-compat/server.ts --port 9000 --verbose

# 带 API Key 认证
npx tsx src/openai-compat/server.ts --api-key sk-my-secret-key

# 指定工作目录
npx tsx src/openai-compat/server.ts --cwd /path/to/my/project
```

## API 端点

### POST /v1/chat/completions

标准 OpenAI Chat Completions 接口，支持流式和非流式。

**请求示例（流式）：**

```bash
curl http://127.0.0.1:8965/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "acp-agent",
    "messages": [{"role": "user", "content": "Hello"}],
    "stream": true
  }'
```

**请求示例（非流式）：**

```bash
curl http://127.0.0.1:8965/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "acp-agent",
    "messages": [{"role": "user", "content": "What is 2+2?"}]
  }'
```

**带 API Key：**

```bash
curl http://127.0.0.1:8965/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer sk-my-secret-key" \
  -d '{
    "model": "acp-agent",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

### POST /v1/messages

Anthropic Claude Messages API 接口，支持流式和非流式。认证使用 `x-api-key` header。

**请求示例（非流式）：**

```bash
curl http://127.0.0.1:8965/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: any" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "acp-agent",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "What is 2+2?"}]
  }'
```

**请求示例（流式）：**

```bash
curl http://127.0.0.1:8965/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: any" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "acp-agent",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello"}],
    "stream": true
  }'
```

**带 system prompt：**

```bash
curl http://127.0.0.1:8965/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: any" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "acp-agent",
    "max_tokens": 1024,
    "system": "You are a helpful assistant that speaks Chinese.",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

### GET /v1/models

返回可用模型列表。

```bash
curl http://127.0.0.1:8965/v1/models
```

### GET /health

健康检查。

```bash
curl http://127.0.0.1:8965/health
```

## 在其他项目中使用

任何支持 OpenAI API 或 Claude API 的客户端库都可以直接对接：

### Python (openai)

```python
from openai import OpenAI

client = OpenAI(
    base_url="http://127.0.0.1:8965/v1",
    api_key="any",  # 未设置 --api-key 时随意填写
)

response = client.chat.completions.create(
    model="acp-agent",
    messages=[{"role": "user", "content": "帮我写一个 hello world"}],
    stream=True,
)

for chunk in response:
    if chunk.choices[0].delta.content:
        print(chunk.choices[0].delta.content, end="")
```

### Node.js (openai)

```typescript
import OpenAI from "openai";

const client = new OpenAI({
  baseURL: "http://127.0.0.1:8965/v1",
  apiKey: "any",
});

const stream = await client.chat.completions.create({
  model: "acp-agent",
  messages: [{ role: "user", content: "帮我写一个 hello world" }],
  stream: true,
});

for await (const chunk of stream) {
  process.stdout.write(chunk.choices[0]?.delta?.content || "");
}
```

### curl

```bash
curl http://127.0.0.1:8965/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"acp-agent","messages":[{"role":"user","content":"Hello"}]}'
```

### Python (anthropic)

```python
from anthropic import Anthropic

client = Anthropic(
    base_url="http://127.0.0.1:8965",
    api_key="any",  # 未设置 --api-key 时随意填写
)

message = client.messages.create(
    model="acp-agent",
    max_tokens=1024,
    messages=[{"role": "user", "content": "帮我写一个 hello world"}],
)
print(message.content[0].text)
```

### Node.js (anthropic)

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  baseURL: "http://127.0.0.1:8965",
  apiKey: "any",
});

const stream = client.messages.stream({
  model: "acp-agent",
  max_tokens: 1024,
  messages: [{ role: "user", content: "帮我写一个 hello world" }],
});

for await (const event of stream) {
  if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
    process.stdout.write(event.delta.text);
  }
}
```

## 开发

```bash
# 类型检查
npm run check

# 构建验证（仅类型检查，不输出文件）
npm run build
```

## 项目结构

```
src/
├── openai-compat/          # OpenAI/Claude 兼容 HTTP API 适配器
│   ├── server.ts           # HTTP 服务器 + CLI 入口
│   ├── handler.ts          # AcpBridge：ACP 客户端连接 + OpenAI 请求处理
│   ├── claude-handler.ts   # Claude Messages API 请求处理
│   └── types.ts            # OpenAI / Claude API 类型定义
├── acp/                    # ACP 协议核心
│   ├── runtime/            # ACP Runtime 接口定义与注册
│   ├── server.ts           # ACP 网关服务器
│   ├── client.ts           # ACP 交互式客户端
│   ├── translator.ts       # ACP ↔ Gateway 翻译层
│   ├── session.ts          # 会话存储
│   └── ...
├── gateway/                # Gateway WebSocket 客户端
├── config/                 # 运行时配置
├── infra/                  # 基础设施工具
└── index.ts                # 公共 API 导出
```
