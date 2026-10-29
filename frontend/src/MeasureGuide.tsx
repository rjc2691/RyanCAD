import { forwardRef, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import { measureVector, pointLetter, type MeasurePoint } from "./measureModel";
import { numeric } from "./api";
export interface MeasureGuideHandle {
  update: (camera: THREE.Camera, width: number, height: number) => void;
}
export default forwardRef<
  MeasureGuideHandle,
  { points: MeasurePoint[]; units: "mm" | "in" }
>(function MeasureGuide({ points, units }, ref) {
  const svg = useRef<SVGSVGElement>(null),
    latest = useRef({ points, units });
  latest.current = { points, units };
  useImperativeHandle(
    ref,
    () => ({
      update(camera, width, height) {
        const root = svg.current;
        if (!root) return;
        root.setAttribute("viewBox", `0 0 ${width} ${height}`);
        const samples = latest.current.points;
        const projected = samples.map((p) =>
          new THREE.Vector3().fromArray(p.point).project(camera),
        );
        const screen = projected.map((v) => [
          ((v.x + 1) * width) / 2,
          ((1 - v.y) * height) / 2,
        ]);
        samples.forEach((_, i) => {
          const el = root.querySelector<SVGGElement>(`[data-point="${i}"]`);
          if (!el) return;
          el.setAttribute("transform", `translate(${screen[i].join(" ")})`);
          el.setAttribute(
            "visibility",
            Math.abs(projected[i].z) <= 1 ? "visible" : "hidden",
          );
          if (i === 0) return;
          const pair = root.querySelector<SVGGElement>(`[data-pair="${i}"]`);
          if (!pair) return;
          pair.setAttribute(
            "visibility",
            Math.abs(projected[i].z) <= 1 && Math.abs(projected[i - 1].z) <= 1
              ? "visible"
              : "hidden",
          );
          const [a, b] = [screen[i - 1], screen[i]];
          pair
            .querySelectorAll("path")
            .forEach((path) =>
              path.setAttribute("d", `M${a.join(",")} L${b.join(",")}`),
            );
          const text = pair.querySelector("text")!;
          text.setAttribute("x", String((a[0] + b[0]) / 2));
          text.setAttribute("y", String((a[1] + b[1]) / 2 - 10));
          text.textContent = `${numeric(measureVector(samples[i - 1].point, samples[i].point).distance / (latest.current.units === "in" ? 25.4 : 1), 4)} ${latest.current.units}`;
        });
      },
    }),
    [],
  );
  return (
    <svg ref={svg} className="measure-viewport-guide" aria-hidden="true">
      {points.slice(1).map((_, j) => (
        <g key={`pair${j}`} data-pair={j + 1}>
          <path className="measure-line-halo" />
          <path className="measure-line" />
          <text textAnchor="middle" />
        </g>
      ))}
      {points.map((_, i) => (
        <g
          key={i}
          data-point={i}
          className={i === 0 ? "measure-start" : "measure-end"}
        >
          <circle r="5" />
          <path d="M-9 0H9 M0-9V9" />
          <text x="11" y="-11">
            {pointLetter(i)}
          </text>
        </g>
      ))}
    </svg>
  );
});
