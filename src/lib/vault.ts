import {
  ensureDir,
  joinPath,
  listDir,
  readTextFile,
  stemName,
  writeTextFile,
  deletePath,
} from "./fs";
import { parseFrontmatter, stringifyFrontmatter } from "./frontmatter";
import {
  BaseEntity,
  Chapter,
  Character,
  DEFAULT_DIRS,
  EntityType,
  Material,
  PlotEvent,
  Plotline,
  ProjectDirs,
  Worldview,
} from "../types";

export function projectDirs(vaultPath: string, dirs: ProjectDirs) {
  const root = joinPath(vaultPath, dirs.root);
  return {
    rootAbs: root,
    characters: joinPath(root, dirs.characters),
    plotlines: joinPath(root, dirs.plotlines),
    events: joinPath(root, dirs.events),
    chapters: joinPath(root, dirs.chapters),
    materials: joinPath(root, dirs.materials),
    worldview: joinPath(root, dirs.worldview ?? "世界观"),
  };
}

export async function ensureProject(vaultPath: string, dirs: ProjectDirs) {
  const p = projectDirs(vaultPath, dirs);
  await ensureDir(p.characters);
  await ensureDir(p.plotlines);
  await ensureDir(p.events);
  await ensureDir(p.chapters);
  await ensureDir(p.materials);
  await ensureDir(p.worldview);
  return p;
}

function typeOfPath(
  rel: string,
  data: Record<string, any>,
  dirs: ProjectDirs
): EntityType | null {
  if (data && typeof data.type === "string") {
    const t = data.type as EntityType;
    if (
      ["character", "plotline", "event", "chapter", "material", "worldview"].includes(t)
    )
      return t;
  }
  const segs = rel.split("/");
  if (segs.includes(dirs.characters)) return "character";
  if (segs.includes(dirs.plotlines)) return "plotline";
  if (segs.includes(dirs.events)) return "event";
  if (segs.includes(dirs.chapters)) return "chapter";
  if (segs.includes(dirs.materials)) return "material";
  if (segs.includes(dirs.worldview ?? "世界观")) return "worldview";
  return null;
}

function toArray(v: any): string[] {
  if (v === undefined || v === null) return [];
  if (Array.isArray(v)) return v.map((x) => String(x));
  return String(v)
    .split(/[,，;；]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function buildEntity(
  path: string,
  rel: string,
  raw: string,
  type: EntityType
): BaseEntity {
  const { data, body } = parseFrontmatter(raw);
  const id = stemName(path);
  const base: BaseEntity = { path, rel, id, type, body, data };

  switch (type) {
    case "character":
      return {
        ...base,
        type,
        name: data.name || id,
        aliases: toArray(data.aliases),
        role: data.role || "",
        tags: toArray(data.tags),
        color: data.color || "#8b5cf6",
        relations: Array.isArray(data.relations) ? data.relations : [],
      } as Character;
    case "plotline":
      return {
        ...base,
        type,
        name: data.name || id,
        color: data.color || "#3b82f6",
        description: data.description || "",
      } as Plotline;
    case "event":
      return {
        ...base,
        type,
        title: data.title || id,
        order: Number(data.order ?? 0),
        date: data.date,
        plotline: data.plotline,
        characters: toArray(data.characters),
        chapter: data.chapter,
        summary: data.summary || "",
      } as PlotEvent;
    case "chapter":
      return {
        ...base,
        type,
        title: data.title || id,
        index: Number(data.index ?? 0),
        summary: data.summary || "",
        characters: toArray(data.characters),
        matrix:
          data.matrix && typeof data.matrix === "object" ? data.matrix : {},
        matrixNotes:
          data.matrixNotes && typeof data.matrixNotes === "object"
            ? data.matrixNotes
            : {},
        beats: Array.isArray(data.beats) ? data.beats : [],
      } as Chapter;
    case "material":
      return {
        ...base,
        type,
        title: data.title || id,
        source: data.source || "",
        url: data.url || "",
        tags: toArray(data.tags),
        summary: data.summary || "",
        category: data.category || "",
      } as Material;
    case "worldview":
      return {
        ...base,
        type,
        title: data.title || id,
        category: data.category || "其他设定",
        tags: toArray(data.tags),
        summary: data.summary || "",
      } as Worldview;
  }
}

export interface VaultData {
  characters: Character[];
  plotlines: Plotline[];
  events: PlotEvent[];
  chapters: Chapter[];
  materials: Material[];
  worldviews: Worldview[];
}

export async function scanVault(
  vaultPath: string,
  dirs: ProjectDirs
): Promise<VaultData> {
  const root = joinPath(vaultPath, dirs.root);
  const files = await listDir(root, ["md"]);
  const result: VaultData = {
    characters: [],
    plotlines: [],
    events: [],
    chapters: [],
    materials: [],
    worldviews: [],
  };
  for (const f of files) {
    if (f.is_dir) continue;
    const type = typeOfPath(f.rel, {}, dirs);
    if (!type) continue;
    let raw = "";
    try {
      raw = await readTextFile(f.path);
    } catch {
      continue;
    }
    const { data } = parseFrontmatter(raw);
    const finalType = typeOfPath(f.rel, data, dirs) || type;
    const entity = buildEntity(f.path, f.rel, raw, finalType);
    switch (finalType) {
      case "character":
        result.characters.push(entity as Character);
        break;
      case "plotline":
        result.plotlines.push(entity as Plotline);
        break;
      case "event":
        result.events.push(entity as PlotEvent);
        break;
      case "chapter":
        result.chapters.push(entity as Chapter);
        break;
      case "material":
        result.materials.push(entity as Material);
        break;
      case "worldview":
        result.worldviews.push(entity as Worldview);
        break;
    }
  }
  result.events.sort((a, b) => a.order - b.order);
  result.chapters.sort((a, b) => a.index - b.index);
  return result;
}

/** Sanitize a string for use as a file name. */
export function safeFileName(name: string): string {
  return (name || "未命名")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}

export async function writeEntity(
  data: Record<string, any>,
  body: string,
  filePath: string
) {
  const content = stringifyFrontmatter(data, body);
  await writeTextFile(filePath, content);
}

export async function deleteEntity(filePath: string) {
  await deletePath(filePath);
}

/** Build the frontmatter data object for an entity for writing. */
export function characterData(c: Partial<Character>): Record<string, any> {
  return {
    type: "character",
    name: c.name,
    aliases: c.aliases,
    role: c.role,
    tags: c.tags,
    color: c.color,
    relations: c.relations,
  };
}

export function plotlineData(p: Partial<Plotline>): Record<string, any> {
  return {
    type: "plotline",
    name: p.name,
    color: p.color,
    description: p.description,
  };
}

export function eventData(e: Partial<PlotEvent>): Record<string, any> {
  return {
    type: "event",
    title: e.title,
    order: e.order,
    date: e.date,
    plotline: e.plotline,
    characters: e.characters,
    chapter: e.chapter,
    summary: e.summary,
  };
}

export function chapterData(c: Partial<Chapter>): Record<string, any> {
  return {
    type: "chapter",
    title: c.title,
    index: c.index,
    summary: c.summary,
    characters: c.characters,
    matrix: c.matrix,
    matrixNotes: c.matrixNotes,
    beats: c.beats,
  };
}

export function materialData(m: Partial<Material>): Record<string, any> {
  return {
    type: "material",
    title: m.title,
    source: m.source,
    url: m.url,
    tags: m.tags,
    summary: m.summary,
    category: m.category,
  };
}

export function worldviewData(w: Partial<Worldview>): Record<string, any> {
  return {
    type: "worldview",
    title: w.title,
    category: w.category,
    tags: w.tags,
    summary: w.summary,
  };
}

// Keep DEFAULT_DIRS accessible from vault module
export { DEFAULT_DIRS };
