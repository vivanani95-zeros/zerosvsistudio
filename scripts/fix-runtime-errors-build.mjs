import { readFile, writeFile } from "node:fs/promises";

const projectPath = "src/lib/web-project.ts";
let project = await readFile(projectPath, "utf8");

const oldInitial = '  let out = inlineAssets(html);';
const newInitial = `  const rewriteInternalLinks = (source: string): string => source.replace(\n    /href=["'](?!https?:|mailto:|tel:|javascript:|#)([^"']+)["']/gi,\n    (full: string, href: string) => {\n      const clean = href.replace(/^\\.\\//, "").replace(/^\\//, "").split(/[?#]/)[0] ?? "";\n      const target = pages.find((p) => {\n        const pClean = p.replace(/^\\.\\//, "");\n        return pClean === clean || baseName(pClean) === baseName(clean) || pClean.replace(/\\.html$/i, "") === clean.replace(/\\/$/, "");\n      });\n      if (!target) return full;\n      const anchor = href.includes("#") ? href.slice(href.indexOf("#") + 1) : "";\n      return \`href=\\"#zeros-route=\\${encodeURIComponent(target)}\\${anchor ? \`&anchor=\\${encodeURIComponent(anchor)}\` : ""}\\"\`;\n    },\n  );\n\n  let out = rewriteInternalLinks(inlineAssets(html));`;
if (project.includes(oldInitial) && !project.includes("const rewriteInternalLinks")) project = project.replace(oldInitial, newInitial);

const oldRoute = `document.documentElement.innerHTML = PAGES[target];\n    executeScripts(document);\n    window.scrollTo(0, 0);`;
const newRoute = `const parsed = new DOMParser().parseFromString(PAGES[target], "text/html");\n    document.title = parsed.title || target;\n    document.head.querySelectorAll("[data-zeros-page-head]").forEach((node) => node.remove());\n    parsed.head.querySelectorAll("style,link,meta:not([charset]),title").forEach((node) => {\n      const clone = node.cloneNode(true);\n      if (clone instanceof HTMLElement) clone.setAttribute("data-zeros-page-head", "true");\n      document.head.appendChild(clone);\n    });\n    document.body.innerHTML = parsed.body.innerHTML;\n    executeScripts(document);\n    window.__ZEROS_PREVIEW__ = { page: target, pages: Object.keys(PAGES), runtime: true };\n    window.scrollTo(0, 0);`;
if (project.includes(oldRoute)) project = project.replace(oldRoute, newRoute);

const oldExecLoop = `      old.replaceWith(fresh);\n    });`;
const newExecLoop = `      old.replaceWith(fresh);\n    });\n    try { document.dispatchEvent(new Event("DOMContentLoaded")); } catch {}`;
if (project.includes(oldExecLoop) && !project.includes('document.dispatchEvent(new Event("DOMContentLoaded"))')) project = project.replace(oldExecLoop, newExecLoop);

await writeFile(projectPath, project, "utf8");
