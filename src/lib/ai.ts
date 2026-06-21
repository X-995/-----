import { fetch } from "@tauri-apps/plugin-http";
import { AISettings, ExtractionTemplate } from "../types";

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

// ─── Material library helpers ────────────────────────────────────────────────

export interface SemanticMatch {
  path: string;
  reason: string;
}

/** Semantic search: rank local materials by relevance to a natural-language query. */
export async function semanticSearch(
  settings: AISettings,
  query: string,
  materials: { path: string; title: string; summary: string; body: string }[]
): Promise<SemanticMatch[]> {
  if (!materials.length) return [];
  const MAX = 80;
  const corpus = materials.slice(0, MAX).map((m, i) =>
    `[${i}] 路径:${m.path}\n标题:${m.title}\n摘要:${m.summary || m.body.slice(0, 150)}`
  );
  const result = await chatJSON<{ matches: { index: number; reason: string }[] }>(
    settings,
    [
      {
        role: "system",
        content:
          "你是小说创作助手，请根据用户的查询语义，从素材列表中找出最相关的条目（最多8条），按相关性从高到低排列。",
      },
      {
        role: "user",
        content: `查询：${query}\n\n素材列表（共${corpus.length}条）：\n${corpus.join("\n\n")}\n\n请输出JSON：{"matches":[{"index":数字,"reason":"一句话相关理由"}]}`,
      },
    ],
    { temperature: 0.3 }
  );
  return (result.matches || []).map((m) => ({
    path: materials[m.index]?.path ?? "",
    reason: m.reason,
  })).filter((m) => m.path);
}

export interface QAResult {
  answer: string;
  refs: { path: string; title: string }[];
}

/** Q&A search: answer a question by synthesizing content from local materials. */
export async function materialQA(
  settings: AISettings,
  question: string,
  materials: { path: string; title: string; summary: string; body: string }[]
): Promise<QAResult> {
  if (!materials.length) return { answer: "素材库为空。", refs: [] };
  const MAX = 60;
  const corpus = materials.slice(0, MAX).map((m, i) =>
    `[${i}] 标题:${m.title}\n内容:${(m.summary || m.body).slice(0, 200)}`
  );
  const result = await chatJSON<{ answer: string; refs: number[] }>(
    settings,
    [
      {
        role: "system",
        content:
          "你是小说创作助手，请根据用户的问题，综合素材库中的内容给出完整的回答，并指出引用了哪些素材条目。",
      },
      {
        role: "user",
        content: `问题：${question}\n\n素材库（共${corpus.length}条）：\n${corpus.join("\n\n")}\n\n请输出JSON：{"answer":"完整的综合答案","refs":[引用的索引数字]}`,
      },
    ],
    { temperature: 0.5 }
  );
  return {
    answer: result.answer || "",
    refs: (result.refs || [])
      .map((i: number) => materials[i])
      .filter(Boolean)
      .map((m) => ({ path: m.path, title: m.title })),
  };
}

/** Ask AI to suggest better search keywords for a natural-language query. */
export async function suggestSearchTerms(
  settings: AISettings,
  description: string
): Promise<string[]> {
  const result = await chatJSON<{ terms: string[] }>(settings, [
    {
      role: "system",
      content:
        "你是搜索优化助手，请把用户的自然语言描述转化为2-3个最适合用于网络搜索的关键词组合。",
    },
    {
      role: "user",
      content: `用户描述：${description}\n\n请输出JSON：{"terms":["关键词组合1","关键词组合2"]}`,
    },
  ]);
  return result.terms || [];
}

/** Synthesize multiple search results into a single structured note. */
export async function synthesizeResults(
  settings: AISettings,
  query: string,
  results: { title: string; snippet: string; url: string }[]
): Promise<string> {
  const ctx = results
    .slice(0, 5)
    .map((r) => `【${r.title}】\n${r.snippet}\n来源: ${r.url}`)
    .join("\n\n");
  return chat(
    settings,
    [
      {
        role: "system",
        content:
          "你是小说创作助手，请把多条搜索结果综合整理为一篇结构清晰的创作参考笔记，保留关键细节，去除重复内容。",
      },
      {
        role: "user",
        content: `查询主题：${query}\n\n搜索结果：\n${ctx}\n\n请输出一篇Markdown格式的笔记。`,
      },
    ],
    { temperature: 0.4 }
  );
}

/** Build a structured summary prompt based on a category's extraction template. */
export function buildTemplatePrompt(
  body: string,
  template: ExtractionTemplate | undefined
): string {
  if (!template || !template.dimensions.length) {
    return `请用2-3句话概括以下素材，并另起一行给出3-5个逗号分隔标签：\n\n${body}`;
  }
  const dimList = template.dimensions.map((d) => `- ${d.label}`).join("\n");
  return `请按以下维度提取素材的关键信息，每个维度用"**维度名**：内容"格式输出，最后另起一行给出3-5个逗号分隔标签：\n\n维度：\n${dimList}\n\n素材内容：\n${body}`;
}

// ─────────────────────────────────────────────────────────────────────────────

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
