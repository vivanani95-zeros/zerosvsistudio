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
  const clean = path.replace(/^\.\//, "").replace(/^\//, "").split(/[?#]/)[0] ?? "";
  return clean || "index.html";
}

/**
 * Builds one persistent runnable preview document. Generated local pages are
 * routed in-place so navigation never escapes the Zeros preview shell.
 */
export function assembleWebProject(project: WebProject, entry = "index.html"): string {
  const files = project.files;
  const pages = Object.keys(files).filter((f) => /\.html$/i.test(f));
  const initial = normalizePagePath(entry);
  const html =
    files[initial] ??
    files["index.html"] ??
    pages[0] ? files[pages[0]!] : "<!doctype html><title>Zeros project</title>";

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
    const clean = normalizePagePath(href);
    if (pages.includes(clean)) return clean;
    const cleanBase = baseName(clean);
    const cleanStem = clean.replace(/\.html$/i, "").replace(/\/$/, "");
    return pages.find((page) => {
      const pageBase = baseName(page);
      const pageStem = page.replace(/\.html$/i, "");
      return pageBase === cleanBase || pageStem === cleanStem;
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
        return `href="#zeros-route=${encodeURIComponent(target)}${anchor ? `&anchor=${encodeURIComponent(anchor)}` : ""}"`;
      },
    );
    // Generated projects sometimes contain local navigation in inline event
    // handlers despite the prompt contract. Do not execute those navigations;
    // the preview route interceptor owns page navigation.
    page = page.replace(
      /(?:window\.)?location\.(?:href|assign|replace)\s*=\s*["']([^"']+)["']/gi,
      (full: string, href: string) => {
        const target = resolvePage(href);
        return target
          ? `window.__ZEROS_ROUTE__ && window.__ZEROS_ROUTE__("${target}")`
          : "void 0";
      },
    );
    return page;
  };

  const out = preparePage(html);
  const pageMap = Object.fromEntries(
    pages.map((page) => [page, preparePage(files[page] ?? "")]),
  );
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

  // srcdoc + sandbox uses an opaque origin. Some generated sites expect Web Storage,
  // so provide a Storage-compatible in-memory fallback instead of throwing.
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

  // Track page-level interaction listeners so preview QA can detect truly dead buttons.
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

  const normalizePath = (value) =>
    (value.replace(/^\.\//, "").replace(/^\//, "").split(/[?#]/)[0] || "index.html");

  const resolveRoute = (href) => {
    const clean = normalizePath(href);
    if (PAGES[clean]) return clean;
    const base = clean.split("/").pop() || clean;
    const stem = clean.replace(/\.html$/i, "").replace(/\/$/, "");
    return Object.keys(PAGES).find((page) =>
      page.split("/").pop() === base || page.replace(/\.html$/i, "") === stem,
    );
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
    const safe = String(requested || "unknown page").replace(/[&<>"]/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"
    }[char] || char));
    document.title = "Page unavailable — Zeros preview";
    document.body.innerHTML = `
      <main style="min-height:100vh;display:grid;place-items:center;padding:32px;font-family:system-ui,sans-serif;background:#0b0d12;color:#f5f7fb">
        <section style="max-width:620px;text-align:center">
          <div style="font-size:56px;margin-bottom:12px">🧭</div>
          <h1 style="margin:0 0 10px;font-size:30px">Page unavailable</h1>
          <p style="margin:0 auto 22px;line-height:1.6;color:#aeb7c7">This generated project does not contain <strong>\${safe}</strong>. Zeros kept the preview alive instead of letting a missing route break the whole UI.</p>
          <a href="#zeros-route=index.html" style="display:inline-block;padding:11px 16px;border-radius:10px;background:#fff;color:#111;text-decoration:none;font-weight:700">Back to home</a>
        </section>
      </main>`;
    send("runtime", { kind: "navigation", value: `Missing generated page: \${requested || "unknown"}` });
    send("page", { path: "__missing__" });
  };

  const route = (path, anchor) => {
    const target = resolveRoute(path);
    if (!target) {
      renderMissingPage(path);
      return;
    }

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
    window.__ZEROS_ROUTE__ = (path) => route(path);
    window.__ZEROS_PREVIEW__ = { page: target, pages: Object.keys(PAGES), runtime: true };
    window.scrollTo(0, 0);
    if (anchor) {
      requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth" }));
    }
    send("page", { path: target });
    send("runtime", { kind: "loaded", value: target });
    replayPageLifecycle();
  };

  const nativeOpen = window.open;
  window.open = (url, target, features) => {
    try {
      if (typeof url === "string" && !/^(https?:|mailto:|tel:|javascript:)/i.test(url)) {
        const page = resolveRoute(url);
        if (page) {
          route(page);
          return window;
        }
      }
    } catch {}
    return nativeOpen.call(window, url, target, features);
  };

  // Capture navigation before generated page handlers can navigate the iframe away.
  // Handles /about, about.html, ./about.html and already-rewritten preview routes.
  document.addEventListener("click", (event) => {
    const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!anchor) return;
    const href = anchor.getAttribute("href") || "";
    if (!href || /^(https?:|mailto:|tel:|javascript:|#(?!zeros-route=))/i.test(href)) return;
    let path = href;
    let hash = "";
    if (href.startsWith("#zeros-route=")) {
      const query = href.slice("#zeros-route=".length);
      const [encodedPath, anchorPart] = query.split("&anchor=");
      path = decodeURIComponent(encodedPath || "index.html");
      hash = anchorPart ? decodeURIComponent(anchorPart) : "";
    } else {
      hash = href.includes("#") ? href.slice(href.indexOf("#") + 1) : "";
    }

    const page = resolveRoute(path);
    if (!page) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    route(page, hash);
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
      const canvas = await window.html2canvas(document.documentElement, {
        useCORS: true,
        backgroundColor: null,
        windowWidth: document.documentElement.scrollWidth,
        windowHeight: document.documentElement.scrollHeight,
      });
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
    const nonFunctionalButtons = buttons
      .filter((b) => !b.disabled)
      .filter((b) => {
        if (b.type === "submit" && b.form) return false;
        if (b.hasAttribute("onclick")) return false;
        return !hasInteractiveListener(b);
      })
      .map((b) => (b.textContent || b.getAttribute("aria-label") || "unnamed button").trim().slice(0, 80));

    const ok =
      missing.length === 0 &&
      brokenLocalLinks.length === 0 &&
      unnamedButtons.length === 0 &&
      nonFunctionalButtons.length === 0;

    send("verification", {
      ok,
      missing,
      brokenLocalLinks,
      unnamedButtons: unnamedButtons.length,
      nonFunctionalButtons,
      pages: pagesChecked,
      page: document.title || current,
    });
  }

  // Keep screenshot capture inside the sandboxed preview.
  const shot = document.createElement("script");
  shot.src = "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js";
  shot.async = true;
  shot.onload = () => send("runtime", { kind: "screenshot-ready", value: "ready" });
  shot.onerror = () => report("screenshot", "Screenshot engine could not be loaded");
  document.head.appendChild(shot);

  window.__ZEROS_PREVIEW__ = { page: current, pages: Object.keys(PAGES), runtime: true, storage: "memory-fallback" };
  send("page", { path: current });
  send("runtime", { kind: "loaded", value: current });
  setTimeout(verifyPage, 1200);
})();
</script>`;

  return `${out}\n${runtime}`;
}

/** Parses fenced blocks labelled with a file path (```file:css/styles.css) or a language. */
export function extractWebProject(text: string): WebProject | null {
  const files: Record<string, string> = {};
  const pattern = /```([^\n`]*)\n([\s\S]*?)```/g;
  for (const match of text.matchAll(pattern)) {
    const rawLabel = (match[1] ?? "").trim().replace(/^file:/i, "").replace(/^["'`]|["'`]$/g, "");
    const body = (match[2] ?? "").trim();
    if (!body) continue;
    const label = rawLabel.split(/\s+/)[0] ?? "";
    let name: string;
    if (/\.[a-z0-9]{2,5}$/i.test(label)) name = label.replace(/^\.?\//, "");
    else name = LANG_MAP[label.toLowerCase()] ?? `file-${Object.keys(files).length + 1}.txt`;
    files[name] = body;
  }
  const htmlFiles = Object.keys(files).filter((f) => /\.html$/i.test(f));
  if (!htmlFiles.length) return null;
  if (!files["index.html"]) {
    const first = htmlFiles[0]!;
    files["index.html"] = files[first]!;
  }

  // Normalize the generated file map so page navigation is deterministic.
  // A page called "Tasks.HTML" should still be recognized as an HTML page,
  // while the canonical entry remains index.html.
  for (const [path, body] of Object.entries(files)) {
    const normalized = path.replace(/^\.\\//, "").replace(/\\/+/g, "/");
    if (normalized !== path) {
      delete files[path];
      files[normalized] = body;
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
