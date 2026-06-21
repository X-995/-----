export type EntityType =
  | "character"
  | "plotline"
  | "event"
  | "chapter"
  | "material"
  | "worldview";

export interface BaseEntity {
  /** absolute path on disk */
  path: string;
  /** path relative to vault root */
  rel: string;
  /** file name without extension */
  id: string;
  type: EntityType;
  body: string;
  /** raw frontmatter object */
  data: Record<string, any>;
  mtime?: number;
}

export interface Relation {
  target: string;
  type: string;
  desc?: string;
}

export interface Character extends BaseEntity {
  type: "character";
  name: string;
  aliases: string[];
  role: string;
  tags: string[];
  color: string;
  relations: Relation[];
}

export interface Plotline extends BaseEntity {
  type: "plotline";
  name: string;
  color: string;
  description: string;
}

export interface PlotEvent extends BaseEntity {
  type: "event";
  title: string;
  order: number;
  date?: string;
  plotline?: string;
  characters: string[];
  chapter?: string;
  summary: string;
}

export interface Beat {
  name: string;
  content: string;
}

export interface Chapter extends BaseEntity {
  type: "chapter";
  title: string;
  index: number;
  summary: string;
  characters: string[];
  /** dimensionKey -> score 1..5 */
  matrix: Record<string, number>;
  matrixNotes: Record<string, string>;
  beats: Beat[];
}

export interface Material extends BaseEntity {
  type: "material";
  title: string;
  source: string;
  url: string;
  tags: string[];
  summary: string;
  /** user-defined category, e.g. "事件" | "技巧" | "资料" | "灵感" | "设定" */
  category: string;
}

export interface Worldview extends BaseEntity {
  type: "worldview";
  title: string;
  category: string;
  tags: string[];
  summary: string;
}

export interface MatrixDimension {
  key: string;
  label: string;
  desc: string;
}

export const DEFAULT_MATRIX_DIMENSIONS: MatrixDimension[] = [
  { key: "mainline", label: "主线推进", desc: "本章对核心主线的推进程度" },
  { key: "arc", label: "人物弧光", desc: "角色成长/转变的体现" },
  { key: "conflict", label: "冲突强度", desc: "矛盾与对抗的激烈程度" },
  { key: "foreshadow", label: "伏笔铺垫", desc: "埋设或回收伏笔" },
  { key: "emotion", label: "情绪张力", desc: "情感冲击与代入感" },
  { key: "pace", label: "节奏快慢", desc: "叙事节奏（5=快, 1=慢）" },
  { key: "info", label: "信息释放", desc: "向读者释放的新信息量" },
];

// Keep for backward-compat imports
export const MATRIX_DIMENSIONS = DEFAULT_MATRIX_DIMENSIONS;

export const DEFAULT_BEATS = ["开头钩子", "情境推进", "转折/高潮", "收尾留扣"];

export const DEFAULT_MATERIAL_CATEGORIES = ["事件", "技巧", "资料", "灵感", "设定"];
export const DEFAULT_WORLDVIEW_CATEGORIES = ["地理", "势力", "历史", "种族", "力量体系", "其他设定"];

export interface AISettings {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface SearchSettings {
  provider: "tavily" | "bing" | "serpapi";
  apiKey: string;
}

export interface ProjectDirs {
  root: string;
  characters: string;
  plotlines: string;
  events: string;
  chapters: string;
  materials: string;
  worldview: string;
}

export const DEFAULT_DIRS: ProjectDirs = {
  root: "小说项目",
  characters: "角色",
  plotlines: "剧情线",
  events: "事件",
  chapters: "章节",
  materials: "素材库",
  worldview: "世界观",
};
