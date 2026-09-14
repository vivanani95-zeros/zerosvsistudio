import { useEffect, useRef, useState } from "react";

type Point = { x: number; y: number };

/** A non-destructive-on-load paint surface for refining a Zeros render. */
export default function ImageStudio({
  src,
  name = "zeros-studio-image",
}: {
  src: string;
  name?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const last = useRef<Point | null>(null);
  const history = useRef<ImageData[]>([]);
  const [ready, setReady] = useState(false);
  const [color, setColor] = useState("#7eefff");
  const [size, setSize] = useState(18);
  const [eraser, setEraser] = useState(false);
  const [dirty, setDirty] = useState(false);

  const context = () => canvasRef.current?.getContext("2d") ?? null;
  const snapshot = () => {
    const canvas = canvasRef.current;
    const ctx = context();
    if (canvas && ctx) history.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const image = new Image();
    image.onload = () => {
      const ratio = image.naturalWidth / image.naturalHeight || 16 / 9;
      canvas.width = 1920;
      canvas.height = Math.round(1920 / ratio);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      history.current = [ctx.getImageData(0, 0, canvas.width, canvas.height)];
      setDirty(false);
      setReady(true);
    };
    image.src = src;
  }, [src]);

  const point = (event: React.PointerEvent<HTMLCanvasElement>): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) * canvas.width) / rect.width,
      y: ((event.clientY - rect.top) * canvas.height) / rect.height,
    };
  };
  const paint = (a: Point, b: Point) => {
    const ctx = context();
    if (!ctx) return;
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = (size * 1920) / Math.max(canvasRef.current?.clientWidth || 1, 1);
    ctx.globalCompositeOperation = eraser ? "destination-out" : "source-over";
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
  };
  const undo = () => {
    const canvas = canvasRef.current;
    const ctx = context();
    if (!canvas || !ctx || history.current.length < 2) return;
    history.current.pop();
    ctx.putImageData(history.current[history.current.length - 1], 0, 0);
    setDirty(history.current.length > 1);
  };
  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = context();
    if (!canvas || !ctx) return;
    snapshot();
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setDirty(true);
  };
  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = `${name}.png`;
    link.click();
  };
  const chip = (active: boolean) =>
    `rounded-md px-2 py-1 text-[10px] font-bold tracking-wide transition ${active ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground hover:text-foreground"}`;

  return (
    <div className="mt-3 overflow-hidden rounded-2xl border border-border bg-card/30">
      <div className="relative bg-[#04060a]">
        <canvas
          ref={canvasRef}
          aria-label="Zeros Paint Lab canvas"
          className="aspect-video w-full touch-none cursor-crosshair"
          onPointerDown={(event) => {
            const p = point(event);
            if (!p) return;
            snapshot();
            drawing.current = true;
            last.current = p;
            event.currentTarget.setPointerCapture(event.pointerId);
            paint(p, p);
            setDirty(true);
          }}
          onPointerMove={(event) => {
            const p = point(event);
            if (!drawing.current || !last.current || !p) return;
            paint(last.current, p);
            last.current = p;
          }}
          onPointerUp={() => {
            drawing.current = false;
            last.current = null;
          }}
          onPointerCancel={() => {
            drawing.current = false;
            last.current = null;
          }}
        />
        <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2">
          <span className="rounded-md border border-primary/30 bg-black/70 px-2 py-1 text-[10px] font-black tracking-[.18em] text-primary">
            ZEROS PAINT LAB
          </span>
          <span className="rounded-md border border-white/10 bg-black/55 px-2 py-1 text-[10px] font-semibold text-white/65">
            PIXEL WORKSPACE
          </span>
        </div>
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/45">
            <span className="rounded-xl border border-white/10 bg-black/70 px-4 py-3 text-xs font-semibold">
              Preparing 1920px canvas…
            </span>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-border bg-card/45 px-3 py-2">
        <span className="text-[10px] font-black uppercase tracking-[.14em] text-muted-foreground">
          Paint workspace
        </span>
        <button className={chip(!eraser)} onClick={() => setEraser(false)}>
          Brush
        </button>
        <button className={chip(eraser)} onClick={() => setEraser(true)}>
          Eraser
        </button>
        <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
          Color{" "}
          <input
            aria-label="Brush color"
            type="color"
            value={color}
            onChange={(e) => {
              setColor(e.target.value);
              setEraser(false);
            }}
            className="h-6 w-7 rounded border-0 bg-transparent p-0"
          />
        </label>
        <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
          Size{" "}
          <input
            aria-label="Brush size"
            type="range"
            min="2"
            max="96"
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            className="w-20 accent-primary"
          />
        </label>
        <button className={chip(false)} onClick={undo}>
          Undo
        </button>
        <button className={chip(false)} onClick={clear}>
          Clear
        </button>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border bg-card/60 px-3 py-2">
        <span className="text-xs text-muted-foreground">
          {dirty
            ? "Local paint edits ready to export"
            : "1920px studio render · paint directly on canvas"}
        </span>
        <button
          onClick={download}
          disabled={!ready}
          className="rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-40"
        >
          Export .png
        </button>
      </div>
    </div>
  );
}
