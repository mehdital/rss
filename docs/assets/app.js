const DATA_URL = "data/entries.json";
const FEEDS_URL = "data/feeds.json";
const FAV_KEY = "veille_favs_v1";

// Mots-clés simples (tu peux enrichir)
const KEYWORDS = {
    Angular: [
        "angular", "signals", "rxjs", "standalone", "zone", "zoneless",
        "angular material", "cdk", "ngrx", "esbuild", "vite", "hydration", "ssr"
    ],
    Java: [
        "java", "jdk", "openjdk", "spring", "spring boot", "hibernate", "jpa",
        "maven", "gradle", "junit", "testcontainers", "micrometer", "tomcat"
    ]
};

const state = {
    feeds: [],
    allItems: [],
    items: [],
    favs: new Set(loadFavs()),
    filters: { q: "", tech: "ALL", source: "ALL", age: "ALL", onlyFav: false },
    generatedAt: null
};

function loadFavs() {
    try { return JSON.parse(localStorage.getItem(FAV_KEY) || "[]"); }
    catch { return []; }
}
function saveFavs() {
    localStorage.setItem(FAV_KEY, JSON.stringify([...state.favs]));
}

function textify(html) {
    if (!html) return "";
    return html
        .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, "")
        .replace(/<\/?[^>]+(>|$)/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function toISODate(d) {
    if (!d) return null;
    const dt = new Date(d);
    if (Number.isNaN(dt.getTime())) return null;
    return dt.toISOString();
}

function daysSince(iso) {
    if (!iso) return Infinity;
    const ms = Date.now() - new Date(iso).getTime();
    return ms / (1000 * 60 * 60 * 24);
}

function classifyTech(item) {
    // Priorité à la source si elle déclare une techno par défaut
    if (item.tech && item.tech !== "Autre") return item.tech;

    const hay = `${item.title || ""} ${item.summary || ""} ${(item.tags || []).join(" ")}`.toLowerCase();
    const score = { Angular: 0, Java: 0 };

    for (const kw of KEYWORDS.Angular) if (hay.includes(kw)) score.Angular++;
    for (const kw of KEYWORDS.Java) if (hay.includes(kw)) score.Java++;

    if (score.Angular === 0 && score.Java === 0) return "Autre";
    return score.Angular >= score.Java ? "Angular" : "Java";
}

function normalizeItem(raw) {
    const title = (raw.title || "").trim();
    const url = raw.url || raw.link || "";
    const summary = (raw.summary || raw.contentSnippet || raw.content || "").trim();
    const publishedAt = toISODate(raw.publishedAt || raw.isoDate || raw.pubDate || raw.date);

    const tags = Array.isArray(raw.tags) ? raw.tags : (Array.isArray(raw.categories) ? raw.categories : []);
    const sourceId = raw.sourceId || "unknown";
    const sourceName = raw.sourceName || sourceId;

    const base = {
        id: raw.id || raw.guid || raw.uid || url || `${sourceId}:${title}`,
        title,
        url,
        summary: textify(summary).slice(0, 320),
        publishedAt,
        sourceId,
        sourceName,
        tags: tags.map(t => String(t)).filter(Boolean).slice(0, 12),
        tech: raw.tech || raw.defaultTech || "Autre"
    };

    base.tech = classifyTech(base);
    return base;
}

function computeStats(items) {
    const total = items.length;
    const angular = items.filter(i => i.tech === "Angular").length;
    const java = items.filter(i => i.tech === "Java").length;
    const new7 = items.filter(i => daysSince(i.publishedAt) <= 7).length;
    return { total, angular, java, new7 };
}

function applyFilters() {
    const q = state.filters.q.toLowerCase().trim();
    const tech = state.filters.tech;
    const source = state.filters.source;
    const age = state.filters.age === "ALL" ? null : Number(state.filters.age);
    const onlyFav = state.filters.onlyFav;

    let items = [...state.allItems];

    if (onlyFav) items = items.filter(i => state.favs.has(i.id));
    if (tech !== "ALL") items = items.filter(i => i.tech === tech);
    if (source !== "ALL") items = items.filter(i => i.sourceId === source);

    if (age) items = items.filter(i => daysSince(i.publishedAt) <= age);

    if (q) {
        items = items.filter(i => {
            const hay = `${i.title} ${i.summary} ${i.sourceName} ${(i.tags || []).join(" ")}`.toLowerCase();
            return hay.includes(q);
        });
    }

    items.sort((a, b) => (b.publishedAt || "").localeCompare(a.publishedAt || ""));
    state.items = items;
}

function badgeClass(tech) {
    if (tech === "Angular") return "badge badge--angular";
    if (tech === "Java") return "badge badge--java";
    return "badge";
}

function fmtDate(iso) {
    if (!iso) return "date inconnue";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "date inconnue";
    return d.toLocaleDateString("fr-FR", { year: "numeric", month: "short", day: "2-digit" });
}

function renderSourcesSelect() {
    const sel = document.getElementById("source");
    // reset
    sel.innerHTML = `<option value="ALL">Source : Toutes</option>`;
    for (const f of state.feeds) {
        const opt = document.createElement("option");
        opt.value = f.id;
        opt.textContent = f.name;
        sel.appendChild(opt);
    }
    sel.value = state.filters.source;
}

function renderStats() {
    const stats = computeStats(state.allItems);
    document.getElementById("statTotal").textContent = String(stats.total);
    document.getElementById("statAngular").textContent = String(stats.angular);
    document.getElementById("statJava").textContent = String(stats.java);
    document.getElementById("statNew7").textContent = String(stats.new7);

    const meta = document.getElementById("metaInfo");
    const gen = state.generatedAt ? `Généré le ${fmtDate(state.generatedAt)}` : "Génération inconnue";
    meta.textContent = `${gen} — ${state.items.length} item(s) affiché(s)`;
}

function renderList() {
    const root = document.getElementById("list");
    root.innerHTML = "";

    if (state.items.length === 0) {
        root.innerHTML = `<div class="item"><div class="muted">Aucun item ne correspond aux filtres.</div></div>`;
        return;
    }

    for (const it of state.items) {
        const el = document.createElement("article");
        el.className = "item";

        const fav = state.favs.has(it.id);

        el.innerHTML = `
      <div class="item__top">
        <div class="item__title">
          <a href="${it.url}" target="_blank" rel="noreferrer">${escapeHtml(it.title || "(sans titre)")}</a>
        </div>
        <div class="badges">
          <span class="${badgeClass(it.tech)}">${it.tech}</span>
          <span class="badge">${escapeHtml(it.sourceName)}</span>
          <span class="badge">${fmtDate(it.publishedAt)}</span>
        </div>
      </div>
      <div class="item__summary">${escapeHtml(it.summary || "")}</div>
      <div class="item__actions">
        <button class="iconbtn" data-fav="${it.id}">${fav ? "★ Favori" : "☆ Ajouter"}</button>
        <button class="iconbtn" data-copy="${it.url}">Copier lien</button>
      </div>
    `;

        root.appendChild(el);
    }

    root.querySelectorAll("[data-fav]").forEach(btn => {
        btn.addEventListener("click", () => {
            const id = btn.getAttribute("data-fav");
            if (state.favs.has(id)) state.favs.delete(id);
            else state.favs.add(id);
            saveFavs();
            applyFilters();
            renderStats();
            renderList();
        });
    });

    root.querySelectorAll("[data-copy]").forEach(btn => {
        btn.addEventListener("click", async () => {
            const url = btn.getAttribute("data-copy");
            try { await navigator.clipboard.writeText(url); btn.textContent = "Copié"; }
            catch { btn.textContent = "Échec"; }
            setTimeout(() => (btn.textContent = "Copier lien"), 900);
        });
    });
}

function escapeHtml(s) {
    return String(s)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;")
        .replaceAll("'", "&#039;");
}

async function loadJson() {
    const [feedsRes, dataRes] = await Promise.all([fetch(FEEDS_URL), fetch(DATA_URL)]);
    if (!feedsRes.ok) throw new Error(`Impossible de charger ${FEEDS_URL}`);
    if (!dataRes.ok) throw new Error(`Impossible de charger ${DATA_URL}`);

    const feeds = await feedsRes.json();
    const data = await dataRes.json();

    state.feeds = feeds;
    state.generatedAt = data.generatedAt || null;

    const norm = (data.items || []).map(normalizeItem);
    // dédoublonnage (id)
    const seen = new Set();
    state.allItems = norm.filter(i => {
        const key = i.id || i.url;
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    applyFilters();
    renderSourcesSelect();
    renderStats();
    renderList();
}

function bindUI() {
    const q = document.getElementById("q");
    const tech = document.getElementById("tech");
    const source = document.getElementById("source");
    const age = document.getElementById("age");
    const onlyFav = document.getElementById("onlyFav");

    q.addEventListener("input", () => { state.filters.q = q.value; applyFilters(); renderStats(); renderList(); });
    tech.addEventListener("change", () => { state.filters.tech = tech.value; applyFilters(); renderStats(); renderList(); });
    source.addEventListener("change", () => { state.filters.source = source.value; applyFilters(); renderStats(); renderList(); });
    age.addEventListener("change", () => { state.filters.age = age.value; applyFilters(); renderStats(); renderList(); });
    onlyFav.addEventListener("change", () => { state.filters.onlyFav = onlyFav.checked; applyFilters(); renderStats(); renderList(); });

    document.getElementById("btnReload").addEventListener("click", async () => {
        await safeRun(loadJson);
    });

    document.getElementById("btnLive").addEventListener("click", async () => {
        await safeRun(liveFetchViaProxy);
    });
}

async function safeRun(fn) {
    const meta = document.getElementById("metaInfo");
    const old = meta.textContent;
    meta.textContent = "Chargement…";
    try { await fn(); }
    catch (e) {
        console.error(e);
        meta.textContent = `Erreur : ${e.message || e}`;
        setTimeout(() => (meta.textContent = old), 2500);
    }
}

/**
 * Optionnel : mode "Live" via proxy CORS.
 * Dépend d’un service externe, donc potentiellement instable.
 * Proxy utilisé : AllOrigins raw endpoint.
 */
async function liveFetchViaProxy() {
    if (!state.feeds.length) {
        const feedsRes = await fetch(FEEDS_URL);
        state.feeds = await feedsRes.json();
        renderSourcesSelect();
    }

    const all = [];
    for (const f of state.feeds) {
        const xml = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(f.url)}`).then(r => r.text());
        const items = parseRssOrAtom(xml).map(x => ({
            ...x,
            sourceId: f.id,
            sourceName: f.name,
            tech: f.defaultTech || "Autre"
        }));
        all.push(...items);
    }

    state.generatedAt = new Date().toISOString();
    const norm = all.map(normalizeItem);

    const seen = new Set();
    state.allItems = norm.filter(i => {
        const key = i.url || i.id;
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });

    applyFilters();
    renderStats();
    renderList();
}

function parseRssOrAtom(xmlText) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, "text/xml");

    // Atom
    if (doc.querySelector("feed")) {
        const entries = [...doc.querySelectorAll("feed > entry")];
        return entries.map(e => {
            const title = e.querySelector("title")?.textContent?.trim() || "";
            const linkEl = e.querySelector("link[rel='alternate']") || e.querySelector("link");
            const url = linkEl?.getAttribute("href") || "";
            const publishedAt =
                e.querySelector("published")?.textContent?.trim() ||
                e.querySelector("updated")?.textContent?.trim() ||
                null;
            const summary =
                e.querySelector("summary")?.textContent?.trim() ||
                e.querySelector("content")?.textContent?.trim() ||
                "";
            const id = e.querySelector("id")?.textContent?.trim() || url || title;
            return { id, title, url, publishedAt, summary };
        });
    }

    // RSS 2.0
    const items = [...doc.querySelectorAll("channel > item")];
    return items.map(i => {
        const title = i.querySelector("title")?.textContent?.trim() || "";
        const url = i.querySelector("link")?.textContent?.trim() || "";
        const publishedAt = i.querySelector("pubDate")?.textContent?.trim() || null;
        const summary =
            i.querySelector("description")?.textContent?.trim() ||
            i.querySelector("content\\:encoded")?.textContent?.trim() ||
            "";
        const guid = i.querySelector("guid")?.textContent?.trim() || url || title;
        const categories = [...i.querySelectorAll("category")].map(c => c.textContent.trim()).filter(Boolean);
        return { id: guid, title, url, publishedAt, summary, categories };
    });
}

(async function init() {
    bindUI();
    await safeRun(loadJson);
})();
