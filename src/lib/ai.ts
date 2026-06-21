import { fetch } from "@tauri-apps/plugin-http";
import { AISettings } from "../types";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export const AI_PROVIDERS: Record<
  string,
  { label: string; baseUrl: string; model: string }
> = {
  openai: { label: "OpenAI", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  deepseek: { label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  zhipu: {
    label: "智谱 GLM",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-4-flash",
  },
  moonshot: { label: "Moonshot Kimi", baseUrl: "https://api.moonshot.cn/v1", model: "moonshot-v1-8k" },
  custom: { label: "自定义 (OpenAI 兼容)", baseUrl: "", model: "" },
};

export class AIError extends Error {}

/**
 * Call an OpenAI-compatible chat completion endpoint.
 */
export async function chat(
  settings: AISettings,
  messages: ChatMessage[],
  opts: { temperature?: number } = {}
): Promise<string> {
  if (!settings.apiKey) throw new AIError("未配置 API Key，请前往设置页填写。");
  if (!settings.baseUrl) throw new AIError("未配置 API 地址 (Base URL)。");
  const url = `${settings.baseUrl.replace(/\/$/, "")}/chat/completions`;

  const resp = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      model: settings.model,
      messages,
      temperature: opts.temperature ?? 0.7,
      stream: false,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    throw new AIError(`AI 请求失败 (${resp.status}): ${text.slice(0, 300)}`);
  }
  const json: any = await resp.json();
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new AIError("AI 返回内容为空或格式异常。");
  }
  return content.trim();
}

/** Ask the model and try to parse a JSON object/array from the reply. */
export async function chatJSON<T = any>(
  settings: AISettings,
  messages: ChatMessage[],
  opts: { temperature?: number } = {}
): Promise<T> {
  const raw = await chat(settings, messages, opts);
  return extractJSON<T>(raw);
}

export function extractJSON<T = any>(raw: string): T {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) text = fence[1].trim();
  // grab the first {...} or [...] block
  const start = text.search(/[[{]/);
  if (start > 0) text = text.slice(start);
  const lastCurly = text.lastIndexOf("}");
  const lastSquare = text.lastIndexOf("]");
  const end = Math.max(lastCurly, lastSquare);
  if (end >= 0) text = text.slice(0, end + 1);
  return JSON.parse(text) as T;
}
