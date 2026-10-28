import { forwardRef, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import type { MovementGuideData } from "./movementModel";
export interface MovementGuideHandle {
  update: (camera: THREE.Camera, width: number, height: number) => void;
}
export default forwardRef<
  MovementGuideHandle,
  { guide?: MovementGuideData | null }
>(function MovementGuide({ guide }, ref) {
  const svg = useRef<SVGSVGElement>(null),
    latest = useRef(guide);
  latest.current = guide;
  useImperativeHandle(
    ref,
    () => ({
      update(camera, width, height) {
        const root = svg.current,
          g = latest.current;
        if (!root || !g) return;
        root.setAttribute("viewBox", `0 0 ${width} ${height}`);
        const project = (p: number[]) => {
          const v = new THREE.Vector3().fromArray(p).project(camera);
          return [((v.x + 1) * width) / 2, ((1 - v.y) * height) / 2];
        };
        const line = (
          name: string,
          a?: number[] | null,
          b?: number[] | null,
        ) => {
          const el = root.querySelector(`[data-move="${name}"]`)!;
          el.setAttribute(
            "d",
            a && b && Math.hypot(...a.map((n, i) => n - b[i])) > 1e-7
              ? `M${project(a).join(",")} L${project(b).join(",")}`
              : "",
          );
        };
        line(
          "travel-halo",
          g.rotation_angle === undefined ? g.origin : undefined,
          g.destination,
        );
        line(
          "travel",
          g.rotation_angle === undefined ? g.origin : undefined,
          g.destination,
        );
        line("gap", g.destination, g.target);
        let arc = "";
        const angleLabel = root.querySelector('[data-move="angle-label"]')!;
        angleLabel.setAttribute("visibility", "hidden");
        if (
          g.rotation_angle !== undefined &&
          g.origin &&
          g.direction &&
          g.directionStart
        ) {
          const axis = new THREE.Vector3().fromArray(g.direction).normalize(),
            pivot = new THREE.Vector3().fromArray(g.directionStart),
            origin = new THREE.Vector3().fromArray(g.origin);
          const center = pivot
            .clone()
            .addScaledVector(axis, origin.clone().sub(pivot).dot(axis));
          let radial = origin.clone().sub(center);
          if (radial.length() < 1e-5)
            radial = new THREE.Vector3(
              Math.abs(axis.x) < 0.8 ? 1 : 0,
              Math.abs(axis.x) < 0.8 ? 0 : 1,
              0,
            )
              .cross(axis)
              .normalize()
              .multiplyScalar(12);
          const angle = THREE.MathUtils.degToRad(
            Math.max(-360, Math.min(360, g.rotation_angle)),
          );
          const points = Array.from({ length: 49 }, (_, i) =>
            center
              .clone()
              .add(radial.clone().applyAxisAngle(axis, (angle * i) / 48))
              .toArray(),
          );
          arc = points
            .map((p, i) => `${i ? "L" : "M"}${project(p).join(",")}`)
            .join(" ");
          const p = project(points[24]);
          angleLabel.setAttribute("x", String(p[0] + 10));
          angleLabel.setAttribute("y", String(p[1] - 10));
          angleLabel.textContent = `${Number(g.rotation_angle.toFixed(3))}°`;
          angleLabel.setAttribute("visibility", "visible");
        }
        root
          .querySelector('[data-move="rotation-halo"]')!
          .setAttribute("d", arc);
        root
          .querySelector('[data-move="rotation-arc"]')!
          .setAttribute("d", arc);
        const start = g.directionStart || g.origin;
        let a: number[] | undefined, b: number[] | undefined;
        if (g.directionStart && g.directionEnd) {
          a = g.directionStart;
          b = g.directionEnd;
          if (
            g.direction &&
            g.direction
              .map((v, i) => v * (b![i] - a![i]))
              .reduce((x, y) => x + y, 0) < 0
          )
            [a, b] = [b, a];
        } else if (start && g.direction) {
          const p = project(start),
            q = project(start.map((n, i) => n + g.direction![i]));
          const px = Math.hypot(q[0] - p[0], q[1] - p[1]),
            scale = px > 0.01 ? 65 / px : 15;
          a = start.map((n, i) => n - g.direction![i] * scale);
          b = start.map((n, i) => n + g.direction![i] * scale);
        }
        line("direction-halo", a, b);
        line("direction", a, b);
        for (const name of ["origin", "destination", "target"] as const) {
          const el = root.querySelector(`[data-move="${name}"]`)!;
          const point = g[name];
          const coincident =
            name === "destination" &&
            point &&
            [g.target, g.origin].some(
              (other) =>
                other &&
                Math.hypot(...point.map((n, i) => n - other[i])) < 1e-6,
            );
          el.setAttribute(
            "visibility",
            point && !coincident ? "visible" : "hidden",
          );
          if (point)
            el.setAttribute(
              "transform",
              `translate(${project(point).join(" ")})`,
            );
        }
      },
    }),
    [],
  );
  return (
    <svg
      ref={svg}
      className="movement-guide"
      aria-label="Movement references and displacement"
      style={{ display: guide ? undefined : "none" }}
    >
      <defs>
        <marker
          id="move-arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto"
        >
          <path
            d="M0 0 L10 5 L0 10"
            fill="none"
            stroke="#77dcc1"
            strokeWidth="1.7"
          />
        </marker>
        <marker
          id="move-direction-arrow"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="5"
          markerHeight="5"
          orient="auto"
        >
          <path
            d="M0 0 L10 5 L0 10"
            fill="none"
            stroke="#b4a0ff"
            strokeWidth="1.7"
          />
        </marker>
      </defs>
      <path
        data-move="direction-halo"
        stroke="#10171e"
        strokeWidth="6"
        fill="none"
      />
      <path
        data-move="direction"
        stroke="#b4a0ff"
        strokeWidth="2.5"
        strokeDasharray="7 4"
        fill="none"
        markerEnd="url(#move-direction-arrow)"
      />
      <path
        data-move="travel-halo"
        stroke="#10171e"
        strokeWidth="6"
        fill="none"
      />
      <path
        data-move="travel"
        stroke="#77dcc1"
        strokeWidth="2.5"
        fill="none"
        markerEnd="url(#move-arrow)"
      />
      <path
        data-move="gap"
        stroke="#ffc281"
        strokeWidth="1.5"
        strokeDasharray="3 5"
        fill="none"
      />
      <path
        data-move="rotation-halo"
        stroke="#10171e"
        strokeWidth="6"
        fill="none"
      />
      <path
        data-move="rotation-arc"
        stroke="#77dcc1"
        strokeWidth="2.5"
        fill="none"
        markerEnd="url(#move-arrow)"
      />
      <text data-move="angle-label" />
      <g data-move="origin" className="move-origin">
        <circle r="6" fill="#10171e" stroke="#ffc281" strokeWidth="2" />
        <path d="M-10 0 H10 M0 -10 V10" stroke="#ffc281" strokeWidth="1.5" />
        <text x="12" y="-10">
          Origin
        </text>
      </g>
      <g data-move="destination" className="move-destination">
        <circle r="5" fill="#77dcc1" stroke="#10171e" strokeWidth="2" />
        <text x="12" y="19">
          Moved origin
        </text>
      </g>
      <g data-move="target" className="move-target-marker">
        <path
          d="M0 -8 L8 0 L0 8 L-8 0Z"
          fill="#10171e"
          stroke="#a5caff"
          strokeWidth="2"
        />
        <text x="12" y="-12">
          Target
        </text>
      </g>
    </svg>
  );
});
