import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, CheckCircle2, Download, ExternalLink, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { assembleWebProject, downloadProjectZip, type WebProject } from "@/lib/web-project";

type RuntimeIssue = { kind: string; value: string };

type PreviewMessage =
  | { source: "zeros-preview"; type: "runtime"; kind: string; value: string }
  | { source: "zeros-preview"; type: "page"; path: string }
  | { source: "zeros-preview"; type: "verification"; ok: boolean; missing?: string[]; brokenLocalLinks?: string[]; missingLocalAssets?: string[]; unnamedButtons?: number; nonFunctionalButtons?: string[]; page?: string }
  | { source: "zeros-preview"; type: "screenshot"; dataUrl: string };

export default function WebPreview({
  project,
  name = "zeros-site",
}: {
  project: WebProject;
  name?: string;
}) {
  const pages = useMemo(() => Object.keys(project.files).filter((f) => f.endsWith(".html")), [project.files]);
  const [entry, setEntry] = useState(pages.includes("index.html") ? "index.html" : (pages[0] ?? "index.html"));
  const [currentPage, setCurrentPage] = useState(pages.includes("index.html") ? "index.html" : (pages[0] ?? "index.html"));
  const [tab, setTab] = useState<"preview" | "code">("preview");
  const [openFile, setOpenFile] = useState(entry);
  const [issues, setIssues] = useState<RuntimeIssue[]>([]);
  const [verification, setVerification] = useState<PreviewMessage & { type: "verification" } | null>(null);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [screenshotBusy, setScreenshotBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    const onMessage = (event: MessageEvent<PreviewMessage>) => {
      if (event.data?.source !== "zeros-preview") return;
      if (event.data.type === "runtime") {
        if (event.data.kind === "loaded" || event.data.kind === "screenshot-ready") {
          setLoaded(true);
          return;
        }
        if (event.data.kind === "error" || event.data.kind === "console" || event.data.kind === "screenshot") {
          setIssues((prev) => [...prev.slice(-7), { kind: event.data.kind, value: event.data.value }]);
        }
      } else if (event.data.type === "page") {
        setEntry(event.data.path);
        setCurrentPage(event.data.path);
        setOpenFile(event.data.path);
        setLoaded(true);
        setVerification(null);
        // Re-run the functional-control QA after every generated page navigation.
        window.setTimeout(() => sendToPreview("verify"), 250);
      } else if (event.data.type === "verification") {
        setVerification(event.data);
        if (event.data.ok) setIssues((prev) => prev.filter((i) => i.kind !== "verification"));
        else setIssues((prev) => [...prev, { kind: "verification", value: "Preview QA found one or more issues." }]);
      } else if (event.data.type === "screenshot") {
        setScreenshot(event.data.dataUrl);
        setScreenshotBusy(false);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  useEffect(() => {
    const firstPage = pages.includes("index.html") ? "index.html" : (pages[0] ?? "index.html");
    setEntry(firstPage);
    setCurrentPage(firstPage);
    setOpenFile(firstPage);
    setIssues([]);
    setVerification(null);
    setScreenshot(null);
    setLoaded(false);
  }, [pages.join("|")]);

  // The iframe is one persistent browser runtime for the entire generated website.
  // Page changes are routed inside that runtime instead of replacing srcDoc and
  // destroying the site's JavaScript state.
  const initialPreviewPage = pages.includes("index.html") ? "index.html" : (pages[0] ?? "index.html");
  const html = useMemo(() => assembleWebProject(project, initialPreviewPage), [project, initialPreviewPage]);

  const sendToPreview = (type: "screenshot" | "verify" | "navigate", payload: Record<string, unknown> = {}) => {
    frameRef.current?.contentWindow?.postMessage(
      { source: "zeros-preview-host", type, ...payload },
      "*",
    );
  };

  useEffect(() => {
    if (!loaded) return;
    const timer = window.setTimeout(() => sendToPreview("verify"), 900);
    return () => window.clearTimeout(timer);
  }, [loaded, html]);

  const requestScreenshot = () => {
    setScreenshotBusy(true);
    sendToPreview("screenshot");
    window.setTimeout(() => setScreenshotBusy(false), 8000);
  };

  const openNew = () => {
    const w = window.open("", "_blank");
    const fullHtml = assembleWebProject(project, currentPage);
    w?.document.write(fullHtml);
    w?.document.close();
  };

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-card/30 shadow-2xl shadow-black/10">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card/60 px-3 py-2">
        {(["preview", "code"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${
              tab === t ? "bg-primary text-primary-foreground" : "border border-border hover:bg-muted"
            }`}
          >
            {t}
          </button>
        ))}
        {tab === "preview" && pages.length > 1 && (
          <select
            value={entry}
            onChange={(e) => {
              const nextPage = e.target.value;
              setEntry(nextPage);
              setIssues([]);
              setVerification(null);
              sendToPreview("navigate", { path: nextPage });
            }}
            className="rounded-lg border border-border bg-transparent px-2 py-1.5 text-xs"
          >
            {pages.map((p) => (
              <option key={p} value={p} className="bg-card">
                {p}
              </option>
            ))}
          </select>
        )}
        {tab === "preview" && (
          <div className="ml-auto flex items-center gap-1.5 text-[11px] text-muted-foreground">
            {loaded ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {issues.length ? `${issues.length} QA issue${issues.length === 1 ? "" : "s"}` : "Live runtime"}
          </div>
        )}
      </div>

      {tab === "preview" ? (
        <div className="relative">
          <iframe
            ref={frameRef}
            title="Zeros website preview"
            srcDoc={html}
            sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads"
            allow="fullscreen *; autoplay *; clipboard-read *; clipboard-write *"
            allowFullScreen
            className="h-[30rem] w-full bg-white"
            onLoad={() => setLoaded(true)}
          />
          <div className="pointer-events-none absolute bottom-3 left-3 right-3 flex items-end justify-between gap-2">
            <div className="pointer-events-auto max-w-[75%] rounded-xl border border-black/10 bg-black/75 px-3 py-2 text-[11px] text-white shadow-xl backdrop-blur">
              {verification?.ok ? (
                <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Zeros QA: all generated pages, local links, assets and button wiring passed.</span>
              ) : issues.length ? (
                <span className="inline-flex items-center gap-1.5 text-red-200"><XCircle className="h-3.5 w-3.5" /> {issues[issues.length - 1]?.value}</span>
              ) : (
                <span>Preview runtime is executing the generated site…</span>
              )}
            </div>
            <div className="pointer-events-auto flex gap-1.5">
              <button onClick={() => sendToPreview("verify")} className="rounded-xl border border-white/20 bg-black/75 px-3 py-2 text-[11px] font-semibold text-white backdrop-blur hover:bg-black">
                Verify
              </button>
              <button onClick={requestScreenshot} disabled={screenshotBusy} className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 bg-black/75 px-3 py-2 text-[11px] font-semibold text-white backdrop-blur hover:bg-black disabled:opacity-60">
                <Camera className="h-3.5 w-3.5" /> {screenshotBusy ? "Capturing…" : "Screenshot"}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex h-[30rem]">
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

      {screenshot && tab === "preview" && (
        <div className="border-t border-border bg-card/40 p-3">
          <div className="mb-2 flex items-center justify-between gap-2 text-xs font-semibold">
            <span>Latest preview screenshot</span>
            <a
              href={screenshot}
              download={`${name}-${currentPage.replace(/[^a-z0-9]+/gi, "-")}.png`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 hover:bg-muted"
            >
              <Download className="h-3.5 w-3.5" /> Save
            </a>
          </div>
          <img src={screenshot} alt="Screenshot of the generated website preview" className="max-h-80 w-full rounded-xl border border-border object-contain" />
        </div>
      )}

      {issues.length > 0 && tab === "preview" && (
        <div className="border-t border-border bg-destructive/5 px-3 py-2 text-[11px] text-muted-foreground">
          <div className="font-semibold text-foreground">Runtime / QA log</div>
          {verification?.nonFunctionalButtons?.length ? (
            <div className="mb-1 truncate text-red-200">
              Suspect buttons: {verification.nonFunctionalButtons.join(" · ")}
            </div>
          ) : null}
          {verification?.missingLocalAssets?.length ? (
            <div className="mb-1 truncate text-amber-200">
              Missing local assets: {verification.missingLocalAssets.join(" · ")}
            </div>
          ) : null}
          {issues.slice(-5).map((issue, index) => <div key={`${issue.kind}-${index}`} className="truncate">{issue.kind}: {issue.value}</div>)}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 border-t border-border bg-card/60 px-3 py-2">
        <span className="text-xs text-muted-foreground">
          {Object.keys(project.files).length} files · {pages.length} pages
        </span>
        <div className="flex gap-2">
          <button onClick={openNew} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted">
            <ExternalLink className="h-3.5 w-3.5" /> Open full
          </button>
          <button onClick={() => void downloadProjectZip(project, name)} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:opacity-90">
            <Download className="h-3.5 w-3.5" /> Download .zip
          </button>
        </div>
      </div>
    </div>
  );
}
