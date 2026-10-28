import { projectedAxes } from "./viewOrientationModel";
import { forwardRef, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import type { WorldAxis } from "./movementModel";
export interface ViewOrientationHandle {
  update: (camera: THREE.Camera) => void;
}
export default forwardRef<
  ViewOrientationHandle,
  {
    units: string;
    onAxis: (axis: WorldAxis) => void;
    onOrigin: () => void;
    selectedAxis?: WorldAxis | null;
  }
>(function ViewOrientation({ units, onAxis, onOrigin, selectedAxis }, ref) {
  const svg = useRef<SVGSVGElement>(null);
  useImperativeHandle(
    ref,
    () => ({
      update(camera) {
        if (!svg.current) return;
        for (const [i, p] of projectedAxes(camera.quaternion).entries()) {
          const root = svg.current.querySelector(`[data-axis="${"XYZ"[i]}"]`)!;
          const line = root.querySelector("line")!,
            label = root.querySelector("text")!,
            dot = root.querySelector("circle")!;
          const x = 43 + p.x * 27,
            y = 41 - p.y * 27;
          line.setAttribute("x2", String(x));
          line.setAttribute("y2", String(y));
          const hit = root.querySelector(".axis-hit")!;
          hit.setAttribute("x2", String(x));
          hit.setAttribute("y2", String(y));
          dot.setAttribute("cx", String(x));
          dot.setAttribute("cy", String(y));
          const endOn = Math.hypot(p.x, p.y) < 0.15;
          label.setAttribute("x", String(endOn ? x + 9 : 43 + p.x * 38));
          label.setAttribute("y", String(endOn ? y - 9 : 44 - p.y * 38));
          root.setAttribute("data-depth", p.z >= 0 ? "front" : "back");
        }
      },
    }),
    [],
  );
  return (
    <div className="view-orientation" aria-label="Camera orientation">
      <svg
        ref={svg}
        width="132"
        height="123"
        viewBox="0 0 88 82"
        aria-label="World XYZ axes follow the viewport camera"
      >
        {["X", "Y", "Z"].map((axis) => (
          <g
            key={axis}
            data-axis={axis}
            role="button"
            tabIndex={0}
            aria-label={`Use world ${axis} axis`}
            aria-pressed={selectedAxis === axis}
            onClick={() => onAxis(axis as WorldAxis)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onAxis(axis as WorldAxis);
              }
            }}
          >
            <title>{`Use world ${axis} axis as direction / rotation axis`}</title>
            <line x1="43" y1="41" />
            <line className="axis-hit" x1="43" y1="41" />
            <circle r="2.5" />
            <text textAnchor="middle">{axis}</text>
          </g>
        ))}
        <g
          role="button"
          tabIndex={0}
          aria-label="Use world origin"
          onClick={onOrigin}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              e.stopPropagation();
              onOrigin();
            }
          }}
        >
          <title>World origin · select as an operation reference point</title>
          <circle className="origin-hit" cx="43" cy="41" r="7" />
          <circle cx="43" cy="41" r="3" fill="#c8d5df" />
        </g>
      </svg>
      <span>{units}</span>
    </div>
  );
});
