import { Suspense, lazy, type CSSProperties } from "react";

const Spline = lazy(() => import("@splinetool/react-spline"));

const MAI_SCENE = "https://prod.spline.design/U5mio-gxbLjNPoD8/scene.splinecode";

export default function MaiSplineBackground({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <div aria-hidden="true" className={className} style={style}>
      <Suspense
        fallback={
          <div className="flex h-full w-full items-center justify-center bg-black">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-500/20 border-t-emerald-400" />
          </div>
        }
      >
        <Spline scene={MAI_SCENE} className="h-full w-full" />
      </Suspense>
    </div>
  );
}
