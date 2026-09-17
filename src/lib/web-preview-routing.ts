export function normalizePreviewPage(path: string): string {
  return (path.replace(/^\.\//, "").replace(/^\//, "").split(/[?#]/)[0] || "index.html");
}

export function rewritePreviewLinks(source: string, pages: string[]): string {
  return source.replace(/href=["'](?!https?:|mailto:|tel:|javascript:|#)([^"']+)["']/gi, (full, href: string) => {
    const target = normalizePreviewPage(href);
    const page = pages.includes(target) ? target : pages.find((p) => p.split("/").pop() === target.split("/").pop());
    if (!page) return full;
    const hash = href.includes("#") ? href.slice(href.indexOf("#") + 1) : "";
    return `href="#zeros-route=${encodeURIComponent(page)}${hash ? `&anchor=${encodeURIComponent(hash)}` : ""}"`;
  });
}
