import yaml from "js-yaml";

export interface ParsedDoc {
  data: Record<string, any>;
  body: string;
}

const FM_RE = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

export function parseFrontmatter(raw: string): ParsedDoc {
  const match = raw.match(FM_RE);
  if (!match) {
    return { data: {}, body: raw };
  }
  let data: Record<string, any> = {};
  try {
    const parsed = yaml.load(match[1]);
    if (parsed && typeof parsed === "object") {
      data = parsed as Record<string, any>;
    }
  } catch {
    data = {};
  }
  return { data, body: match[2] ?? "" };
}

export function stringifyFrontmatter(
  data: Record<string, any>,
  body: string
): string {
  const clean = pruneEmpty(data);
  const hasData = clean && Object.keys(clean).length > 0;
  const yamlStr = hasData
    ? yaml.dump(clean, { lineWidth: -1, noRefs: true, skipInvalid: true })
    : "";
  const front = hasData ? `---\n${yamlStr}---\n\n` : "";
  return `${front}${body ?? ""}`;
}

/** Remove undefined / null / empty-string / empty-array values to keep files tidy. */
function pruneEmpty(obj: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}
