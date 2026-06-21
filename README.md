# 小说创作助手

一个可与 Obsidian 联动的 Windows 桌面应用，辅助小说创作。所有数据以 **Markdown + YAML frontmatter** 形式直接存储在你的 Obsidian vault 中，本应用与 Obsidian 可同时编辑、自动双向同步。

## 功能

- **Obsidian 联动**：选择一个 vault 文件夹，自动创建项目目录结构；Rust 文件监听实现改动后自动刷新（双向同步）。
- **EPUB 导入解析**：解析电子书的目录、章节、元数据与封面，可按章导入为「章节」或「参考素材」。
- **素材库**：本地文件导入、手动新建，以及联网搜索（Tavily / Bing / SerpAPI，自带 Key），并支持 AI 自动摘要与打标签。
- **人物关系可视化**：基于 React Flow 的关系图谱，节点为人物、连线为关系，可拖拽布局（自动保存）、按标签筛选、增删改。
- **剧情线 / 时间轴**：基于 vis-timeline 的多线并行时间轴，事件可拖拽调序、改变所属剧情线。
- **剧情矩阵（单章多维分析）**：对单章在「主线推进 / 人物弧光 / 冲突 / 伏笔 / 情绪 / 节奏 / 信息释放」等维度打分并备注，配雷达图；全书概览提供「章节 × 维度」热力图与节奏曲线。
- **线性分析（单章构思拆解）**：把单章拆成线性节拍（开头钩子 → 推进 → 转折 → 收尾），梳理「这一章是如何构思的」。
- **AI 助手（BYOK）**：自带 API Key，支持 OpenAI / DeepSeek / 智谱 GLM / Moonshot 等 OpenAI 兼容接口；可用于矩阵评分、构思拆解、素材整理。

## 技术栈

- Tauri 2（Rust）+ React 19 + TypeScript + Vite
- Tailwind CSS、Zustand、React Router
- 可视化：`@xyflow/react`（关系图）、`vis-timeline`（时间轴）、`echarts`（图表）
- 解析：`jszip` + `DOMParser`（EPUB）、`js-yaml`（frontmatter）
- 后端命令：文件读写 / 目录扫描 / 文件监听（`notify`）/ 对话框 / HTTP

## Vault 数据结构

在所选 vault 下创建可配置的项目根目录（默认 `小说项目/`）：

```
小说项目/
  角色/      <人物>.md     # frontmatter: name, aliases, role, tags, color, relations[], x, y
  剧情线/    <线>.md       # frontmatter: name, color, description
  事件/      <事件>.md     # frontmatter: title, order, plotline, characters[], chapter
  章节/      <章节>.md     # frontmatter: title, index, summary, matrix{}, matrixNotes{}, beats[]
  素材库/    <素材>.md     # frontmatter: title, source, url, tags[], summary
```

每个文件正文即笔记内容，可被 Obsidian 直接打开、编辑、双链。

## 开发与运行

前置：Node.js、Rust 工具链、Windows 上的 WebView2。

```bash
npm install
npm run tauri dev      # 启动开发模式
npm run tauri build    # 打包 Windows 安装包 (MSI / NSIS)
```

## 首次使用

1. 打开应用 → 进入「设置」。
2. 选择你的 Obsidian vault 文件夹，点击「初始化并连接」。
3. （可选）填写 AI 服务商与 API Key、联网搜索 API Key。
4. 开始在各模块创作；所有改动会写回 vault 的 `.md` 文件，Obsidian 中即时可见。
