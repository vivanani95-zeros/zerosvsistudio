import { useState } from "react";
import type { SongSpec } from "@/lib/song";

export function SongBlock({
  spec,
  url,
  onRender,
}: {
  spec: SongSpec;
  url?: string | undefined;
  onRender: (spec: SongSpec) => Promise<void>;
}) {
  const [rendering, setRendering] = useState(false);
  return (
    <div className="mt-3 rounded-2xl border border-border bg-card/50 p-4">
      <h3 className="text-sm font-bold">{spec.title}</h3>
      {url ? (
        <>
          <audio controls src={url} className="mt-3 w-full" />
          <a
            href={url}
            download={`${spec.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.wav`}
            className="mt-2 inline-block rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground"
          >
            Download .wav
          </a>
        </>
      ) : (
        <button
          onClick={async () => {
            setRendering(true);
            await onRender(spec);
            setRendering(false);
          }}
          disabled={rendering}
          className="mt-3 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          {rendering ? "Rendering audio…" : "Render audio"}
        </button>
      )}
      <div className="mt-4 space-y-3 text-xs text-muted-foreground">
        {spec.lyrics?.map((s, i) => (
          <div key={i}>
            <p className="font-semibold text-foreground">{s.section}</p>
            {s.lines?.map((l, j) => (
              <p key={j}>{l}</p>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
