export type WebProject = { files: Record<string, string> };

const LANG_MAP: Record<string, string> = {
  html: "index.html",
  css: "css/styles.css",
  js: "js/main.js",
  javascript: "js/main.js",
  json: "data/site.json",
  md: "README.md",
  markdown: "README.md",
};

function baseName(path: string): string {
  return path.split("/").pop() ?? path;
}

function normalizePagePath(path: string): string {
  let clean = path.replace(/^\.\//, "").replace(/^\//, "").split(/[?#]/)[0] ?? "";
  clean = clean.replace(/\/+$/, "");
  if (!clean || clean === ".") return "index.html";
  if (!/\.html?$/i.test(clean)) clean = `${clean}.html`;
  return clean;
}

export function assembleWebProject(project: WebProject, entry = "index.html"): string {
  const files = project.files;
  const pages = Object.keys(files).filter((f) => /\.html$/i.test(f));
  const initial = normalizePagePath(entry);
  const html =
    files[initial] ??
    files["index.html"] ??
    (pages[0] ? files[pages[0]!] : "<!doctype html><title>Zeros project</title>");

  const find = (href: string): string | undefined => {
    const clean = href.replace(/^\.\//, "").replace(/^\//, "").split(/[?#]/)[0] ?? "";
    if (files[clean] !== undefined) return files[clean];
    const aliases = [
      clean,
      clean.replace(/^css\//, ""),
      clean.replace(/^js\//, ""),
      `css/${baseName(clean)}`,
      `js/${baseName(clean)}`,
      baseName(clean),
    ];
    for (const a of aliases) {
      if (files[a] !== undefined) return files[a];
    }
    const match = Object.keys(files).find((f) => baseName(f).toLowerCase() === baseName(clean).toLowerCase());
    return match ? files[match] : undefined;
  };

  const inlineAssets = (source: string): string =>
    source
      .replace(/<link[^>]*href=["']([^"']+\.css(?:\?[^"']*)?)["'][^>]*>/gi, (tag, href: string) => {
        const css = find(href);
        return css !== undefined ? `<style data-zeros-inline="css">${css}</style>` : tag;
      })
      .replace(
        /<script([^>]*)src=["']([^"']+\.js(?:\?[^"']*)?)["']([^>]*)><\/script>/gi,
        (tag, before: string, src: string, after: string) => {
          const js = find(src);
          return js !== undefined ? `<script${before}${after}>${js}\n<\/script>` : tag;
        },
      );

  const resolvePage = (href: string): string | undefined => {
    const raw = (href || "").trim();
    if (!raw || /^(https?:|mailto:|tel:|javascript:)/i.test(raw)) return undefined;
    if (raw.startsWith("#") && !raw.startsWith("#zeros-route=")) return undefined;
    let candidate = raw;
    if (candidate.startsWith("#zeros-route=")) {
      const query = candidate.slice("#zeros-route=".length);
      candidate = decodeURIComponent(query.split("&")[0] || "index.html");
    }
    const clean = normalizePagePath(candidate);
    if (pages.includes(clean)) return clean;
    const cleanBase = baseName(clean).toLowerCase();
    const cleanStem = cleanBase.replace(/\.html?$/i, "");
    const cleanNoExt = clean.replace(/\.html?$/i, "").toLowerCase();
    return pages.find((page) => {
      const pageBase = baseName(page).toLowerCase();
      const pageStem = pageBase.replace(/\.html?$/i, "");
      const pageNoExt = page.replace(/\.html?$/i, "").toLowerCase();
      return (
        pageBase === cleanBase ||
        pageStem === cleanStem ||
        pageNoExt === cleanNoExt ||
        pageNoExt.endsWith("/" + cleanStem) ||
        pageStem === cleanStem + "/index"
      );
    });
  };

  const preparePage = (source: string): string => {
    let page = inlineAssets(source);
    page = page.replace(
      /href=["'](?!https?:|mailto:|tel:|javascript:|#)([^"']+)["']/gi,
      (full: string, href: string) => {
        const target = resolvePage(href);
        if (!target) return full;
        const anchor = href.includes("#") ? href.slice(href.indexOf("#") + 1) : "";
        return `href="#" data-zeros-route="${target}"${anchor ? ` data-zeros-anchor="${anchor}"` : ""}`;
      },
    );
    page = page.replace(
      /data-(?:href|link|page)=["'](?!https?:|mailto:|tel:|javascript:|#)([^"']+)["']/gi,
      (full: string, href: string) => {
        const target = resolvePage(href);
        return target ? `data-zeros-route="${target}"` : full;
      },
    );
    page = page.replace(
      /(?:window\.)?location\.(?:href|assign|replace)\s*=\s*["']([^"']+)["']/gi,
      (full: string, href: string) => {
        const target = resolvePage(href);
        return target
          ? `window.__ZEROS_ROUTE__ && window.__ZEROS_ROUTE__("${target}")`
          : "void 0";
      },
    );
    page = page.replace(
      /(?:window\.)?location\.(?:assign|replace)\(\s*["']([^"']+)["']\s*\)/gi,
      (full: string, href: string) => {
        const target = resolvePage(href);
        return target
          ? `(window.__ZEROS_ROUTE__ && window.__ZEROS_ROUTE__("${target}"))`
          : "void 0";
      },
    );
    return page;
  };

  const STUDIO_BASE_CSS = `:root{--bg:#07090f;--fg:#f4f6fb;--muted:#9aa3b5;--line:rgba(255,255,255,.08);--card:rgba(255,255,255,.04);--brand:#22d3ee;--brand2:#a78bfa;--glow:0 0 40px rgba(34,211,238,.25);--radius:1.25rem;--font-d:Syne,system-ui,sans-serif;--font-b:DM Sans,system-ui,sans-serif}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;font-family:var(--font-b);background:var(--bg);color:var(--fg);line-height:1.6;-webkit-font-smoothing:antialiased}img,svg{max-width:100%;display:block}a{color:inherit;text-decoration:none}.container{width:min(1120px,92%);margin-inline:auto}.site-header{position:sticky;top:0;z-index:50;backdrop-filter:blur(16px);background:rgba(7,9,15,.72);border-bottom:1px solid var(--line)}.nav{display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:.9rem 0}.logo{font-family:var(--font-d);font-weight:800;letter-spacing:-.03em;font-size:1.15rem}.nav-links{display:flex;gap:1.1rem;flex-wrap:wrap;font-size:.9rem;color:var(--muted)}.nav-links a:hover{color:var(--fg)}.btn{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;padding:.75rem 1.25rem;border-radius:999px;border:1px solid var(--line);font-weight:600;font-size:.9rem;transition:.25s ease;cursor:pointer;background:transparent;color:var(--fg)}.btn:hover{transform:translateY(-2px);box-shadow:var(--glow)}.btn-primary{background:linear-gradient(135deg,var(--brand),var(--brand2));border:none;color:#061018}.hero{min-height:88vh;display:grid;place-items:center;text-align:center;padding:6rem 0 4rem;position:relative;overflow:hidden}.hero::before{content:"";position:absolute;inset:-20%;background:radial-gradient(ellipse at 30% 20%,rgba(34,211,238,.18),transparent 50%),radial-gradient(ellipse at 70% 60%,rgba(167,139,250,.16),transparent 45%);animation:aurora 12s ease-in-out infinite alternate;pointer-events:none}@keyframes aurora{from{transform:translateY(-2%) scale(1)}to{transform:translateY(2%) scale(1.05)}}.hero h1{font-family:var(--font-d);font-size:clamp(2.6rem,7vw,4.8rem);line-height:1.02;letter-spacing:-.04em;margin:0 0 1rem;position:relative}.hero p{max-width:36rem;margin:0 auto 1.75rem;color:var(--muted);font-size:1.05rem;position:relative}.hero-cta{display:flex;gap:.75rem;justify-content:center;flex-wrap:wrap;position:relative}.section{padding:5rem 0}.section h2{font-family:var(--font-d);font-size:clamp(1.8rem,4vw,2.6rem);letter-spacing:-.03em;margin:0 0 1.5rem}.grid{display:grid;gap:1.25rem}.grid-3{grid-template-columns:repeat(auto-fit,minmax(240px,1fr))}.card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:1.4rem;transition:.25s ease}.card:hover{transform:translateY(-4px);border-color:rgba(34,211,238,.35);box-shadow:var(--glow)}.site-footer{border-top:1px solid var(--line);padding:3rem 0;margin-top:2rem;color:var(--muted);font-size:.9rem}.reveal{opacity:0;transform:translateY(18px);transition:opacity .7s ease,transform .7s ease}.reveal.visible{opacity:1;transform:none}@media (max-width:720px){.nav-links{display:none}.nav-links.open{display:flex;flex-direction:column;position:absolute;top:100%;left:0;right:0;background:rgba(7,9,15,.96);padding:1rem;border-bottom:1px solid var(--line)}}`;

  const withStudioChrome = (pageHtml: string): string => {
    const fontLink =
      '<link rel="preconnect" href="https://fonts.googleapis.com">' +
      '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
      '<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Syne:wght@600;700;800&display=swap" rel="stylesheet">';
    const baseStyle = `<style data-zeros-studio-base>${STUDIO_BASE_CSS}</style>`;
    if (/<head[^>]*>/i.test(pageHtml)) {
      return pageHtml.replace(/<head[^>]*>/i, (m) => `${m}\n${fontLink}\n${baseStyle}`);
    }
    return `${fontLink}\n${baseStyle}\n${pageHtml}`;
  };

  const out = withStudioChrome(preparePage(html));
  const pageMap = Object.fromEntries(
    pages.map((page) => [page, withStudioChrome(preparePage(files[page] ?? ""))]),
  );
  const safeMap = JSON.stringify(pageMap).replace(/<\//g, "<\\/");
  const runtime = `
<script data-zeros-runtime>
(() => {
  const PAGES = ${safeMap};
  const current = ${JSON.stringify(initial)};
  try {
    let b = document.querySelector("base");
    if (!b) { b = document.createElement("base"); document.head.prepend(b); }
    b.setAttribute("href", "about:blank");
    b.setAttribute("target", "_self");
  } catch {}
  const send = (type, payload = {}) => {
    try { parent.postMessage({ source: "zeros-preview", type, ...payload }, "*"); } catch {}
  };
  const report = (kind, value) => send("runtime", { kind, value: String(value || "Unknown runtime error") });
  const createMemoryStorage = () => {
    const data = Object.create(null);
    return {
      get length() { return Object.keys(data).length; },
      key: (index) => Object.keys(data)[index] ?? null,
      getItem: (key) => Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null,
      setItem: (key, value) => { data[String(key)] = String(value); },
      removeItem: (key) => { delete data[String(key)]; },
      clear: () => { for (const key of Object.keys(data)) delete data[key]; },
    };
  };
  try { void window.localStorage; } catch {
    try { Object.defineProperty(window, "localStorage", { configurable: true, value: createMemoryStorage() }); } catch {}
  }
  try { void window.sessionStorage; } catch {
    try { Object.defineProperty(window, "sessionStorage", { configurable: true, value: createMemoryStorage() }); } catch {}
  }
  const executeScripts = (root) => {
    root.querySelectorAll("script:not([data-zeros-runtime])").forEach((old) => {
      if (old.src) return;
      const fresh = document.createElement("script");
      for (const attr of old.attributes) fresh.setAttribute(attr.name, attr.value);
      fresh.textContent = old.textContent || "";
      old.replaceWith(fresh);
    });
  };
  const normalizePath = (value) => {
    let clean = (value || "").replace(/^\.\//, "").replace(/^\//, "").split(/[?#]/)[0] || "index.html";
    clean = clean.replace(/\/+$/, "");
    if (!clean || clean === ".") return "index.html";
    if (!/\.html?$/i.test(clean)) clean = clean + ".html";
    return clean;
  };
  const resolveRoute = (href) => {
    if (!href) return undefined;
    if (/^(https?:|mailto:|tel:|javascript:)/i.test(href)) return undefined;
    if (href.startsWith("#") && !href.startsWith("#zeros-route=")) return undefined;
    let candidate = href;
    if (candidate.startsWith("#zeros-route=")) {
      const query = candidate.slice("#zeros-route=".length);
      candidate = decodeURIComponent((query.split("&")[0] || "index.html"));
    }
    const clean = normalizePath(candidate);
    if (PAGES[clean]) return clean;
    const base = (clean.split("/").pop() || clean).toLowerCase();
    const stem = base.replace(/\.html?$/i, "");
    const noExt = clean.replace(/\.html?$/i, "").toLowerCase();
    return Object.keys(PAGES).find((page) => {
      const pageBase = (page.split("/").pop() || page).toLowerCase();
      const pageStem = pageBase.replace(/\.html?$/i, "");
      const pageNoExt = page.replace(/\.html?$/i, "").toLowerCase();
      return pageBase === base || pageStem === stem || pageNoExt === noExt || pageNoExt.endsWith("/" + stem);
    });
  };
  const replayPageLifecycle = () => {
    setTimeout(() => {
      try {
        document.dispatchEvent(new Event("DOMContentLoaded"));
        window.dispatchEvent(new Event("load"));
      } catch {}
    }, 0);
  };
  const renderMissingPage = (requested) => {
    const safe = String(requested || "unknown");
    const available = Object.keys(PAGES).map((p) =>
      '<a href="#" data-zeros-route="' + p + '" style="display:inline-block;margin:4px;padding:8px 12px;border-radius:999px;background:rgba(255,255,255,.08);color:#fff;text-decoration:none;font-size:13px">' + p + '</a>'
    ).join("");
    document.title = "Page unavailable";
    document.body.innerHTML = '<main style="min-height:100vh;display:grid;place-items:center;padding:32px;font-family:system-ui,sans-serif;background:#0b0d12;color:#f5f7fb"><section style="max-width:640px;text-align:center"><h1>Page unavailable</h1><p>Missing: ' + safe + '</p><div>' + (available || "No pages") + '</div></section></main>';
    send("page", { path: "__missing__" });
  };
  const route = (path, anchor) => {
    try { history.replaceState(null, "", location.pathname + location.search); } catch {}
    const target = resolveRoute(path);
    if (!target) { renderMissingPage(path); return; }
    const parsed = new DOMParser().parseFromString(PAGES[target], "text/html");
    document.title = parsed.title || target;
    document.head.querySelectorAll("[data-zeros-page-head]").forEach((node) => node.remove());
    parsed.head.querySelectorAll("style,link,meta:not([charset]),title,script").forEach((node) => {
      const clone = node.cloneNode(true);
      if (clone instanceof HTMLElement) clone.setAttribute("data-zeros-page-head", "true");
      document.head.appendChild(clone);
    });
    document.body.innerHTML = parsed.body.innerHTML;
    executeScripts(document);
    window.__ZEROS_ROUTE__ = (next) => route(next);
    window.scrollTo(0, 0);
    if (anchor) requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth" }));
    send("page", { path: target });
    send("runtime", { kind: "loaded", value: target });
    replayPageLifecycle();
  };
  document.addEventListener("click", (event) => {
    const el = event.target instanceof Element ? event.target.closest("a[href], [data-zeros-route], [data-href], [data-link], [data-page]") : null;
    if (!el) return;
    const zerosRoute = el.getAttribute("data-zeros-route");
    if (zerosRoute) {
      event.preventDefault();
      event.stopPropagation();
      try { history.replaceState(null, "", location.pathname + location.search); } catch {}
      route(zerosRoute, el.getAttribute("data-zeros-anchor") || "");
      return;
    }
    const href = el.getAttribute("href") || el.getAttribute("data-href") || "";
    if (!href || /^(https?:|mailto:|tel:|javascript:)/i.test(href) || href === "#") return;
    const page = resolveRoute(href);
    if (!page) return;
    event.preventDefault();
    event.stopPropagation();
    try { history.replaceState(null, "", location.pathname + location.search); } catch {}
    route(page, href.includes("#") ? href.slice(href.indexOf("#") + 1) : "");
  }, true);
  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const action = form.getAttribute("action") || "";
    if (!action || /^(https?:|mailto:|tel:|javascript:|#)/i.test(action)) return;
    const page = resolveRoute(action);
    if (!page) return;
    event.preventDefault();
    route(page);
  }, true);
  window.addEventListener("message", (event) => {
    if (event.data?.source !== "zeros-preview-host") return;
    if (event.data.type === "navigate" && typeof event.data.path === "string") route(event.data.path);
  });
  window.__ZEROS_ROUTE__ = (path) => route(path);
  window.__ZEROS_PREVIEW__ = { page: current, pages: Object.keys(PAGES), runtime: true };
  send("page", { path: current });
  send("runtime", { kind: "loaded", value: current });
})();
</script>`;

  return `${out}\n${runtime}`;
}

export function extractWebProject(text: string): WebProject | null {
  const files: Record<string, string> = {};
  const pattern = /```([^\n`]*)\n([\s\S]*?)(?:```|$)/g;
  for (const match of text.matchAll(pattern)) {
    const rawLabel = (match[1] ?? "").trim().replace(/^file:/i, "").replace(/^["'`]|["'`]$/g, "");
    const body = (match[2] ?? "").trim();
    if (!body || body.length < 8) continue;
    const tokens = rawLabel.split(/\s+/).filter(Boolean);
    let name = "";
    for (const tok of tokens) {
      const cleaned = tok.replace(/^file:/i, "").replace(/^\.?\/+/, "");
      if (/\.[a-z0-9]{2,5}$/i.test(cleaned)) {
        name = cleaned;
        break;
      }
    }
    if (!name) {
      const lang = (tokens[0] ?? "").toLowerCase();
      name = LANG_MAP[lang] ?? `file-${Object.keys(files).length + 1}.txt`;
    }
    name = name.replace(/^\.\//, "").replace(/\\/g, "/");
    if (!files[name] || body.length > files[name].length) files[name] = body;
  }
  if (!Object.keys(files).some((f) => /\.html$/i.test(f))) {
    const htmlDoc =
      text.match(/<!doctype html[\s\S]+<\/html>/i)?.[0] ??
      text.match(/<html[\s\S]+<\/html>/i)?.[0];
    if (htmlDoc && htmlDoc.length > 80) files["index.html"] = htmlDoc.trim();
  }
  if (files["index.html"] && !files["css/styles.css"] && !files["styles.css"]) {
    const styles = [...files["index.html"].matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1].trim()).filter(Boolean);
    if (styles.length) files["css/styles.css"] = styles.join("\n\n");
  }
  if (files["index.html"] && !files["js/main.js"] && !files["script.js"]) {
    const scripts = [...files["index.html"].matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
      .map((m) => m[1].trim())
      .filter((s) => s && !s.includes("data-zeros-runtime"));
    if (scripts.length) files["js/main.js"] = scripts.join("\n\n");
  }
  const htmlFiles = Object.keys(files).filter((f) => /\.html$/i.test(f));
  if (!htmlFiles.length) return null;
  if (!files["index.html"]) {
    const first = htmlFiles[0]!;
    files["index.html"] = files[first]!;
  }
  for (const path of Object.keys(files)) {
    const normalized = path.replace(/^\.\//, "").replace(/\\/g, "/");
    if (normalized !== path) {
      const body = files[path]!;
      delete files[path];
      if (!files[normalized] || body.length > files[normalized].length) files[normalized] = body;
    }
  }
  return { files };
}

export async function downloadProjectZip(project: WebProject, name = "zeros-site") {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  Object.entries(project.files).forEach(([path, contents]) => zip.file(path, contents));
  const blob = await zip.generateAsync({ type: "blob" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${name}.zip`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export { buildFallbackWebProject } from "./web-fallback";
