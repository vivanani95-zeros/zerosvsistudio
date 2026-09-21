import { readFile, writeFile } from "node:fs/promises";

const projectPath = "src/lib/web-project.ts";
let project = await readFile(projectPath, "utf8");

// This build patch is intentionally syntax-safe and idempotent.
// The current web-project.ts already contains the persistent preview/router logic.
// Keep this script as a compatibility patcher for older commits without embedding
// nested template literals that can break Node's parser during Cloudflare builds.

const oldRoute = [
  "document.documentElement.innerHTML = PAGES[target];",
  "    executeScripts(document);",
  "    window.scrollTo(0, 0);",
].join("\n");

const newRoute = [
  "const parsed = new DOMParser().parseFromString(PAGES[target], \"text/html\");",
  "    document.title = parsed.title || target;",
  "    document.head.querySelectorAll(\"[data-zeros-page-head]\").forEach((node) => node.remove());",
  "    parsed.head.querySelectorAll(\"style,link,meta:not([charset]),title,script\").forEach((node) => {",
  "      const clone = node.cloneNode(true);",
  "      if (clone instanceof HTMLElement) clone.setAttribute(\"data-zeros-page-head\", \"true\");",
  "      document.head.appendChild(clone);",
  "    });",
  "    document.body.innerHTML = parsed.body.innerHTML;",
  "    executeScripts(document);",
  "    window.__ZEROS_PREVIEW__ = { page: target, pages: Object.keys(PAGES), runtime: true };",
  "    window.scrollTo(0, 0);",
].join("\n");

if (project.includes(oldRoute) && !project.includes("data-zeros-page-head")) {
  project = project.replace(oldRoute, newRoute);
}

await writeFile(projectPath, project, "utf8");
console.log("fix-runtime-errors-build: completed safely");
