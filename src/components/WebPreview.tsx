import { useState } from "react";
import { assembleWebProject, downloadProjectZip, type WebProject } from "@/lib/web-project";

export default function WebPreview({
  project,
  name = "zeros-site",
}: {
  project: WebProject;
  name?: string;
}) {
  const pages = Object.keys(project.files).filter((f) => f.endsWith(".html"));
  const [entry, setEntry] = useState(pages.includes("index.html") ? "index.html" : (pages[0] ?? "index.html"));
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [openFile, setOpenFile] = useState(entry);
  const html = assembleWebProject(project, entry);

  const openNew = () => {
    const w = window.open("", "_blank");
    w?.document.write(html);
    w?.document.close();
  };

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-border">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card/60 px-3 py-2">
        {(["preview", "code"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1 text-xs font-semibold capitalize ${
              tab === t ? "bg-primary text-primary-foreground" : "border border-border"
            }`}
          >
            {t}
          </button>
        ))}
        {tab === "preview" && pages.length > 1 && (
          <select
            value={entry}
            onChange={(e) => setEntry(e.target.value)}
            className="rounded-lg border border-border bg-transparent px-2 py-1 text-xs"
          >
            {pages.map((p) => (
              <option key={p} value={p} className="bg-card">
                {p}
              </option>
            ))}
          </select>
        )}
      </div>

      {tab === "preview" ? (
        <iframe
          title="Zeros website preview"
          srcDoc={html}
          sandbox="allow-scripts"
          className="h-[26rem] w-full bg-white"
        />
      ) : (
        <div className="flex h-[26rem]">
          <ul className="w-40 shrink-0 overflow-auto border-r border-border bg-card/40 text-xs">
            {Object.keys(project.files).map((f) => (
              <li key={f}>
                <button
                  onClick={() => setOpenFile(f)}
                  className={`block w-full truncate px-2 py-1.5 text-left ${
                    openFile === f ? "bg-primary/20 text-primary" : "text-muted-foreground"
                  }`}
                >
                  {f}
                </button>
              </li>
            ))}
          </ul>
          <pre className="flex-1 overflow-auto bg-[oklch(0.06_0.008_265)] p-3 text-[11px] leading-relaxed">
            <code>{project.files[openFile] ?? project.files["index.html"]}</code>
          </pre>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-border bg-card/60 px-3 py-2">
        <span className="text-xs text-muted-foreground">
          {Object.keys(project.files).length} files · {pages.length} pages
        </span>
        <div className="flex gap-2">
          <button
            onClick={openNew}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold"
          >
            Open full
          </button>
          <button
            onClick={() => void downloadProjectZip(project, name)}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
          >
            Download .zip
          </button>
        </div>
      </div>
    </div>
  );
}
