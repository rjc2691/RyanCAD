import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Geometry, Occurrence, Selection } from "./types";

interface Props {
  geometry: Record<string, Geometry>;
  occurrences: Occurrence[];
  revision: number;
  selected: Selection | null;
  onSelect: (selection: Selection | null, add?: boolean) => void;
  explode: number;
  grid: boolean;
  section: boolean;
  historyKey?: string;
  previewToken?: string;
}
export interface ViewportHandle {
  fit: () => void;
  view: (direction: string) => void;
  screenshot: () => string | undefined;
}

const Viewport = forwardRef<ViewportHandle, Props>((props, ref) => {
  const container = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<any>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const cache = useRef(
    new Map<
      string,
      { geometry: THREE.BufferGeometry; edges: THREE.BufferGeometry }
    >(),
  );
  const initialFit = useRef(false);

  const fit = () => {
    const s = sceneRef.current;
    if (!s || !s.parts.children.length) return;
    const box = new THREE.Box3().setFromObject(s.parts);
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3()),
      size = box.getSize(new THREE.Vector3());
    const distance = Math.max(size.x, size.y, size.z, 10);
    s.controls.target.copy(center);
    s.camera.position
      .copy(center)
      .add(
        new THREE.Vector3(1.4, -1.9, 1.35)
          .normalize()
          .multiplyScalar(distance * 3),
      );
    s.controls.update();
    s.camera.updateMatrixWorld();
    const projected = new THREE.Box3();
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z])
          projected.expandByPoint(
            new THREE.Vector3(x, y, z).applyMatrix4(
              s.camera.matrixWorldInverse,
            ),
          );
    const projectedSize = projected.getSize(new THREE.Vector3());
    s.camera.zoom = 1;
    const aspect = s.width / s.height;
    const halfHeight =
      Math.max(projectedSize.y, projectedSize.x / aspect, 10) * 0.72;
    s.camera.left = -halfHeight * aspect;
    s.camera.right = halfHeight * aspect;
    s.camera.top = halfHeight;
    s.camera.bottom = -halfHeight;
    s.camera.updateProjectionMatrix();
    s.controls.update();
  };
  const view = (direction: string) => {
    const s = sceneRef.current;
    if (!s) return;
    if (direction === "iso") {
      fit();
      return;
    }
    const offset = (
      {
        top: [0, 0, 1],
        front: [0, -1, 0.0001],
        right: [1, 0, 0.0001],
      } as Record<string, number[]>
    )[direction];
    if (offset) {
      const distance = s.camera.position.distanceTo(s.controls.target);
      s.camera.position
        .copy(s.controls.target)
        .add(
          new THREE.Vector3(
            ...(offset as [number, number, number]),
          ).multiplyScalar(distance),
        );
      s.controls.update();
    }
  };
  useImperativeHandle(ref, () => ({
    fit,
    view,
    screenshot: () =>
      sceneRef.current?.renderer.domElement.toDataURL("image/png"),
  }));

  const geometryStamp = JSON.stringify(
    Object.entries(props.geometry).map(([id, data]) => [id, data.geometry_key]),
  );
  const occurrenceStamp = JSON.stringify(
    props.occurrences.map((o) => [
      o.id,
      o.definition,
      o.matrix,
      o.color,
      o.visible,
      o.suppressed,
    ]),
  );
  const selectionStamp = JSON.stringify(props.selected);
  useEffect(() => {
    const host = container.current!;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#171d26");
    const camera = new THREE.OrthographicCamera(-100, 100, 80, -80, 0.1, 10000);
    camera.up.set(0, 0, 1);
    camera.position.set(150, -220, 165);
    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(host.clientWidth, host.clientHeight);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.45;
    renderer.localClippingEnabled = true;
    host.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controls.screenSpacePanning = true;
    controls.mouseButtons = {
      LEFT: THREE.MOUSE.ROTATE,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.PAN,
    };
    controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };
    controls.minZoom = 0.05;
    controls.maxZoom = 100;
    scene.add(new THREE.HemisphereLight("#d9e7fa", "#4d525f", 2.0));
    const key = new THREE.DirectionalLight("#eef5ff", 3.5);
    key.position.set(-100, -160, 230);
    scene.add(key);
    const fill = new THREE.DirectionalLight("#b4d6ee", 2.0);
    fill.position.set(150, 80, 100);
    scene.add(fill);
    const rim = new THREE.DirectionalLight("#88c7bf", 1.3);
    rim.position.set(-90, 140, 20);
    scene.add(rim);
    const grid = new THREE.GridHelper(
      1000,
      100,
      new THREE.Color("#4a5869"),
      new THREE.Color("#303a49"),
    );
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -0.12;
    const gm = grid.material as THREE.LineBasicMaterial;
    gm.transparent = true;
    gm.opacity = 0.23;
    scene.add(grid);
    const axes = new THREE.Group();
    for (const [direction, color] of [
      [new THREE.Vector3(1, 0, 0), "#a85f65"],
      [new THREE.Vector3(0, 1, 0), "#77a88a"],
      [new THREE.Vector3(0, 0, 1), "#659ac7"],
    ] as const) {
      const points = [
        new THREE.Vector3(),
        direction.clone().multiplyScalar(500),
      ];
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({
          color,
          transparent: true,
          opacity: 0.23,
        }),
      );
      axes.add(line);
    }
    scene.add(axes);
    const parts = new THREE.Group();
    scene.add(parts);
    const raycaster = new THREE.Raycaster(),
      pointer = new THREE.Vector2();
    let down = { x: 0, y: 0 };
    const pointerdown = (event: PointerEvent) => {
      down = { x: event.clientX, y: event.clientY };
    };
    const pointerup = (event: PointerEvent) => {
      if (
        event.button !== 0 ||
        Math.hypot(event.clientX - down.x, event.clientY - down.y) > 4
      )
        return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        (-(event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const threshold =
        ((camera.top - camera.bottom) / camera.zoom / host.clientHeight) * 3;
      raycaster.params.Line.threshold = threshold;
      const hits = raycaster
        .intersectObjects(parts.children, true)
        .filter(
          (item) =>
            item.object.userData.occurrence && !item.object.userData.overlay,
        );
      const surface = hits.find((item) => item.object.type === "Mesh");
      const edgeHit = hits.find(
        (item) =>
          item.object.type === "LineSegments" &&
          (!surface || item.distance <= surface.distance + threshold),
      );
      const hit = edgeHit || surface;
      if (!hit) {
        propsRef.current.onSelect(null);
        return;
      }
      const object = hit.object as THREE.Mesh,
        occurrence = object.userData.occurrence as Occurrence;
      if (edgeHit) {
        const edge = propsRef.current.geometry[
          occurrence.definition
        ]?.edges?.find(
          (e) =>
            (hit.index ?? -1) >= e.segment_start * 2 &&
            (hit.index ?? -1) < (e.segment_start + e.segment_count) * 2,
        );
        propsRef.current.onSelect(
          {
            occurrence: occurrence.id,
            definition: occurrence.definition,
            edge,
          },
          event.shiftKey,
        );
        return;
      }
      const face = propsRef.current.geometry[
        occurrence.definition
      ]?.faces?.find(
        (f) =>
          (hit.faceIndex ?? -1) >= f.triangle_start &&
          (hit.faceIndex ?? -1) < f.triangle_start + f.triangle_count,
      );
      propsRef.current.onSelect(
        { occurrence: occurrence.id, definition: occurrence.definition, face },
        event.shiftKey,
      );
    };
    renderer.domElement.addEventListener("pointerdown", pointerdown);
    renderer.domElement.addEventListener("pointerup", pointerup);
    const state = {
      scene,
      camera,
      renderer,
      controls,
      parts,
      grid,
      axes,
      width: host.clientWidth,
      height: host.clientHeight,
    };
    sceneRef.current = state;
    const observer = new ResizeObserver(() => {
      state.width = host.clientWidth;
      state.height = host.clientHeight;
      renderer.setSize(state.width, state.height);
      const h = camera.top - camera.bottom;
      camera.left = (-h * state.width) / state.height / 2;
      camera.right = -camera.left;
      camera.updateProjectionMatrix();
    });
    observer.observe(host);
    let frame = 0;
    const render = () => {
      frame = requestAnimationFrame(render);
      controls.update();
      renderer.render(scene, camera);
    };
    render();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.removeEventListener("pointerdown", pointerdown);
      renderer.domElement.removeEventListener("pointerup", pointerup);
      host.removeChild(renderer.domElement);
      sceneRef.current = null;
      initialFit.current = false;
    };
  }, []);

  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    s.grid.visible = props.grid;
    s.axes.visible = props.grid;
  }, [props.grid]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const s = sceneRef.current;
      if (!s) return;
      const desired = new Map<
        string,
        { geometry: THREE.BufferGeometry; edges: THREE.BufferGeometry }
      >();
      for (const [identifier, info] of Object.entries(props.geometry)) {
        if (!info.geometry_key) continue;
        const key = info.geometry_key;
        let asset = cache.current.get(key);
        if (!asset) {
          const query = new URLSearchParams();
          if (props.historyKey) query.set("history_key", props.historyKey);
          if (props.previewToken)
            query.set("preview_token", props.previewToken);
          const response = await fetch(
            "/api/geometry/" + identifier + "?" + query,
          );
          if (!response.ok) continue;
          const buffer = await response.arrayBuffer();
          if (cancelled) return;
          const header = new DataView(buffer);
          if (header.getUint32(4, true) !== 1) continue;
          const vertices = header.getUint32(8, true),
            indices = header.getUint32(12, true),
            lineVertices = header.getUint32(16, true);
          const geometry = new THREE.BufferGeometry();
          let offset = 20;
          geometry.setAttribute(
            "position",
            new THREE.BufferAttribute(
              new Float32Array(buffer, offset, vertices * 3),
              3,
            ),
          );
          offset += vertices * 12;
          geometry.setIndex(
            new THREE.BufferAttribute(
              new Uint32Array(buffer, offset, indices),
              1,
            ),
          );
          offset += indices * 4;
          geometry.computeVertexNormals();
          geometry.computeBoundingSphere();
          const edges = new THREE.BufferGeometry();
          edges.setAttribute(
            "position",
            new THREE.BufferAttribute(
              new Float32Array(buffer, offset, lineVertices * 3),
              3,
            ),
          );
          asset = { geometry, edges };
          cache.current.set(key, asset);
        }
        desired.set(identifier, asset);
      }
      if (cancelled) return;
      for (const child of [...s.parts.children]) {
        s.parts.remove(child);
        child.traverse((object: any) => {
          if (object.material) object.material.dispose?.();
          if (object.userData.overlay) object.geometry?.dispose();
        });
      }
      const clip = props.section
        ? [new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)]
        : [];
      const physical = props.occurrences.filter(
        (o) => o.kind !== "assembly" && !o.suppressed && o.visible,
      );
      for (let index = 0; index < physical.length; index++) {
        const occurrence = physical[index],
          asset = desired.get(occurrence.definition);
        if (!asset) continue;
        const selected = props.selected?.occurrence === occurrence.id;
        const material = new THREE.MeshStandardMaterial({
          color: occurrence.color,
          metalness: 0.18,
          roughness: 0.43,
          side: THREE.DoubleSide,
          emissive: selected ? "#283b3f" : "#000000",
          emissiveIntensity: selected ? 0.4 : 0,
          clippingPlanes: clip,
          polygonOffset: true,
          polygonOffsetFactor: 1,
          polygonOffsetUnits: 1,
        });
        const mesh = new THREE.Mesh(asset.geometry, material);
        mesh.userData.occurrence = occurrence;
        const group = new THREE.Group();
        group.matrixAutoUpdate = false;
        const matrix = new THREE.Matrix4().set(
          ...(occurrence.matrix.flat() as [
            number,
            number,
            number,
            number,
            number,
            number,
            number,
            number,
            number,
            number,
            number,
            number,
            number,
            number,
            number,
            number,
          ]),
        );
        if (props.explode) {
          const angle = (index / physical.length) * Math.PI * 2;
          matrix.elements[12] += Math.cos(angle) * props.explode;
          matrix.elements[13] += Math.sin(angle) * props.explode;
          matrix.elements[14] += index * props.explode * 0.14;
        }
        group.matrix.copy(matrix);
        group.add(mesh);
        const lines = new THREE.LineSegments(
          asset.edges,
          new THREE.LineBasicMaterial({
            color: selected ? "#a9e4d8" : "#293849",
            transparent: true,
            opacity: selected ? 0.85 : 0.63,
            clippingPlanes: clip,
          }),
        );
        lines.userData.occurrence = occurrence;
        group.add(lines);
        if (selected && props.selected?.edge) {
          const edge = props.selected.edge;
          const geometry = new THREE.BufferGeometry();
          geometry.setAttribute(
            "position",
            asset.edges.getAttribute("position"),
          );
          geometry.setDrawRange(edge.segment_start * 2, edge.segment_count * 2);
          const highlight = new THREE.LineSegments(
            geometry,
            new THREE.LineBasicMaterial({
              color: "#c6f5df",
              depthTest: false,
              clippingPlanes: clip,
            }),
          );
          highlight.userData.overlay = true;
          highlight.renderOrder = 5;
          group.add(highlight);
        }
        if (selected && props.selected?.face && asset.geometry.index) {
          const face = props.selected.face;
          const overlay = new THREE.BufferGeometry();
          overlay.setAttribute(
            "position",
            asset.geometry.getAttribute("position"),
          );
          const arr = (asset.geometry.index.array as Uint32Array).slice(
            face.triangle_start * 3,
            (face.triangle_start + face.triangle_count) * 3,
          );
          overlay.setIndex(new THREE.BufferAttribute(arr, 1));
          const highlight = new THREE.Mesh(
            overlay,
            new THREE.MeshBasicMaterial({
              color: "#9ddccd",
              transparent: true,
              opacity: 0.22,
              side: THREE.DoubleSide,
              depthWrite: false,
              polygonOffset: true,
              polygonOffsetFactor: -1,
              clippingPlanes: clip,
            }),
          );
          highlight.userData.overlay = true;
          group.add(highlight);
        }
        s.parts.add(group);
      }
      if (!initialFit.current && s.parts.children.length) {
        fit();
        initialFit.current = true;
      }
      const activeKeys = new Set(
        Object.values(props.geometry).map((info) => info.geometry_key),
      );
      for (const [key, item] of cache.current) {
        if (cache.current.size <= Math.max(100, activeKeys.size)) break;
        if (activeKeys.has(key)) continue;
        item.geometry.dispose();
        item.edges.dispose();
        cache.current.delete(key);
      }
    };
    load().catch((error) => console.error("Viewport geometry:", error));
    return () => {
      cancelled = true;
    };
  }, [
    geometryStamp,
    occurrenceStamp,
    selectionStamp,
    props.explode,
    props.section,
    props.historyKey,
    props.previewToken,
  ]);
  return (
    <div
      className="canvas-host"
      ref={container}
      aria-label="Interactive CAD viewport"
    />
  );
});
export default Viewport;
