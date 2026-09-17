import { readFile, writeFile } from "node:fs/promises";

const projectPath = "src/lib/web-project.ts";
const previewPath = "src/components/WebPreview.tsx";

let project = await readFile(projectPath, "utf8");

const oldPageMap = `const pageMap = Object.fromEntries(\n    pages.map((page) => [page, inlineAssets(files[page] ?? "")]),\n  );`;
const newPageMap = `const preparePage = (source: string): string => {\n    let page = inlineAssets(source);\n    page = page.replace(\n      /href=["'](?!https?:|mailto:|tel:|javascript:|#)([^"']+)["']/gi,\n      (full: string, href: string) => {\n        const clean = href.replace(/^\\.\\//, "").replace(/^\\//, "").split(/[?#]/)[0] ?? "";\n        const target = pages.find((p) => p === clean || baseName(p) === baseName(clean));\n        if (!target) return full;\n        const anchor = href.includes("#") ? href.slice(href.indexOf("#") + 1) : "";\n        return \`href=\\"#zeros-route=\\${encodeURIComponent(target)}\\${anchor ? \`&anchor=\\${encodeURIComponent(anchor)}\` : ""}\\"\`;\n      },\n    );\n    return page;\n  };\n\n  const pageMap = Object.fromEntries(\n    pages.map((page) => [page, preparePage(files[page] ?? "")]),\n  );`;
if (!project.includes(oldPageMap)) throw new Error("Website page-map block not found");
project = project.replace(oldPageMap, newPageMap);

const oldRoute = `document.documentElement.innerHTML = PAGES[target];\n    executeScripts(document);\n    window.scrollTo(0, 0);`;
const newRoute = `const parsed = new DOMParser().parseFromString(PAGES[target], "text/html");\n    document.title = parsed.title || target;\n    document.head.querySelectorAll("[data-zeros-page-head]").forEach((node) => node.remove());\n    parsed.head.querySelectorAll("style,link,meta:not([charset]),title").forEach((node) => {\n      const clone = node.cloneNode(true);\n      if (clone instanceof HTMLElement) clone.setAttribute("data-zeros-page-head", "true");\n      document.head.appendChild(clone);\n    });\n    document.body.innerHTML = parsed.body.innerHTML;\n    executeScripts(document);\n    window.__ZEROS_PREVIEW__ = { page: target, pages: Object.keys(PAGES), runtime: true };\n    window.scrollTo(0, 0);`;
if (!project.includes(oldRoute)) throw new Error("Website route block not found");
project = project.replace(oldRoute, newRoute);

const oldRuntimeSend = `const send = (type, payload = {}) => {\n    try { parent.postMessage({ source: "zeros-preview", type, ...payload }, "*"); } catch {}\n  };`;
const newRuntimeSend = `const send = (type, payload = {}) => {\n    try { parent.postMessage({ source: "zeros-preview", type, ...payload }, "*"); } catch {}\n  };\n  window.__ZEROS_PREVIEW__ = { page: current, pages: Object.keys(PAGES), runtime: true, storage: "localStorage" };`;
if (project.includes(oldRuntimeSend) && !project.includes('storage: "localStorage"')) project = project.replace(oldRuntimeSend, newRuntimeSend);

const oldVerify = `function verifyPage() {\n    const required = ["title", "body"];\n    const missing = required.filter((selector) => !document.querySelector(selector));\n    const brokenLocalLinks = [...document.querySelectorAll("a[href]")]\n      .map((a) => a.getAttribute("href") || "")\n      .filter((href) => href.endsWith(".html"))\n      .filter((href) => !PAGES[normalizePath(href)]);\n    const buttons = [...document.querySelectorAll("button")];\n    const unnamedButtons = buttons.filter((b) => !(b.textContent || "").trim() && !b.getAttribute("aria-label"));\n    send("verification", {\n      ok: missing.length === 0 && brokenLocalLinks.length === 0 && unnamedButtons.length === 0,\n      missing,\n      brokenLocalLinks,\n      unnamedButtons: unnamedButtons.length,\n      page: document.title || current,\n    });\n  }`;
const newVerify = `function verifyPage() {\n    const pagesChecked = Object.keys(PAGES);\n    const brokenLocalLinks = [];\n    for (const page of pagesChecked) {\n      const source = PAGES[page] || "";\n      for (const match of source.matchAll(/href=["']([^"']+)["']/gi)) {\n        const href = match[1] || "";\n        if (/^(https?:|mailto:|tel:|javascript:|#)/i.test(href)) continue;\n        const target = normalizePath(href);\n        if (target.endsWith(".html") && !PAGES[target] && !Object.keys(PAGES).some((p) => p.split("/").pop() === target.split("/").pop())) {\n          brokenLocalLinks.push(page + " → " + href);\n        }\n      }\n    }\n    const missing = ["title", "body"].filter((selector) => !document.querySelector(selector));\n    const buttons = [...document.querySelectorAll("button")];\n    const unnamedButtons = buttons.filter((b) => !(b.textContent || "").trim() && !b.getAttribute("aria-label"));\n    const ok = missing.length === 0 && brokenLocalLinks.length === 0 && unnamedButtons.length === 0;\n    send("verification", { ok, missing, brokenLocalLinks, unnamedButtons: unnamedButtons.length, pages: pagesChecked, page: document.title || current });\n  }`;
if (!project.includes(oldVerify)) throw new Error("Website QA function not found");
project = project.replace(oldVerify, newVerify);

await writeFile(projectPath, project, "utf8");

let preview = await readFile(previewPath, "utf8");
preview = preview.replace(
  'sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads"',
  'sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups allow-downloads"',
);
await writeFile(previewPath, preview, "utf8");
