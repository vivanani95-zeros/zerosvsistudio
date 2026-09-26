import type { SongSpec } from "@/lib/song";

/**
 * Song player only — no lyrics dump, no JSON, no internal arrangement.
 * User sees: title · BPM, audio preview, Download .wav
 */
export function SongBlock({
  spec,
  url,
}: {
  spec: SongSpec;
  url?: string | undefined;
}) {
  const safeName = (spec.title || "zeros-song")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase() || "zeros-song";

  return (
    <div className="mt-3 rounded-2xl border border-border bg-card/50 p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-bold">{spec.title}</h3>
        <span className="shrink-0 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {spec.bpm} BPM
        </span>
      </div>
      {url ? (
        <>
          <audio controls src={url} className="mt-3 w-full" preload="metadata" />
          <a
            href={url}
            download={`${safeName}.wav`}
            className="mt-2 inline-block rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
          >
            Download .wav
          </a>
        </>
      ) : (
        <p className="mt-3 text-xs text-muted-foreground">Rendering audio…</p>
      )}
    </div>
  );
}
