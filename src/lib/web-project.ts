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
 * Builds one runnable preview document. Internal .html links are converted into
 * preview routes so clicking navigation never escapes the current Zeros preview.
 * The runtime reports browser errors, rejected promises and successful page loads
 * to the parent preview shell via postMessage.
 */
export function assembleWebProject(project: WebProject, entry = "index.html"): string {
  const files = project.files;
  const pages = Object.keys(files).filter((f) => f.endsWith(".html"));
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

  let out = inlineAssets(html);

  // Keep the generated page's visual markup intact while making local links
  // route through the preview controller. External links and anchors remain real.
  out = out.replace(
    /href=["'](?!https?:|https?:|mailto:|tel:|javascript:|#)([^"']+)["']/gi,
    (tag: string, href: string) => {
      const target = normalizePagePath(href);
      if (!target.endsWith(".html")) return tag;
      const suffix = href.includes("#") ? `&anchor=${encodeURIComponent(href.split("#").slice(1).join("#"))}` : "";
      return `href="#zeros-route=${encodeURIComponent(target)}${suffix}"`;
    },
  );

  // Also catch root-relative links written without an explicit extension when
  // a matching HTML page exists in the generated project.
  for (const page of pages) {
    const stem = page.replace(/\.html$/i, "");
    if (!stem || stem === "index") continue;
    const re = new RegExp(`href=["'](${stem})(?:\\/)?["']`, "gi");
    out = out.replace(re, `href="#zeros-route=${encodeURIComponent(page)}"`);
  }

  const pageMap = Object.fromEntries(
    pages.map((page) => [page, inlineAssets(files[page] ?? "")]),
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

  const route = (path, anchor) => {
    const target = PAGES[path] ? path : (PAGES["index.html"] ? "index.html" : Object.keys(PAGES)[0]);
    if (!target) return;
    document.documentElement.innerHTML = PAGES[target];
    executeScripts(document);
    window.scrollTo(0, 0);
    if (anchor) {
      requestAnimationFrame(() => document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth" }));
    }
    send("page", { path: target });
    send("runtime", { kind: "loaded", value: target });
  };

  document.addEventListener("click", (event) => {
    const anchor = event.target?.closest?.("a[href]");
    if (!anchor) return;
    const href = anchor.getAttribute("href") || "";
    if (!href.startsWith("#zeros-route=")) return;
    event.preventDefault();
    const query = href.slice("#zeros-route=".length);
    const [encodedPath, anchorPart] = query.split("&anchor=");
    route(decodeURIComponent(encodedPath || "index.html"), anchorPart ? decodeURIComponent(anchorPart) : "");
  });

  window.addEventListener("message", (event) => {
    if (event.data?.source !== "zeros-preview-host") return;
    if (event.data.type === "screenshot") captureScreenshot();
    if (event.data.type === "verify") verifyPage();
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
    const required = ["title", "body"];
    const missing = required.filter((selector) => !document.querySelector(selector));
    const brokenLocalLinks = [...document.querySelectorAll("a[href]")]
      .map((a) => a.getAttribute("href") || "")
      .filter((href) => href.endsWith(".html"))
      .filter((href) => !PAGES[normalizePath(href)]);
    const buttons = [...document.querySelectorAll("button")];
    const unnamedButtons = buttons.filter((b) => !(b.textContent || "").trim() && !b.getAttribute("aria-label"));
    send("verification", {
      ok: missing.length === 0 && brokenLocalLinks.length === 0 && unnamedButtons.length === 0,
      missing,
      brokenLocalLinks,
      unnamedButtons: unnamedButtons.length,
      page: document.title || current,
    });
  }

  function normalizePath(value) {
    return (value.replace(/^\.\//, "").replace(/^\//, "").split(/[?#]/)[0] || "index.html");
  }

  // Load html2canvas in the preview itself so screenshot capture happens inside
  // the runnable page rather than trying to pierce a sandboxed iframe from above.
  const shot = document.createElement("script");
  shot.src = "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js";
  shot.async = true;
  shot.onload = () => send("runtime", { kind: "screenshot-ready", value: "ready" });
  shot.onerror = () => report("screenshot", "Screenshot engine could not be loaded");
  document.head.appendChild(shot);

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
  const hasHtml = Object.keys(files).some((f) => f.endsWith(".html"));
  if (!hasHtml) return null;
  if (!files["index.html"]) {
    const first = Object.keys(files).find((f) => f.endsWith(".html"))!;
    files["index.html"] = files[first]!;
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
