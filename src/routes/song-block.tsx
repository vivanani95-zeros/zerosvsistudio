import type { SongSpec } from "@/lib/song";

/**
 * Song player only — no lyrics dump, no JSON, no internal arrangement.
 * User sees: title · BPM, audio preview, Download .wav
 */
export function SongBlock({
  spec,
  url,
}: {
  spec?: SongSpec | null;
  url?: string | undefined;
}) {
  const title = spec?.title || "Zeros track";
  const bpm = typeof spec?.bpm === "number" ? spec.bpm : 120;
  const safeName =
    title
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "zeros-song";

  return (
    <div className="mt-3 rounded-2xl border border-white/10 bg-black/50 p-4 backdrop-blur-md">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-bold text-white">{title}</h3>
        <span className="shrink-0 text-[11px] font-medium uppercase tracking-wider text-white/50">
          {bpm} BPM
        </span>
      </div>
      {url ? (
        <>
          <audio controls src={url} className="mt-3 w-full" preload="metadata" />
          <a
            href={url}
            download={`${safeName}.wav`}
            className="mt-2 inline-block rounded-lg bg-cyan-400 px-3 py-1.5 text-xs font-semibold text-black"
          >
            Download .wav
          </a>
        </>
      ) : (
        <p className="mt-3 text-xs text-white/50">Rendering audio…</p>
      )}
    </div>
  );
}
