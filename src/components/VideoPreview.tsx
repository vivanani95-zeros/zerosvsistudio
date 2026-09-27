import type { VideoSpec } from "@/lib/video-spec";

/**
 * Video player only — no internal script/JSON dump.
 * Download prefers .mp4 when the encoder produced MP4.
 */
export function VideoPreview({
  spec,
  url,
  format = "webm",
}: {
  spec: VideoSpec;
  url?: string | undefined;
  format?: "mp4" | "webm";
}) {
  const safeName =
    (spec.title || "zeros-video")
      .replace(/[^a-z0-9]+/gi, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "zeros-video";

  const secs = Math.round(spec.durationSec || 0);
  const w = spec.width || 1920;
  const resLabel = w >= 2560 ? "1440p" : w >= 1920 ? "1080p" : w >= 1280 ? "720p" : `${w}p`;
  const ext = format === "mp4" ? "mp4" : "webm";

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-card/50">
      <div className="flex items-baseline justify-between gap-3 px-4 pt-4">
        <h3 className="text-sm font-bold">{spec.title}</h3>
        <span className="shrink-0 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {secs}s · {spec.fps || 30}fps · {resLabel} · audio · {ext}
        </span>
      </div>
      {url ? (
        <>
          <video
            controls
            src={url}
            className="mt-3 aspect-video w-full bg-black"
            preload="metadata"
            playsInline
          />
          <div className="px-4 pb-4 pt-2">
            <a
              href={url}
              download={`${safeName}.${ext}`}
              className="inline-block rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
            >
              Download {ext.toUpperCase()}
            </a>
          </div>
        </>
      ) : (
        <p className="px-4 py-6 text-xs text-muted-foreground">Rendering 3D frames + audio…</p>
      )}
    </div>
  );
}
