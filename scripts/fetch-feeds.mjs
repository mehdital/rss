import fs from "fs";
import path from "path";
import Parser from "rss-parser";

const parser = new Parser({
  timeout: 20000,
  headers: { "User-Agent": "veille-rss-dashboard/1.0 (GitHub Actions)" }
});

const ROOT = process.cwd();
const feedsPath = path.join(ROOT, "feeds.json");
const outEntries = path.join(ROOT, "docs", "data", "entries.json");
const outFeeds = path.join(ROOT, "docs", "data", "feeds.json");

function strip(html) {
  if (!html) return "";
  return String(html)
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
    .replace(/<\/?[^>]+(>|$)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toISO(d) {
  if (!d) return null;
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}

async function main() {
  const feeds = JSON.parse(fs.readFileSync(feedsPath, "utf-8"));
  fs.mkdirSync(path.dirname(outEntries), { recursive: true });

  const items = [];
  for (const f of feeds) {
    try {
      const feed = await parser.parseURL(f.url);
      for (const it of (feed.items || [])) {
        const url = it.link || it.url || "";
        const title = (it.title || "").trim();
        const publishedAt = toISO(it.isoDate || it.pubDate);
        const summary = strip(it.contentSnippet || it.content || "").slice(0, 320);

        items.push({
          id: it.guid || it.id || url || `${f.id}:${title}`,
          title,
          url,
          publishedAt,
          summary,
          sourceId: f.id,
          sourceName: f.name,
          tech: f.defaultTech || "Autre",
          tags: Array.isArray(it.categories) ? it.categories.slice(0, 12) : []
        });
      }
    } catch (e) {
      // On continue (une source peut tomber temporairement)
      console.error(`Feed error (${f.id}):`, e.message || e);
    }
  }

  // Dédoublonnage + tri
  const seen = new Set();
  const uniq = items.filter(i => {
    const key = i.url || i.id;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => (b.publishedAt || "").localeCompare(a.publishedAt || ""));

  fs.writeFileSync(outEntries, JSON.stringify({ generatedAt: new Date().toISOString(), items: uniq }, null, 2));
  fs.writeFileSync(outFeeds, JSON.stringify(feeds, null, 2));

  console.log(`Generated ${uniq.length} items`);
}

main();
