export type WebProject = { files: Record<string, string> };

export function assembleWebProject(project: WebProject): string {
  const html = project.files["index.html"] ?? "<!doctype html><title>Zeros project</title>";
  const css = project.files["styles.css"] ?? "";
  const js = project.files["script.js"] ?? "";
  return html
    .replace(/<link[^>]+href=["']\.\/?styles\.css["'][^>]*>/i, `<style>${css}</style>`)
    .replace(/<script[^>]+src=["']\.\/?script\.js["'][^>]*><\/script>/i, `<script>${js}<\/script>`)
    .replace("</head>", `<style>${css}</style></head>`)
    .replace("</body>", `<script>${js}<\/script></body>`);
}

export function extractWebProject(text: string): WebProject | null {
  const files: Record<string, string> = {};
  const pattern = /```(?:file:)?([^\n`]*)\n([\s\S]*?)```/gi;
  for (const match of text.matchAll(pattern)) {
    const label = (match[1] ?? "").trim().toLowerCase();
    const body = (match[2] ?? "").trim();
    if (label.includes("html")) files["index.html"] = body;
    else if (label.includes("css")) files["styles.css"] = body;
    else if (label.includes("js") || label.includes("javascript")) files["script.js"] = body;
  }
  return files["index.html"] ? { files } : null;
}