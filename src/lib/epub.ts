import JSZip from "jszip";
import { readBinaryBase64 } from "./fs";

export interface EpubChapter {
  id: string;
  title: string;
  href: string;
  text: string;
  html: string;
}

export interface EpubBook {
  title: string;
  creator: string;
  language: string;
  publisher: string;
  description: string;
  coverDataUrl?: string;
  chapters: EpubChapter[];
}

function resolvePath(base: string, relative: string): string {
  if (relative.startsWith("/")) return relative.slice(1);
  const baseDir = base.includes("/") ? base.slice(0, base.lastIndexOf("/")) : "";
  const parts = (baseDir ? baseDir.split("/") : []).concat(relative.split("/"));
  const out: string[] = [];
  for (const part of parts) {
    if (part === "." || part === "") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return out.join("/");
}

function textFromHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc.querySelectorAll("script,style").forEach((el) => el.remove());
  const text = doc.body?.textContent || "";
  return text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n\n");
}

export async function parseEpub(filePath: string): Promise<EpubBook> {
  const b64 = await readBinaryBase64(filePath);
  const zip = await JSZip.loadAsync(b64, { base64: true });

  const containerXml = await zip.file("META-INF/container.xml")?.async("string");
  if (!containerXml) throw new Error("无效的 EPUB：缺少 container.xml");
  const container = new DOMParser().parseFromString(containerXml, "application/xml");
  const opfPath = container
    .querySelector("rootfile")
    ?.getAttribute("full-path");
  if (!opfPath) throw new Error("无效的 EPUB：找不到 OPF 文件");

  const opfXml = await zip.file(opfPath)?.async("string");
  if (!opfXml) throw new Error("无效的 EPUB：无法读取 OPF");
  const opf = new DOMParser().parseFromString(opfXml, "application/xml");

  const getMeta = (tag: string) =>
    opf.getElementsByTagName(`dc:${tag}`)[0]?.textContent?.trim() ||
    opf.querySelector(tag)?.textContent?.trim() ||
    "";

  const book: EpubBook = {
    title: getMeta("title") || "未命名书籍",
    creator: getMeta("creator"),
    language: getMeta("language"),
    publisher: getMeta("publisher"),
    description: getMeta("description"),
    chapters: [],
  };

  // manifest: id -> {href, mediaType, properties}
  const manifest: Record<string, { href: string; type: string; props: string }> = {};
  opf.querySelectorAll("manifest > item").forEach((item) => {
    const id = item.getAttribute("id") || "";
    manifest[id] = {
      href: item.getAttribute("href") || "",
      type: item.getAttribute("media-type") || "",
      props: item.getAttribute("properties") || "",
    };
  });

  // cover image
  try {
    let coverId = opf
      .querySelector('metadata > meta[name="cover"]')
      ?.getAttribute("content");
    if (!coverId) {
      coverId = Object.keys(manifest).find((id) =>
        manifest[id].props.includes("cover-image")
      );
    }
    if (coverId && manifest[coverId]) {
      const coverPath = resolvePath(opfPath, manifest[coverId].href);
      const coverFile = zip.file(coverPath);
      if (coverFile) {
        const data = await coverFile.async("base64");
        book.coverDataUrl = `data:${manifest[coverId].type};base64,${data}`;
      }
    }
  } catch {
    /* cover optional */
  }

  // build TOC title map (from nav or ncx)
  const titleMap = await buildTitleMap(zip, opf, manifest, opfPath);

  // spine order
  const spineItems = Array.from(opf.querySelectorAll("spine > itemref"));
  let counter = 0;
  for (const ref of spineItems) {
    const idref = ref.getAttribute("idref") || "";
    const item = manifest[idref];
    if (!item || !/html|xml/.test(item.type)) continue;
    const path = resolvePath(opfPath, item.href);
    const file = zip.file(path);
    if (!file) continue;
    const html = await file.async("string");
    const text = textFromHtml(html);
    if (!text.trim()) continue;
    counter++;
    const title =
      titleMap[path] ||
      titleMap[item.href] ||
      firstHeading(html) ||
      `章节 ${counter}`;
    book.chapters.push({
      id: idref,
      title,
      href: item.href,
      text,
      html,
    });
  }

  return book;
}

function firstHeading(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const h = doc.querySelector("h1,h2,h3,title");
  return h?.textContent?.trim() || "";
}

async function buildTitleMap(
  zip: JSZip,
  opf: Document,
  manifest: Record<string, { href: string; type: string; props: string }>,
  opfPath: string
): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  // EPUB3 nav
  const navId = Object.keys(manifest).find((id) =>
    manifest[id].props.includes("nav")
  );
  if (navId) {
    const navPath = resolvePath(opfPath, manifest[navId].href);
    const navHtml = await zip.file(navPath)?.async("string");
    if (navHtml) {
      const doc = new DOMParser().parseFromString(navHtml, "text/html");
      doc.querySelectorAll("nav a").forEach((a) => {
        const href = (a.getAttribute("href") || "").split("#")[0];
        if (href) map[resolvePath(navPath, href)] = a.textContent?.trim() || "";
      });
    }
  }
  // EPUB2 ncx
  const ncxId =
    opf.querySelector("spine")?.getAttribute("toc") ||
    Object.keys(manifest).find((id) => manifest[id].type.includes("ncx"));
  if (ncxId && manifest[ncxId]) {
    const ncxPath = resolvePath(opfPath, manifest[ncxId].href);
    const ncxXml = await zip.file(ncxPath)?.async("string");
    if (ncxXml) {
      const doc = new DOMParser().parseFromString(ncxXml, "application/xml");
      doc.querySelectorAll("navPoint").forEach((np) => {
        const label = np.querySelector("navLabel > text")?.textContent?.trim();
        const src = np.querySelector("content")?.getAttribute("src")?.split("#")[0];
        if (label && src) map[resolvePath(ncxPath, src)] = label;
      });
    }
  }
  return map;
}
