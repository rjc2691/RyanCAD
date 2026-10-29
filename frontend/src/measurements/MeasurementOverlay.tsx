import {sectionKeeps} from "../sectionView";
import { forwardRef, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import type { Geometry, Selection } from "../types";
import {
  MeasurementService,
  type Candidate,
  type Focus,
  type MeasurementPart,
  type Vec3,
} from "./MeasurementService";

interface Props {
  geometry: Record<string, Geometry>;
  selected: Selection | null;
  hovered: Selection | null;
  selectedItems?: Selection[];
  hoveredItems?: Selection[];
  units: "mm" | "in";
  section: boolean;
  sectionPlane?: THREE.Plane;
}
export interface MeasurementOverlayHandle {
  update: (scene: any, now: number) => void;
}
import {
  placeSurfaceMeasurements,
  type MeasurementSurface,
  type SurfacePlacement,
} from "./SurfaceMeasurements";

const NS = "http://www.w3.org/2000/svg";
const entityKey = (s: Selection | null) =>
  s
    ? `${s.occurrence}:${s.edge ? `edge:${s.edge.segment_start}` : s.face ? `face:${s.face.id}` : "component"}`
    : "";
function focus(s: Selection | null): Focus | null {
  return s
    ? {
        occurrence: s.occurrence,
        entity: s.edge
          ? `edge:${s.edge.segment_start}`
          : s.face
            ? `face:${s.face.id}`
            : undefined,
        face: s.face
          ? {
              ...s.face,
              center: s.face.center as Vec3,
              normal: s.face.normal as Vec3,
            }
          : undefined,
        point: s.point as Vec3 | undefined,
      }
    : null;
}

/** The adapter owns only projection/occlusion and SVG drawing. Surface labels follow actual face projection. No CAD writes. */
export default forwardRef<MeasurementOverlayHandle, Props>(
  function MeasurementOverlay(props, ref) {
    const svg = useRef<SVGSVGElement>(null);
    const latest = useRef(props);
    latest.current = props;
    const runtime = useRef({
      service: new MeasurementService(),
      candidateKey: "",
      shapeKey: "",
      candidates: [] as Candidate[],
      selectedKey: "",
      hoverKey: "",
      hoverSince: 0,
      lastRank: 0,
      cameraKey: "",
      ranked: [] as ReturnType<MeasurementService["rank"]>,
      nodes: new Map<string, SVGGElement>(),
      surfaces: [] as MeasurementSurface[],
      lastContext: "",
    });

    const draw = (
      placements: SurfacePlacement[],
      project?: (id: string, p: Vec3) => { x: number; y: number },
    ) => {
      const root = svg.current;
      if (!root) return;
      const active = new Set(placements.map((p) => p.candidate.id));
      for (const [id, node] of runtime.current.nodes)
        if (!active.has(id)) {
          node.remove();
          runtime.current.nodes.delete(id);
        }
      const paths = new Map<string, string>();
      for (const item of placements) {
        let node = runtime.current.nodes.get(item.candidate.id);
        if (!node) {
          node = document.createElementNS(NS, "g");
          node.appendChild(document.createElementNS(NS, "title"));
          const clip = document.createElementNS(NS, "clipPath");
          clip.appendChild(document.createElementNS(NS, "path"));
          node.appendChild(clip);
          const label = document.createElementNS(NS, "g");
          label.appendChild(document.createElementNS(NS, "text"));
          node.appendChild(label);
          root.appendChild(node);
          runtime.current.nodes.set(item.candidate.id, node);
        }
        const c = item.candidate,
          key = `${item.face.occurrence}:${item.face.id}`;
        const clipId = `face-label-${c.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
        node.setAttribute(
          "class",
          `smart-dimension surface-dimension ${item.hover ? "hover-dimension" : "selected-dimension"}`,
        );
        node.setAttribute("data-kind", c.kind);
        node.setAttribute("data-value", String(c.value));
        node.setAttribute("data-score", item.score.toFixed(2));
        node.setAttribute("data-source", c.entity);
        node.setAttribute("data-face", item.face.id);
        node.setAttribute("aria-label", `${c.qualifier}: ${item.label}`);
        node.children[0].textContent = `${c.parameterNames?.length ? `Parameter: ${c.parameterNames.join(", ")}. ` : ""}${c.qualifier}: ${item.label}. Read-only measurement on face ${item.face.id}.`;
        const clip = node.children[1],
          label = node.children[2];
        clip.setAttribute("id", clipId);
        clip.setAttribute("clipPathUnits", "userSpaceOnUse");
        let path = paths.get(key);
        if (!path && project) {
          path = item.face.triangles
            .map(
              (triangle) =>
                triangle
                  .map((point, i) => {
                    const p = project(item.face.occurrence, point);
                    return `${i ? "L" : "M"}${p.x},${p.y}`;
                  })
                  .join(" ") + " Z",
            )
            .join(" ");
          paths.set(key, path);
        }
        clip.firstElementChild!.setAttribute("d", path || "");
        label.setAttribute("clip-path", `url(#${clipId})`);
        const text = label.firstElementChild!;
        text.setAttribute("transform", `matrix(${item.matrix.join(" ")})`);
        text.setAttribute("text-anchor", "middle");
        text.setAttribute("dy", ".35em");
        text.textContent = item.label;
      }
      root.setAttribute("data-count", String(placements.length));
      root.setAttribute("data-presentation", "surface");
    };
    useImperativeHandle(
      ref,
      () => ({
        update(scene, now) {
          const p = latest.current,
            r = runtime.current,
            root = svg.current;
          if (!root) return;
          root.setAttribute("viewBox", `0 0 ${scene.width} ${scene.height}`);
          const selectedKey = entityKey(p.selected),
            hoverKey = entityKey(p.hovered);
          if (hoverKey !== r.hoverKey) {
            r.hoverKey = hoverKey;
            r.hoverSince = now;
          }
          const hovered =
            hoverKey && now - r.hoverSince >= 180 ? focus(p.hovered) : null;
          const selected = focus(p.selected);
          const selectedItems = (p.selectedItems || [])
            .map(focus)
            .filter((f): f is Focus => !!f);
          const hoveredItems = hovered
            ? (p.hoveredItems || []).map(focus).filter((f): f is Focus => !!f)
            : [];
          const shapeKey = Object.entries(p.geometry)
            .map(([id, g]) => `${id}:${g.geometry_key}:${JSON.stringify(g.named_extents)}:${JSON.stringify(g.edges?.map(e => e.parameter_names))}`)
            .join("|");
          if (shapeKey !== r.shapeKey) {
            r.service.reset();
            r.shapeKey = shapeKey;
            r.selectedKey = "";
          }
          if (selectedKey !== r.selectedKey) {
            r.service.observe(selected, "select", now);
            r.selectedKey = selectedKey;
          }
          const contextKey = JSON.stringify([
            selectedKey,
            hovered ? hoverKey : "",
            p.selected?.point,
            p.units,
            p.section,
            p.sectionPlane?.normal.toArray(),p.sectionPlane?.constant,
            selectedItems.map((f) => f.occurrence),
            hoveredItems.map((f) => f.occurrence),
          ]);
          const groups = scene.parts.children as THREE.Group[];
          const scoped = groups.filter(
            (g) =>
              g.userData.occurrence.id === selected?.occurrence ||
              g.userData.occurrence.id === hovered?.occurrence ||
              selectedItems.some(
                (f) => f.occurrence === g.userData.occurrence.id,
              ) ||
              hoveredItems.some(
                (f) => f.occurrence === g.userData.occurrence.id,
              ),
          );
          if (!scoped.length) {
            draw([]);
            r.ranked = [];
            r.lastContext = contextKey;
            return;
          }
          const groupMap = new Map<string, THREE.Group>(
            groups.map((g) => [g.userData.occurrence.id, g]),
          );
          const candidateKey =
            shapeKey +
            contextKey +
            scoped.map((g) => g.matrix.elements.join(",")).join("|");
          const candidatesChanged = candidateKey !== r.candidateKey;
          if (candidatesChanged) {
            r.surfaces = [];
            const parts: MeasurementPart[] = scoped.flatMap((group) => {
              const o = group.userData.occurrence,
                info = p.geometry[o.definition];
              if (!info?.bounds) return [];
              const mesh = group.userData.asset
                .geometry as THREE.BufferGeometry;
              const meshPositions = mesh.getAttribute("position"),
                index = mesh.index;
              const meshPoint = (i: number) =>
                new THREE.Vector3()
                  .fromBufferAttribute(meshPositions, index ? index.getX(i) : i)
                  .toArray() as Vec3;
              for (const face of info.faces || [])
                if (face.type === "PLANE") {
                  const triangles: [Vec3, Vec3, Vec3][] = [];
                  for (
                    let i = face.triangle_start * 3;
                    i < (face.triangle_start + face.triangle_count) * 3;
                    i += 3
                  )
                    triangles.push([
                      meshPoint(i),
                      meshPoint(i + 1),
                      meshPoint(i + 2),
                    ]);
                  r.surfaces.push({
                    ...face,
                    occurrence: o.id,
                    center: face.center as Vec3,
                    normal: face.normal as Vec3,
                    triangles,
                  });
                }
              group.updateWorldMatrix(true, false);
              const positions =
                group.userData.asset.edges.getAttribute("position");
              const point = (index: number) =>
                new THREE.Vector3()
                  .fromBufferAttribute(positions, index)
                  .toArray() as Vec3;
              return [
                {
                  id: o.id,
                  definition: o.definition,
                  bounds: info.bounds,
                  namedExtents: info.named_extents,
                  focusFaceIds: [
                    selected?.occurrence === o.id
                      ? selected?.face?.id
                      : undefined,
                    hovered?.occurrence === o.id
                      ? hovered?.face?.id
                      : undefined,
                  ].filter((id): id is string => !!id),
                  faces: (info.faces || []).map(
                    (face) =>
                      ({
                        ...face,
                        parameterNames: (face as any).parameter_names,
                        center:
                          face.id === selected?.face?.id &&
                          o.id === selected.occurrence &&
                          selected.point
                            ? selected.point
                            : face.id === hovered?.face?.id &&
                                o.id === hovered.occurrence &&
                                hovered.point
                              ? hovered.point
                              : face.center,
                      }) as any,
                  ),
                  edges: (info.edges || []).map((edge) => {
                    const start = edge.segment_start * 2,
                      last = (edge.segment_start + edge.segment_count) * 2 - 1;
                    const mid = start + Math.floor(edge.segment_count / 2) * 2;
                    const a = point(mid),
                      b = point(mid + 1);
                    return {
                      id: String(edge.segment_start),
                      type: edge.type,
                      length: edge.length,
                      parameterNames: edge.parameter_names,
                      a: point(start),
                      b: point(last),
                      anchor: a.map((v, i) => (v + b[i]) / 2) as Vec3,
                    };
                  }),
                },
              ];
            });
            r.candidates = r.service.candidates(parts);
            r.candidateKey = candidateKey;
          }
          const project = (id: string, point: Vec3) => {
            const group = groupMap.get(id)!;
            const world = new THREE.Vector3(...point).applyMatrix4(
              group.matrixWorld,
            );
            const clipped = p.section && !sectionKeeps(world,p.sectionPlane);
            const q = world.project(scene.camera);
            return {
              x: ((q.x + 1) * scene.width) / 2,
              y: ((1 - q.y) * scene.height) / 2,
              visible:
                !clipped &&
                q.z >= -1 &&
                q.z <= 1 &&
                Math.abs(q.x) < 1 &&
                Math.abs(q.y) < 1,
            };
          };
          const targets = groups.flatMap((g) =>
            g.children.filter((o) => o.type === "Mesh" && !o.userData.overlay),
          );
          const ray = new THREE.Raycaster();
          const cameraKey =
            scene.camera.matrixWorld.elements.join(",") +
            scene.camera.projectionMatrix.elements.join(",") +
            `${scene.width},${scene.height}`;
          const visiblePoint = (id: string, point: Vec3) => {
            const group = groupMap.get(id)!;
            const world = new THREE.Vector3(...point).applyMatrix4(
              group.matrixWorld,
            );
            const ndc = world.clone().project(scene.camera);
            if (
              Math.abs(ndc.x) > 1 ||
              Math.abs(ndc.y) > 1 ||
              (p.section && !sectionKeeps(world,p.sectionPlane))
            )
              return false;
            ray.setFromCamera(new THREE.Vector2(ndc.x, ndc.y), scene.camera);
            const hit = ray
              .intersectObjects(targets, false)
              .find((h) => !p.section || sectionKeeps(h.point,p.sectionPlane));
            const distance = world
              .clone()
              .sub(ray.ray.origin)
              .dot(ray.ray.direction);
            return !hit || hit.distance >= distance - 0.02;
          };
          const visibility = (c: Candidate) => {
            const points =
              c.kind === "area" || c.kind === "curve"
                ? [c.anchor]
                : [c.a, c.b, c.anchor];
            return (
              points.filter((point) => visiblePoint(c.occurrence, point))
                .length / points.length
            );
          };
          const facing = (face: MeasurementSurface) => {
            const normal = new THREE.Vector3(...face.normal)
              .applyNormalMatrix(
                new THREE.Matrix3().getNormalMatrix(
                  groupMap.get(face.occurrence)!.matrixWorld,
                ),
              )
              .normalize();
            return -normal.dot(
              scene.camera.getWorldDirection(new THREE.Vector3()),
            );
          };
          const context = {
            selected,
            hovered,
            selectedItems,
            hoveredItems,
            now,
            width: scene.width,
            height: scene.height,
            units: p.units,
            project,
            visibility,
            facing,
            visiblePoint,
            reserved: [
              { x: 0, y: 0, width: scene.width, height: 68 },
              ...(selected ? [{ x: 18, y: 75, width: 325, height: 65 }] : []),
              { x: 18, y: scene.height - 136, width: 420, height: 45 },
              { x: 0, y: scene.height - 80, width: 90, height: 80 },
              {
                x: scene.width - 270,
                y: scene.height - 65,
                width: 270,
                height: 65,
              },
              {
                x: 100,
                y: scene.height - 45,
                width: Math.max(0, scene.width - 400),
                height: 45,
              },
            ],
          };
          const changed = contextKey !== r.lastContext || candidatesChanged;
          if (!changed && cameraKey === r.cameraKey && now - r.lastRank <= 180)
            return;
          if (changed || !r.ranked.length || now - r.lastRank > 180) {
            if (hovered && contextKey !== r.lastContext)
              r.service.observe(hovered, "hover", now);
            r.ranked = r.service.rank(r.candidates, context);
            r.lastRank = now;
            r.lastContext = contextKey;
            root.setAttribute("data-candidates", String(r.candidates.length));
            root.setAttribute(
              "data-top-scores",
              JSON.stringify(
                r.service
                  .explain()
                  .slice(0, 8)
                  .map((x) => ({
                    id: x.candidate.id,
                    score: x.score,
                    signals: x.signals,
                  })),
              ),
            );
          }
          const placements = placeSurfaceMeasurements(
            r.ranked,
            r.surfaces,
            context,
          );
          r.service.rememberDisplayed(placements.map((p) => p.candidate.id));
          draw(placements, project);
          r.cameraKey = cameraKey;
        },
      }),
      [],
    );
    return (
      <svg
        ref={svg}
        className="smart-dimensions"
        role="group"
        aria-label="Contextual measurements"
        data-testid="smart-dimensions"
      />
    );
  },
);
