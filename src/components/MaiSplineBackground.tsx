import type { CSSProperties } from "react";
import { SplineScene } from "@/components/mai-spline/SplineScene";

const MAI_SCENE = "https://prod.spline.design/U5mio-gxbLjNPoD8/scene.splinecode";

export default function MaiSplineBackground({ className, style }: { className?: string; style?: CSSProperties }) {
  return (
    <div aria-hidden="true" className={className} style={style}>
      <SplineScene scene={MAI_SCENE} className="h-full w-full" />
    </div>
  );
}
