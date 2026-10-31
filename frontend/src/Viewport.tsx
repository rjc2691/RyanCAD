import {worldAxisScales} from "./worldAxisExtent";
import {syncMovementGhost} from "./movementGhost";
import {createFadingGrid} from "./gridAppearance";
import MoveAxisHandles,{type MoveAxisHandlesHandle} from "./MoveAxisHandles";
import {shortcutLabel} from './toolbarShortcuts';
import type {ActiveAppearance} from "./experiments";
import {updateEdgePulseTime} from './activeAppearance';
import {createWorldPlanes,styleWorldPlanes,worldPlaneAxes,type WorldPlane} from './worldPlanes';
import MeasureGuide,{type MeasureGuideHandle} from "./MeasureGuide";
import type {MeasurePoint} from "./measureModel";
import SectionGuide,{type SectionGuideHandle} from "./SectionGuide";
import type {SectionSettings} from "./sectionView";
import {sectionKeeps} from "./sectionView";
import MovementGuide, { type MovementGuideHandle } from "./MovementGuide";
import { designHeaders } from "./api";
import { explodedLayout } from "./explodedView";
import { sketchOrbitOffset } from "./sketchOrbit";
import { expandedGroupSelection } from "./groupModel";
import SketchGuide, {
  type SketchGuideHandle,
  type SketchDimensionEditor,
} from "./SketchGuide";
import {
  entityPoints,
  sketchBasis,
  snapSketchPoint,
  type SketchDraft,
  type SketchPoint,
} from "./sketchModel";
import type { MovementGuideData, WorldAxis } from "./movementModel";
import { entityName, resolveDisplaySelection } from "./geometryLabels";
import {
  highlight,
  wideLines,
  disposeOverlay,
  disposeHighlightMaterial,
  hoverIntent,
} from "./viewportHighlights";
import {
  selectionMembers,
  displaySelectionMembers,
  referenceMembers,
  selectionKey,
} from "./operations/groupedSelection";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { Geometry, Occurrence, Selection } from "./types";
import MeasurementOverlay, {
  type MeasurementOverlayHandle,
} from "./measurements/MeasurementOverlay";

import OperationGuide, {
  type OperationGuideHandle,
} from "./operations/OperationGuide";
import { OPERATION_COLORS } from "./operations/operationRoles";
import type {
  OperationFrame,
  OperationDraft,
  PickSlot,
} from "./operations/operationModel";
import {
  COMPONENT_SELECTION_COLOR,
  HOVER_COLOR,
  SELECTION_COLOR,
  disposePreview,
  viewportDisplayContext,
  syncOperationAppearance,
  type DisplayedPreview,
} from "./viewportOperationDisplay";

interface Props {
  uiBackground?:string;
  onMoveDistance?:(value:string)=>void;
  onMoveAxisSlide?:(axis:WorldAxis,distance:number)=>void;
  onWorldPlane?:(plane:WorldPlane)=>void;
  selectedWorldPlane?:WorldPlane;
  measurePoints?: MeasurePoint[] | null;
  onWorldAxis?: (axis: WorldAxis) => void;
  onWorldOrigin?:()=>void;
  editingGroup?: string;
  editingContext?:{name:string;label:string;onDone:()=>void;disabled:boolean};
  resolveHover?: (selection: Selection | null) => Selection | null;
  onDoubleSelect?: (selection: Selection | null) => void;
  sketch?: SketchDraft | null;
  dimensionEditor?: SketchDimensionEditor | null;
  sketchPlanePicking?: boolean;
  worldPlanePicking?:boolean;
  sketchObjects?: SketchDraft[];
  selectedSketch?: string | null;
  onSelectSketch?: (id: string,removeOnly?:boolean) => void;
  onSketchInput?: (
    point: SketchPoint,
    tolerance: number,
    selection: Selection | null,
    additive?:boolean,
    removeOnly?:boolean,
  ) => void;
  onSketchCursor?: (point: SketchPoint|null,tolerance?:number) => void;
  onSketchMeasurement?:(id:string)=>void;
  onOperationPreviewReady?: (token: string | null) => void;
  operationPreview?: any;
  operationFrame?: OperationFrame;
  operationDraft?: OperationDraft;
  placementTarget?: Selection | null;
  featureEditTarget?: Selection | null;
  movementGuide?: MovementGuideData | null;
  orientationRef?: React.RefObject<{
    update: (camera: THREE.Camera) => void;
  } | null>;
  referenceHover?: Selection | null;
  pickSlot?: PickSlot;
  onSketchPoint?: (point: number[]) => void;
  geometry: Record<string, Geometry>;
  occurrences: Occurrence[];
  revision: number;
  selected: Selection | null;
  onSelect: (selection: Selection | null, add?: boolean, removeOnly?:boolean) => void;
  explode: number;
  showBounds?: boolean;
  grid: boolean;
  activeAppearance?: ActiveAppearance;
  section: boolean;
  sectionPlane?: THREE.Plane;
  sectionReference?: SectionSettings["reference"];
  sectionOffset?: number;
  historyKey?: string;
  previewToken?: string;
  units?: "mm" | "in";
  onContextMenu?: (selection: Selection | null, x: number, y: number) => void;
}
export interface ViewportHandle {
  alignPlane: (frame: OperationFrame) => void;
  fit: () => void;
  view: (direction: string) => void;
  screenshot: () => string | undefined;
}

async function previewAsset(id: string, token: string, signal?: AbortSignal) {
  const response = await fetch(
    `/api/geometry/${id}?preview_token=${encodeURIComponent(token)}`,
    { signal, headers: designHeaders() },
  );
  if (!response.ok) throw new Error("Preview mesh could not be loaded.");
  const buffer = await response.arrayBuffer(),
    header = new DataView(buffer);
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
    new THREE.BufferAttribute(new Uint32Array(buffer, offset, indices), 1),
  );
  offset += indices * 4;
  geometry.computeVertexNormals();
  const edges = new THREE.BufferGeometry();
  edges.setAttribute(
    "position",
    new THREE.BufferAttribute(
      new Float32Array(buffer, offset, lineVertices * 3),
      3,
    ),
  );
  return { geometry, edges };
}

const Viewport = forwardRef<ViewportHandle, Props>((props, ref) => {
  const container = useRef<HTMLDivElement>(null);
  const worldOriginButton=useRef<HTMLButtonElement>(null);
  const movementGuide = useRef<MovementGuideHandle>(null);
  const moveAxisHandles=useRef<MoveAxisHandlesHandle>(null);
  const measureGuide = useRef<MeasureGuideHandle>(null);
  const operationGuide = useRef<OperationGuideHandle>(null);
  const sketchGuide = useRef<SketchGuideHandle>(null);
  const sketchView = useRef<any>(null);
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
  const displayedPreview = useRef<DisplayedPreview | null>(null);
  const previousProfile = useRef(props.operationDraft?.profile);
  const [previewDisplayError, setPreviewDisplayError] = useState("");
  const [rendererError,setRendererError]=useState('');
  const displayContext = viewportDisplayContext(props);
  const measurementRef = useRef<MeasurementOverlayHandle>(null);
  const sectionGuide=useRef<SectionGuideHandle>(null);
  const hoverHint = useRef<HTMLDivElement>(null);
  const [shiftHeld, setShiftHeld] = useState(false);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Shift") setShiftHeld(e.type === "keydown");
    };
    const blur = () => setShiftHeld(false);
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", key);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", key);
      window.removeEventListener("keyup", key);
      window.removeEventListener("blur", blur);
    };
  }, []);
  const [hovered, setHovered] = useState<Selection | null>(null);
  const [hoveredSketch,setHoveredSketch]=useState<string|null>(null);
  const [hoveredWorldPlane,setHoveredWorldPlane]=useState<WorldPlane|null>(null);
  const [hoveredAxis, setHoveredAxis] = useState<WorldAxis | null>(null);
  const hoveredAxisRef = useRef<WorldAxis | null>(null);
  hoveredAxisRef.current = hoveredAxis;
  const [hoverFromPanel, setHoverFromPanel] = useState(false);
  const sketchFrameStamp = props.sketch
    ? JSON.stringify(props.sketch.frame)
    : "";
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    const { camera, controls } = s;
    controls.enableDamping = false;
    controls.update();
    if (props.sketch) {
      if (!sketchView.current)
        sketchView.current = {
          position: camera.position.clone(),
          up: camera.up.clone(),
          target: controls.target.clone(),
          left: camera.left,
          right: camera.right,
          top: camera.top,
          bottom: camera.bottom,
          zoom: camera.zoom,
        };
      if (!props.sketchPlanePicking) {
        const f = sketchBasis(props.sketch.frame),
          distance = camera.position.distanceTo(controls.target);
        camera.up.copy(f.v);
        controls.target.copy(f.origin);
        camera.position
          .copy(f.origin)
          .addScaledVector(f.normal, distance || 100);
      }
      controls.enableRotate = !!props.sketchPlanePicking;
    } else if (sketchView.current) {
      const saved = sketchView.current;
      camera.position.copy(saved.position);
      camera.up.copy(saved.up);
      controls.target.copy(saved.target);
      for (const key of ["left", "right", "top", "bottom", "zoom"])
        camera[key] = saved[key];
      sketchView.current = null;
      controls.enableRotate = true;
    }
    camera.updateProjectionMatrix();
    controls.update();
    camera.updateMatrixWorld();
    controls.enableDamping = true;
  }, [sketchFrameStamp, props.sketchPlanePicking]);

  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    const group = new THREE.Group();
    s.scene.add(group);
    s.sketchObjects = group;
    for (const d of props.sketchObjects || []) {
      if (d.feature?.id === props.sketch?.feature?.id) continue;
      const f = sketchBasis(d.frame);
      for (const e of d.entities) {
        const points = entityPoints(e).map((p) =>
          f.origin
            .clone()
            .addScaledVector(f.u, p[0])
            .addScaledVector(f.v, p[1]),
        );
        if (e.type === "point" && points[0]) {
          const a = points[0];
          points.push(a.clone().addScaledVector(f.u, 0.2));
        }
        const line = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints(points),
          new THREE.LineBasicMaterial({
            color:
              props.selectedSketch === d.feature?.id
                ? SELECTION_COLOR
                : e.construction
                  ? "#be9be9"
                  : "#f3ce77",
            depthTest: false,
            transparent: true,
            opacity: 0.85,
          }),
        );
        line.renderOrder = 12;
        line.userData.sketchId = d.feature?.id;
        line.userData.baseColor = (
          line.material as THREE.LineBasicMaterial
        ).color.getHex();
        group.add(line);
        if(props.selectedSketch===d.feature?.id&&points.length>1){
          const segments=points.slice(1).flatMap((p,i)=>[...points[i].toArray(),...p.toArray()]);
          const selectedStroke=wideLines(segments,SELECTION_COLOR,3.5,[]);selectedStroke.material.depthTest=false;selectedStroke.renderOrder=13;group.add(selectedStroke);
        }
      }
    }
    return () => {
      s.clearHover?.();
      s.scene.remove(group);
      if (s.sketchObjects === group) s.sketchObjects = null;
      disposeOverlay(group);
    };
  }, [props.sketchObjects, props.selectedSketch, props.sketch?.feature?.id]);

  const fit = () => {
    const s = sceneRef.current;
    if (s && propsRef.current.sketch) {
      const d = propsRef.current.sketch,
        f = sketchBasis(d.frame),
        points = d.entities.flatMap(entityPoints);
      const us = points.map((p) => p[0]),
        vs = points.map((p) => p[1]);
      const minU = Math.min(-10, ...us),
        maxU = Math.max(10, ...us),
        minV = Math.min(-10, ...vs),
        maxV = Math.max(10, ...vs);
      const center = f.origin
          .clone()
          .addScaledVector(f.u, (minU + maxU) / 2)
          .addScaledVector(f.v, (minV + maxV) / 2),
        distance = s.camera.position.distanceTo(s.controls.target);
      s.controls.enableDamping = false;
      s.controls.update();
      s.controls.target.copy(center);
      s.camera.position.copy(center).addScaledVector(f.normal, distance || 100);
      s.camera.up.copy(f.v);
      const half =
        Math.max(maxV - minV, (maxU - minU) / (s.width / s.height)) * 0.65;
      s.camera.top = half;
      s.camera.bottom = -half;
      s.camera.left = (-half * s.width) / s.height;
      s.camera.right = -s.camera.left;
      s.camera.zoom = 1;
      s.camera.updateProjectionMatrix();
      s.controls.update();
      s.controls.enableDamping = true;
      return;
    }
    if (
      !s ||
      (!s.parts.children.length &&
        !s.preview?.children.length &&
        !s.sketchObjects?.children.length)
    )
      return;
    s.camera.up.set(0, 0, 1);
    // Finish residual orbit/pan damping before replacing the camera target.
    const damping = s.controls.enableDamping;
    s.controls.enableDamping = false;
    s.controls.update();
    s.controls.enableDamping = damping;
    const box = new THREE.Box3().setFromObject(
      s.parts.children.length
        ? s.parts
        : s.preview?.children.length
          ? s.preview
          : s.sketchObjects,
    );
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
    if (propsRef.current.sketch && !propsRef.current.sketchPlanePicking) return;
    const s = sceneRef.current;
    if (!s) return;
    s.camera.up.set(0, 0, 1);
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
    alignPlane: (frame) => {
      const s = sceneRef.current;
      if (!s) return;
      const damping = s.controls.enableDamping;
      s.controls.enableDamping = false;
      s.controls.update();
      const distance = s.camera.position.distanceTo(s.controls.target);
      s.camera.up.copy(frame.v);
      s.controls.target.copy(frame.origin);
      s.camera.position
        .copy(frame.origin)
        .addScaledVector(frame.normal, distance);
      s.controls.update();
      s.controls.enableDamping = damping;
    },
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
      o.visible,
      o.suppressed,
    ]),
  );
  const selectionStamp = JSON.stringify([
    props.selected,
    props.operationDraft?.pathReferences,
    props.operationDraft?.profileReferences,
  ]);
  const colorStamp = JSON.stringify(
    props.occurrences.map((o) => [o.id, o.color]),
  );
  useEffect(()=>{const scene=sceneRef.current?.scene;if(scene)scene.background=new THREE.Color(props.uiBackground||"#171d26");},[props.uiBackground]);
  const appearanceStamp=JSON.stringify(props.activeAppearance);
  useEffect(()=>{const scene=sceneRef.current;if(scene)syncOperationAppearance(scene.parts,displayedPreview.current,propsRef.current);},[appearanceStamp,props.movementGuide]);
  const refreshSelection = () => {
    const s = sceneRef.current;
    if (!s) return;
    const current = propsRef.current;
    for (const group of s.parts.children) {
      const { occurrence, asset, clip, selectionLayer } = group.userData;
      disposeOverlay(selectionLayer);
      const references = current.operationDraft
        ? [
            ...referenceMembers(current.operationDraft, "path"),
            ...referenceMembers(current.operationDraft, "profile"),
          ].map((r) => r.selection)
        : [];
      const all = [
        ...new Map(
          [
            ...displaySelectionMembers(
              current.selected,
              current.operationDraft,
            ),
            ...references,
          ]
            .flatMap((s) => expandedGroupSelection(s, current.occurrences))
            .map((s) => [selectionKey(s), s]),
        ).values(),
      ];
      const selected = all.filter((s) => s.occurrence === occurrence.id);
      if (!selected.length) continue;
      if (!current.operationDraft) {
        const outline = wideLines(
          asset.edges.getAttribute("position").array,
          COMPONENT_SELECTION_COLOR,
          2.2,
          clip,
        );
        outline.userData.wholeOutline = true;
        selectionLayer.add(outline);
      }
      for (const member of selected) {
        const overlay = highlight(
          member,
          asset,
          clip,
          "selected",
          !current.operationDraft,
        );
        if (overlay) selectionLayer.add(overlay);
      }
    }
    syncOperationAppearance(s.parts, displayedPreview.current, current);
  };
  useEffect(refreshSelection, [
    selectionStamp,
    !!props.operationDraft,
    !!props.sketch,
    props.editingGroup,
    colorStamp,
    displayContext,
  ]);
  useEffect(() => {
    const host = container.current!;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(propsRef.current.uiBackground||"#171d26");
    const camera = new THREE.OrthographicCamera(-100, 100, 80, -80, 0.1, 10000);
    camera.up.set(0, 0, 1);
    camera.position.set(150, -220, 165);
    let renderer:THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        preserveDrawingBuffer: true,
      });
    } catch(error) {
      setRendererError(error instanceof Error ? error.message : 'The browser could not initialize WebGL.');
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(Math.max(1,host.clientWidth), Math.max(1,host.clientHeight), false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
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
    let sketchOrbit: {
      pointer: number;
      x: number;
      y: number;
      offset: THREE.Vector3;
      frame: SketchDraft["frame"];
    } | null = null;
    const orbitDown = (event: PointerEvent) => {
      const d = propsRef.current.sketch;
      if (
        !d ||
        propsRef.current.sketchPlanePicking ||
        event.button !== 2 ||
        !event.shiftKey
      )
        return;
      event.preventDefault();
      event.stopImmediatePropagation();
      controls.enableDamping = false;
      controls.update();
      controls.enabled = false;
      sketchOrbit = {
        pointer: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        offset: camera.position.clone().sub(controls.target),
        frame: d.frame,
      };
      renderer.domElement.setPointerCapture(event.pointerId);
    };
    const orbitMove = (event: PointerEvent) => {
      if (!sketchOrbit || event.pointerId !== sketchOrbit.pointer) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const width = Math.max(1, renderer.domElement.clientWidth),
        height = Math.max(1, renderer.domElement.clientHeight);
      const offset = sketchOrbitOffset(
        sketchOrbit.offset,
        sketchOrbit.frame,
        (-3 * (event.clientX - sketchOrbit.x)) / width,
        (3 * (event.clientY - sketchOrbit.y)) / height,
      );
      camera.position.copy(controls.target).add(offset);
      camera.up.copy(sketchBasis(sketchOrbit.frame).v);
      camera.lookAt(controls.target);
      camera.updateMatrixWorld();
    };
    const orbitEnd = (event: PointerEvent) => {
      if (!sketchOrbit || event.pointerId !== sketchOrbit.pointer) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      sketchOrbit = null;
      controls.enabled = true;
      controls.update();
      controls.enableDamping = true;
      if (renderer.domElement.hasPointerCapture(event.pointerId))
        renderer.domElement.releasePointerCapture(event.pointerId);
    };
    renderer.domElement.addEventListener("pointerdown", orbitDown, true);
    renderer.domElement.addEventListener("pointermove", orbitMove, true);
    renderer.domElement.addEventListener("pointerup", orbitEnd, true);
    renderer.domElement.addEventListener("pointercancel", orbitEnd, true);
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
    const {grid, update: updateGridFade} = createFadingGrid();
    scene.add(grid);
    const axes = new THREE.Group();
    for (const [index,[direction,color]] of ([
      [new THREE.Vector3(1,0,0),'#d87b81'],
      [new THREE.Vector3(0,1,0),'#8bc79f'],
      [new THREE.Vector3(0,0,1),'#80baf0'],
    ] as const).entries()) {
      for(const sign of [1,-1]){
        const endpoint=direction.clone().multiplyScalar(500*sign),axis=(['X','Y','Z'] as const)[index];
        const pickLine=new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(),endpoint]),new THREE.LineBasicMaterial({visible:false}));
        pickLine.userData.worldAxis=axis;pickLine.userData.axisPick=true;pickLine.userData.axisIndex=index;
        const stroke=wideLines([0,0,0,...endpoint.toArray()],color,sign>0?2:1.1,[]);
        stroke.material.opacity=sign>0?.85:.27;stroke.material.depthTest=true;stroke.renderOrder=1;
        stroke.userData.worldAxis=axis;stroke.userData.baseColor=color;stroke.userData.axisSign=sign;stroke.userData.axisIndex=index;
        // Reference axes are unbounded, unlike scene geometry. Keep their
        // projected tails from terminating at the camera's near/far planes.
        stroke.frustumCulled=false;
        stroke.material.onBeforeCompile=shader=>{shader.vertexShader=shader.vertexShader.replace("gl_Position = clip;","clip.z = clamp(clip.z, -clip.w * 0.9999, clip.w * 0.9999); gl_Position = clip;");};
        stroke.material.customProgramCacheKey=()=>"world-axis-depth-clamp-v1";
        axes.add(pickLine,stroke);
      }
    }
    scene.add(axes);
    const worldPlanes=createWorldPlanes();scene.add(worldPlanes);
    let planeHover:WorldPlane|null=null;
    const showPlaneHover=(plane:WorldPlane|null)=>{if(planeHover!==plane){planeHover=plane;setHoveredWorldPlane(plane);}};
    const parts = new THREE.Group();
    scene.add(parts);
    const previewGroup = new THREE.Group();
    scene.add(previewGroup);
    const profileRole = new THREE.Group();
    profileRole.name = "Tool Profile body";
    scene.add(profileRole);
    let profileRoleKey = "";
    const clearProfileRole = () => {
      profileRole.traverse((o: any) => disposeHighlightMaterial(o.material));
      profileRole.clear(); // Source mesh buffers belong to the native cache.
    };
    const syncProfileRole = () => {
      const f = propsRef.current.operationFrame,
        d = propsRef.current.operationDraft;
      const source =
        f?.bodyOccurrence &&
        parts.children.find(
          (g) => g.userData.occurrence?.id === f.bodyOccurrence,
        );
      const sourceDefinition = d?.profileReference?.selection.definition;
      const asset = source
        ? source.userData.asset
        : cache.current.get(
            propsRef.current.geometry[sourceDefinition || ""]?.geometry_key ||
              "",
          );
      const key =
        d?.profile === "body" && asset && f?.bodyMatrix
          ? `${f.bodyOccurrence}:${propsRef.current.geometry[sourceDefinition || ""]?.geometry_key}:${f.bodyMatrix.elements.join(",")}`
          : "";
      if (key === profileRoleKey) return;
      profileRoleKey = key;
      clearProfileRole();
      if (!key || !asset || !f?.bodyMatrix) return;
      const group = new THREE.Group();
      group.matrixAutoUpdate = false;
      group.matrix.copy(f.bodyMatrix);
      const mesh = new THREE.Mesh(
        asset.geometry,
        new THREE.MeshBasicMaterial({
          color: OPERATION_COLORS.profile,
          transparent: true,
          opacity: 0.28,
          depthWrite: false,
          depthTest: false,
          side: THREE.DoubleSide,
        }),
      );
      const wire = new THREE.LineSegments(
        asset.edges,
        new THREE.LineBasicMaterial({
          color: OPERATION_COLORS.profile,
          transparent: true,
          opacity: 0.95,
          depthTest: false,
        }),
      );
      mesh.renderOrder = 14;
      wire.renderOrder = 15;
      group.add(mesh, wire);
      profileRole.add(group);
    };
    const raycaster = new THREE.Raycaster(),
      pointer = new THREE.Vector2();
    const hoverLayer = new THREE.Group();
    hoverLayer.matrixAutoUpdate = false;
    scene.add(hoverLayer);
    let down = { x: 0, y: 0 },
      dragging = false,
      hoverKey = "";
    let lastPointer: PointerEvent | null = null;
    const activeTouches = new Set<number>();
    let multiTouchGesture = false;
    let hoverSource: "viewport" | "panel" = "viewport";
    const showHover = (
      picked: Selection | null,
      source: "viewport" | "panel",
    ) => {
      const entity = picked?.vertex
        ? `vertex:${picked.vertex.point.join(",")}`
        : picked?.edge
          ? `edge:${picked.edge.id || picked.edge.signature}`
          : picked?.face
            ? `face:${picked.face.id || picked.face.signature}`
            : "component";
      const key = picked
        ? `${source}:${picked.occurrence}:${entity}:${propsRef.current.geometry[picked.definition]?.geometry_key}`
        : "";
      if (key === hoverKey) return;
      hoverKey = key;
      hoverSource = source;
      disposeOverlay(hoverLayer);
      setHovered(picked);
      setHoverFromPanel(source === "panel");
      renderer.domElement.style.cursor =
        picked && source === "viewport" ? "pointer" : "";
      if (!picked) return;
      const group = parts.children.find(
        (g) => g.userData.occurrence?.id === picked.occurrence,
      );
      if (!group) {
        const members = expandedGroupSelection(
          picked,
          propsRef.current.occurrences,
        );
        if (members.length && members[0].occurrence !== picked.occurrence) {
          hoverLayer.matrix.identity();
          for (const member of members) {
            const source = parts.children.find(
              (g) => g.userData.occurrence?.id === member.occurrence,
            );
            if (!source) continue;
            const overlay = highlight(
              member,
              source.userData.asset,
              source.userData.clip,
              "hover",
            );
            if (!overlay) continue;
            const placed = new THREE.Group();
            placed.matrixAutoUpdate = false;
            placed.matrix.copy(source.matrix);
            placed.add(overlay);
            hoverLayer.add(placed);
          }
          return;
        }
        hoverKey = "";
        return;
      }
      hoverLayer.matrix.copy(group.matrix);
      const overlay = highlight(
        picked,
        group.userData.asset,
        group.userData.clip,
        "hover",
        !propsRef.current.operationDraft,
      );
      if (overlay) hoverLayer.add(overlay);
      if (picked.edge?.midpoint && propsRef.current.placementTarget) {
        const midpoint = highlight(
          {
            ...picked,
            edge: undefined,
            vertex: {
              point: picked.edge.midpoint,
              edge: picked.edge,
              anchor: "mid",
            },
          },
          group.userData.asset,
          group.userData.clip,
          "selected",
        );
        if (midpoint) hoverLayer.add(midpoint);
      }
    };
    const sketchHoverLayer=new THREE.Group();scene.add(sketchHoverLayer);
    let sketchHoverId:string|null=null;
    const showSketchHover = (id: string | null) => {
      if(id===sketchHoverId)return;
      sketchHoverId=id;setHoveredSketch(id);disposeOverlay(sketchHoverLayer);
      if(!id)return;
      for (const line of sceneRef.current?.sketchObjects?.children || []) {
        if(line.userData.sketchId!==id)continue;
        const positions=(line as THREE.Line).geometry.getAttribute('position'),segments:number[]=[];
        for(let i=1;i<positions.count;i++)for(const j of [i-1,i])segments.push(positions.getX(j),positions.getY(j),positions.getZ(j));
        for(const [color,width,order] of [[HOVER_COLOR,2.5,15]] as const){
          const stroke=wideLines(segments,color,width,[]);stroke.material.depthTest=false;stroke.renderOrder=order;sketchHoverLayer.add(stroke);
        }
      }
    };
    const clearHover = () => {
      lastPointer = null;
      setHoveredAxis(null);
      showHover(null, "viewport");
      showSketchHover(null);
      showPlaneHover(null);
    };
    const pickSketch = (event: MouseEvent): string | null => {
      const current = propsRef.current,
        objects = sceneRef.current?.sketchObjects;
      if (
        !objects ||
        current.sketch ||
        current.placementTarget ||
        current.measurePoints ||
        (current.pickSlot && current.pickSlot !== "profile")
      )
        return null;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        1 - ((event.clientY - rect.top) / rect.height) * 2,
      );
      raycaster.setFromCamera(pointer, camera);
      raycaster.params.Line.threshold =
        ((camera.top - camera.bottom) / camera.zoom / rect.height) * 7;
      objects.updateMatrixWorld(true);
      return (
        raycaster
          .intersectObjects(objects.children.filter((o:any)=>o.userData.sketchId), false)
          .find((hit) => hit.object.userData.sketchId)?.object.userData
          .sketchId || null
      );
    };
    const pickWorldAxis = (event: MouseEvent): WorldAxis | null => {
      const current = propsRef.current;
      if (
        !axes.visible ||
        (current.sketch&&current.sketch.tool!=="dimension") ||
        !current.onWorldAxis ||
        (current.pickSlot && current.pickSlot !== "path")
      )
        return null;
      camera.updateMatrixWorld();
      axes.updateMatrixWorld(true);
      parts.updateMatrixWorld(true);
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        1 - ((event.clientY - rect.top) / rect.height) * 2,
      );
      // Keep the shared origin available for point picking, and don't pick an
      // axis viewed end-on (its projected direction is ambiguous).
      const origin = new THREE.Vector3().project(camera);
      if (
        Math.hypot(
          ((pointer.x - origin.x) * rect.width) / 2,
          ((pointer.y - origin.y) * rect.height) / 2,
        ) < 10
      )
        return null;
      raycaster.setFromCamera(pointer, camera);
      const tolerance =
        ((camera.top - camera.bottom) / camera.zoom / rect.height) * 6;
      raycaster.params.Line.threshold = tolerance;
      const hits = raycaster.intersectObjects(axes.children.filter(o=>o.userData.axisPick), false);
      const hit = hits.find((h) => {
        const endpoint = new THREE.Vector3()
          .fromBufferAttribute(
            (h.object as THREE.Line).geometry.getAttribute("position"),
            1,
          )
          .project(camera);
        return (
          Math.hypot(
            ((endpoint.x - origin.x) * rect.width) / 2,
            ((endpoint.y - origin.y) * rect.height) / 2,
          ) > 12
        );
      });
      if (!hit) return null;
      // Visible model surfaces take precedence over axes behind the part.
      const surfaces = parts.children.flatMap((g) =>
        g.children.filter((o) => o.type === "Mesh" && !o.userData.overlay),
      );
      const surface = raycaster
        .intersectObjects(surfaces, false)
        .find((h) => !current.section || sectionKeeps(h.point,current.sectionPlane));
      if (surface && surface.distance < hit.distance - tolerance) return null;
      return hit.object.userData.worldAxis as WorldAxis;
    };
    const pickWorldPlane=(event:MouseEvent):WorldPlane|null=>{
      if(!propsRef.current.worldPlanePicking||!worldPlanes.visible)return null;
      camera.updateMatrixWorld();worldPlanes.updateMatrixWorld(true);parts.updateMatrixWorld(true);
      const r=renderer.domElement.getBoundingClientRect();pointer.set((event.clientX-r.left)/r.width*2-1,1-(event.clientY-r.top)/r.height*2);raycaster.setFromCamera(pointer,camera);
      const marker=raycaster.intersectObjects(worldPlanes.children.map(g=>g.children[0]),false).find(h=>Math.abs(raycaster.ray.direction.dot(h.object.userData.normal))>.08);
      const surfaces=parts.children.flatMap(g=>g.children.filter(o=>(o.type==='Mesh'||o.type==='LineSegments')&&!o.userData.overlay));
      raycaster.params.Line.threshold=(camera.top-camera.bottom)/camera.zoom/r.height*5;
      const occluder=raycaster.intersectObjects(surfaces,false).find(h=>!propsRef.current.section||sectionKeeps(h.point,propsRef.current.sectionPlane));
      if(occluder)return null;
      if(marker)return marker.object.userData.worldPlane;
      const candidates=worldPlanes.children.flatMap(group=>{
        const plane=group.userData.worldPlane as WorldPlane,{u,v}=worldPlaneAxes(plane),normal=new THREE.Vector3().crossVectors(u,v),point=new THREE.Vector3();
        if(Math.abs(raycaster.ray.direction.dot(normal))<.08||!raycaster.ray.intersectPlane(new THREE.Plane(normal,0),point))return [];
        const a=point.dot(u),b=point.dot(v);if(a<=1e-6||b<=1e-6)return [];
        return [{plane,score:Math.min(a,b)/Math.max(a,b),distance:raycaster.ray.origin.distanceTo(point)}];
      });
      candidates.sort((a,b)=>b.score-a.score||a.distance-b.distance);return candidates[0]?.plane||null;
    };
    const pick = (event: MouseEvent): Selection | null => {
      camera.updateMatrixWorld();
      parts.updateMatrixWorld(true);
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        (-(event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const threshold =
        ((camera.top - camera.bottom) / camera.zoom / host.clientHeight) * 5;
      raycaster.params.Line.threshold = threshold;
      // Only raycast actual geometry, never overlays. Ignore clipped-away hits.
      const targets = parts.children.flatMap((g) =>
        g.children.filter((o) => o.userData.occurrence && !o.userData.overlay),
      );
      const hits = raycaster
        .intersectObjects(targets, false)
        .filter((hit) => !propsRef.current.section || sectionKeeps(hit.point,propsRef.current.sectionPlane));
      const surface = hits.find((item) => item.object.type === "Mesh");
      const edgeHit = hits.find(
        (item) =>
          item.object.type === "LineSegments" &&
          (!surface || item.distance <= surface.distance + threshold),
      );
      const hit = edgeHit || surface;
      if (!hit) return null;
      {
        let closest: { distance: number; selection: Selection } | null = null;
        for (const group of parts.children) {
          const occurrence = group.userData.occurrence as Occurrence;
          if (occurrence.id !== hit.object.userData.occurrence.id) continue;
          const data = propsRef.current.geometry[occurrence.definition];
          const candidates: { point: number[]; edge?: any; anchor?: "mid" }[] =
            (data?.vertices || []).map((point) => ({ point }));
          if (
            (!propsRef.current.operationDraft && !propsRef.current.sketch) ||
            propsRef.current.placementTarget ||
            propsRef.current.pickSlot === "travelTarget"
          )
            for (const edge of data?.edges || []) {
              if (
                edge.midpoint &&
                [edge.start, edge.end].every(
                  (p) =>
                    p &&
                    Math.hypot(
                      ...p.map((v: number, i: number) => v - edge.midpoint[i]),
                    ) > 1e-6,
                )
              )
                candidates.push({ point: edge.midpoint, edge, anchor: "mid" });
            }
          for (const candidate of candidates) {
            const { point } = candidate;
            const world = new THREE.Vector3(
              ...(point as [number, number, number]),
            ).applyMatrix4(group.matrixWorld);
            if (propsRef.current.section && !sectionKeeps(world,propsRef.current.sectionPlane)) continue;
            const projected = world.clone().project(camera);
            const distance = Math.hypot(
              ((projected.x - pointer.x) * rect.width) / 2,
              ((projected.y - pointer.y) * rect.height) / 2,
            );
            if (
              distance > 7 ||
              (surface &&
                raycaster.ray.origin.distanceTo(world) >
                  surface.distance + threshold * 2)
            )
              continue;
            const edge =
              candidate.edge ||
              data.edges?.find((e) =>
                [e.start, e.end].some(
                  (p) =>
                    p &&
                    Math.hypot(
                      ...p.map((v: number, i: number) => v - point[i]),
                    ) < 1e-5,
                ),
              );
            if (!edge) continue;
            const anchor =
              candidate.anchor ||
              (Math.hypot(
                ...edge.start.map((v: number, i: number) => v - point[i]),
              ) < 1e-5
                ? "start"
                : "end");
            if (!closest || distance < closest.distance)
              closest = {
                distance,
                selection: {
                  occurrence: occurrence.id,
                  definition: occurrence.definition,
                  vertex: { point, edge, anchor },
                },
              };
          }
        }
        if (closest) return closest.selection;
      }
      const occurrence = hit.object.userData.occurrence as Occurrence;
      const data = propsRef.current.geometry[occurrence.definition];
      if (edgeHit) {
        const edge = data?.edges?.find(
          (e) =>
            (hit.index ?? -1) >= e.segment_start * 2 &&
            (hit.index ?? -1) < (e.segment_start + e.segment_count) * 2,
        );
        return {
          occurrence: occurrence.id,
          definition: occurrence.definition,
          edge,
          point: hit.object.worldToLocal(hit.point.clone()).toArray(),
        };
      }
      const face = data?.faces?.find(
        (f) =>
          (hit.faceIndex ?? -1) >= f.triangle_start &&
          (hit.faceIndex ?? -1) < f.triangle_start + f.triangle_count,
      );
      return {
        occurrence: occurrence.id,
        definition: occurrence.definition,
        face,
        point: hit.object.worldToLocal(hit.point.clone()).toArray(),
      };
    };
    const sketchInput = (event: MouseEvent) => {
      const d = propsRef.current.sketch;
      if (!d) return null;
      camera.updateMatrixWorld();
      const rect = renderer.domElement.getBoundingClientRect(),
        f = sketchBasis(d.frame);
      pointer.set(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        1 - ((event.clientY - rect.top) / rect.height) * 2,
      );
      raycaster.setFromCamera(pointer, camera);
      const p = new THREE.Vector3();
      if (
        !raycaster.ray.intersectPlane(
          new THREE.Plane().setFromNormalAndCoplanarPoint(f.normal, f.origin),
          p,
        )
      )
        return null;
      p.sub(f.origin);
      return {
        point: [p.dot(f.u), p.dot(f.v)] as SketchPoint,
        tolerance:
          ((camera.top - camera.bottom) / camera.zoom / rect.height) * 8,
      };
    };
    const pointerdown = (event: PointerEvent) => {
      if (event.pointerType === "touch") {
        activeTouches.add(event.pointerId);
        if (activeTouches.size > 1) multiTouchGesture = true;
      }
      down = { x: event.clientX, y: event.clientY };
      dragging = true;
      clearHover();
    };
    const pointerup = (event: PointerEvent) => {
      if (event.pointerType === "touch") {
        activeTouches.delete(event.pointerId);
        const wasMultiTouch = multiTouchGesture;
        if (!activeTouches.size) multiTouchGesture = false;
        // A pinch/pan must never become a geometry pick or a sketch point when
        // one finger is lifted before the other.
        if (wasMultiTouch) {
          dragging = activeTouches.size > 0;
          return;
        }
      }
      dragging = false;
      if (
        event.button !== 0 ||
        Math.hypot(event.clientX - down.x, event.clientY - down.y) > 4
      )
        return;
      if (propsRef.current.sketch && !propsRef.current.sketchPlanePicking) {
        const axis=event.ctrlKey?null:pickWorldAxis(event);if(axis){propsRef.current.onWorldAxis?.(axis);return;}
        const input = sketchInput(event);
        if (input)
          propsRef.current.onSketchInput?.(
            input.point,
            input.tolerance,
            propsRef.current.sketch.showComponents ? pick(event) : null,
            event.shiftKey,
            event.ctrlKey,
          );
        return;
      }
      if (
        ["sketch", "place"].includes(propsRef.current.pickSlot || "") &&
        propsRef.current.operationFrame
      ) {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.set(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          1 - ((event.clientY - rect.top) / rect.height) * 2,
        );
        raycaster.setFromCamera(pointer, camera);
        const frame = propsRef.current.operationFrame,
          point = new THREE.Vector3();
        if (
          raycaster.ray.intersectPlane(
            new THREE.Plane().setFromNormalAndCoplanarPoint(
              frame.normal,
              frame.origin,
            ),
            point,
          )
        ) {
          const delta = point.sub(
            propsRef.current.pickSlot === "place"
              ? frame.baseOrigin
              : frame.origin,
          );
          propsRef.current.onSketchPoint?.([
            Math.round(delta.dot(frame.u)),
            Math.round(delta.dot(frame.v)),
          ]);
        }
        return;
      }
      if(event.ctrlKey){const sketch=pickSketch(event);if(sketch)propsRef.current.onSelectSketch?.(sketch,true);else propsRef.current.onSelect(pick(event),false,true);return;}
      const sketchId = pickSketch(event);
      if (sketchId) {
        propsRef.current.onSelectSketch?.(sketchId);
        return;
      }
      const worldAxis = pickWorldAxis(event);
      if (worldAxis) {
        propsRef.current.onWorldAxis?.(worldAxis);
        clearHover();
        return;
      }
      const plane=pickWorldPlane(event);if(plane){propsRef.current.onWorldPlane?.(plane);clearHover();return;}
      propsRef.current.onSelect(pick(event), event.shiftKey,event.ctrlKey);

    };
    const pointermove = (event: PointerEvent) => {
      if (
        propsRef.current.sketch &&
        !propsRef.current.sketchPlanePicking &&
        !event.buttons
      ) {
        const input = sketchInput(event);
        if (input)
          propsRef.current.onSketchCursor?.(input.point,input.tolerance);
      }
      if (!dragging && !event.buttons) lastPointer = event;
    };
    const contextmenu = (event: MouseEvent) => {
      event.preventDefault();
      if (propsRef.current.sketch) return;
      if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > 4)
        return;
      clearHover();
      propsRef.current.onContextMenu?.(
        pick(event),
        event.clientX,
        event.clientY,
      );
    };
    const pointerleave = () => {
      if(propsRef.current.sketch)propsRef.current.onSketchCursor?.(null);
      dragging = false;
      clearHover();
    };
    const pointercancel = (event: PointerEvent) => {
      activeTouches.delete(event.pointerId);
      if (!activeTouches.size) multiTouchGesture = false;
      pointerleave();
    };
    const doubleclick = (event: MouseEvent) => {
      if (pickSketch(event)||pickWorldPlane(event)) return;
      if (
        !propsRef.current.operationDraft &&
        !propsRef.current.placementTarget &&
        !propsRef.current.sketch
      )
        propsRef.current.onDoubleSelect?.(pick(event));
    };
    renderer.domElement.addEventListener("pointerdown", pointerdown);
    renderer.domElement.addEventListener("pointerup", pointerup);
    renderer.domElement.addEventListener("pointermove", pointermove);
    renderer.domElement.addEventListener("pointerleave", pointerleave);
    renderer.domElement.addEventListener("pointercancel", pointercancel);
    renderer.domElement.addEventListener("contextmenu", contextmenu);
    renderer.domElement.addEventListener("dblclick", doubleclick);
    controls.addEventListener("change", clearHover);
    const state = {
      scene,
      camera,
      renderer,
      controls,
      parts,
      preview: previewGroup,
      profileRole,
      grid,
      axes,
      clearHover,
      width: host.clientWidth,
      height: host.clientHeight,
    };
    const movementGhost=new THREE.Group();scene.add(movementGhost);
    sceneRef.current = state;
    // ResizeObserver can run after animation callbacks, just before paint.
    // Resizing the WebGL buffer there clears the last frame and exposes a blank
    // canvas until the next animation tick. Queue dimensions only; resize and
    // redraw together below, so the browser never paints that cleared buffer.
    let pendingSize: {width:number;height:number}|null=null;
    const observer = new ResizeObserver(() => {
      pendingSize={width:host.clientWidth,height:host.clientHeight};
    });
    observer.observe(host);
    let frame = 0;
    const render = () => {
      updateEdgePulseTime(performance.now()/1000);
      frame = requestAnimationFrame(render);
      if(pendingSize){
        const {width,height}=pendingSize;pendingSize=null;
        if(width>0&&height>0&&(width!==state.width||height!==state.height)){
          state.width=width;state.height=height;
          renderer.setSize(width,height,false);
          const h=camera.top-camera.bottom;
          camera.left=(-h*width)/height/2;camera.right=-camera.left;
          camera.updateProjectionMatrix();
        }
      }
      controls.update();
      camera.updateMatrixWorld();
      const originButton=worldOriginButton.current;
      if(originButton){
        const point=new THREE.Vector3().project(camera);
        const visible=Number.isFinite(point.x)&&Number.isFinite(point.y)&&Math.abs(point.x)<=1&&Math.abs(point.y)<=1;
        originButton.hidden=!visible;
        if(visible){originButton.style.left=`${(point.x+1)*state.width/2}px`;originButton.style.top=`${(1-point.y)*state.height/2}px`;}
      }
      const axisScales=worldAxisScales(camera);
      for(const child of axes.children){const scale=axisScales[child.userData.axisIndex];child.visible=scale>0;child.scale.setScalar(scale||1);}
      const current=propsRef.current;
      updateGridFade(camera);
      worldPlanes.visible=!!current.worldPlanePicking&&!!current.onWorldPlane;
      worldPlanes.scale.setScalar((camera.top-camera.bottom)/camera.zoom/Math.max(1,state.height));
      if(!worldPlanes.visible)showPlaneHover(null);
      styleWorldPlanes(worldPlanes,planeHover,current.selectedWorldPlane,!!current.worldPlanePicking,Math.max(state.width,state.height)*24);
      if (lastPointer) {
        const event = lastPointer;
        const sketchId = pickSketch(event);
        showSketchHover(sketchId);
        const axis = sketchId ? null : pickWorldAxis(event);
        setHoveredAxis(axis);
        const plane=sketchId||axis?null:pickWorldPlane(event);showPlaneHover(plane);
        const picked =
          sketchId ||
          axis ||
          plane ||
          (propsRef.current.sketch &&
            propsRef.current.sketch.tool !== "project" &&
            !propsRef.current.sketchPlanePicking) ||
          ["place", "sketch"].includes(propsRef.current.pickSlot || "")
            ? null
            : pick(event);
        const rect = renderer.domElement.getBoundingClientRect();
        if (hoverHint.current) {
          hoverHint.current.style.left = `${Math.max(12, Math.min(state.width - 230, event.clientX - rect.left + 18))}px`;
          hoverHint.current.style.top = `${Math.max(12, Math.min(state.height - 90, event.clientY - rect.top + 20))}px`;
        }
        lastPointer = null;
        showHover(
          propsRef.current.resolveHover
            ? propsRef.current.resolveHover(picked)
            : picked,
          "viewport",
        );
        if (axis || sketchId || plane) renderer.domElement.style.cursor = "pointer";
        else if(!picked)renderer.domElement.style.cursor="";
      }
      const selectedAxis =
        (propsRef.current.sketch&&propsRef.current.dimensionEditor?.second?.startsWith("world:")?propsRef.current.dimensionEditor.second.slice(6):null) ||
        propsRef.current.movementGuide?.worldAxis ||
        (propsRef.current.operationDraft?.direction !== "edge" &&
        propsRef.current.operationDraft?.direction !== "normal"
          ? propsRef.current.operationDraft?.direction
          : null);
      for (const child of axes.children) {
        if(child.userData.axisPick)continue;
        const material = (child as THREE.Line)
          .material as THREE.LineBasicMaterial;
        const hovered = child.userData.worldAxis === hoveredAxisRef.current;
        const selected = child.userData.worldAxis === selectedAxis;
        material.color.set(
          hovered
            ? "#ffb45e"
            : selected
              ? OPERATION_COLORS.path
              : child.userData.baseColor,
        );
        material.opacity = hovered || selected ? 1 : child.userData.axisSign>0?.85:.27;
        (material as any).linewidth=hovered||selected?3:child.userData.axisSign>0?2:1.1;
      }
      const external =
        (propsRef.current.operationDraft || propsRef.current.placementTarget || propsRef.current.measurePoints) &&
        propsRef.current.referenceHover;
      if (external) {
        showHover(
          resolveDisplaySelection(
            external,
            propsRef.current.geometry[external.definition],
          ),
          "panel",
        );
      } else if (hoverSource === "panel") showHover(null, "viewport");
      camera.updateMatrixWorld();
      parts.updateMatrixWorld(true);
      sectionGuide.current?.update(state);
      if (
        !propsRef.current.sketch &&
        !propsRef.current.operationDraft &&
        !propsRef.current.measurePoints &&
        !propsRef.current.placementTarget
      )
        measurementRef.current?.update(state, performance.now());
      if (propsRef.current.operationDraft) {
        syncProfileRole();
        operationGuide.current?.update(camera, state.width, state.height);
      } else if (profileRoleKey) {
        profileRoleKey = "";
        clearProfileRole();
      }
      syncMovementGhost(movementGhost,parts,current.placementTarget,current.section?[current.sectionPlane||new THREE.Plane(new THREE.Vector3(0,1,0),0)]:[]);
      movementGuide.current?.update(camera, state.width, state.height);
      moveAxisHandles.current?.update(camera,state.width,state.height);
      measureGuide.current?.update(camera, state.width, state.height);
      sketchGuide.current?.update(camera, state.width, state.height);
      propsRef.current.orientationRef?.current?.update(camera);
      renderer.render(scene, camera);
    };
    render();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      disposeOverlay(hoverLayer);
      disposeOverlay(sketchHoverLayer);
      disposeOverlay(worldPlanes);
      disposeOverlay(axes);
      clearProfileRole();
      disposePreview(displayedPreview.current);
      displayedPreview.current = null;
      controls.removeEventListener("change", clearHover);
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", orbitDown, true);
      renderer.domElement.removeEventListener("pointermove", orbitMove, true);
      renderer.domElement.removeEventListener("pointerup", orbitEnd, true);
      renderer.domElement.removeEventListener("pointercancel", orbitEnd, true);
      renderer.dispose();
      renderer.domElement.removeEventListener("pointerdown", pointerdown);
      renderer.domElement.removeEventListener("pointerup", pointerup);
      renderer.domElement.removeEventListener("pointermove", pointermove);
      renderer.domElement.removeEventListener("pointerleave", pointerleave);
      renderer.domElement.removeEventListener("pointercancel", pointercancel);
      renderer.domElement.removeEventListener("contextmenu", contextmenu);
      renderer.domElement.removeEventListener("dblclick", doubleclick);
      parts.traverse((object: any) => {
        disposeHighlightMaterial(object.material);
        if (object.userData.overlay) object.geometry?.dispose();
      });
      for (const asset of cache.current.values()) {
        asset.geometry.dispose();
        asset.edges.dispose();
      }
      cache.current.clear();
      host.removeChild(renderer.domElement);
      movementGhost.traverse((g:any)=>g.material?.dispose());movementGhost.clear();scene.remove(movementGhost);
      sceneRef.current = null;
      initialFit.current = false;
    };
  }, []);

  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    const preview =
      !props.sketch &&
      !props.operationDraft &&
      !props.placementTarget &&
      props.sketchObjects?.some((d) => d.feature?.id === props.selectedSketch);
    s.grid.visible =
      props.grid && !preview && (!props.sketch || !!props.sketchPlanePicking);
    s.axes.visible =
      !props.sketch || !!props.sketchPlanePicking || props.sketch.tool==="dimension";
    s.parts.visible = !props.sketch || props.sketch.showComponents;
  }, [
    props.grid,
    !!props.sketch,
    props.sketch?.showComponents,
    props.sketch?.tool,
    props.sketchPlanePicking,
    props.selectedSketch,
    props.sketchObjects,
    props.operationDraft,
    props.placementTarget,
  ]);

  useEffect(() => {
    const scene = sceneRef.current?.scene;
    if (!scene || !props.showBounds || !props.selected || props.sketch) return;
    const layout = explodedLayout(
      props.occurrences,
      props.geometry,
      props.explode,
    );
    const selected = new Set(
      selectionMembers(props.selected).flatMap((item) =>
        expandedGroupSelection(item, props.occurrences).map(
          (part) => part.occurrence,
        ),
      ),
    );
    const layer = new THREE.Group();
    for (const occurrence of props.occurrences) {
      if (!selected.has(occurrence.id) || !occurrence.visible) continue;
      const entry = layout.entries.get(occurrence.id);
      if (!entry) continue;
      const box = entry.bounds.clone().translate(entry.offset);
      const helper = new THREE.Box3Helper(box, 0xe5a860);
      const material = helper.material as THREE.LineBasicMaterial;
      material.transparent = true;
      material.opacity = 0.65;
      material.depthTest = false;
      material.depthWrite = false;
      helper.renderOrder = 20;
      layer.add(helper);
      const c = entry.center.clone().add(entry.offset);
      const size = Math.max(
        box.getSize(new THREE.Vector3()).length() * 0.025,
        0.3,
      );
      const points = [
        new THREE.Vector3(-size, 0, 0),
        new THREE.Vector3(size, 0, 0),
        new THREE.Vector3(0, -size, 0),
        new THREE.Vector3(0, size, 0),
        new THREE.Vector3(0, 0, -size),
        new THREE.Vector3(0, 0, size),
      ].map((p) => p.add(c));
      const cross = new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({
          color: 0xffdf98,
          transparent: true,
          opacity: 0.95,
          depthTest: false,
          depthWrite: false,
        }),
      );
      cross.renderOrder = 21;
      layer.add(cross);
    }
    scene.add(layer);
    return () => {
      scene.remove(layer);
      disposeOverlay(layer);
    };
  }, [
    props.showBounds,
    selectionStamp,
    occurrenceStamp,
    geometryStamp,
    props.explode,
    !!props.sketch,
  ]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const s = sceneRef.current;
      if (!s) return;
      // A committed candidate can become the native source without refetching.
      for (const [id, asset] of displayedPreview.current?.assets || []) {
        const key = displayedPreview.current!.components[id]?.geometry_key;
        if (
          key &&
          props.geometry[id]?.geometry_key === key &&
          !cache.current.has(key)
        )
          cache.current.set(key, {
            geometry: asset.geometry.clone(),
            edges: asset.edges.clone(),
          });
      }
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
            { headers: designHeaders() },
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
      s.clearHover();
      for (const child of [...s.parts.children]) {
        s.parts.remove(child);
        child.traverse((object: any) => {
          if (object.material) disposeHighlightMaterial(object.material);
          if (object.userData.overlay) object.geometry?.dispose();
        });
      }
      const clip = props.section
        ? [props.sectionPlane || new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)]
        : [];
      const layout = explodedLayout(
        props.occurrences,
        props.geometry,
        props.explode,
      );
      const physical = props.occurrences.filter(
        (o) => o.kind !== "assembly" && !o.suppressed && o.visible,
      );
      for (let index = 0; index < physical.length; index++) {
        const occurrence = physical[index],
          asset = desired.get(occurrence.definition);
        if (!asset) continue;
        const selected = props.selected?.occurrence === occurrence.id;
        const material = new THREE.MeshStandardMaterial({
          color:
            propsRef.current.occurrences.find((o) => o.id === occurrence.id)
              ?.color || occurrence.color,
          metalness: 0.08,
          roughness: 0.6,
          side: THREE.DoubleSide,
          emissive: selected ? "#5c3614" : "#000000",
          emissiveIntensity: selected ? 0.18 : 0,
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
        const displacement = layout.entries.get(occurrence.id)?.offset;
        if (displacement) {
          matrix.elements[12] += displacement.x;
          matrix.elements[13] += displacement.y;
          matrix.elements[14] += displacement.z;
        }
        group.matrix.copy(matrix);
        const selectionLayer = new THREE.Group();
        group.userData = {
          occurrence,
          asset,
          clip,
          surface: mesh,
          selectionLayer,
        };
        group.add(mesh);
        const lines = new THREE.LineSegments(
          asset.edges,
          new THREE.LineBasicMaterial({
            color: selected ? COMPONENT_SELECTION_COLOR : "#182330",
            transparent: true,
            opacity: selected ? 1 : 0.8,
            clippingPlanes: clip,
          }),
        );
        lines.userData.occurrence = occurrence;
        group.add(lines);
        group.userData.wire = lines;
        group.add(selectionLayer);
        s.parts.add(group);
      }
      refreshSelection();
      if (!initialFit.current && s.parts.children.length) {
        fit();
        initialFit.current = true;
      }
      if (container.current)
        container.current.dataset.readyRevision = String(props.revision);
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
    props.explode,
    props.section,
    props.historyKey,
    props.previewToken,
  ]);
  useEffect(() => {
    const s = sceneRef.current;
    if (!s) return;
    const old = displayedPreview.current;
    // Cancellation and a change of owner invalidate the display context. Ordinary
    // edits keep the last solid candidate visible while its replacement loads.
    if (
      (!props.operationDraft && !props.placementTarget && !props.featureEditTarget) ||
      !props.operationPreview ||
      (old && previousProfile.current !== props.operationDraft?.profile) ||
      (old && old.context !== displayContext)
    ) {
      disposePreview(old);
      displayedPreview.current = null;
      setPreviewDisplayError("");
      propsRef.current.onOperationPreviewReady?.(null);
    }
    previousProfile.current = props.operationDraft?.profile;
    syncOperationAppearance(
      s.parts,
      displayedPreview.current,
      propsRef.current,
    );
  }, [
    displayContext,
    props.operationDraft?.profile,
    !!props.operationPreview,
    !!props.operationDraft,
    colorStamp,
    props.section,
    selectionStamp,
  ]);

  useEffect(() => {
    const s = sceneRef.current,
      report = props.operationPreview;
    if (
      !s ||
      !report ||
      (!props.operationDraft && !props.placementTarget && !props.featureEditTarget) ||
      report.stale
    )
      return;
    const existing = displayedPreview.current;
    if (
      existing &&
      existing.token === report.preview_token &&
      existing.context === displayContext
    ) {
      // A superseded load may have cleared readiness while this retained
      // candidate was still on screen. Restoring a cached draft restores it.
      propsRef.current.onOperationPreviewReady?.(existing.token);
      setPreviewDisplayError("");
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    const assets = new Map<string, Awaited<ReturnType<typeof previewAsset>>>();
    const root = new THREE.Group();
    const next: DisplayedPreview = {
      token: report.preview_token,
      context: displayContext,
      root,
      assets,
      components: report.components,
      section: props.section,
      occurrences: report.occurrences,
    };
    propsRef.current.onOperationPreviewReady?.(null);
    setPreviewDisplayError("");
    const load = async () => {
      try {
        const changed = Object.entries(
          report.components as Record<string, Geometry>,
        ).filter(
          ([id, info]) =>
            info.geometry_key &&
            info.geometry_key !== propsRef.current.geometry[id]?.geometry_key,
        );
        const loads = await Promise.allSettled(
          changed.map(async ([id]) =>
            assets.set(
              id,
              await previewAsset(id, report.preview_token, controller.signal),
            ),
          ),
        );
        const failure = loads.find((r) => r.status === "rejected");
        if (failure?.status === "rejected") throw failure.reason;
        const current = propsRef.current;
        if (
          cancelled ||
          (!current.operationDraft && !current.placementTarget && !current.featureEditTarget) ||
          current.operationPreview?.preview_token !== next.token ||
          viewportDisplayContext(current) !== next.context
        ) {
          disposePreview(next);
          return;
        }
        const clip = current.section
          ? [current.sectionPlane || new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)]
          : [];
        next.section = current.section;
        for (const occurrence of report.occurrences || []) {
          const asset = assets.get(occurrence.definition);
          if (!asset || !occurrence.visible || occurrence.suppressed) continue;
          const group = new THREE.Group();
          group.userData.occurrence = occurrence;
          group.matrixAutoUpdate = false;
          group.matrix.set(
            ...(occurrence.matrix.flat() as Parameters<THREE.Matrix4["set"]>),
          );
          // Match the source transform, including the optional exploded view.
          const source = s.parts.children.find(
            (g: THREE.Group) => g.userData.occurrence.id === occurrence.id,
          );
          if (source) group.matrix.copy(source.matrix);
          group.add(
            new THREE.Mesh(
              asset.geometry,
              new THREE.MeshStandardMaterial({
                color:
                  current.occurrences.find((o) => o.id === occurrence.id)
                    ?.color ||
                  occurrence.color ||
                  "#92b7c9",
                roughness: 0.6,
                metalness: 0.08,
                side: THREE.DoubleSide,
                clippingPlanes: clip,
                polygonOffset: true,
                polygonOffsetFactor: 1,
                polygonOffsetUnits: 1,
              }),
            ),
            new THREE.LineSegments(
              asset.edges,
              new THREE.LineBasicMaterial({
                color: COMPONENT_SELECTION_COLOR,
                transparent: true,
                opacity: 0.9,
                depthWrite: false,
                clippingPlanes: clip,
              }),
            ),
          );
          root.add(group);
        }
        // No render can occur between replacing the old root and masking the
        // source surface. Exactly one opaque surface is drawn for each part.
        const previous = displayedPreview.current;
        s.preview.add(root);
        displayedPreview.current = next;
        syncOperationAppearance(s.parts, next, current);
        disposePreview(previous);
        if (!initialFit.current && root.children.length) {
          fit();
          initialFit.current = true;
        }
        if (container.current)
          container.current.dataset.previewToken = next.token;
        propsRef.current.onOperationPreviewReady?.(next.token);
      } catch (error) {
        disposePreview(next);
        if (!cancelled) {
          console.error("Operation preview:", error);
          setPreviewDisplayError(
            "Preview could not be displayed. Edit a value to retry; the previous shape is still shown.",
          );
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    props.operationPreview?.preview_token,
    props.operationPreview?.stale,
    displayContext,
    !!props.operationDraft,
  ]);

  const visibleSelections = displaySelectionMembers(
    props.selected,
    props.operationDraft,
  );
  const selectedOccurrence = props.occurrences.find(
    (o) =>
      o.id === visibleSelections[0]?.occurrence && o.visible && !o.suppressed,
  );
  const edgeSelected = !!props.selected?.edge;
  const selectedCount = visibleSelections.length;
  return (
    <>
      {props.onWorldOrigin&&<button ref={worldOriginButton} hidden className="world-origin-point" aria-label="Select world origin" aria-pressed={!!props.selected?.worldOrigin} title="World origin · X 0, Y 0, Z 0 mm" onClick={e=>{e.stopPropagation();if(e.ctrlKey)props.onSelect({worldOrigin:true,occurrence:"",definition:"root"},false,true);else props.onWorldOrigin?.();}} onContextMenu={e=>e.preventDefault()}><svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="5"/><path d="M10 1v5m0 8v5M1 10h5m8 0h5"/><circle className="origin-center" cx="10" cy="10" r="1.4"/></svg></button>}
      {rendererError&&<div className="viewport-renderer-error" role="alert">
        <h2>3D graphics unavailable</h2>
        <p>This browser could not start WebGL 2. The design remains on the server; the workspace and file menus are still available.</p>
        <p>In Chrome, open <code>chrome://settings/system</code>, enable graphics acceleration, then quit and reopen Chrome. Check <code>chrome://gpu</code> for WebGL / WebGL2 status and Problems Detected.</p>
        <p>If graphics are still unavailable, update Chrome and macOS, or use a browser where this design already works.</p>
        <button className="button primary" onClick={()=>window.location.reload()}>Reload app</button>
        <details><summary>Graphics error details</summary><pre>{rendererError}</pre></details>
      </div>}
      <div
        className="canvas-host"
        ref={container}
        aria-label="Interactive CAD viewport"
        data-world-plane-picking={props.worldPlanePicking||undefined}
        data-hover-source={
          hoveredSketch||hoveredWorldPlane?'viewport':hovered ? (hoverFromPanel ? "panel" : "viewport") : undefined
        }
        data-hover-kind={
          hoveredWorldPlane?'plane':hoveredSketch?'sketch':hovered?.vertex
            ? "vertex"
            : hovered?.edge
              ? "edge"
              : hovered?.face
                ? "face"
                : undefined
        }
      />
      <div
        ref={hoverHint}
        className="viewport-hover-target"
        role="tooltip"
        aria-label="Click target"
        hidden={(!hovered && !hoveredAxis && !hoveredSketch && !hoveredWorldPlane) || hoverFromPanel}
        data-kind={hoveredWorldPlane?'plane':hoveredSketch?'sketch':hovered?.vertex ? "vertex" : hovered?.edge ? "edge" : "face"}
      >
        <strong>
          <i />
          {hoveredWorldPlane ? `World ${hoveredWorldPlane} plane` : hoveredSketch ? `Sketch · ${props.sketchObjects?.find(d=>d.feature?.id===hoveredSketch)?.feature?.name||'2D sketch'}` : hoveredAxis ? (
            `World ${hoveredAxis} axis`
          ) : (
            <>
              {entityName(
                hovered,
                hovered ? props.geometry[hovered.definition] : undefined,
              )}
              ·{" "}
              {
                props.occurrences.find((o) => o.id === hovered?.occurrence)
                  ?.name
              }
            </>
          )}
        </strong>
        {hovered?.edge &&
          !hovered.vertex &&
          Number.isFinite(hovered.edge.length) && (
            <span className="viewport-hover-measurement">
              {hovered.edge.type === "LINE" ? "Length" : "Curve length"}{" "}
              <b>
                {(
                  hovered.edge.length / (props.units === "in" ? 25.4 : 1)
                ).toLocaleString(undefined, {
                  maximumFractionDigits: props.units === "in" ? 4 : 3,
                })}{" "}
                {props.units || "mm"}
              </b>
            </span>
          )}
        <small>
          {hoveredWorldPlane ? 'Click to use this plane' : hoveredSketch ? props.operationDraft?'Use as Tool Profile':'Click to select sketch' : hoveredAxis
            ? "Use as reference direction / Tool Path"
            : props.placementTarget
              ? "Pick points for origin/target or an edge for direction"
              : props.measurePoints
                ? shiftHeld ? "Add or remove a measurement point" : "Use clicked location as a measurement point"
              : hovered
                ? hoverIntent(
                    hovered,
                    props.selected,
                    props.operationDraft,
                    props.pickSlot,
                    shiftHeld,
                  )
                : ""}
        </small>
      </div>
      {(selectedOccurrence || props.selected?.worldOrigin || props.editingContext) && !props.sketch && !props.measurePoints && (
        <div className="viewport-selection-summary" aria-live="polite">
          <span className="active-part-marker" />
          <span>
            <small>
              {props.editingContext ? props.editingContext.label : props.selected?.worldOrigin ? "WORLD REFERENCE" : props.operationDraft
                ? "PICKED REFERENCE"
                : selectedOccurrence?.kind === "assembly"
                  ? "ACTIVE GROUP"
                  : selectedOccurrence?.purpose === "tool"
                    ? "ACTIVE TOOL BODY"
                    : "ACTIVE COMPONENT"}
            </small>
            <strong>{props.editingContext?.name||(props.selected?.worldOrigin?"World origin":selectedOccurrence?.name)}</strong>
          </span>
          {props.editingContext ? <button className="selection-summary-done" disabled={props.editingContext.disabled} onClick={props.editingContext.onDone}>Done</button> : <b>
            {props.selected?.worldOrigin ? "X 0 · Y 0 · Z 0 mm" : selectedCount > 1
              ? `${selectedCount} ${edgeSelected ? "edges" : props.selected?.face ? "faces" : "components"} selected`
              : selectedOccurrence?.kind === "assembly"
                ? "Group selected"
                : `${entityName(props.selected, props.geometry[props.selected?.definition || ""])} selected`}
          </b>}
        </div>
      )}
      <MoveAxisHandles ref={moveAxisHandles} target={props.placementTarget} rows={props.occurrences} geometry={props.geometry} guide={props.movementGuide} onSlide={props.onMoveAxisSlide} onDistance={props.onMoveDistance}/>
      <MovementGuide ref={movementGuide} guide={props.movementGuide} />
      <SketchGuide
        ref={sketchGuide}
        draft={
          props.sketchPlanePicking
            ? null
            : props.sketch ||
              (props.grid && !props.operationDraft && !props.placementTarget
                ? props.sketchObjects?.find(
                    (d) => d.feature?.id === props.selectedSketch,
                  )
                : null)
        }
        gridOnly={!props.sketch}
        onMeasurement={props.onSketchMeasurement}
        dimensionEditor={props.dimensionEditor}
      />
      <OperationGuide
        ref={operationGuide}
        frame={props.operationFrame}
        draft={props.operationDraft}
        pick={props.pickSlot}
      />
      {previewDisplayError &&
        (props.operationDraft || props.placementTarget || props.featureEditTarget) && (
          <div className="operation-stale-note" role="alert">
            {previewDisplayError}
          </div>
        )}
      {props.operationPreview?.stale && !previewDisplayError && (
        <div className="operation-stale-note" role="note">
          Previous preview · current edit is not validated
        </div>
      )}
      {props.measurePoints && <MeasureGuide ref={measureGuide} points={props.measurePoints} units={props.units||'mm'}/>}
      {!props.sketch && !props.operationDraft && !props.placementTarget && !props.featureEditTarget && !props.measurePoints && (
        <MeasurementOverlay
          ref={measurementRef}
          geometry={props.geometry}
          selected={props.selected}
          hovered={hovered}
          selectedItems={
            props.selected
              ? expandedGroupSelection(props.selected, props.occurrences)
              : []
          }
          hoveredItems={
            hovered ? expandedGroupSelection(hovered, props.occurrences) : []
          }
          units={props.units || "mm"}
          section={props.section}
          sectionPlane={props.sectionPlane}
        />
      )}
      {props.section && props.sectionReference && <SectionGuide ref={sectionGuide} reference={props.sectionReference} offset={props.sectionOffset||0} geometry={props.geometry} occurrences={props.occurrences} explode={props.explode} units={props.units}/>}
      <div className="viewport-selection-legend" hidden={!!props.sketch}>
        <span>
          <i className="active" style={props.activeAppearance?.enabled?{background:props.activeAppearance.tint}:undefined} />
          Active part
        </span>
        <span>
          <i className="selected" />
          Selected
        </span>
        <span>
          <i className="hover" />
          Click target
        </span>
        {hovered && (
          <b>
            {entityName(hovered, props.geometry[hovered.definition])} ·{" "}
            {props.operationDraft ? "tool reference" : "click to select"}
          </b>
        )}
      </div>
    </>
  );
});
export default Viewport;
