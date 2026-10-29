import { forwardRef, useImperativeHandle, useMemo, useRef } from "react";
import * as THREE from "three";
import { explodedLayout } from "./explodedView";
import type { SectionSettings } from "./sectionView";
import type { Geometry, Occurrence } from "./types";
export interface SectionGuideHandle {
  update: (scene: any) => void;
}
export default forwardRef<
  SectionGuideHandle,
  {
    reference: NonNullable<SectionSettings["reference"]>;
    offset: number;
    occurrences: Occurrence[];
    geometry: Record<string, Geometry>;
    explode: number;
    units?: string;
  }
>(function SectionGuide(props, ref) {
  const svg = useRef<SVGSVGElement>(null),
    latest = useRef(props);
  latest.current = props;
  const plane = useMemo(() => {
    const n = new THREE.Vector3().fromArray(props.reference.normal).normalize(),
      origin = new THREE.Vector3().fromArray(props.reference.origin);
    const { collection } = explodedLayout(
      props.occurrences.filter((o) => o.visible),
      props.geometry,
      props.explode,
    );
    const center = collection.isEmpty()
      ? origin.clone()
      : collection.getCenter(new THREE.Vector3());
    center.addScaledVector(n, -center.clone().sub(origin).dot(n));
    const half = Math.max(
      5,
      collection.isEmpty()
        ? 25
        : collection.getSize(new THREE.Vector3()).length() * 0.55,
    );
    const u = new THREE.Vector3()
      .crossVectors(
        n,
        Math.abs(n.z) < 0.9
          ? new THREE.Vector3(0, 0, 1)
          : new THREE.Vector3(0, 1, 0),
      )
      .normalize();
    const v = new THREE.Vector3().crossVectors(n, u).normalize();
    return {
      n,
      origin,
      corners: [
        [-1, -1],
        [1, -1],
        [1, 1],
        [-1, 1],
      ].map(([a, b]) =>
        center
          .clone()
          .addScaledVector(u, a * half)
          .addScaledVector(v, b * half),
      ),
    };
  }, [props.reference, props.occurrences, props.geometry, props.explode]);
  useImperativeHandle(
    ref,
    () => ({
      update(scene) {
        const root = svg.current;
        if (!root) return;
        const p = latest.current;
        const project = (point: THREE.Vector3) => {
          const v = point.clone().project(scene.camera);
          return {
            x: ((v.x + 1) * scene.width) / 2,
            y: ((1 - v.y) * scene.height) / 2,
          };
        };
        const points = (offset: number) =>
          plane.corners
            .map((c) => {
              const q = project(c.clone().addScaledVector(plane.n, offset));
              return `${q.x},${q.y}`;
            })
            .join(" ");
        root.setAttribute("viewBox", `0 0 ${scene.width} ${scene.height}`);
        root
          .querySelector('[data-section="reference"]')!
          .setAttribute("points", points(0));
        const cut = root.querySelector('[data-section="cut"]')!;
        cut.setAttribute("points", points(p.offset));
        cut.setAttribute("opacity", Math.abs(p.offset) > 1e-8 ? "1" : "0");
        const a = project(plane.origin),
          b = project(plane.origin.clone().addScaledVector(plane.n, p.offset));
        for (const key of ["path-halo", "path"])
          root
            .querySelector(`[data-section="${key}"]`)!
            .setAttribute("d", `M${a.x} ${a.y}L${b.x} ${b.y}`);
        root
          .querySelector('[data-section="origin"]')!
          .setAttribute("transform", `translate(${a.x} ${a.y})`);
        root
          .querySelector('[data-section="end"]')!
          .setAttribute("transform", `translate(${b.x} ${b.y})`);
        const distance = Math.hypot(b.x - a.x, b.y - a.y),
          nx = distance > 1 ? -(b.y - a.y) / distance : 0,
          ny = distance > 1 ? (b.x - a.x) / distance : -1;
        const label = root.querySelector('[data-section="label"]')!;
        label.setAttribute(
          "x",
          String(
            Math.max(70, Math.min(scene.width - 70, (a.x + b.x) / 2 + nx * 18)),
          ),
        );
        label.setAttribute(
          "y",
          String(
            Math.max(
              20,
              Math.min(scene.height - 20, (a.y + b.y) / 2 + ny * 18),
            ),
          ),
        );
        label.textContent = `Offset ${(p.units === "in" ? p.offset / 25.4 : p.offset).toLocaleString(undefined, { maximumFractionDigits: 3 })} ${p.units === "in" ? "in" : "mm"}`;
      },
    }),
    [plane],
  );
  return (
    <svg
      className="section-guide"
      ref={svg}
      aria-label="Section reference plane and offset guide"
    >
      <polygon data-section="reference" className="section-reference-plane">
        <title>{props.reference.label}</title>
      </polygon>
      <polygon data-section="cut" className="section-cut-outline" />
      <path data-section="path-halo" className="section-offset-halo" />
      <path data-section="path" className="section-offset-path" />
      <g data-section="origin" className="section-origin">
        <circle r="5" />
        <path d="M-8 0H8M0 -8V8" />
      </g>
      <g data-section="end" className="section-end">
        <path d="M0 -5L5 0L0 5L-5 0Z" />
      </g>
      <text
        data-section="label"
        textAnchor="middle"
        className="section-offset-label"
      />
    </svg>
  );
});
