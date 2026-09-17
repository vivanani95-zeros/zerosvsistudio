import type { WebProject } from "./web-project";

export type WebQAResult = { ok: boolean; errors: string[]; warnings: string[] };

/** Static preflight for generated sites. It catches broken internal assets/links before the result is shown. */
export function preflightWebProject(project: WebProject): WebQAResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const files = project.files;
  const htmlPages = Object.keys(files).filter((f) => f.toLowerCase().endsWith(".html"));
  const exists = (value: string) => {
    const clean = value.replace(/^\.\//, "").replace(/^\//, "").split(/[?#]/)[0];
    return !!files[clean] || Object.keys(files).some((f) => f.split("/").pop() === clean.split("/").pop());
  };

  if (!files["index.html"]) errors.push("index.html is missing");
  if (htmlPages.length < 2) warnings.push("Only one HTML page was generated");

  for (const [path, source] of Object.entries(files)) {
    if (!source.trim()) errors.push(`${path} is empty`);
    if (!path.toLowerCase().endsWith(".html")) continue;
    if (!/<title\b/i.test(source)) warnings.push(`${path} has no <title>`);

    for (const match of source.matchAll(/href=["']([^"']+)["']/gi)) {
      const href = match[1] ?? "";
      if (/^(https?:|mailto:|tel:|javascript:|#)/i.test(href)) continue;
      const clean = href.split(/[?#]/)[0] ?? "";
      if (clean.endsWith(".html") && !exists(clean)) errors.push(`${path} → missing page: ${href}`);
      if (clean.endsWith(".css") && !exists(clean)) errors.push(`${path} → missing stylesheet: ${href}`);
    }
    for (const match of source.matchAll(/(?:src|href)=["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']/gi)) {
      const asset = match[1] ?? "";
      if (/^https?:/i.test(asset)) continue;
      if (!exists(asset)) errors.push(`${path} → missing asset: ${asset}`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
