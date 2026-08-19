export default function WebPreview({
  html,
  name = "zeros-site",
}: {
  html: string;
  name?: string;
}) {
  const download = () => {
    const blob = new Blob([html], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name}.html`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const openNew = () => {
    const w = window.open("", "_blank");
    w?.document.write(html);
    w?.document.close();
  };

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-border">
      <iframe
        title="Zeros website preview"
        srcDoc={html}
        sandbox="allow-scripts"
        className="h-[26rem] w-full bg-white"
      />
      <div className="flex items-center justify-between gap-3 border-t border-border bg-card/60 px-3 py-2">
        <span className="text-xs text-muted-foreground">Live preview</span>
        <div className="flex gap-2">
          <button
            onClick={openNew}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold"
          >
            Open full
          </button>
          <button
            onClick={download}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
          >
            Download .html
          </button>
        </div>
      </div>
    </div>
  );
}
