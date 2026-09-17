import { readFile, writeFile } from "node:fs/promises";

const projectPath = "src/lib/web-project.ts";
let project = await readFile(projectPath, "utf8");

// Make the initial page use the same internal-link resolver as every routed page.
const oldInitial = '  let out = inlineAssets(html);';
const newInitial = `  const rewriteInternalLinks = (source: string): string => source.replace(\n    /href=["'](?!https?:|mailto:|tel:|javascript:|#)([^"']+)["']/gi,\n    (full: string, href: string) => {\n      const clean = href.replace(/^\\.\\//, "").replace(/^\\//, "").split(/[?#]/)[0] ?? "";\n      const target = pages.find((p) => {\n        const pClean = p.replace(/^\\.\\//, "");\n        return pClean === clean || baseName(pClean) === baseName(clean) || pClean.replace(/\\.html$/i, "") === clean.replace(/\\/$/, "");\n      });\n      if (!target) return full;\n      const anchor = href.includes("#") ? href.slice(href.indexOf("#") + 1) : "";\n      return \`href=\\"#zeros-route=\\${encodeURIComponent(target)}\\${anchor ? \`&anchor=\\${encodeURIComponent(anchor)}\` : ""}\\"\`;\n    },\n  );\n\n  let out = rewriteInternalLinks(inlineAssets(html));`;
if (project.includes(oldInitial) && !project.includes("const rewriteInternalLinks")) project = project.replace(oldInitial, newInitial);

// The route controller must survive page changes. Replacing the whole html element
// destroys the controller and all of its listeners, which is why the first page worked
// while subsequent navigation fell back to the host site. Keep the document shell alive.
const oldRoute = `document.documentElement.innerHTML = PAGES[target];\n    executeScripts(document);\n    window.scrollTo(0, 0);`;
const newRoute = `const parsed = new DOMParser().parseFromString(PAGES[target], "text/html");\n    document.title = parsed.title || target;\n    document.head.querySelectorAll("[data-zeros-page-head]").forEach((node) => node.remove());\n    parsed.head.querySelectorAll("style,link,meta:not([charset]),title").forEach((node) => {\n      const clone = node.cloneNode(true);\n      if (clone instanceof HTMLElement) clone.setAttribute("data-zeros-page-head", "true");\n      document.head.appendChild(clone);\n    });\n    document.body.innerHTML = parsed.body.innerHTML;\n    executeScripts(document);\n    window.__ZEROS_PREVIEW__ = { page: target, pages: Object.keys(PAGES), runtime: true };\n    window.scrollTo(0, 0);`;
if (project.includes(oldRoute)) project = project.replace(oldRoute, newRoute);

// Generated apps commonly initialize from DOMContentLoaded. When a page is swapped
// inside the persistent preview shell, that event has already fired, so replay it.
const oldExec = `      old.replaceWith(fresh);`;
const newExec = `      old.replaceWith(fresh);\n      try { fresh.dispatchEvent(new Event("zeros-script-mounted")); } catch {}\n    });\n    try { document.dispatchEvent(new Event("DOMContentLoaded")); } catch {}`;
if (project.includes(oldExec) && !project.includes("zeros-script-mounted")) project = project.replace(oldExec, newExec);

await writeFile(projectPath, project, "utf8");

const providerPath = "src/lib/providers.server.ts";
let provider = await readFile(providerPath, "utf8");
const oldFetch = '        const res = await fetch(`${GEMINI_BASE}/models/${model}:generateContent`, {';
const newFetch = `        const controller = new AbortController();\n        const timer = setTimeout(() => controller.abort(), 20000);\n        const res = await fetch(\`${'${GEMINI_BASE}'}/models/\${model}:generateContent\`, {`;
if (provider.includes(oldFetch) && !provider.includes("TTS_TIMEOUT_GUARD")) {
  // Only patch the occurrence belonging to the TTS function.
  const marker = "export async function ttsPcmBase64";
  const start = provider.indexOf(marker);
  if (start >= 0) {
    const before = provider.slice(0, start);
    let tail = provider.slice(start);
    tail = tail.replace(oldFetch, newFetch + "\n          // TTS_TIMEOUT_GUARD");
    tail = tail.replace('        if (!res.ok) continue;', '        if (!res.ok) { clearTimeout(timer); continue; }');
    tail = tail.replace('        for (const p of json.candidates?.[0]?.content?.parts ?? []) {', '        clearTimeout(timer);\n        for (const p of json.candidates?.[0]?.content?.parts ?? []) {');
    provider = before + tail;
  }
}
await writeFile(providerPath, provider, "utf8");
