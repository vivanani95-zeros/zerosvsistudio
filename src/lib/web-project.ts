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

/** Inlines every locally-referenced stylesheet and script so the preview runs standalone. */
export function assembleWebProject(project: WebProject, entry = "index.html"): string {
  const files = project.files;
  const html =
    files[entry] ??
    files["index.html"] ??
    Object.entries(files).find(([f]) => f.endsWith(".html"))?.[1] ??
    "<!doctype html><title>Zeros project</title>";

  const find = (href: string): string | undefined => {
    const clean = href.replace(/^\.\//, "").replace(/^\//, "").split(/[?#]/)[0] ?? "";
    if (files[clean] !== undefined) return files[clean];
    const match = Object.keys(files).find((f) => baseName(f) === baseName(clean));
    return match ? files[match] : undefined;
  };

  let out = html
    .replace(/<link[^>]*href=["']([^"']+\.css)["'][^>]*>/gi, (tag, href: string) => {
      const css = find(href);
      return css !== undefined ? `<style>${css}</style>` : tag;
    })
    .replace(
      /<script[^>]*src=["']([^"']+\.js)["'][^>]*><\/script>/gi,
      (tag, src: string) => {
        const js = find(src);
        return js !== undefined ? `<script>${js}\n<\/script>` : tag;
      },
    );

  // Cross-page links can't work inside a single-document preview.
  out = out.replace(/href=["'](?!https?:|#|mailto:)([^"']*\.html)["']/gi, 'href="#"');
  return out;
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
