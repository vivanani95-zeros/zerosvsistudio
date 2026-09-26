export type WebProject = { files: Record<string, string> };

const LANG_MAP: Record<string, string> = {
  html: "index.html",
  css: "styles.css",
  js: "script.js",
  javascript: "script.js",
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
    const match = Object.keys(files).find((f) => baseName(f) === baseName(clean));
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

  const out = preparePage(html);
  const pageMap = Object.fromEntries(pages.map((page) => [page, preparePage(files[page] ?? "")]));
  const safeMap = JSON.stringify(pageMap).replace(/<\//g, "<\\/");
  const runtime = `
<script data-zeros-runtime>
(() => {
  const PAGES = ${safeMap};
  const current = ${JSON.stringify(initial)};
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
  const listenerRegistry = new WeakMap();
  const nativeAddEventListener = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function(type, listener, options) {
    try {
      if (listener && (this === window || this === document || this instanceof Element)) {
        const set = listenerRegistry.get(this) || new Set();
        set.add(String(type).toLowerCase());
        listenerRegistry.set(this, set);
      }
    } catch {}
    return nativeAddEventListener.call(this, type, listener, options);
  };
  window.addEventListener("error", (e) => report("error", e.error?.stack || e.message));
  window.addEventListener("unhandledrejection", (e) => report("error", e.reason?.stack || e.reason));
  const nativeError = console.error;
  console.error = (...args) => { report("console", args.map(String).join(" ")); nativeError(...args); };
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
    setTimeout(() => {
      try { document.dispatchEvent(new Event("DOMContentLoaded")); } catch {}
    }, 150);
  };
  const renderMissingPage = (requested) => {
    const safe = String(requested || "unknown page").replace(/[&<>"]/g, (char) => {
      if (char === "&") return "&";
      if (char === "<") return "<";
      if (char === ">") return ">";
      if (char === '"') return "\"";
      return char;
    });
    const available = Object.keys(PAGES).map((p) => {
      return '<a href="#" data-zeros-route="' + p + '" style="display:inline-block;margin:4px;padding:8px 12px;border-radius:999px;background:rgba(255,255,255,.08);color:#fff;text-decoration:none;font-size:13px">' + p + '</a>';
    }).join("");
    document.title = "Page unavailable — Zeros preview";
    document.body.innerHTML = '<main style="min-height:100vh;display:grid;place-items:center;padding:32px;font-family:system-ui,sans-serif;background:#0b0d12;color:#f5f7fb"><section style="max-width:640px;text-align:center"><div style="font-size:48px;margin-bottom:12px">🧭</div><h1 style="margin:0 0 10px;font-size:28px">Page unavailable</h1><p style="margin:0 auto 18px;line-height:1.6;color:#aeb7c7">This project does not contain <strong>' + safe + '</strong>. Pick a generated page:</p><div style="display:flex;flex-wrap:wrap;justify-content:center;gap:6px">' + (available || "<span>No pages</span>") + '</div></section></main>';
    send("runtime", { kind: "navigation", value: "Missing generated page: " + (requested || "unknown") });
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
    window.__ZEROS_PREVIEW__ = { page: target, pages: Object.keys(PAGES), runtime: true };
    window.scrollTo(0, 0);
    if (anchor) requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth" }));
    send("page", { path: target });
    send("runtime", { kind: "loaded", value: target });
    replayPageLifecycle();
  };
  const nativeOpen = window.open;
  window.open = (url, target, features) => {
    try {
      if (typeof url === "string" && !/^(https?:|mailto:|tel:|javascript:)/i.test(url)) {
        const page = resolveRoute(url);
        if (page) { route(page); return window; }
      }
    } catch {}
    return nativeOpen.call(window, url, target, features);
  };
  document.addEventListener("click", (event) => {
    const el = event.target instanceof Element ? event.target.closest("a[href], [data-zeros-route], [data-href], [data-link], [data-page], button[data-nav], [onclick]") : null;
    if (!el) return;
    const zerosRoute = el.getAttribute("data-zeros-route");
    if (zerosRoute) {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      try { history.replaceState(null, "", location.pathname + location.search); } catch {}
      route(zerosRoute, el.getAttribute("data-zeros-anchor") || "");
      return;
    }
    const href = el.getAttribute("href") || el.getAttribute("data-href") || el.getAttribute("data-link") || el.getAttribute("data-page") || el.getAttribute("data-nav") || "";
    if (!href) return;
    if (/^(https?:|mailto:|tel:|javascript:)/i.test(href)) return;
    if (href === "#") return;
    let path = href;
    let hash = "";
    if (href.startsWith("#zeros-route=")) {
      const query = href.slice("#zeros-route=".length);
      const [encodedPath, anchorPart] = query.split("&anchor=");
      path = decodeURIComponent(encodedPath || "index.html");
      hash = anchorPart ? decodeURIComponent(anchorPart) : "";
    } else if (href.startsWith("#")) {
      return;
    } else {
      hash = href.includes("#") ? href.slice(href.indexOf("#") + 1) : "";
    }
    const page = resolveRoute(path);
    if (!page) return;
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    try { history.replaceState(null, "", location.pathname + location.search); } catch {}
    route(page, hash);
  }, true);
  document.addEventListener("submit", (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement)) return;
    const action = form.getAttribute("action") || "";
    if (!action || /^(https?:|mailto:|tel:|javascript:|#)/i.test(action)) return;
    const page = resolveRoute(action);
    if (!page) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    route(page);
  }, true);
  window.addEventListener("message", (event) => {
    if (event.data?.source !== "zeros-preview-host") return;
    if (event.data.type === "screenshot") captureScreenshot();
    if (event.data.type === "verify") verifyPage();
    if (event.data.type === "navigate" && typeof event.data.path === "string") route(event.data.path);
  });
  async function captureScreenshot() {
    try {
      if (!window.html2canvas) throw new Error("Screenshot engine is still loading");
      const canvas = await window.html2canvas(document.documentElement, { useCORS: true, backgroundColor: null, windowWidth: document.documentElement.scrollWidth, windowHeight: document.documentElement.scrollHeight });
      send("screenshot", { dataUrl: canvas.toDataURL("image/png") });
    } catch (error) {
      report("screenshot", error instanceof Error ? error.message : String(error));
    }
  }
  function verifyPage() {
    const pagesChecked = Object.keys(PAGES);
    const brokenLocalLinks = [];
    for (const page of pagesChecked) {
      const source = PAGES[page] || "";
      for (const match of source.matchAll(/href=["']([^"']+)["']/gi)) {
        const href = match[1] || "";
        if (/^(https?:|mailto:|tel:|javascript:|#)/i.test(href)) continue;
        if (!resolveRoute(href)) brokenLocalLinks.push(page + " → " + href);
      }
    }
    const missing = ["title", "body"].filter((selector) => !document.querySelector(selector));
    const buttons = [...document.querySelectorAll("button")];
    const unnamedButtons = buttons.filter((b) => !(b.textContent || "").trim() && !b.getAttribute("aria-label"));
    const hasInteractiveListener = (element) => {
      let node = element;
      for (let depth = 0; node && depth < 4; depth += 1, node = node.parentElement) {
        const listeners = listenerRegistry.get(node);
        if (listeners?.has("click") || listeners?.has("pointerup") || listeners?.has("pointerdown") || listeners?.has("keydown")) return true;
      }
      return false;
    };
    const nonFunctionalButtons = buttons.filter((b) => !b.disabled).filter((b) => {
      if (b.type === "submit" && b.form) return false;
      if (b.hasAttribute("onclick")) return false;
      if (b.hasAttribute("data-zeros-route") || b.hasAttribute("data-href") || b.hasAttribute("data-nav")) return false;
      return !hasInteractiveListener(b);
    }).map((b) => (b.textContent || b.getAttribute("aria-label") || "unnamed button").trim().slice(0, 80));
    const ok = missing.length === 0 && brokenLocalLinks.length === 0 && unnamedButtons.length === 0 && nonFunctionalButtons.length === 0;
    send("verification", { ok, missing, brokenLocalLinks, unnamedButtons: unnamedButtons.length, nonFunctionalButtons, pages: pagesChecked, page: document.title || current });
  }
  const shot = document.createElement("script");
  shot.src = "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js";
  shot.async = true;
  shot.onload = () => send("runtime", { kind: "screenshot-ready", value: "ready" });
  shot.onerror = () => report("screenshot", "Screenshot engine could not be loaded");
  document.head.appendChild(shot);
  window.__ZEROS_ROUTE__ = (path) => route(path);
  window.__ZEROS_PREVIEW__ = { page: current, pages: Object.keys(PAGES), runtime: true, storage: "memory-fallback" };
  send("page", { path: current });
  send("runtime", { kind: "loaded", value: current });
  setTimeout(verifyPage, 1200);
})();
</script>`;

  return `${out}\n${runtime}`;
}

/** Parses fenced blocks labelled with a file path or language. Handles truncated fences. */
export function extractWebProject(text: string): WebProject | null {
  const files: Record<string, string> = {};
  // Allow truncated closing fence (model cut off)
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

  // Bare HTML document fallback when model dumps a full page without fences
  if (!Object.keys(files).some((f) => /\.html$/i.test(f))) {
    const htmlDoc =
      text.match(/<!doctype html[\s\S]+<\/html>/i)?.[0] ??
      text.match(/<html[\s\S]+<\/html>/i)?.[0];
    if (htmlDoc && htmlDoc.length > 80) files["index.html"] = htmlDoc.trim();
  }

  // Pull embedded <style> / <script> into shared files when only HTML was emitted
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

  // Normalize paths
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
