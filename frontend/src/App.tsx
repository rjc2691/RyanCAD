import ExperimentalFeatures from "./ExperimentalFeatures";
import {dispatchToolbarShortcut,shortcutAttributes,shortcutLabel,getToolbarPreferences,subscribeToolbar,reorderToolbar} from './toolbarShortcuts';
import ToolbarSettings from './ToolbarSettings';
import BugReports from "./BugReports";
import MeasurePanel from "./MeasurePanel";
import {measurePoint,captureMeasurePoint,type MeasurePoint} from "./measureModel";
import {loadExperiments,saveExperiments,ACTIVE_APPEARANCE_ID,SIDEBAR_TOOLBAR_LAYOUT_ID} from "./experiments";
import MCPSetup from "./MCPSetup";
import AccountMenu from "./AccountMenu";
import HistoryResizeHandle from "./HistoryResizeHandle";
import {explodedLayout} from "./explodedView";
import SectionControls from "./SectionControls";
import {updateSectionPlane,sectionRange,type SectionSettings} from "./sectionView";
import FileActions from "./FileActions";
import SketchToolbar from "./SketchToolbar";
import ParametersWindow from "./ParametersWindow";
import { NamedParameterProvider } from "./NumericInput";
import WorkspaceDialog, { type WorkspaceInfo } from "./WorkspaceDialog";
import FeatureHistory from "./FeatureHistory";
import FeatureEditPanel, { type FeatureEditHandle } from "./FeatureEditPanel";
import MobileNavigation, { useMobileLayout, type MobilePane } from "./MobileNavigation";
import { historyLanes, historyStep } from "./historyModel";
import type { MovementGuideData, WorldAxis } from "./movementModel";
import GroupPanel, { type GroupPanelHandle } from "./GroupPanel";
import {
  groupCandidates,
  componentTreeRows,
  treeDropParent,
  treeDropProblem,
  remapTreePath,
  groupSelection,
  parentPath,
  withinGroup,
} from "./groupModel";
import MoveComponentPanel, {
  type MoveComponentHandle,
} from "./MoveComponentPanel";
import ViewOrientation, { type ViewOrientationHandle } from "./ViewOrientation";
import { entityName } from "./geometryLabels";
import {
  mergeSelection,
  selectionMembers,
} from "./operations/groupedSelection";
import {
  Fragment,
  Children,isValidElement,type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Activity,
  Puzzle,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Axis3D,
  Box,
  Boxes,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeftRight,
  Circle,
  Clock3,
  Command,
  Radius,
  Pencil,
  Copy,
  Cuboid,
  Download,
  Ellipsis,
  Expand,
  Eye,
  EyeOff,
  FilePlus2,
  FolderOpen,
  FolderPlus,
  GitBranch,
  Grid2X2,
  Magnet,
  Grip,
  History,
  Info,
  Layers,
  Link2,
  LoaderCircle,
  Maximize2,
  MousePointer2,
  Move3D,
  PanelLeftClose,
  PanelRightClose,
  Pause,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  Ruler,
  Save,
  ScanLine,
  Scan,
  Search,
  Settings2,
  ShieldCheck,
  SkipForward,
  SlidersHorizontal,
  Square,
  SquareDashed,
  Star,
  Target,
  Trash2,
  Triangle,
  Undo2,
  Unlink,
  X,
  Zap,
} from "lucide-react";
import Viewport, { type ViewportHandle } from "./Viewport";
import { Modal, ParameterDialog, ToolDialog } from "./Forms";
import SketchPanel, { type SketchPanelHandle } from "./SketchPanel";
import {
  frameFromSelection,
  chooseSketchTool,
  worldSketchFrame,
  sketchBasis,
  startSketch,
  type SketchDraft,
  type SketchFrame,
} from "./sketchModel";
import { inspectorMeasurements } from "./inspectorMeasurements";
import ComponentAppearance from "./ComponentAppearance";
import ContextMenu, { type ContextAction } from "./ContextMenu";
import OperationPanel, {
  type OperationPanelHandle,
} from "./operations/OperationPanel";
import {
  initialOperation,
  withSketchProfile,
  operationFrame,
  OPERATION_TOOLS,
  operationPathPickProblem,
  type OperationDraft,
  type PickSlot,
} from "./operations/operationModel";
import {
  api,
  ApiError,
  expressionLabel,
  numeric,
  waitJob,
  newRequestId,
  currentDesignId,
  setCurrentDesignId,
  designHeaders,
  designUrl,
} from "./api";
import type { Feature, Parameter, Selection, State, Occurrence } from "./types";

// Only independent workflows; shape/motion shortcuts live inside Tool.
const toolList = [
  { id: "tool", label: "Tool operation", icon: Zap, category: "Design" },
  { id: "sketch", label: "Sketch", icon: SquareDashed, category: "Design" },
  {
    id: "transform",
    label: "Move Component",
    icon: Move3D,
    category: "Organize",
  },
  { id: "duplicate", label: "Repeat part", icon: Copy, category: "Organize" },
  {
    id: "assembly",
    label: "Group components",
    icon: FolderOpen,
    category: "Organize",
  },
  {
    id: "component_pattern",
    label: "Component pattern",
    icon: Boxes,
    category: "Organize",
  },
  {
    id: "measure",
    label: "Measure",
    icon: Ruler,
    category: "Inspect",
  },
  {
    id: "checkpoint",
    label: "Save checkpoint",
    icon: Save,
    category: "History",
  },
];
const toolbarLabels: Record<string, string> = {
  component_pattern: "Array parts",
  stock: "Stock",
  parameter: "New parameter",
  fit: "Fit",
  measure: "Measure",
  checkpoint: "Checkpoint",
};
const featureIcon: Record<string, any> = {
  box: Box,
  cylinder: Circle,
  rectangle: Square,
  circle: Circle,
  sketch: SquareDashed,
  extrude: ArrowUpRight,
  holes: Target,
  fillet: Radius,
  chamfer: Triangle,
  pattern: Grid2X2,
  revolve: RotateCcw,
  mirror: ChevronsLeftRight,
  boolean: Boxes,
};

function OrderedToolbar({order,children}:{order:string[];children:ReactNode}) {
 const flatten=(nodes:ReactNode):any[]=>Children.toArray(nodes).flatMap((node:any)=>isValidElement(node)&&node.type===Fragment?flatten((node.props as any).children):[node]);
 const rank=(node:any)=>{const id=node.props?.['data-toolbar-action']||(node.type===ExperimentalFeatures?'experiments':node.type===BugReports?'reports':null);return id?order.indexOf(id):Math.min(...['experiments','reports','settings'].map(id=>order.indexOf(id)))-.5;};
 return <>{flatten(children).sort((a,b)=>rank(a)-rank(b))}</>;
}

function Logo() {
  return (
    <svg width="30" height="32" viewBox="0 0 30 32" fill="none">
      <path
        d="M15 2 27 9v14l-12 7-12-7V9L15 2Z"
        stroke="#a3dfd0"
        strokeWidth="1.5"
      />
      <path d="m3 9 12 7 12-7M15 16v14" stroke="#6b9c94" strokeWidth="1.2" />
      <path d="m9 12 6-3 6 3-6 3-6-3Z" fill="#a3dfd0" />
      <path d="M15 19v5l6-3v-5l-6 3Z" fill="#a3dfd0" fillOpacity=".65" />
    </svg>
  );
}

export default function App() {
  const [move, setMove] = useState<{
    target: Selection | null;
    axisRequest?: { axis: WorldAxis; id: number };
  } | null>(null);
  const [moveGuide, setMoveGuide] = useState<MovementGuideData | null>(null);
  const [movePreview, setMovePreview] = useState<any>(null);
  const moveRef = useRef<MoveComponentHandle>(null);
  const moveActive = useRef(false);
  moveActive.current = !!move;
  const moveTargetRef = useRef<Selection | null>(null);
  moveTargetRef.current = move?.target || null;
  const orientationRef = useRef<ViewOrientationHandle>(null);
  const [operation, setOperation] = useState<OperationDraft | null>(null);
  const [operationSetup, setOperationSetup] = useState<{
    draft: OperationDraft;
    pick: PickSlot;
    report: any;
  } | null>(null);
  const [operationReference, setOperationReference] =
    useState<Selection | null>(null);
  const [operationHover, setOperationHover] = useState<Selection | null>(null);
  const [operationPreview, setOperationPreview] = useState<any>(null);
  const [previewRendered, setPreviewRendered] = useState<string | null>(null);
  const operationRef = useRef<OperationPanelHandle>(null);
  const [featureEdit, setFeatureEdit] = useState<{ feature: Feature; target: Selection | null } | null>(null);
  const featureEditRef = useRef<FeatureEditHandle>(null);
  const featureEditActive = useRef(false);
  featureEditActive.current = !!featureEdit;
  const operationCommit = useRef<{ cancelled: boolean; jobId?: string } | null>(
    null,
  );
  const operationActive = useRef(false);
  operationActive.current = !!operation || !!move || !!featureEdit;
  const launchRef = useRef<(kind: string) => void>(() => {});
  const [state, setState] = useState<State | null>(null);
  const [workspace, setWorkspace] = useState<WorkspaceInfo | null>(null);
  const stateRef = useRef<State | null>(null);
  const [appearance, setAppearance] = useState<{
    definition: string;
    x: number;
    y: number;
    focusName?: boolean;
  } | null>(null);
  const [colorPreview, setColorPreview] = useState<{
    definition: string;
    color: string;
  } | null>(null);
  const [groupColorsEnabled, setGroupColorsEnabled] = useState(true);
  const [fallbackGroupColors] = useState(() => {
    const palette = ["#89959f", "#9b958a", "#808f8b", "#9a9098", "#92999b"];
    return Array.from(
      { length: 3 },
      () => palette[Math.floor(Math.random() * palette.length)],
    );
  });
  const [contextMenu, setContextMenu] = useState<{
    selection: Selection | null;
    x: number;
    y: number;
  } | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const selectedMembers = selectionMembers(selection);
  const [selectionSet, setSelectionSet] = useState<string[]>([]);
  const [groupScope, setGroupScope] = useState("");
  const treePointer = useRef<{
    id: string;
    x: number;
    y: number;
    active: boolean;
    parent: string | null;
    problem: string;
  } | null>(null);
  const suppressTreeClick = useRef(0);
  const [draggedComponent, setDraggedComponent] = useState<string | null>(null);
  const [treeDrop, setTreeDrop] = useState<{
    parent: string;
    problem: string;
  } | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [editingDesignName, setEditingDesignName] = useState<string | null>(
    null,
  );
  const cancelDesignRename = useRef(false);
  const toggleGroup = (id: string) =>
    setExpandedGroups((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  useEffect(() => {
    if (!groupScope) return;
    setExpandedGroups((previous) => {
      const next = new Set(previous);
      for (let id = groupScope; id; id = parentPath(id)) next.add(id);
      return next;
    });
  }, [groupScope]);
  const groupScopeRef = useRef("");
  groupScopeRef.current = groupScope;
  const [grouping, setGrouping] = useState<string[] | null>(null);
  const groupingActive = useRef(false);
  groupingActive.current = !!grouping;
  const groupPanelRef = useRef<GroupPanelHandle>(null);
  useEffect(() => {
    if (
      groupScope &&
      state &&
      !state.occurrences.some((o) => o.id === groupScope)
    )
      setGroupScope("");
  }, [state?.document.revision, groupScope]);
  const [selectedFeature, setSelectedFeature] = useState<string | null>(null);
  const [dialog, setDialog] = useState<string | null>(null);
  const [toolbarPrefs,setToolbarPrefs]=useState(getToolbarPreferences);
  useEffect(()=>subscribeToolbar(()=>setToolbarPrefs(getToolbarPreferences())),[]);
  const toolbarDrag=useRef<string|null>(null),toolbarDragEnd=useRef(0);
  const [measure,setMeasure]=useState<MeasurePoint[]|null>(null);
  const [measureReplace,setMeasureReplace]=useState<number|null>(null);
  const [measureNotice,setMeasureNotice]=useState('');
  const measureActive=useRef(false);measureActive.current=measure!==null;
  const closeMeasure=()=>{setMeasure(null);setMeasureReplace(null);setMeasureNotice('');setOperationHover(null);};
  useEffect(()=>{setMeasure(current=>current===null?null:[]);setMeasureReplace(null);setMeasureNotice('');setOperationHover(null);},[state?.document.id,state?.document.revision]);
  const dialogRef = useRef(dialog);
  dialogRef.current = dialog;
  const [editParameter, setEditParameter] = useState<string | null>(null);
  const [sketch, setSketch] = useState<SketchDraft | null>(null);
  const sketchRef = useRef<SketchPanelHandle>(null);
  const [dimensionEditor, setDimensionEditor] = useState<{
    line: string;
    value: string;
    error?: string;
  } | null>(null);
  const sketchActive = useRef(false);
  sketchActive.current = !!sketch;
  const [sketchPlanePicking, setSketchPlanePicking] = useState(false);
  const sketchPlanePickingRef = useRef(false);
  sketchPlanePickingRef.current = sketchPlanePicking;
  const [selectedSketch, setSelectedSketch] = useState<string | null>(null);
  const [hiddenSketches, setHiddenSketches] = useState<Set<string>>(new Set());
  const sketchParent = useRef(false);
  const [error, setError] = useState<any>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [localJob, setLocalJob] = useState<any>(null);
  const [toolSearch, setToolSearch] = useState("");
  const [parallelHistory, setParallelHistory] = useState(false);
  const [mergedHistory, setMergedHistory] = useState<Set<string>>(new Set());
  const [toolWorkbench, setToolWorkbench] = useState<string | null>(null);
  const toolReturnSelection = useRef<Selection | null>(null);
  const toolReturnScope = useRef("");
  const [timelineTab, setTimelineTab] = useState("features");
  const [activityAction, setActivityAction] = useState<any>(null);
  const [olderActions, setOlderActions] = useState<any[]>([]);
  const [grid, setGrid] = useState(true);
  const [experiments,setExperiments]=useState(loadExperiments);
  useEffect(()=>saveExperiments(experiments),[experiments]);
  const [section, setSection] = useState(false);
  const [sectionSettings,setSectionSettings]=useState<SectionSettings>({axis:"Y",offset:0,flipped:false});
  const sectionPlane=useRef(updateSectionPlane(sectionSettings));
  updateSectionPlane(sectionSettings,sectionPlane.current);
  const sectionInitialized=useRef(false);
  const [sectionPicking,setSectionPicking]=useState(false);
  const [sectionNotice,setSectionNotice]=useState("");
  const sectionPickingRef=useRef(false);sectionPickingRef.current=sectionPicking;
  const [explode, setExplode] = useState(0);
  const [showComponentBounds, setShowComponentBounds] = useState(false);
  const [historyView, setHistoryView] = useState<any>(null);
  const escapeState = useRef({
    contextMenu,
    appearance,
    editParameter,
    error,
    historyView,
  });
  escapeState.current = {
    contextMenu,
    appearance,
    editParameter,
    error,
    historyView,
  };
  const [exports, setExports] = useState<any>(null);
  const [followAgent, setFollowAgent] = useState(true);
  const [connectionError, setConnectionError] = useState(false);
  const [leftVisible, setLeftVisible] = useState(true);
  const [rightVisible, setRightVisible] = useState(true);
  const mobileLayout = useMobileLayout();
  const [mobilePane, setMobilePane] = useState<MobilePane>("viewport");
  const mobileOperation = sketch ? "Sketch" : featureEdit ? "Edit feature" : move ? "Move" : operation ? "Tool" : grouping !== null ? "Group" : measure!==null ? "Measure" : null;
  useEffect(() => {
    if (mobileLayout && mobileOperation) setMobilePane("inspector");
  }, [mobileLayout, mobileOperation]);
  const viewRef = useRef<ViewportHandle>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const runRef = useRef<any>(null);
  const lastSequence = useRef(-1);
  const statePoll = useRef(false);
  const workspaceReady = useRef(false);

  const refresh = useCallback(async (force = false) => {
    if (!workspaceReady.current) return stateRef.current;
    if (statePoll.current && !force) return stateRef.current;
    statePoll.current = true;
    try {
      const current = (await api("/state")) as State;
      setConnectionError(false);
      if (
        force ||
        lastSequence.current !== current.sequence ||
        stateRef.current?.worker_status !== current.worker_status ||
        stateRef.current?.save_error !== current.save_error
      ) {
        stateRef.current = current;
        setState(current);
        lastSequence.current = current.sequence;
      }
      return current;
    } catch (e) {
      setConnectionError(true);
      return stateRef.current;
    } finally {
      statePoll.current = false;
    }
  }, []);
  const refreshWorkspace = useCallback(async () => {
    const info = (await api("/workspace")) as WorkspaceInfo;
    setWorkspace(info);
    return info;
  }, []);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const info = await refreshWorkspace();
        if (cancelled) return;
        const stored = currentDesignId();
        setCurrentDesignId(info.designs.some((design) => design.id === stored && !design.deleted) ? stored : info.active_design);
        workspaceReady.current = true;
        await refresh(true);
      } catch (error: any) {
        if (!cancelled) {
          setConnectionError(true);
          setError({ message: error.message || "Could not open this workspace.", code: error.code || "request_failed" });
        }
      }
    })();
    const timer = setInterval(() => refresh(), 650);
    return () => { cancelled = true; clearInterval(timer); };
  }, [refresh, refreshWorkspace]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4500);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  const report = (e: any) => {
    setError({
      message: e.message || "The operation could not be completed.",
      code: e.code || "request_failed",
      details: e.details,
    });
  };
  const run = useCallback(
    async (name: string, args: Record<string, any> = {}) => {
      const current = stateRef.current;
      if (!current) return;
      setError(null);
      setLocalJob({ status: "queued", description: name });
      try {
        const submission = await api("/commands", {
          method: "POST",
          body: JSON.stringify({
            name,
            args,
            expected_revision: current.document.revision,
            request_id: newRequestId(),
          }),
        });
        const result = await waitJob(submission, setLocalJob);
        const next = await refresh(true);
        setHistoryView(null);
        if (result.occurrence_map) {
          const mapping = result.occurrence_map as Record<string, string>;
          setExpandedGroups(
            (previous) =>
              new Set([...previous].map((id) => remapTreePath(id, mapping))),
          );
          setGroupScope((previous) => remapTreePath(previous, mapping));
        }
        if (result.occurrence_id) {
          setExpandedGroups((previous) => {
            const next = new Set(previous);
            if (
              name === "group.create" ||
              (name === "group.insert" && args.kind === "assembly")
            )
              next.add(result.occurrence_id);
            for (
              let id = parentPath(result.occurrence_id);
              id;
              id = parentPath(id)
            )
              next.add(id);
            return next;
          });
        }
        if (next && !operationActive.current) {
          setSelection((current) =>
            current
              ? next.occurrences.some((i) => i.id === current.occurrence)
                ? { ...current, face: undefined, edge: undefined }
                : null
              : null,
          );
          setSelectionSet((current) =>
            current.filter((id) => next.occurrences.some((i) => i.id === id)),
          );
        }
        if (result.instance_id && next && !operationActive.current) {
          const occurrence = next.occurrences.find(
            (i) => i.source_id === result.instance_id,
          );
          if (occurrence) {
            setSelection({
              occurrence: occurrence.id,
              definition: occurrence.definition,
            });
            setSelectionSet([occurrence.id]);
          }
        } else if (result.component_id && next && !operationActive.current) {
          const occurrence = next.occurrences.find(
            (i) => i.definition === result.component_id,
          );
          if (occurrence)
            setSelection({
              occurrence: occurrence.id,
              definition: occurrence.definition,
            });
        }
        if (result.feature_id && !operationActive.current) {
          setSelectedFeature(result.feature_id);
          const f = next?.document.features[result.feature_id];
          const occurrence = next?.occurrences.find(
            (i) => i.definition === f?.owner,
          );
          if (occurrence)
            setSelection({
              occurrence: occurrence.id,
              definition: occurrence.definition,
            });
        }
        setToast(result.description || "Design updated");
        return result;
      } catch (e) {
        report(e);
        throw e;
      } finally {
        setLocalJob(null);
      }
    },
    [refresh],
  );
  runRef.current = run;
  const preview = async (name: string, args: any) => {
    try {
      return await waitJob(
        await api("/previews", {
          method: "POST",
          body: JSON.stringify({
            name,
            args,
            expected_revision: stateRef.current!.document.revision,
            request_id: newRequestId(),
          }),
        }),
        setLocalJob,
      );
    } catch (e) {
      report(e);
      throw e;
    } finally {
      setLocalJob(null);
    }
  };

  const captureSectionFace=(item:Selection|null)=>{
    if(!state)return false;
    const frame=frameFromSelection(item,state);
    if(!frame||!item){setSectionNotice("Choose a planar face or a sketch plane.");return false;}
    const offset=explodedLayout(state.occurrences,historyView?.components||state.geometry,explode).entries.get(item.occurrence)?.offset;
    if(offset)frame.origin=frame.origin.map((n,i)=>n+offset.getComponent(i));
    setSectionSettings({...sectionSettings,offset:0,reference:{label:`${state.document.components[item.definition]?.name || "Component"} · ${item.face?.name || "Planar face"}`,origin:frame.origin,normal:frame.normal}});
    setSectionPicking(false);setSectionNotice("");return true;
  };
  const captureSectionSketch=(id:string)=>{
    if(!state||!state.document.features[id])return;
    const feature=state.document.features[id],frame=startSketch(state,feature).frame;
    setSectionSettings({...sectionSettings,offset:0,reference:{label:feature.name+" · sketch plane",origin:frame.origin,normal:frame.normal}});
    setSectionPicking(false);setSectionNotice("");
  };
  const select = (item: Selection | null, add = false, fromTree = false) => {
    if (featureEditActive.current) return;
    if(item?.worldPlane){
      const plane=item.worldPlane;
      if(sectionPicking){setSectionSettings({...sectionSettings,axis:plane==='XY'?'Z':plane==='XZ'?'Y':'X',offset:0,reference:undefined});setSectionPicking(false);setSectionNotice('');return;}
      if(sketchActive.current){if(sketchPlanePicking){setSketch(d=>d?{...d,plane,frame:worldSketchFrame(plane),pending:[],message:''}:d);setSketchPlanePicking(false);}return;}
      if(operationActive.current||groupingActive.current||measureActive.current)return;
      setSelection(item);setSelectionSet([]);setSelectedSketch(null);setSelectedFeature(null);return;
    }
    if(sectionPicking){captureSectionFace(item);return;}
    if(measure!==null && state){
      if(!item)return;
      const sample=measurePoint(item,state);
      if(!sample){setMeasureNotice('Pick a point, edge or face in the viewport.');return;}
      setMeasure(current=>captureMeasurePoint(current||[],sample,add,measureReplace));
      setMeasureReplace(null);setMeasureNotice('');setOperationHover(null);return;
    }
    if (sketchActive.current) {
      if (sketchPlanePicking && item && state) {
        const frame = frameFromSelection(item, state);
        if (frame) {
          setSketch((d) =>
            d ? { ...d, frame, plane: "custom", message: "" } : d,
          );
          setSketchPlanePicking(false);
        } else
          setSketch((d) => (d ? { ...d, message: "Pick a planar face." } : d));
      }
      return;
    }
    if (grouping !== null && state) {
      const picked = groupSelection(item, state.occurrences, groupScope);
      if (picked)
        setGrouping((ids) =>
          ids?.includes(picked.occurrence)
            ? ids.filter((i) => i !== picked.occurrence)
            : [...(ids || []), picked.occurrence],
        );
      return;
    }
    setSelectedSketch(null);
    if (moveActive.current) {
      if (!moveTargetRef.current && item) {
        item = state
          ? groupSelection(item, state.occurrences, groupScope)
          : item;
        if (!item) return;
        const target = {
          occurrence: item.occurrence,
          definition: item.definition,
        };
        setMove({ target });
        setSelection(target);
        setSelectionSet([target.occurrence]);
      } else moveRef.current?.capture(item);
      return;
    }
    if (operationActive.current) {
      const d = operationSetup?.draft || operation;
      if (d && operationPathPickProblem(d, operationSetup?.pick || null, item))
        return;
      operationRef.current?.capture(item, add);
      setOperationReference((current) => mergeSelection(current, item, add));
      return;
    }
    item =
      state && !fromTree
        ? groupSelection(item, state.occurrences, groupScope)
        : item;
    if (
      toolWorkbench &&
      (!item || state?.document.components[item.definition]?.purpose !== "tool")
    )
      setToolWorkbench(null);
    const next = mergeSelection(selection, item, add);
    setSelection(next);
    setSelectedFeature(null);
    setSelectionSet([
      ...new Set(selectionMembers(next).map((s) => s.occurrence)),
    ]);
  };
  const selectSketch = (id: string) => {
    if (featureEditActive.current) return;
    if(sectionPicking){captureSectionSketch(id);return;}
    if(measureActive.current){setMeasureNotice('Pick a point on a component in the viewport. Sketch point measurement is not available yet.');return;}
    if (sketchActive.current || moveActive.current || groupingActive.current)
      return;
    if (operationRef.current) {
      operationRef.current.useSketch(id);
      return;
    }
    setSelectedSketch(id);
    setSelection(null);
    setSelectionSet([]);
    setSelectedFeature(null);
  };
  const chooseTool = (kind: string) => {
    if (featureEditActive.current) {
      setToast("Apply or cancel the feature edit before opening another tool.");
      return;
    }
    setSectionPicking(false);setSectionNotice("");
    setToolSearch("");
    if (sketchActive.current) return;
    if (groupingActive.current) return;
    if(measureActive.current && kind!=="measure")closeMeasure();
    if(kind==="measure" && !operationActive.current){
      setDialog(null);setContextMenu(null);setRightVisible(true);setSectionPicking(false);
      setExplode(0);setMeasure([]);setMeasureReplace(null);setMeasureNotice('');return;
    }
    if (kind === "assembly" && !operationActive.current && state) {
      const ids = selectionMembers(selection)
        .map(
          (s) => groupSelection(s, state.occurrences, groupScope)?.occurrence,
        )
        .filter((v): v is string => !!v);
      setGrouping([...new Set(ids)]);
      setDialog(null);
      setRightVisible(true);
      return;
    }
    if (
      kind === "duplicate" &&
      !operationActive.current &&
      selection &&
      state?.document.components[selection.definition]?.kind === "assembly"
    ) {
      void run("group.copy", { occurrence: selection.occurrence }).catch(
        () => {},
      );
      return;
    }
    if (kind === "sketch") {
      openSketch();
      return;
    }
    if (moveActive.current) {
      if (kind !== "transform")
        setToast(
          "Apply or cancel Move Component before opening another editing tool.",
        );
      return;
    }
    if (OPERATION_TOOLS.has(kind) && stateRef.current) {
      if (
        !selectedSketch &&
        selection &&
        stateRef.current.document.components[selection.definition]?.kind ===
          "assembly"
      ) {
        setToast("Double-click the group to edit one of its components.");
        return;
      }
      setDialog(null);
      setHistoryView(null);
      setRightVisible(true);
      setExplode(0);
      if (operationRef.current) {
        if (kind !== "tool") operationRef.current.startPreset(kind);
      } else {
        const selectedProfile =
          selectedSketch &&
          stateRef.current.document.features[selectedSketch]?.type === "sketch"
            ? selectedSketch
            : null;
        const seed = initialOperation(
          selectedProfile || selection?.worldPlane ? null : selection,
          stateRef.current,
          kind,
        );
        if(selection?.worldPlane)seed.plane=selection.worldPlane;
        setOperationReference(selectedProfile || selection?.worldPlane ? null : selection);
        setOperation(
          selectedProfile
            ? withSketchProfile(seed, stateRef.current, selectedProfile)
            : seed,
        );
      }
      return;
    }
    if (operationActive.current) {
      setToast(
        "Cancel the tool operation before opening another editing tool.",
      );
      return;
    }
    if (kind === "transform") {
      setDialog(null);
      setContextMenu(null);
      setHistoryView(null);
      setRightVisible(true);
      setExplode(0);
      setSelectedFeature(null);
      const target = selection && !selection.worldPlane
        ? { occurrence: selection.occurrence, definition: selection.definition }
        : null;
      setMove({ target });
      setMovePreview(null);
      setPreviewRendered(null);
      if (target) setSelection(target);
      return;
    }
    setDialog(kind);
  };
  const openSketch = (feature?: Feature, draft?: OperationDraft) => {
    const current = stateRef.current;
    if (!current || busy || moveActive.current || featureEditActive.current) return;
    if(measureActive.current)closeMeasure();
    sketchParent.current = !!operation;
    const parent = draft || operationSetup?.draft || operation;
    let frame: SketchFrame | undefined;
    if (!feature && parent) {
      const f = operationFrame(
        parent,
        current,
        operationSetup?.report?.feature_values,
        operationSetup?.report?.operation_display,
      );
      frame = {
        origin: f.origin.toArray(),
        u: f.u.toArray(),
        normal: f.normal.toArray(),
      };
    } else if (!feature)
      frame = frameFromSelection(selection, current) || undefined;
    const next = startSketch(current, feature, frame);
    if(!feature&&!parent&&selection?.worldPlane)next.plane=selection.worldPlane;
    if (!feature && parent?.profile === "polygon" && parent.points.length) {
      next.entities = parent.points.map((p, i) => {
        const q = parent.points[(i + 1) % parent.points.length];
        return {
          id: `e${i + 1}`,
          type: "line",
          x1: p[0],
          y1: p[1],
          x2: q[0],
          y2: q[1],
          fixed: true,
          construction: false,
        };
      });
    }
    setDialog(null);
    setHistoryView(null);
    setRightVisible(true);
    setSketchPlanePicking(!feature && !frame);
    setSketch(next);
  };
  const closeSketch = () => {
    setSketch(null);
    setSketchPlanePicking(false);
  };
  const finishSketch = async (d: SketchDraft) => {
    if (!d.entities.length || d.entities.length > 200)
      throw new Error("A sketch needs 1–200 entities.");
    const embedded = sketchParent.current;
    if (
      embedded &&
      !d.entities.some((e) => !e.construction && e.type !== "point")
    )
      throw new Error(
        "Draw a closed non-construction profile before using it as a tool.",
      );
    const result = await run(
      d.feature ? "sketch.update" : "sketch.create",
      d.feature
        ? {
            feature_id: d.feature.id,
            name: d.name,
            entities: d.entities,
            constraints: d.constraints.map(({ pendingExpression, ...c }) =>
              pendingExpression !== undefined
                ? { ...c, value: pendingExpression }
                : c,
            ),
          }
        : {
            name: d.name,
            owner: "root",
            plane: d.plane === "custom" ? "XY" : d.plane,
            frame: d.frame,
            entities: d.entities,
            constraints: d.constraints.map(({ pendingExpression, ...c }) =>
              pendingExpression !== undefined
                ? { ...c, value: pendingExpression }
                : c,
            ),
          },
    );
    const id = d.feature?.id || result.feature_id;
    const current = stateRef.current;
    if (
      embedded &&
      (current?.profiles?.[id]?.status !== "closed" ||
        (current.profiles[id].region_count || 1) !== 1)
    ) {
      setSketch({
        ...d,
        feature: current?.document.features[id],
        message:
          "Sketch saved, but the tool needs a closed region. Close the outline or cancel to return without changing the tool profile.",
      });
      return;
    }
    closeSketch();
    setSelectedSketch(id);
    setSelection(null);
    setSelectionSet([]);
    setSelectedFeature(null);
    if (embedded)
      requestAnimationFrame(() => operationRef.current?.useSketch(id, true));
  };
  const chooseWorldOrigin = () => {
    if(sectionPicking)return;
    if(measureActive.current){select({worldOrigin:true,occurrence:'',definition:'root'});return;}
    if (sketchActive.current) return;
    if (!state || busy) return;
    if (moveActive.current) moveRef.current?.chooseOrigin();
    else if (operationActive.current) operationRef.current?.chooseOrigin();
    else {
      chooseTool("tool");
      setOperation((current) =>
        current
          ? {
              ...current,
              origin: "reference",
              originPinned: true,
              reference: {
                selection: {
                  worldOrigin: true,
                  definition: "root",
                  occurrence: "",
                },
                anchor: "center",
                label: "World origin",
              },
            }
          : current,
      );
    }
  };
  const chooseWorldAxis = (axis: WorldAxis) => {
    if(sectionPicking){setSectionSettings({...sectionSettings,axis,offset:0,reference:undefined});setSectionPicking(false);setSectionNotice("");return;}
    if (sketchActive.current || measureActive.current) return;
    if (!state || busy) return;
    if (moveActive.current) moveRef.current?.chooseAxis(axis);
    else if (operationActive.current) operationRef.current?.chooseAxis(axis);
    else {
      chooseTool("transform");
      setMove((current) =>
        current
          ? { ...current, axisRequest: { axis, id: performance.now() } }
          : current,
      );
    }
  };
  launchRef.current = chooseTool;
  const editGroup = (item: Selection | null, fromTree = false) => {
    if (
      !item ||
      !state ||
      operationActive.current ||
      sketchActive.current ||
      groupingActive.current
    )
      return;
    const chosen = fromTree
      ? item
      : groupSelection(item, state.occurrences, groupScope);
    if (
      chosen &&
      state.document.components[chosen.definition]?.kind === "assembly"
    ) {
      setGroupScope(chosen.occurrence);
      setSelection(null);
      setSelectionSet([]);
      setSelectedFeature(null);
    }
  };
  const endGroupEditing = () => {
    const id = groupScopeRef.current,
      o = stateRef.current?.occurrences.find((o) => o.id === id);
    setGroupScope(parentPath(id));
    setSelection(o ? { occurrence: o.id, definition: o.definition } : null);
    setSelectionSet(o ? [o.id] : []);
  };
  const endGroupEditingRef = useRef(endGroupEditing);
  endGroupEditingRef.current = endGroupEditing;
  const clearOperation = () => {
    setOperation(null);
    setOperationSetup(null);
    setOperationReference(null);
    setOperationPreview(null);
    setFeatureEdit(null);
  };
  const closeOperation = () => {
    const pending = operationCommit.current;
    if (pending) {
      pending.cancelled = true;
      if (pending.jobId)
        void api(`/jobs/${pending.jobId}/cancel`, { method: "POST" }).catch(
          report,
        );
    }
    clearOperation();
    setContextMenu(null);
  };
  const closeMove = () => {
    closeOperation();
    setMove(null);
    setMovePreview(null);
  };
  const commitOperation = async (report: any) => {
    const moving = moveActive.current;
    const editing = featureEditActive.current;
    const pending = { cancelled: false, jobId: "" };
    operationCommit.current = pending;
    setLocalJob({
      status: "queued",
      description: editing ? "Apply feature changes" : moving ? "Apply Move Component" : "Apply tool operation",
    });
    try {
      const submission = await api(`/previews/${report.preview_token}/commit`, {
        method: "POST",
      });
      pending.jobId = submission.job_id;
      if (pending.cancelled && pending.jobId)
        await api(`/jobs/${pending.jobId}/cancel`, { method: "POST" });
      const result = await waitJob(submission, setLocalJob);
      const next = await refresh(true);
      if (pending.cancelled) {
        setToast(
          "The operation finished before cancellation. Undo is available.",
        );
        return;
      }
      if (moving) {
        setMove(null);
        setMovePreview(null);
      } else clearOperation();
      setSelectedFeature(result.feature_id || null);
      const item = next?.occurrences.find(
        (o) =>
          o.source_id === result.instance_id ||
          o.definition === next.document.features[result.feature_id]?.owner,
      );
      if (item) {
        setSelectedSketch(null);
        setSelection({ occurrence: item.id, definition: item.definition });
        setSelectionSet([item.id]);
      }
      setToast(
        moving
          ? "Component moved"
          : result.description || "Tool operation applied",
      );
    } finally {
      if (operationCommit.current === pending) operationCommit.current = null;
      setLocalJob(null);
    }
  };
  const loadRecipe = async (recipe: string) => {
    if (operationActive.current || sketch || grouping || busy) {
      setToast("Finish or cancel the current operation before opening a reference design.");
      return;
    }
    setLocalJob({ status: "queued", description: "Create reference design" });
    try {
      const created = await api("/workspace/designs", { method: "POST", body: JSON.stringify({ name: recipe === "mold" ? "Silicone mold tooling" : "Mounting plate and pins" }) });
      const submission = await api("/commands", { method: "POST", headers: designHeaders(created.design_id), body: JSON.stringify({ name: "recipe.load", args: { recipe }, expected_revision: 0, request_id: newRequestId() }) });
      await waitJob(submission, setLocalJob, 120, created.design_id);
      setCurrentDesignId(created.design_id);
      window.location.reload();
    } catch (error) { report(error); }
    finally { setLocalJob(null); }
  };
  const exportSTL = async (options: Record<string, any> = {}) => {
    if (!state) return;
    setLocalJob({ status: "queued", description: "Validate and export STL" });
    setError(null);
    try {
      const result = await waitJob(
        await api("/export", {
          method: "POST",
          body: JSON.stringify({
            expected_revision: state.document.revision,
            ...options,
          }),
        }),
        setLocalJob,
      );
      setExports(result);
      setDialog("exports");
      setToast("STL batch validated and ready");
    } catch (e) {
      report(e);
    } finally {
      setLocalJob(null);
      refresh(true);
    }
  };
  const viewStage = async (feature: Feature) => {
    if (operationActive.current) {
      setToast(
        "Cancel the tool operation before inspecting a different build stage.",
      );
      return;
    }
    try {
      const cost = await api("/history/" + feature.id + "/cost");
      if (cost.explicit_compute_recommended && !cost.cached) {
        setDialog("history-confirm");
        setSelectedFeature(feature.id);
        return;
      }
      await computeStage(feature.id);
    } catch (e) {
      report(e);
    }
  };
  const editHistoryFeature = (feature: Feature) => {
    if (!state || busy || operationActive.current || sketch || grouping) {
      setToast("Finish or cancel the current operation before editing a feature.");
      return;
    }
    if (measureActive.current) closeMeasure();
    setHistoryView(null);
    setDialog(null);
    setContextMenu(null);
    setSectionPicking(false);
    setRightVisible(true);
    setSelectedFeature(feature.id);
    setExplode(0);
    if (feature.type === "sketch") { openSketch(feature); return; }
    const occurrence = state.occurrences.find(o => o.id === selection?.occurrence && o.definition === feature.owner)
      || state.occurrences.find(o => o.definition === feature.owner);
    const target = occurrence ? { occurrence: occurrence.id, definition: occurrence.definition } : null;
    if (state.document.components[feature.owner]?.purpose === "tool") setToolWorkbench(feature.owner);
    else setToolWorkbench(null);
    setSelectedSketch(null);
    setSelection(target);
    setSelectionSet(target ? [target.occurrence] : []);
    setOperationPreview(null);
    setPreviewRendered(null);
    setFeatureEdit({feature, target});
  };
  const computeStage = async (id: string) => {
    if(measureActive.current)closeMeasure();
    setLocalJob({ status: "queued", description: "Evaluate history stage" });
    try {
      const result = await waitJob(
        await api("/history/" + id, { method: "POST" }),
        setLocalJob,
      );
      setHistoryView({ ...result, feature_id: id });
      setDialog(null);
    } catch (e) {
      report(e);
    } finally {
      setLocalJob(null);
      refresh(true);
    }
  };
  const controlAgent = async (id: string, operation: string) => {
    try {
      await api("/agents/" + id + "/" + operation, { method: "POST" });
      await refresh(true);
    } catch (e) {
      report(e);
    }
  };

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if((event.target as HTMLElement).closest('[data-shortcut-capture]'))return;
      if(dispatchToolbarShortcut(event))return;
      if((event.target as HTMLElement).closest('.experimental-popover,.bug-reports-popover,.file-action-menu,.account-dropdown'))return;
      if((event.target as HTMLElement).closest('[role=dialog]')&&!['Escape','Enter'].includes(event.key))return;
      if((event.target as HTMLElement).closest('.bug-reports-popover'))return;
      if(measureActive.current && event.key==='Escape'){
        event.preventDefault();event.stopImmediatePropagation();closeMeasure();return;
      }
      if(event.key==="Escape" && sectionPickingRef.current){event.preventDefault();event.stopImmediatePropagation();setSectionPicking(false);setSectionNotice("");return;}
      if (groupingActive.current && ["Enter", "Escape"].includes(event.key)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.key === "Escape") groupPanelRef.current?.cancel();
        else if (!event.repeat) groupPanelRef.current?.confirm();
        return;
      }
      if (sketchActive.current) {
        if (!event.isComposing && ["Escape", "Enter"].includes(event.key)) {
          event.preventDefault();
          event.stopImmediatePropagation();
          if (sketchRef.current?.dimensionKey(event.key)) return;
          if (event.key === "Escape") {
            if (sketchPlanePickingRef.current) closeSketch();
            else sketchRef.current?.escape();
          } else if (!event.repeat) sketchRef.current?.finish();
        }
        const input = (event.target as HTMLElement).closest(
          "input,textarea,select,[contenteditable=true]",
        );
        if (!input && !event.isComposing && !event.altKey) {
          const key = event.key.toLowerCase();
          if ((event.ctrlKey || event.metaKey) && key === "z") {
            event.preventDefault();
            if (!event.repeat) sketchRef.current?.undo();
          } else if (
            !event.ctrlKey &&
            !event.metaKey &&
            !sketchPlanePickingRef.current
          ) {
            if (key === "f") {
              event.preventDefault();
              if (!event.repeat) viewRef.current?.fit();
            } else if (key === "s") {
              event.preventDefault();
              if (!event.repeat)
                setSketch((d) =>
                  d
                    ? { ...d, gridSnapEnabled: d.gridSnapEnabled === false }
                    : d,
                );
            }
          }
        }
        return;
      }
      if (
        operationActive.current &&
        !event.isComposing &&
        ["Enter", "Escape"].includes(event.key)
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.key === "Escape") {
          if (featureEditActive.current) featureEditRef.current?.cancel();
          else if (moveActive.current) moveRef.current?.cancel();
          else operationRef.current?.cancel();
        } else if (!event.repeat) {
          if (featureEditActive.current) featureEditRef.current?.confirm();
          else if (moveActive.current) moveRef.current?.confirm();
          else operationRef.current?.confirm();
        }
        return;
      }
      const input = (event.target as HTMLElement).closest(
        "input,textarea,select,[contenteditable=true]",
      );
      if (event.key === "Escape") {
        // Focused editors and popovers handle their own cancellation first.
        if (escapeState.current.contextMenu || escapeState.current.appearance)
          return;
        if (
          dialogRef.current ||
          escapeState.current.editParameter ||
          escapeState.current.error
        ) {
          setDialog(null);
          setEditParameter(null);
          setError(null);
          return;
        }
        if (input) return;
        if (groupScopeRef.current && !input) {
          event.preventDefault();
          endGroupEditingRef.current();
          return;
        }
        if (escapeState.current.historyView) {
          setHistoryView(null);
          return;
        }
        setSelection(null);
        setSelectionSet([]);
        setSelectedSketch(null);
        setSelectedFeature(null);
        return;
      }
      if (input) return;
      if (
        !event.isComposing &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !event.shiftKey
      ) {
        const axis: WorldAxis | undefined = {
          ArrowUp: "Z",
          ArrowDown: "Z",
          ArrowLeft: "Y",
          ArrowRight: "X",
        }[event.key] as WorldAxis | undefined;
        const panel = moveActive.current
          ? moveRef.current
          : operationRef.current;
        if (
          axis &&
          !(event.target as HTMLElement).closest("[role=tree]") &&
          operationActive.current &&
          panel?.canChooseAxis()
        ) {
          event.preventDefault();
          event.stopImmediatePropagation();
          if (!event.repeat) panel.chooseAxis(axis);
          return;
        }
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        runRef
          .current?.(event.shiftKey ? "history.redo" : "history.undo")
          .catch(() => {});
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        window.open(designUrl("/api/native"), "_self");
        return;
      }
      if (!event.ctrlKey&&!event.metaKey&&!event.altKey&&!event.shiftKey&&event.key.toLowerCase() === "f") viewRef.current?.fit();
      if (!event.ctrlKey && !event.metaKey && !event.altKey && event.shiftKey && event.key.toLowerCase() === "g") {
        event.preventDefault();
        if (!event.repeat) setGrid(v => !v);
        return;
      }
      if (event.key === "1") viewRef.current?.view("front");
      if (event.key === "2") viewRef.current?.view("right");
      if (event.key === "7") viewRef.current?.view("top");
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, []);

  const component =
    state && selection ? state.document.components[selection.definition] : null;
  const occurrence = state?.occurrences.find(
    (i) => i.id === selection?.occurrence,
  );
  const geometry =
    state && component
      ? (historyView?.components || state.geometry)[component.id]
      : undefined;
  const measurements = state
    ? inspectorMeasurements(
        state,
        selection,
        historyView?.components || state.geometry,
      )
    : null;
  const inchMeasures = state?.document.display_units === "in";
  const measurementSection = measurements && (
    <section
      className="inspector-section inspector-measurements"
      aria-label="Measurements"
      data-scope={measurements.scope}
      data-source={historyView ? "history" : "current"}
    >
      <div className="section-heading">
        <h3>Measurements</h3>
        <small>
          {measurements.scope === "component"
            ? "One part"
            : measurements.scope === "assembly"
              ? "Group totals"
              : "Design totals"}
        </small>
      </div>
      <div
        className="property-row"
        data-measurement="volume"
        data-value={measurements.volume ?? ""}
      >
        <span>Material volume</span>
        <strong>
          {measurements.volume === null
            ? "—"
            : numeric(measurements.volume / (inchMeasures ? 25.4 ** 3 : 1000)) +
              (inchMeasures ? " in³" : " cm³")}
        </strong>
      </div>
      <div
        className="property-row"
        data-measurement="area"
        data-value={measurements.area ?? ""}
      >
        <span>{measurements.areaLabel}</span>
        <strong>
          {measurements.area === null
            ? "—"
            : numeric(measurements.area / (inchMeasures ? 25.4 ** 2 : 100)) +
              (inchMeasures ? " in²" : " cm²")}
        </strong>
      </div>
      {measurements.scope === "assembly" && (
        <div className="property-row">
          <span>Part instances</span>
          <strong>{measurements.count}</strong>
        </div>
      )}
      {measurements.incomplete > 0 && (
        <p className="measurement-availability">
          {measurements.scope === "component"
            ? "Geometry not evaluated"
            : `Partial totals · ${measurements.incomplete} unfinished ${measurements.incomplete === 1 ? "part" : "parts"}`}
        </p>
      )}
    </section>
  );
  useEffect(() => {
    if (historyView && historyView.revision !== state?.document.revision)
      setHistoryView(null);
  }, [state?.document.revision, historyView]);
  const feature =
    state && selectedFeature ? state.document.features[selectedFeature] : null;
  const busyJobs =
    state?.jobs.filter(
      (j) =>
        ["queued", "running", "waiting"].includes(j.status) &&
        // Candidate builds never mutate the document. They must not block the
        // editor, or briefly lock the UI after a canceled preview closes.
        j.operation !== "preview",
    ) || [];
  const busy = !!localJob || busyJobs.length > 0;
  const currentJob = localJob || busyJobs[busyJobs.length - 1];
  const unit = state?.document.display_units || "mm";
  const length = (value: number) =>
    numeric(unit === "in" ? value / 25.4 : value, unit === "in" ? 3 : 2);
  const actorName = (id: string) =>
    state?.document.actors?.[id]?.name ||
    (id === "local-human"
      ? "You"
      : id === "reference-library"
        ? "Reference library"
        : id.startsWith("agent_")
          ? "External agent"
          : id);
  const params = state ? Object.values(state.document.parameters).filter(p => p.named === true) : [];
  const filteredTools = toolList.filter((t) =>
    `${t.label} ${t.category}`.toLowerCase().includes(toolSearch.toLowerCase()),
  );
  const featureOrder = state?.document.feature_order || [];
  const sketchFeatures = Object.values(state?.document.features || {}).filter(
    (feature) => feature.type === "sketch",
  );
  const anySketchVisible = sketchFeatures.some(
    (feature) => !hiddenSketches.has(feature.id),
  );
  const savedSketchObjects = useMemo(
    () =>
      state
        ? Object.values(state.document.features)
            .filter(
              (f) =>
                f.type === "sketch" &&
                !f.suppressed &&
                !hiddenSketches.has(f.id),
            )
            .map((f) => startSketch(state, f))
        : [],
    [state?.document.revision, hiddenSketches],
  );
  const visibleFeatures = featureOrder.map(
    (id) => state!.document.features[id],
  );
  const lanes = historyLanes(
    visibleFeatures,
    state?.document.components || {},
    parallelHistory,
    mergedHistory,
  );
  const stageIndex =
    historyView?.feature_id === "origin"
      ? -1
      : historyView
        ? featureOrder.indexOf(historyView.feature_id)
        : featureOrder.length - 1;
  const stepHistory = (direction: -1 | 1) => {
    if (!state || busy || operationActive.current || sketch || grouping) return;
    const destination = historyStep(
      featureOrder,
      historyView?.feature_id || null,
      direction,
    );
    if (destination === null) {
      setHistoryView(null);
      return;
    }
    if (destination === "origin") void computeStage("origin");
    else if (state.document.features[destination])
      void viewStage(state.document.features[destination]);
  };
  const documentName = state?.document.name || "Opening your workspace…";

  // External activity is observable without forcing camera movement or selection changes.
  const previousAction = useRef("");
  useEffect(() => {
    const action = state?.actions[0];
    if (action && action.id !== previousAction.current) {
      previousAction.current = action.id;
      if (
        action.actor.kind === "agent" &&
        followAgent &&
        !operationActive.current
      ) {
        const f = action.affected
          .map((id: string) => state?.document.features[id])
          .find(Boolean);
        const o = state?.occurrences.find((i) => i.definition === f?.owner);
        if (o) {
          setSelection({ occurrence: o.id, definition: o.definition });
          setSelectedFeature(f.id);
        }
      }
    }
  }, [state?.actions, followAgent]);

  const toolBodies = Object.values(state?.document.components || {}).filter(
    (c) => c.purpose === "tool",
  );
  const openToolBody = (id: string) => {
    if (busy || operationActive.current || sketch || grouping) return;
    const source = state?.occurrences.find((o) => o.definition === id);
    if (!source) return;
    if (!toolWorkbench) {
      toolReturnSelection.current = selection;
      toolReturnScope.current = groupScope;
    }
    setToolWorkbench(id);
    setGroupScope("");
    setHistoryView(null);
    setSelection({ definition: id, occurrence: source.id });
    setSelectionSet([source.id]);
    setSelectedFeature(null);
  };
  const closeToolBody = () => {
    if (operationActive.current || sketch) return;
    setToolWorkbench(null);
    setGroupScope(toolReturnScope.current);
    setSelection(toolReturnSelection.current);
    setSelectedFeature(null);
  };
  const newToolBody = async () => {
    if (busy || operationActive.current || sketch || grouping) return;
    try {
      const result = await run("toolbody.create");
      if (result?.component_id) {
        if (!toolWorkbench) {
          toolReturnSelection.current = selection;
          toolReturnScope.current = groupScope;
        }
        setToolWorkbench(result.component_id);
        setGroupScope("");
      }
    } catch {}
  };
  useEffect(() => {
    if (toolWorkbench && !state?.document.components[toolWorkbench])
      setToolWorkbench(null);
    else if (
      toolWorkbench &&
      selection &&
      state?.document.components[selection.definition]?.purpose === "tool"
    )
      setToolWorkbench(selection.definition);
    else if (
      toolWorkbench &&
      selection &&
      state?.document.components[selection.definition]?.purpose !== "tool"
    )
      setToolWorkbench(null);
  }, [state?.document.revision, selection?.definition]);
  const viewportOccurrences = (state?.occurrences || []).filter((o) =>
    toolWorkbench
      ? o.definition === toolWorkbench
      : state?.document.components[o.definition]?.purpose !== "tool",
  );
  const treeEditingDisabled =
    !state ||
    busy ||
    !!historyView ||
    !!featureEdit || !!operation ||
    !!move ||
    !!sketch ||
    !!grouping;
  const createTreeItem = async (parent: string, kind: "solid" | "assembly") => {
    if (treeEditingDisabled) return;
    try {
      await run("group.insert", { parent, kind });
    } catch {}
  };
  const dropTreeItem = async (parent: string, source = draggedComponent) => {
    setDraggedComponent(null);
    setTreeDrop(null);
    if (
      !source ||
      treeEditingDisabled ||
      treeDropProblem(state!.occurrences, source, parent)
    )
      return;
    try {
      await run("group.reparent", { occurrence: source, parent });
    } catch {}
  };
  const dropTreeItemRef = useRef(dropTreeItem);
  dropTreeItemRef.current = dropTreeItem;
  useEffect(() => {
    const clear = () => {
      treePointer.current = null;
      setDraggedComponent(null);
      setTreeDrop(null);
    };
    const move = (event: PointerEvent) => {
      const drag = treePointer.current;
      if (!drag || treeEditingDisabled) return;
      if (
        !drag.active &&
        Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5
      )
        return;
      drag.active = true;
      setDraggedComponent(drag.id);
      const hit = document.elementFromPoint(event.clientX, event.clientY),
        row = hit?.closest<HTMLElement>(".component-row"),
        design = hit?.closest(".structure-root"),
        create = hit?.closest<HTMLElement>(".tree-create-row");
      let parent: string | null = null;
      if (row) {
        const target = stateRef.current?.occurrences.find(
          (o) => o.id === row.dataset.occurrence,
        );
        if (target) parent = treeDropParent(target);
      } else if (design) parent = "";
      else if (create) parent = create.dataset.createParent || "";
      drag.parent = parent;
      drag.problem =
        parent === null
          ? "Drop on a group, a component level, or the design name."
          : treeDropProblem(
              stateRef.current?.occurrences || [],
              drag.id,
              parent,
            );
      setTreeDrop({ parent: parent ?? "", problem: drag.problem });
      const panel = hit?.closest<HTMLElement>(".left-panel");
      if (panel) {
        const rect = panel.getBoundingClientRect();
        if (event.clientY > rect.bottom - 24) panel.scrollTop += 10;
        else if (event.clientY < rect.top + 24) panel.scrollTop -= 10;
      }
      event.preventDefault();
    };
    const up = () => {
      const drag = treePointer.current;
      clear();
      if (!drag?.active) return;
      suppressTreeClick.current = performance.now() + 400;
      if (drag.parent !== null && !drag.problem)
        void dropTreeItemRef.current(drag.parent, drag.id);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") clear();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", clear);
    window.addEventListener("blur", clear);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", clear);
      window.removeEventListener("blur", clear);
      window.removeEventListener("keydown", key);
    };
  }, [treeEditingDisabled]);
  const treeRows = componentTreeRows(
    (state?.occurrences || []).filter(
      (o) => state?.document.components[o.definition]?.purpose !== "tool",
    ),
    expandedGroups,
  );
  const groupColorDefinitions = [
    ...new Set(
      (state?.occurrences || [])
        .filter((o) => o.kind === "assembly")
        .map((o) => o.definition),
    ),
  ];
  const groupIconColors = Array.from({ length: 3 }, (_, index) => {
    const id = groupColorDefinitions[index];
    return id
      ? (colorPreview?.definition === id
          ? colorPreview.color
          : state?.document.components[id]?.color) || fallbackGroupColors[index]
      : fallbackGroupColors[index];
  });
  const createParent = selection
    ? parentPath(selection.occurrence)
    : groupScope;
  const createRow = (
    <button
      className="create-part tree-create-row sidebar-add-row"
      data-create-parent={createParent}
      role="treeitem"
      aria-level={(createParent ? createParent.split("/").length : 0) + 1}
      style={{
        marginLeft:
          26 + (createParent ? createParent.split("/").length : 0) * 16,
      }}
      title={`Create an empty component in ${state?.occurrences.find((o) => o.id === createParent)?.name || "this design"}`}
      onClick={() => void createTreeItem(createParent, "solid")}
      disabled={treeEditingDisabled}
    >
      <Plus size={14} />
      <span>add component</span>
    </button>
  );
  return (
    <NamedParameterProvider parameters={state ? Object.values(state.document.parameters) : []} values={Object.fromEntries(Object.entries(state?.parameter_graph || {}).map(([id, info]) => [id, info.value]))}>
    <div
      data-mobile-pane={mobilePane}
      data-sidebar-toolbar-layout={experiments[SIDEBAR_TOOLBAR_LAYOUT_ID].enabled||undefined}
      data-sidebar-toolbar-mode={experiments[SIDEBAR_TOOLBAR_LAYOUT_ID].mode||'between'}
      className={
        "app-shell " +
        (!leftVisible ? "left-hidden " : "") +
        (!rightVisible ? "right-hidden " : "") +
        (operation || move || featureEdit || sketch || grouping || measure!==null ? " operation-active" : "") +
        (parallelHistory && timelineTab === "features"
          ? " parallel-timelines"
          : "")
      }
      style={
        {
          "--timeline-requested": `${48 + lanes.length * 96}px`,
        } as React.CSSProperties
      }
    >
      <header className="app-header">
        <div className="brand-container">
          <div className="brand"><Logo /><span>Ryan<span>CAD</span></span></div>
        </div>
          <FileActions state={state} disabled={!state || busy || !!featureEdit || !!operation || !!move || !!grouping || !!sketch || !!historyView}
            onBusy={(value) => setLocalJob(value ? {status: "running", description: "Transfer design file"} : null)}
            onNative={() => importRef.current?.click()} onSTL={() => setDialog("export-settings")}
            onReferences={() => setDialog("references")}
            onImported={async () => { await refresh(true); }} onError={report} />
        <button {...shortcutAttributes('search')} className="command-search" aria-label="Find a tool or action" title="Find a tool or action · Ctrl/⌘+K" onClick={() => setDialog("palette")}>
          <Search size={14} />
          <span>Find a tool or action</span>
          <kbd>Ctrl K</kbd>
        </button>
        <div className="header-right">
          <span
            className={"save-indicator " + (state?.save_error ? "warning" : "")}
            title={
              state?.save_error ||
              "Every accepted edit is saved to the local durable journal."
            }
          >
            <span />
            {state?.save_error
              ? "Save warning"
              : busy
                ? "Working…"
                : "Saved locally"}
          </span>
          <button
            aria-label="Agents"
            {...shortcutAttributes('agents')}
            title="Agents · Shift+N"
            className={
              "button agent-button " + (state?.agents.length ? "connected" : "")
            }
            onClick={() => setDialog("agents")}
          >
            <Activity size={15} />
            <span>Agents</span>
            <small>
              {state?.agents.filter((a) => !a.revoked && a.connected).length ||
                0}
            </small>
          </button>
          <AccountMenu onAgents={()=>setDialog("agents")} />
        </div>
      </header>
      <nav
        className="tool-strip"
        aria-label={sketch ? "Sketch tools" : "Modeling tools"}
        onDragStart={e=>{const b=(e.target as HTMLElement).closest<HTMLElement>('[data-toolbar-action]');if(!b||!b.draggable)return;toolbarDrag.current=b.dataset.toolbarAction!;e.dataTransfer.setData('text/ryancad-toolbar',toolbarDrag.current);e.dataTransfer.effectAllowed='move';}}
        onDragOver={e=>{if(toolbarDrag.current&&(e.target as HTMLElement).closest('[data-toolbar-action]')){e.preventDefault();e.dataTransfer.dropEffect='move';}}}
        onDrop={e=>{const target=(e.target as HTMLElement).closest<HTMLElement>('[data-toolbar-action]')?.dataset.toolbarAction;if(toolbarDrag.current&&target){e.preventDefault();reorderToolbar(toolbarDrag.current,target);toolbarDrag.current=null;toolbarDragEnd.current=Date.now();}}}
        onDragEnd={()=>{toolbarDrag.current=null;toolbarDragEnd.current=Date.now();}}
        onClickCapture={e=>{if(Date.now()-toolbarDragEnd.current<300){e.preventDefault();e.stopPropagation();}}}
      >
        <div className="tool-strip-content">
        {sketch ? (
          <SketchToolbar
            draft={sketch}
            busy={busy}
            disabled={busy || sketchPlanePicking}
            onTool={(tool) =>
              setSketch((d) => (d ? chooseSketchTool(d, tool) : d))
            }
            onUndo={() => sketchRef.current?.undo()}
            onFinish={() => sketchRef.current?.finish()}
            onCancel={closeSketch}
          />
        ) : (
          <OrderedToolbar order={toolbarPrefs.order}>
            <button
              className={
                "tool-button " + (operation ? "active" : "")
              }
              aria-label="Tool operation"
              {...shortcutAttributes('tool')}
              title="Tool operation · T"
              disabled={!state || busy || !!historyView}
              onClick={() => chooseTool("tool")}
            >
              <Zap size={19} />
              <span>Tool</span>
              <kbd>{shortcutLabel('tool')}</kbd>
            </button>
            <button
              className={`tool-button ${grouping ? "active" : ""}`}
              aria-label="Group components"
              {...shortcutAttributes('assembly')}
              title="Group components · G"
              disabled={
                !state ||
                busy ||
                !!featureEdit || !!operation ||
                !!move ||
                !!sketch ||
                !!historyView
              }
              onClick={() => chooseTool("assembly")}
            >
              <FolderPlus size={18} />
              <span>Group</span>
              <kbd>{shortcutLabel('assembly')}</kbd>
            </button>
            <button
              className={`tool-button ${sketch ? "active" : ""}`}
              aria-label="Sketch"
              {...shortcutAttributes('sketch')}
              title="Sketch · E"
              disabled={!state || busy || !!historyView || !!move}
              onClick={() => chooseTool("sketch")}
            >
              <SquareDashed size={18} />
              <span>Sketch</span>
              <kbd>{shortcutLabel('sketch')}</kbd>
            </button>
            {toolList
              .filter((t) =>
                [
                  "transform",
                  "duplicate",
                  "component_pattern",
                  "parameter",
                  "fit",
                  "measure",
                  "checkpoint",
                ].includes(t.id),
              )
              .sort((a, b) =>
                a.id === "transform" ? -1 : b.id === "transform" ? 1 : 0,
              )
              .map((t) => (
                <button
                  key={t.id}
                  {...shortcutAttributes(t.id)}
                  className={
                    "tool-button " +
                    ((t.id === "transform" && move)||(t.id==="measure"&&measure!==null) ? "active" : "")
                  }
                  onClick={() => chooseTool(t.id)}
                  aria-label={
                    t.id === "duplicate" && component?.kind === "assembly"
                      ? "Copy group"
                      : t.label
                  }
                  title={
                    t.id === "transform"
                      ? "Move Component · M"
                      : t.id === "duplicate" && component?.kind === "assembly"
                        ? "Copy group · parts retain linked geometry"
                        : `${t.label} · ${shortcutLabel(t.id)}`
                  }
                  disabled={!state || busy || !!historyView}
                >
                  <t.icon size={18} />
                  <span>
                    {t.id === "duplicate" && component?.kind === "assembly"
                      ? "Copy group"
                      : toolbarLabels[t.id] || t.label}
                  </span>
                  <kbd>{shortcutLabel(t.id)}</kbd>
                </button>
              ))}

            <button
              className="tool-button parameters-tool"
              {...shortcutAttributes('parameters')}
              title="Parameters · P"
              onClick={() => setDialog("parameters")}
              disabled={!state || !!grouping}
            >
              <SlidersHorizontal size={18} />
              <span>Parameters</span>
              <kbd>{shortcutLabel('parameters')}</kbd>
            </button>
            <div className="toolbar-spacer" />
            <ExperimentalFeatures value={experiments} onChange={setExperiments} />
            <BugReports />
            <button
              className="icon-button"
              {...shortcutAttributes('settings')}
              title="Workspace settings · Shift+,"
              aria-label="Workspace settings"
              onClick={() => setDialog("settings")}
            >
              <Settings2 size={17} />
            </button>
          </OrderedToolbar>
        )}
        </div>
      </nav>

      {(leftVisible || mobileLayout) && (
        <aside className="left-panel">
          <div className="panel-title">
            <button className="workspace-tree-title workspace-tree-button" title="Manage workspace designs" aria-label="Manage workspace designs" onClick={() => { void refreshWorkspace().catch(report); setDialog("workspace"); }}>
              Local Workspace <ChevronRight size={12} />
            </button>
            <button
              className="icon-button"
              aria-label="Hide component panel"
              onClick={() => mobileLayout ? setMobilePane("viewport") : setLeftVisible(false)}
            >
              <PanelLeftClose size={14} />
            </button>
          </div>
          {workspace?.legacy_available && workspace.designs.filter((design) => !design.deleted).length === 1 && state?.document.revision === 0 && (
            <button className="workspace-legacy-notice" onClick={() => { void refreshWorkspace().catch(report); setDialog("workspace"); }}>
              An earlier server design is available <ChevronRight size={12} />
            </button>
          )}
          <div
            className="structure-root"
            data-tree-drop={
              draggedComponent && treeDrop?.parent === ""
                ? treeDrop.problem
                  ? "invalid"
                  : "valid"
                : undefined
            }
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({ selection: null, x: e.clientX, y: e.clientY });
            }}
            onDragOver={(e) => {
              if (!draggedComponent) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setTreeDrop({
                parent: "",
                problem: treeDropProblem(
                  state!.occurrences,
                  draggedComponent,
                  "",
                ),
              });
            }}
            onDrop={(e) => {
              e.preventDefault();
              void dropTreeItem("");
            }}
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 4h16v16H4zM4 13h6m4 0h6M13 4v5m0 4v7M10 13v-3" />
              <path d="M10 10a3 3 0 0 1 3 3M2 2v3m0-3h3M22 19v3h-3" />
            </svg>
            {editingDesignName !== null ? (
              <input
                autoFocus
                aria-label="Design name"
                maxLength={180}
                value={editingDesignName}
                onFocus={(e) => e.currentTarget.select()}
                onChange={(e) => setEditingDesignName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    cancelDesignRename.current = true;
                    e.currentTarget.blur();
                  }
                  if (e.key === "Enter") {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
                onBlur={() => {
                  const name = editingDesignName.trim();
                  setEditingDesignName(null);
                  if (
                    !cancelDesignRename.current &&
                    name &&
                    name !== state?.document.name
                  )
                    void run("document.rename", { name }).catch(() => {});
                  cancelDesignRename.current = false;
                }}
              />
            ) : (
              <>
                <button
                  className="design-tree-name"
                  title="Current design · Double-click or F2 to rename"
                  onClick={() => select(null)}
                  onDoubleClick={() => {
                    if (state && !busy && !operationActive.current && !sketch)
                      setEditingDesignName(state.document.name);
                  }}
                  onKeyDown={(e) => {
                    if (
                      e.key === "F2" &&
                      state &&
                      !busy &&
                      !operationActive.current &&
                      !sketch
                    ) {
                      e.preventDefault();
                      setEditingDesignName(state.document.name);
                    }
                  }}
                >
                  {documentName}
                </button>
                <button
                  className="icon-button design-rename"
                  aria-label="Rename design"
                  title="Rename design"
                  disabled={
                    !state ||
                    busy ||
                    !!historyView ||
                    !!featureEdit || !!operation ||
                    !!move ||
                    !!sketch ||
                    !!grouping
                  }
                  onClick={() => setEditingDesignName(state!.document.name)}
                >
                  <Pencil size={12} />
                </button>
              </>
            )}
          </div>
          <div className="structure-section design-category">
            <button
              className="component-color-mode"
              aria-label={
                groupColorsEnabled
                  ? "Switch to monochrome component colors"
                  : "Switch to group component colors"
              }
              aria-pressed={groupColorsEnabled}
              title={
                groupColorsEnabled
                  ? "Switch to monochrome colors"
                  : "Switch to group colors"
              }
              onClick={() => setGroupColorsEnabled((enabled) => !enabled)}
            >
              <svg
                width="19"
                height="19"
                viewBox="0 0 20 20"
                aria-hidden="true"
              >
                <circle cx="7" cy="7" r="5" fill={groupIconColors[0]} />
                <circle
                  cx="13"
                  cy="7"
                  r="5"
                  fill={groupIconColors[1]}
                  fillOpacity=".85"
                />
                <circle
                  cx="10"
                  cy="12.5"
                  r="5"
                  fill={groupIconColors[2]}
                  fillOpacity=".85"
                />
              </svg>
            </button>
            <Boxes size={15} />
            <span>Components</span>
          </div>
          <div className="tree-list" role="tree" aria-label="Design components">
            {treeRows.map(
              (
                { occurrence: o, depth, childCount, position, siblings },
                treeIndex,
              ) => {
                const c = state!.document.components[o.definition];
                const active = selectionMembers(selection).some(
                  (s) => s.occurrence === o.id,
                );
                const count = state!.occurrences.filter(
                  (i) => i.definition === o.definition && !i.suppressed,
                ).length;
                return (
                  <Fragment key={o.id}>
                    <div
                      className={
                        "component-row " +
                        (active || o.id === groupScope ? "selected " : "") +
                        (!o.visible || o.suppressed ? "muted" : "")
                      }
                      data-can-drag={
                        (!treeEditingDisabled &&
                          !o.pattern_mode &&
                          !o.suppressed) ||
                        undefined
                      }
                      data-dragging={draggedComponent === o.id || undefined}
                      data-tree-drop={
                        draggedComponent && treeDrop?.parent === o.id
                          ? treeDrop.problem
                            ? "invalid"
                            : "valid"
                          : undefined
                      }
                      role="treeitem"
                      aria-label={c.name}
                      aria-level={depth + 1}
                      aria-posinset={position}
                      aria-setsize={siblings}
                      aria-selected={active || o.id === groupScope}
                      aria-expanded={
                        o.kind === "assembly"
                          ? expandedGroups.has(o.id)
                          : undefined
                      }
                      data-occurrence={o.id}
                      data-editing={o.id === groupScope || undefined}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        select(
                          { occurrence: o.id, definition: o.definition },
                          false,
                          true,
                        );
                        setContextMenu({
                          selection: {
                            occurrence: o.id,
                            definition: o.definition,
                          },
                          x: e.clientX,
                          y: e.clientY,
                        });
                      }}
                      style={{
                        paddingLeft: 22 + depth * 16,
                      }}
                    >
                      {Array.from({ length: depth }, (_, i) => (
                        <i
                          key={i}
                          className="tree-indent-guide"
                          style={{ left: 31 + i * 16 }}
                        />
                      ))}
                      {o.kind === "assembly" ? (
                        <button
                          className="tree-expander"
                          aria-label={`${expandedGroups.has(o.id) ? "Collapse" : "Expand"} ${c.name}`}
                          title={`${childCount} direct members`}
                          onClick={() => toggleGroup(o.id)}
                        >
                          {expandedGroups.has(o.id) ? (
                            <ChevronDown size={13} />
                          ) : (
                            <ChevronRight size={13} />
                          )}
                        </button>
                      ) : (
                        <span className="tree-expander-spacer" />
                      )}
                      {o.kind === "assembly" && (
                        <>
                          <button
                            className="component-color-button"
                            aria-label={"Edit color of " + c.name}
                            title="Edit component color"
                            disabled={busy || !!historyView}
                            onClick={(e) => {
                              const rect =
                                e.currentTarget.getBoundingClientRect();
                              setAppearance({
                                definition: o.definition,
                                x:
                                  (e.currentTarget
                                    .closest(".left-panel")
                                    ?.getBoundingClientRect().right ||
                                    rect.right) + 8,
                                y: rect.top,
                              });
                            }}
                          >
                            <span
                              style={{
                                background:
                                  colorPreview?.definition === c.id
                                    ? colorPreview.color
                                    : c.color,
                              }}
                            />
                          </button>
                        </>
                      )}
                      <button
                        className="component-select"
                        draggable={false}
                        onPointerDown={(e) => {
                          if (
                            e.button === 0 &&
                            !treeEditingDisabled &&
                            !o.pattern_mode &&
                            !o.suppressed
                          )
                            treePointer.current = {
                              id: o.id,
                              x: e.clientX,
                              y: e.clientY,
                              active: false,
                              parent: null,
                              problem: "",
                            };
                        }}
                        title={
                          c.name +
                          (o.kind === "assembly"
                            ? " · Double-click to edit group"
                            : " · Double-click to rename · Right-click for actions")
                        }
                        onDoubleClick={(e) => {
                          if (busy || historyView) return;
                          if (o.kind === "assembly") {
                            editGroup(
                              {
                                occurrence: o.id,
                                definition: o.definition,
                              },
                              true,
                            );
                            return;
                          }
                          const rect = e.currentTarget.getBoundingClientRect();
                          setAppearance({
                            definition: o.definition,
                            x:
                              (e.currentTarget
                                .closest(".left-panel")
                                ?.getBoundingClientRect().right || rect.right) +
                              8,
                            y: rect.top,
                            focusName: true,
                          });
                        }}
                        onKeyDown={(e) => {
                          if (
                            [
                              "ArrowUp",
                              "ArrowDown",
                              "ArrowLeft",
                              "ArrowRight",
                            ].includes(e.key)
                          ) {
                            e.preventDefault();
                            const rows = [
                              ...e.currentTarget
                                .closest("[role=tree]")!
                                .querySelectorAll<HTMLButtonElement>(
                                  ".component-select",
                                ),
                            ];
                            const index = rows.indexOf(e.currentTarget);
                            if (e.key === "ArrowDown")
                              rows[
                                Math.min(rows.length - 1, index + 1)
                              ]?.focus();
                            if (e.key === "ArrowUp")
                              rows[Math.max(0, index - 1)]?.focus();
                            if (e.key === "ArrowRight") {
                              if (
                                o.kind === "assembly" &&
                                !expandedGroups.has(o.id)
                              )
                                toggleGroup(o.id);
                              else if (childCount) rows[index + 1]?.focus();
                            }
                            if (e.key === "ArrowLeft") {
                              if (
                                o.kind === "assembly" &&
                                expandedGroups.has(o.id)
                              )
                                toggleGroup(o.id);
                              else
                                rows
                                  .find(
                                    (r) =>
                                      r
                                        .closest("[data-occurrence]")
                                        ?.getAttribute("data-occurrence") ===
                                      parentPath(o.id),
                                  )
                                  ?.focus();
                            }
                          }
                          if (e.key === "F2" && !busy && !historyView) {
                            e.preventDefault();
                            const rect =
                              e.currentTarget.getBoundingClientRect();
                            setAppearance({
                              definition: o.definition,
                              x:
                                (e.currentTarget
                                  .closest(".left-panel")
                                  ?.getBoundingClientRect().right ||
                                  rect.right) + 8,
                              y: rect.top,
                              focusName: true,
                            });
                          }
                        }}
                        onClick={(e) => {
                          if (performance.now() < suppressTreeClick.current) {
                            e.preventDefault();
                            return;
                          }
                          select(
                            { occurrence: o.id, definition: o.definition },
                            e.shiftKey,
                            true,
                          );
                          setRightVisible(true);
                        }}
                      >
                        {o.kind === "assembly" ? (
                          <FolderOpen size={15} />
                        ) : o.kind === "planar" ? (
                          <Layers size={15} />
                        ) : (
                          <Box size={15} />
                        )}
                        <span>{c.name}</span>
                        {count > 1 && (
                          <span className="instance-count">
                            <Link2 size={10} />
                            {count}
                          </span>
                        )}
                      </button>
                      {o.id === groupScope && (
                        <div className="tree-edit-status">
                          <em>Editing</em>
                          <button
                            disabled={
                              !!featureEdit || !!operation || !!move || !!grouping || !!sketch
                            }
                            onClick={endGroupEditing}
                          >
                            Done
                          </button>
                        </div>
                      )}
                      <button
                        className="tree-rename"
                        aria-label={"Rename " + c.name}
                        title="Rename component · F2"
                        disabled={busy || !!historyView}
                        onClick={(e) => {
                          const rect = e.currentTarget.getBoundingClientRect();
                          setAppearance({
                            definition: o.definition,
                            x:
                              (e.currentTarget
                                .closest(".left-panel")
                                ?.getBoundingClientRect().right || rect.right) +
                              8,
                            y: rect.top,
                            focusName: true,
                          });
                        }}
                      >
                        <Pencil size={12} />
                      </button>
                      <button
                        className="tree-eye"
                        title={
                          o.visible ? "Hide in viewport" : "Show in viewport"
                        }
                        aria-label={(o.visible ? "Hide " : "Show ") + c.name}
                        onClick={() =>
                          run("instance.visibility", {
                            id: o.source_id,
                            visible: !o.visible,
                          }).catch(() => {})
                        }
                      >
                        {o.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                      </button>
                    </div>
                  </Fragment>
                );
              },
            )}
            {createRow}
            {draggedComponent && (
              <div className="tree-drop-help" role="status">
                {treeDrop?.problem ||
                  `Move into ${state?.occurrences.find((o) => o.id === treeDrop?.parent)?.name || "design root"}. Geometry stays in place.`}
              </div>
            )}
          </div>
          <div className="sketch-tree" aria-label="Design sketches">
            <div className="structure-section">
              <SquareDashed size={15} />
              <span>2D Sketches</span>
              <small>{sketchFeatures.length}</small>
              <button
                className="icon-button"
                aria-label={
                  anySketchVisible ? "Hide all sketches" : "Show all sketches"
                }
                title={
                  anySketchVisible ? "Hide all sketches" : "Show all sketches"
                }
                disabled={!sketchFeatures.length}
                onClick={() =>
                  setHiddenSketches((previous) => {
                    const next = new Set(previous);
                    for (const feature of sketchFeatures) {
                      if (anySketchVisible) next.add(feature.id);
                      else next.delete(feature.id);
                    }
                    return next;
                  })
                }
              >
                {anySketchVisible ? <Eye size={13} /> : <EyeOff size={13} />}
              </button>

            </div>
            {sketchFeatures.map((f) => (
              <div
                key={f.id}
                className={`sketch-tree-row ${selectedSketch === f.id ? "selected" : ""}`}
              >
                <button
                  className="sketch-tree-name"
                  onClick={() => {
                    if (sketch) return;
                    selectSketch(f.id);
                  }}
                  onDoubleClick={() => openSketch(f)}
                >
                  <SquareDashed size={14} />
                  <span>{f.name}</span>
                </button>
                <button
                  className="icon-button"
                  aria-label={`Edit ${f.name}`}
                  disabled={!!sketch || busy}
                  onClick={() => openSketch(f)}
                >
                  <Pencil size={12} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`${hiddenSketches.has(f.id) ? "Show" : "Hide"} sketch ${f.name}`}
                  onClick={() =>
                    setHiddenSketches((prev) => {
                      const next = new Set(prev);
                      if (next.has(f.id)) next.delete(f.id);
                      else next.add(f.id);
                      return next;
                    })
                  }
                >
                  {hiddenSketches.has(f.id) ? (
                    <EyeOff size={12} />
                  ) : (
                    <Eye size={12} />
                  )}
                </button>
              </div>
            ))}
            {selectedSketch &&
              state?.document.features[selectedSketch] &&
              !sketch && (
                <div className="sketch-tree-actions">
                  <button
                    onClick={() =>
                      openSketch(state.document.features[selectedSketch])
                    }
                  >
                    Edit sketch
                  </button>
                  <button
                    disabled={busy}
                    onClick={() => {
                      if (operationRef.current)
                        operationRef.current.useSketch(selectedSketch);
                      else {
                        chooseTool("tool");
                        requestAnimationFrame(() =>
                          operationRef.current?.useSketch(selectedSketch),
                        );
                      }
                    }}
                  >
                    Use as tool profile
                  </button>
                </div>
              )}
              <button
                className="create-part sidebar-add-row"
                aria-label="New sketch"
                disabled={!state || busy || !!sketch}
                onClick={() => chooseTool("sketch")}
              >
                <Plus size={14} /><span>add sketch</span>
              </button>
          </div>
          <section className="tool-body-library" aria-label="3D Tool Bodies">
            <div className="structure-section design-category">
              <Cuboid size={15} />
              <span>3D Tool Bodies</span>
              <small>{toolBodies.length}</small>

            </div>
            {toolBodies.map((body) => (
              <div
                className={`tool-library-row ${toolWorkbench === body.id ? "selected" : ""}`}
                key={body.id}
              >
                <button
                  title="Edit in the tool workbench"
                  onClick={() => openToolBody(body.id)}
                  disabled={
                    busy || !!featureEdit || !!operation || !!move || !!sketch || !!grouping
                  }
                >
                  <Cuboid size={14} />
                  <span>{body.name}</span>
                </button>
                <button
                  className="icon-button"
                  aria-label={`Rename tool body ${body.name}`}
                  disabled={busy || !!featureEdit || !!operation || !!move || !!sketch}
                  onClick={(e) => {
                    const r = e.currentTarget.getBoundingClientRect();
                    setAppearance({
                      definition: body.id,
                      x: r.right + 8,
                      y: r.top,
                      focusName: true,
                    });
                  }}
                >
                  <Pencil size={12} />
                </button>
                <button
                  className="icon-button"
                  aria-label={`Remove tool body ${body.name}`}
                  title="Remove tool body · referenced tools are protected"
                  disabled={busy || !!featureEdit || !!operation || !!move || !!sketch}
                  onClick={() => {
                    void run("component.delete", { id: body.id }).catch(
                      () => {},
                    );
                  }}
                >
                  <X size={12} />
                </button>
              </div>
            ))}
              <button
                className="create-part sidebar-add-row"
                aria-label="New 3D tool body"
                title="New tool body"
                disabled={
                  !state ||
                  busy ||
                  !!featureEdit || !!operation ||
                  !!move ||
                  !!sketch ||
                  !!grouping ||
                  !!historyView
                }
                onClick={() => void newToolBody()}
              >
                <Plus size={14} /><span>add tool</span>
              </button>
          </section>
          <div className="design-utilities" aria-label="Design utilities">
            <button
              className="design-utility-link"
              onClick={() => {
                setDialog("parameters");
              }}
            >
              <ChevronRight size={12} />
              <SlidersHorizontal size={15} />
              <span>Parameters</span>
              <small>
                {params.filter((p) => state!.parameter_graph[p.id].root).length}
              </small>
            </button>
            <button
              className="design-utility-link"
              onClick={() => setDialog("checkpoints")}
            >
              <ChevronRight size={12} />
              <History size={15} />
              <span>Checkpoints</span>
              <small>{state?.checkpoints.length || 0}</small>
            </button>
          </div>
        </aside>
      )}

      <main
        className={`viewport-area ${toolWorkbench ? "tool-workbench-view" : ""}`}
      >
        {toolWorkbench && (
          <div className="tool-workbench-banner">
            <Cuboid size={15} />
            <span>
              Tool workbench · {state?.document.components[toolWorkbench]?.name}
            </span>
            <button
              disabled={!!featureEdit || !!operation || !!move || !!sketch || busy}
              onClick={() => chooseTool("tool")}
            >
              Build / edit
            </button>
            <button
              disabled={!!featureEdit || !!operation || !!move || !!sketch}
              onClick={closeToolBody}
            >
              Return to design
            </button>
          </div>
        )}

        <Viewport
          key={toolWorkbench || "design"}
          onWorldAxis={chooseWorldAxis}
          onWorldPlane={plane=>select({worldPlane:plane,occurrence:"",definition:"root"})}
          selectedWorldPlane={selection?.worldPlane}
          editingGroup={groupScope}
          resolveHover={(item) =>
            sectionPicking || measure!==null ? item : operation &&
            operationPathPickProblem(
              operationSetup?.draft || operation,
              operationSetup?.pick || null,
              item,
            )
              ? null
              : state && !featureEdit && !operation && !move && !sketch
                ? groupSelection(item, state.occurrences, groupScope)
                : item
          }
          onDoubleSelect={(item) => {
            if(measureActive.current)return;
            if (!item && groupScope) endGroupEditing();
            else editGroup(item);
          }}
          sketch={
            sketch?.solvedEntities
              ? { ...sketch, entities: sketch.solvedEntities }
              : sketch
          }
          dimensionEditor={
            dimensionEditor && sketch
              ? {
                  ...dimensionEditor,
                  onChange: (v) => sketchRef.current?.dimensionChange(v),
                  onConfirm: () => sketchRef.current?.dimensionKey("Enter"),
                  onCancel: () => sketchRef.current?.dimensionKey("Escape"),
                }
              : null
          }
          sketchPlanePicking={sketchPlanePicking}
          sketchObjects={savedSketchObjects}
          selectedSketch={selectedSketch}
          onSelectSketch={selectSketch}
          onSketchInput={(p, t, s) => sketchRef.current?.point(p, t, s)}
          onSketchCursor={(cursor) =>
            setSketch((d) => (d ? { ...d, cursor } : d))
          }
          ref={viewRef}
          geometry={historyView?.components || state?.geometry || {}}
          occurrences={viewportOccurrences.map((o) => ({
            ...o,
            name: state?.document.components[o.definition]?.name || o.name,
            color: (() => {
              if (!groupColorsEnabled) return "#84919a";
              const ancestors =
                state?.occurrences
                  .filter(
                    (g) => g.kind === "assembly" && o.id.startsWith(g.id + "/"),
                  )
                  .sort((a, b) => b.id.length - a.id.length) || [];
              const group = o.kind === "assembly" ? o : ancestors[0];
              const id = group?.definition || o.definition;
              return colorPreview?.definition === id
                ? colorPreview.color
                : state?.document.components[id]?.color || o.color;
            })(),
          }))}
          units={state?.document.display_units}
          onContextMenu={(item, x, y) => {
            if(measureActive.current || featureEditActive.current)return;
            const resolved =
              state && !featureEdit && !operation && !move && !sketch
                ? groupSelection(item, state.occurrences, groupScope)
                : item;
            select(resolved);
            setContextMenu({ selection: resolved, x, y });
          }}
          revision={state?.document.revision || 0}
          selected={
            selection?.worldPlane ? null : measure!==null
              ? measure.length ? {...measure[0].selection,items:measure.map(p=>p.selection)} : null
              : grouping && state
              ? (() => {
                  const items = grouping
                    .map((id) => state.occurrences.find((o) => o.id === id))
                    .filter((o): o is Occurrence => !!o)
                    .map((o) => ({
                      occurrence: o.id,
                      definition: o.definition,
                    }));
                  return items.length ? { ...items[0], items } : null;
                })()
              : sketch
                ? null
                : operation
                  ? operationReference
                  : selection
          }
          onSelect={select}
          measurePoints={measure}
          explode={sketch ? 0 : explode}
          showBounds={showComponentBounds}
          grid={grid}
          section={sketch || sectionPicking ? false : section}
          sectionPlane={sectionPlane.current}
          activeAppearance={experiments[ACTIVE_APPEARANCE_ID]}
          sectionReference={sectionSettings.reference}
          sectionOffset={sectionSettings.offset}
          historyKey={historyView?.history_key}
          operationPreview={
            sketch ? null : move ? movePreview : operationPreview
          }
          placementTarget={move?.target}
          featureEditTarget={featureEdit?.target}
          movementGuide={move ? moveGuide : null}
          orientationRef={orientationRef}
          onOperationPreviewReady={setPreviewRendered}
          operationFrame={
            operationSetup && state
              ? operationFrame(
                  operationSetup.draft,
                  state,
                  operationSetup.report?.feature_values,
                  operationSetup.report?.operation_display,
                )
              : undefined
          }
          operationDraft={sketch ? undefined : operationSetup?.draft}
          referenceHover={operation || move || measure!==null ? operationHover : null}
          pickSlot={operationSetup?.pick}
          onSketchPoint={(point) => operationRef.current?.sketchPoint(point)}
        />
        <div className="viewport-top">
          <div className="viewport-context">
            <span className="eyebrow">
              {sketch
                ? "SKETCH · UNSAVED EDITS"
                : featureEdit
                  ? "EDIT FEATURE · UNAPPLIED PREVIEW"
                : historyView
                  ? "HISTORY INSPECTION"
                  : move
                    ? "MOVE COMPONENT · UNAPPLIED PREVIEW"
                    : operation
                      ? "TOOL SETUP · UNAPPLIED PREVIEW"
                      : "ASSEMBLY WORKSPACE"}
            </span>
            {(!sketch || sketchPlanePicking) && (
              <div>
                <span className="status-orb small" />
                {sketchPlanePicking
                  ? "Pick a world plane or planar face"
                  : historyView
                    ? "Earlier build stage · current parameter values"
                    : section
                      ? "Section view · clipped display"
                      : "Orthographic"}
              </div>
            )}
            {groupScope && !sketch && (
              <div className="group-edit-banner">
                <FolderOpen size={14} />
                <span>
                  Editing{" "}
                  {state?.occurrences.find((o) => o.id === groupScope)?.name}
                </span>
                <button
                  disabled={!!featureEdit || !!operation || !!move || !!grouping}
                  onClick={endGroupEditing}
                >
                  Done
                </button>
              </div>
            )}
          </div>
          <div className="viewport-view-navigation">
            <ViewOrientation
              ref={orientationRef}
              onAxis={chooseWorldAxis}
              onOrigin={chooseWorldOrigin}
              selectedAxis={
                move
                  ? moveGuide?.worldAxis
                  : operationSetup &&
                      ["X", "Y", "Z"].includes(operationSetup.draft.direction)
                    ? (operationSetup.draft.direction as WorldAxis)
                    : null
              }
            />
            <div className="view-controls">
              <button
                title="Front view · 1"
                onClick={() => viewRef.current?.view("front")}
              >
                Front
              </button>
              <button
                title="Top view · 7"
                onClick={() => viewRef.current?.view("top")}
              >
                Top
              </button>
              <button
                title="Right view · 2"
                onClick={() => viewRef.current?.view("right")}
              >
                Right
              </button>
              <button
                className="iso-view"
                title="Isometric view"
                onClick={() => viewRef.current?.view("iso")}
              >
                <Box size={18} />
                <span>ISO</span>
              </button>
            </div>
          </div>
        </div>
        {!leftVisible && (
          <button
            className="panel-reopen left"
            title="Show structure"
            onClick={() => setLeftVisible(true)}
          >
            <Layers size={18} />
          </button>
        )}
        {!rightVisible && (
          <button
            className="panel-reopen right"
            title="Show inspector"
            onClick={() => setRightVisible(true)}
          >
            <SlidersHorizontal size={18} />
          </button>
        )}
        {historyView && (
          <div className="history-banner">
            <History size={15} />
            <span>
              {historyView.feature_id === "origin"
                ? "Origin · before the first feature"
                : state?.document.features[historyView.feature_id]?.name}
            </span>
            <button onClick={() => setHistoryView(null)}>
              Return to present
              <ArrowRight size={14} />
            </button>
          </div>
        )}
        {busy && (
          <div className="job-card">
            <LoaderCircle className="spin" size={17} />
            <div>
              <strong>
                {currentJob?.status === "waiting"
                  ? "Waiting for next agent step"
                  : (
                      currentJob?.description ||
                      currentJob?.operation ||
                      "Evaluating design"
                    ).replaceAll(".", " · ")}
              </strong>
              <span>
                {state?.worker_status === "starting"
                  ? "Starting the native geometry kernel…"
                  : currentJob?.status === "waiting"
                    ? "Use Continue in the Agents panel."
                    : "The last saved design remains available."}
              </span>
            </div>
            <button
              className="text-button"
              onClick={() => {
                const id = currentJob?.id || currentJob?.job_id;
                if (id)
                  api("/jobs/" + id + "/cancel", { method: "POST" }).catch(
                    report,
                  );
              }}
            >
              Cancel
            </button>
          </div>
        )}
        {error && (
          <div className="error-card" role="alert">
            <Info size={18} />
            <div>
              <strong>{error.message}</strong>
              <span>
                {error.code?.replaceAll("_", " ")} · Last saved design retained
              </span>
              {error.details?.feature_id && (
                <button
                  onClick={() => {
                    setSelectedFeature(error.details.feature_id);
                    setRightVisible(true);
                  }}
                >
                  Inspect responsible feature
                </button>
              )}
              {error.details?.reason && (
                <details>
                  <summary>Technical details</summary>
                  {error.details.reason}
                </details>
              )}
            </div>
            <button aria-label="Dismiss error" onClick={() => setError(null)}>
              <X size={15} />
            </button>
          </div>
        )}
        {connectionError && (
          <div className="connection-banner">
            Reconnecting to your local CAD engine… Saved edits remain on disk.
          </div>
        )}
        {section && !sketch && <SectionControls settings={sectionSettings} onChange={setSectionSettings} onClose={()=>{setSection(false);setSectionPicking(false);setSectionNotice("");}}
          picking={sectionPicking} notice={sectionNotice} pickDisabled={!!operation||!!move||!!sketch||grouping!==null||measure!==null}
          onCancelPick={()=>{setSectionPicking(false);setSectionNotice("");}}
          onPick={()=>{setSectionNotice("");if(selectedSketch){captureSectionSketch(selectedSketch);return;}if(selection?.face&&captureSectionFace(selection))return;setSectionPicking(true);}}
          occurrences={viewportOccurrences} geometry={historyView?.components || state?.geometry || {}} explode={explode} />}
        <div className="viewport-bottom">
          <div className="navigation-hint">
            <MousePointer2 size={12} />
            <span className="desktop-navigation-hint">
              {sketch && !sketchPlanePicking
                ? "Shift + right-drag to orbit"
                : "Left-drag to orbit"}{" "}
              <b>·</b> Right-drag to pan <b>·</b> Scroll to zoom
            </span>
            <span className="touch-navigation-hint">
              {sketch && !sketchPlanePicking
                ? "Tap to draw · Two fingers to pan / zoom"
                : "Tap to select · Drag to orbit · Two fingers to pan / zoom"}
            </span>
          </div>
          <div className="viewport-options">
            {sketch && (
              <button
                className={sketch.gridSnapEnabled !== false ? "active" : ""}
                aria-label="Sketch grid snapping"
                aria-pressed={sketch.gridSnapEnabled !== false}
                title="Toggle sketch grid snapping · S"
                disabled={sketchPlanePicking}
                onClick={() =>
                  setSketch((d) =>
                    d
                      ? { ...d, gridSnapEnabled: d.gridSnapEnabled === false }
                      : d,
                  )
                }
              >
                <Magnet size={16} />
                <span>
                  Snap {sketch.gridSnapEnabled !== false ? "on" : "off"}
                </span>
              </button>
            )}

            <button
              className={section ? "active" : ""}
              title="Section view"
              aria-label="Section view"
              aria-pressed={section}
              onClick={() => {if(!section && !sectionInitialized.current){setSectionSettings({...sectionSettings,offset:sectionRange(sectionSettings,viewportOccurrences,historyView?.components || state?.geometry || {},explode).center});sectionInitialized.current=true;}if(section){setSectionPicking(false);setSectionNotice("");}setSection(!section);}}
            >
              <ScanLine size={16} />
            </button>
            <button
              className={grid ? "active" : ""}
              title="Toggle grid · Shift G"
              onClick={() => setGrid((v) => !v)}
            >
              <Grid2X2 size={16} />
            </button>
            <button
              title="Fit design · F"
              onClick={() => viewRef.current?.fit()}
            >
              <Expand size={16} />
            </button>
            <button
              className={showComponentBounds ? "active" : ""}
              aria-label="Show selected component bounds and centers"
              aria-pressed={showComponentBounds}
              title="Show selected component bounding boxes and centers"
              onClick={() => setShowComponentBounds((v) => !v)}
            >
              <Scan size={16} />
            </button>
            <span />
            <label title="Exploded view: scale distances from the assembly center; placements stay unchanged">
              <Boxes size={15} />
              <input
                aria-label="Exploded display"
                type="range"
                min="0"
                max="200"
                step="1"
                value={explode}
                aria-valuetext={`${explode}% separation`}
                disabled={!!featureEdit || !!operation || !!move || measure!==null}
                onChange={(e) => setExplode(Number(e.target.value))}
              />
            </label>
          </div>
        </div>
      </main>

      {featureEdit && state && <FeatureEditPanel key={featureEdit.feature.id} ref={featureEditRef}
        feature={featureEdit.feature} state={state} renderedToken={previewRendered}
        onPreview={setOperationPreview} onCommit={commitOperation} onClose={closeOperation} />}
      {operation && state && (
        <div
          className="operation-panel-host"
          style={{ display: sketch ? "none" : undefined }}
        >
          <OperationPanel
            suspended={!!sketch}
            onDrawProfile={(draft) => openSketch(undefined, draft)}
            ref={operationRef}
            state={state}
            initial={operation}
            onChange={(draft, pick, report) =>
              setOperationSetup({ draft, pick, report })
            }
            onPreview={setOperationPreview}
            onHoverReference={setOperationHover}
            renderedToken={previewRendered}
            onCommit={commitOperation}
            onAlign={() => {
              if (operationSetup && state)
                viewRef.current?.alignPlane(
                  operationFrame(
                    operationSetup.draft,
                    state,
                    operationSetup.report?.feature_values,
                    operationSetup.report?.operation_display,
                  ),
                );
            }}
            onClose={closeOperation}
          />
        </div>
      )}
      {sketch && state && (
        <SketchPanel
          ref={sketchRef}
          draft={sketch}
          state={state}
          onChange={setSketch}
          onDimensionEditor={setDimensionEditor}
          onFinish={finishSketch}
          onCancel={closeSketch}
          embedded={sketchParent.current}
          planePicking={sketchPlanePicking}
          onPlaneChosen={() => setSketchPlanePicking(false)}
          onFacePlane={() => setSketchPlanePicking(true)}
          onAlign={() => {
            const f = sketchBasis(sketch.frame);
            viewRef.current?.alignPlane(f as any);
          }}
        />
      )}
      {move && state && (
        <MoveComponentPanel
          ref={moveRef}
          state={state}
          target={move.target}
          axisRequest={move.axisRequest}
          renderedToken={previewRendered}
          onTarget={(target) => {
            setMove({ target });
            setSelection(target);
            setSelectionSet(target ? [target.occurrence] : []);
          }}
          onGuide={setMoveGuide}
          onHoverReference={setOperationHover}
          onPreview={setMovePreview}
          onCommit={commitOperation}
          onClose={closeMove}
        />
      )}
      {grouping !== null && state && (
        <GroupPanel
          ref={groupPanelRef}
          rows={groupCandidates(state.occurrences, groupScope).map((o) => ({
            ...o,
            name: state.document.components[o.definition]?.name || o.name,
          }))}
          selected={grouping}
          onSelected={setGrouping}
          onClose={() => setGrouping(null)}
          onApply={async (mode, name, target) => {
            await run(mode === "new" ? "group.create" : "group.add", {
              name,
              occurrences: grouping,
              ...(target ? { group: target } : {}),
            });
            setGrouping(null);
          }}
        />
      )}
      {measure!==null&&state&&<MeasurePanel points={measure} replace={measureReplace} notice={measureNotice} units={state.document.display_units}
        onReplace={setMeasureReplace} onRemove={index=>{setMeasure(points=>points?.filter((_,i)=>i!==index)||[]);setMeasureReplace(null);setOperationHover(null);}}
        onClear={()=>{setMeasure([]);setMeasureReplace(null);setMeasureNotice('');setOperationHover(null);}}
        onHover={setOperationHover} onClose={closeMeasure}/>}
      {(rightVisible || mobileLayout) && !featureEdit && !operation && !move && !sketch && !grouping && measure===null && (
        <aside className="inspector-panel">
          <div className="panel-title">
            <span>INSPECTOR</span>
            <button
              className="icon-button"
              aria-label="Hide inspector"
              onClick={() => mobileLayout ? setMobilePane("viewport") : setRightVisible(false)}
            >
              <PanelRightClose size={14} />
            </button>
          </div>
          <div className="inspector-scroll">
            {component ? (
              <>
                <div className="component-heading">
                  <div
                    className="large-component-icon"
                    style={{ color: component.color }}
                  >
                    <Box size={23} />
                  </div>
                  <div>
                    <span className="eyebrow">
                      {component.kind === "assembly"
                        ? "GROUP"
                        : component.kind === "planar"
                          ? "PLANAR PART"
                          : component.purpose === "tool"
                            ? "3D TOOL BODY"
                            : "PHYSICAL COMPONENT"}
                    </span>
                    <h2>{component.name}</h2>
                  </div>
                  <button
                    className="icon-button"
                    title="Component actions"
                    onClick={() => setDialog("component-actions")}
                  >
                    <Ellipsis size={18} />
                  </button>
                </div>
                <div className="component-status">
                  <span className="status-orb small" />
                  {component.kind === "assembly"
                    ? "Component group"
                    : geometry?.status === "valid"
                      ? "Valid solid"
                      : geometry?.status === "planar"
                        ? "Planar profile"
                        : geometry?.status === "open_profile"
                          ? "Open sketch profile"
                          : "Draft component"}
                  <span>
                    {
                      state!.occurrences.filter(
                        (i) => i.definition === component.id,
                      ).length
                    }{" "}
                    instance
                    {state!.occurrences.filter(
                      (i) => i.definition === component.id,
                    ).length === 1
                      ? ""
                      : "s"}
                  </span>
                </div>
                {measurementSection}
                {component.kind === "assembly" && (
                  <section className="inspector-section group-inspector-actions">
                    <button onClick={() => editGroup(selection)}>
                      <FolderOpen size={14} />
                      Edit group
                    </button>
                    <button onClick={() => chooseTool("transform")}>
                      <Move3D size={14} />
                      Move group
                    </button>
                    <button
                      onClick={() =>
                        run("group.copy", {
                          occurrence: selection?.occurrence,
                        }).catch(() => {})
                      }
                    >
                      <Copy size={14} />
                      Copy group
                    </button>
                    <button
                      onClick={() =>
                        run("group.ungroup", {
                          occurrence: selection?.occurrence,
                        }).catch(() => {})
                      }
                    >
                      Ungroup
                    </button>
                  </section>
                )}
                {component.kind !== "assembly" && (
                  <section className="inspector-section">
                    <div className="section-heading">
                      <h3>Part envelope</h3>
                      <small>{unit}</small>
                    </div>
                    <div className="dimension-triple">
                      {["X", "Y", "Z"].map((axis, i) => (
                        <div key={axis}>
                          <span className={"axis-" + axis.toLowerCase()}>
                            {axis}
                          </span>
                          <strong>
                            {geometry?.bounds
                              ? length(geometry.bounds.size[i])
                              : "—"}
                          </strong>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {selection?.face && (
                  <section className="inspector-section selected-face">
                    <div className="section-heading">
                      <h3>
                        {selectedMembers.length > 1
                          ? `Selected faces (${selectedMembers.length})`
                          : entityName(selection, geometry)}
                      </h3>
                      <span className="mini-badge">
                        {selection.face.type.toLowerCase()}
                      </span>
                    </div>
                    <div className="property-row">
                      <span>
                        {selectedMembers.length > 1
                          ? "Combined face area"
                          : "Face area"}
                      </span>
                      <strong>
                        {numeric(
                          selectedMembers.reduce(
                            (sum, s) => sum + (s.face?.area || 0),
                            0,
                          ),
                        )}{" "}
                        mm²
                      </strong>
                    </div>
                    <div className="property-row">
                      <span>
                        {selectedMembers.length > 1
                          ? "Primary center · local mm"
                          : "Center · local mm"}
                      </span>
                      <strong>
                        {selection.face.center
                          .map((v) => numeric(v, 1))
                          .join(", ")}
                      </strong>
                    </div>
                    {selectedMembers.length === 1 &&
                      selection.face.controlling_parameter &&
                      state!.document.parameters[
                        selection.face.controlling_parameter
                      ] && (
                        <button
                          className="button secondary full"
                          onClick={() =>
                            setEditParameter(
                              selection.face!.controlling_parameter!,
                            )
                          }
                        >
                          <ArrowUpRight size={14} />
                          Edit generating dimension
                        </button>
                      )}
                    {selectedMembers.length === 1 &&
                      selection.face.controlling_parameter && (
                        <button
                          className="text-button"
                          onClick={() => setDialog("push-pull")}
                        >
                          <ArrowUpRight size={12} />
                          Push / pull by an exact offset
                        </button>
                      )}
                  </section>
                )}
                {selection?.edge && (
                  <section className="inspector-section selected-face">
                    <div className="section-heading">
                      <h3>
                        {selectedMembers.length > 1
                          ? `Selected edges (${selectedMembers.length})`
                          : entityName(selection, geometry)}
                      </h3>
                      <span className="mini-badge">
                        {selection.edge.type.toLowerCase()}
                      </span>
                    </div>
                    <div className="property-row">
                      <span>
                        {selectedMembers.length > 1
                          ? "Combined curve length"
                          : "Curve length"}
                      </span>
                      <strong>
                        {numeric(
                          selectedMembers.reduce(
                            (sum, s) => sum + (s.edge?.length || 0),
                            0,
                          ),
                          4,
                        )}{" "}
                        mm
                      </strong>
                    </div>
                    <div className="field-grid">
                      <button
                        className="button secondary small"
                        onClick={() => chooseTool("fillet")}
                      >
                        {selectedMembers.length > 1
                          ? "Round selected edges"
                          : "Round this edge"}
                      </button>
                      <button
                        className="button secondary small"
                        onClick={() => chooseTool("chamfer")}
                      >
                        {selectedMembers.length > 1
                          ? "Chamfer selected edges"
                          : "Chamfer this edge"}
                      </button>
                    </div>
                  </section>
                )}
                <section className="inspector-section">
                  <div className="section-heading">
                    <h3>
                      {feature ? "Feature dimensions" : "Component dimensions"}
                    </h3>
                    <button
                      title="Open parameter workspace"
                      onClick={() => {
                        setDialog("parameters");
                      }}
                    >
                      <SlidersHorizontal size={13} />
                    </button>
                  </div>
                  {(feature
                    ? Object.entries(feature.parameters)
                    : Object.values(state!.document.parameters)
                        .filter((p) => p.owner === component.id)
                        .slice(0, 7)
                        .map((p) => [p.name, p.id])
                  ).map(([field, id]) => {
                    const p = state!.document.parameters[id];
                    if (!p) return null;
                    const info = state!.parameter_graph[id];
                    return (
                      <button
                        className="dimension-row"
                        key={field}
                        onClick={() => setEditParameter(id)}
                      >
                        <span title={p.name}>
                          {feature
                            ? field.replaceAll("_", " ")
                            : p.name.split(" · ").slice(1).join(" · ") ||
                              p.name}
                        </span>
                        <strong>
                          {numeric(info.value, 3)}
                          <small>
                            {p.kind === "length"
                              ? "mm"
                              : p.kind === "angle"
                                ? "°"
                                : ""}
                          </small>
                          {!info.root && <Link2 size={10} />}
                        </strong>
                        {p.tolerance && (
                          <em>
                            −{p.tolerance.minus} / +{p.tolerance.plus}
                          </em>
                        )}
                      </button>
                    );
                  })}
                  <button
                    className="text-button"
                    onClick={() => {
                      setDialog("parameters");
                    }}
                  >
                    Named parameters
                    <ArrowRight size={12} />
                  </button>
                </section>
                <section className="inspector-section">
                  <div className="section-heading">
                    <h3>Construction</h3>
                    <small>{component.feature_ids.length} features</small>
                  </div>
                  <div className="feature-list">
                    {component.feature_ids.map((id) => {
                      const f = state!.document.features[id],
                        Icon = featureIcon[f.type] || Box;
                      return (
                        <button
                          className={
                            (selectedFeature === id ? "active " : "") +
                            (f.suppressed ? "suppressed" : "")
                          }
                          key={id}
                          onClick={() => setSelectedFeature(id)}
                        >
                          <Icon size={14} />
                          <span>{f.name}</span>
                          {f.suppressed ? (
                            <EyeOff size={11} />
                          ) : state!.timings[id]?.expensive ? (
                            <Clock3 size={11} />
                          ) : (
                            <ChevronRight size={12} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {feature && (
                    <div className="feature-actions">
                      <button className="text-button" disabled={busy} onClick={() => editHistoryFeature(feature)}>
                        <Pencil size={12} />Edit feature
                      </button>
                      <button
                        className="text-button"
                        onClick={() => viewStage(feature)}
                      >
                        <History size={12} />
                        View build stage
                      </button>
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() =>
                          run("feature.suppress", {
                            id: feature.id,
                            suppressed: !feature.suppressed,
                          }).catch(() => {})
                        }
                      >
                        {feature.suppressed ? "Restore" : "Suppress"}
                      </button>
                      {feature.type === "sketch" && (
                        <button
                          className="text-button"
                          onClick={() => {
                            openSketch(feature);
                          }}
                        >
                          Edit sketch
                        </button>
                      )}
                    </div>
                  )}
                </section>
                <section className="inspector-section">
                  <div className="section-heading">
                    <h3>Placement</h3>
                    <button onClick={() => chooseTool("transform")}>
                      <Move3D size={13} />
                    </button>
                  </div>
                  <div className="property-row">
                    <span>
                      {component.purpose === "tool"
                        ? "Origin · tool workspace mm"
                        : "Origin · assembly mm"}
                    </span>
                    <strong>
                      {occurrence?.matrix
                        .slice(0, 3)
                        .map((row) => numeric(row[3], 1))
                        .join(", ")}
                    </strong>
                  </div>
                  <button
                    className="text-button"
                    onClick={() => chooseTool("transform")}
                  >
                    Move Component
                    <ArrowRight size={12} />
                  </button>
                </section>
                <section className="inspector-section provenance">
                  <div className="section-heading">
                    <h3>Provenance</h3>
                  </div>
                  <div className="property-row">
                    <span>Created by</span>
                    <span>{actorName((feature || component).created_by)}</span>
                  </div>
                  <div className="property-row">
                    <span>Last edited by</span>
                    <span>{actorName((feature || component).modified_by)}</span>
                  </div>
                </section>
              </>
            ) : (
              <>
                <div className="design-overview-heading">
                  <h2>Entire design</h2>
                </div>
                {measurementSection}
                <section className="inspector-section">
                  <div className="section-heading">
                    <h3>Parameters</h3>
                  </div>
                  <div className="property-row">
                    <span>Root design inputs</span>
                    <strong>
                      {
                        params.filter((p) => state!.parameter_graph[p.id].root)
                          .length
                      }
                    </strong>
                  </div>
                  <div className="property-row">
                    <span>Shared dimensions</span>
                    <strong>
                      {params.filter((p) => p.owner === "root").length}
                    </strong>
                  </div>
                </section>
                {state?.document.notes.trim() && (
                  <section className="inspector-section">
                    <div className="section-heading">
                      <h3>Notes</h3>
                    </div>
                    <p className="design-notes">{state.document.notes}</p>
                  </section>
                )}
                <button
                  className="button secondary inspector-parameters"
                  onClick={() => setDialog("parameters")}
                >
                  <GitBranch size={15} />
                  Open parameters
                </button>
              </>
            )}
          </div>
          <div className="inspector-footer">
            <span className="status-orb small" />
            {historyView
              ? "Measurements in inspected build stage"
              : "Measurements in current revision"}
            <span>{unit}</span>
          </div>
        </aside>
      )}

      {mobileLayout && <MobileNavigation pane={mobilePane} onChange={setMobilePane} operation={mobileOperation} />}
      <section className="timeline-panel">
        <HistoryResizeHandle />
        <header>
          <div className="timeline-tabs">
            <button
              className={timelineTab === "features" ? "active" : ""}
              onClick={() => setTimelineTab("features")}
            >
              <Layers size={13} />
              Feature history<small>{featureOrder.length}</small>
            </button>
            <button
              className={timelineTab === "activity" ? "active" : ""}
              onClick={() => setTimelineTab("activity")}
            >
              <Activity size={13} />
              Activity<small>{state?.actions.length || 0}</small>
            </button>
          </div>
          <div className="timeline-heading-right">
            <button
              className="text-button"
              aria-pressed={parallelHistory}
              aria-label="Separate component timelines"
              onClick={() => {
                setParallelHistory((v) => !v);
                setTimelineTab("features");
              }}
            >
              <GitBranch size={14} />
              Component lanes
            </button>
            {parallelHistory && mergedHistory.size > 0 && (
              <button
                className="text-button"
                onClick={() => setMergedHistory(new Set())}
              >
                Restore lanes ({mergedHistory.size})
              </button>
            )}
            <div
              className="history-controls"
              role="group"
              aria-label="Step through feature history"
            >
              <button
                className="icon-button"
                aria-label="Previous feature"
                title="Previous build stage"
                disabled={
                  !featureOrder.length ||
                  stageIndex < 0 ||
                  busy ||
                  !!featureEdit || !!operation ||
                  !!move ||
                  !!sketch ||
                  !!grouping
                }
                onClick={() => stepHistory(-1)}
              >
                <ChevronLeft size={17} />
              </button>
              <button
                className="icon-button"
                aria-label="Next feature"
                title="Next build stage"
                disabled={
                  !historyView ||
                  busy ||
                  !!featureEdit || !!operation ||
                  !!move ||
                  !!sketch ||
                  !!grouping
                }
                onClick={() => stepHistory(1)}
              >
                <ChevronRight size={17} />
              </button>
            </div>

            <div
              className="history-controls"
              role="group"
              aria-label="History controls"
            >
              <button
                className="icon-button"
                title="Undo · Ctrl Z"
                aria-label="Undo"
                disabled={!state?.can_undo || busy}
                onClick={() => run("history.undo").catch(() => {})}
              >
                <Undo2 size={17} />
              </button>
              <button
                className="icon-button"
                title="Redo · Ctrl Shift Z"
                aria-label="Redo"
                disabled={!state?.can_redo || busy}
                onClick={() => run("history.redo").catch(() => {})}
              >
                <Redo2 size={17} />
              </button>
            </div>
            <span
              className="timeline-revision"
              aria-label="Saved design revision"
              title="Latest saved design revision"
            >
              Rev {state?.document.revision ?? "—"}
            </span>

            <span>
              <span className="status-orb small" />
              {historyView
                ? "Build stage " +
                  (featureOrder.indexOf(historyView.feature_id) + 1)
                : "Current"}
            </span>
            <button
              className="text-button"
              onClick={() => setDialog("checkpoints")}
            >
              <History size={12} />
              Checkpoints
            </button>
          </div>
        </header>
        {timelineTab === "features" ? (
          <FeatureHistory
            lanes={lanes}
            activeComponent={component?.id || null}
            count={featureOrder.length}
            split={parallelHistory}
            onMerge={(id) =>
              setMergedHistory((previous) => new Set([...previous, id]))
            }
            renderFeature={(id, index) => {
              const f = state!.document.features[id];
              const Icon = featureIcon[f.type] || Box;
              const owner = state!.document.components[f.owner];
              return (
                <button
                  key={f.id}
                  className={
                    "timeline-feature " +
                    (selectedFeature === f.id ? "selected " : "") +
                    (f.suppressed ? "suppressed " : "") +
                    (historyView?.feature_id === f.id ? "rollback" : "")
                  }
                  title={
                    f.name +
                    " · " +
                    owner.name +
                    "\nCreated by " +
                    actorName(f.created_by) +
                    "\nDouble-click to edit this feature"
                  }
                  disabled={!!featureEdit || !!sketch || !!operation || !!move || !!grouping || busy}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      editHistoryFeature(f);
                    }
                  }}
                  onClick={() => {
                    const o = state!.occurrences.find(
                      (o) => o.definition === f.owner,
                    );
                    if (o) {
                      if (owner.purpose === "tool") openToolBody(owner.id);
                      else {
                        setToolWorkbench(null);
                        select(
                          { occurrence: o.id, definition: o.definition },
                          false,
                          true,
                        );
                      }
                    }
                    if (!operationActive.current) setSelectedFeature(f.id);
                  }}
                  onDoubleClick={() => editHistoryFeature(f)}
                >
                  <div
                    className="feature-tile"
                    style={
                      { "--part-color": owner.color } as React.CSSProperties
                    }
                  >
                    <Icon size={18} />
                    {state!.timings[f.id]?.expensive && (
                      <Clock3 className="cost-badge" size={10} />
                    )}
                    <small>{String(index + 1).padStart(2, "0")}</small>
                  </div>
                  <span>{f.name}</span>
                  <em>{owner.name}</em>
                </button>
              );
            }}
          />
        ) : (
          <div className="activity-timeline">
            {state?.actions.length ? (
              [
                ...state.actions,
                ...olderActions.filter(
                  (a) => !state.actions.some((current) => current.id === a.id),
                ),
              ].map((a) => (
                <button
                  className="activity-item"
                  key={a.id}
                  onClick={() => {
                    setActivityAction(a);
                    setDialog("activity-detail");
                  }}
                >
                  <span className={"actor-badge " + a.actor.kind}>
                    {a.actor.kind === "agent" ? (
                      <Activity size={13} />
                    ) : (
                      a.actor.name.slice(0, 1)
                    )}
                  </span>
                  <div>
                    <strong>{a.description}</strong>
                    <span>
                      {a.actor.name} · revision {a.revision} ·{" "}
                      {new Date(a.timestamp).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <small>{numeric(a.duration_ms, 0)} ms</small>
                </button>
              ))
            ) : (
              <p>No committed actions yet.</p>
            )}
            {state?.jobs
              .filter((j) => j.status === "failed" || j.status === "cancelled")
              .slice(-6)
              .reverse()
              .map((j) => (
                <button
                  className="activity-item"
                  key={j.id}
                  onClick={() =>
                    setError(
                      j.error || {
                        code: "cancelled",
                        message:
                          "This operation was cancelled; the saved revision is unchanged.",
                      },
                    )
                  }
                >
                  <Info size={17} />
                  <div>
                    <strong>
                      {j.description || j.operation} · {j.status}
                    </strong>
                    <span>
                      {j.actor.name} · recent diagnostic · no design commit
                    </span>
                  </div>
                </button>
              ))}
            {(state?.actions.length || 0) >= 250 && (
              <button
                className="button secondary small"
                onClick={async () => {
                  const loaded = [...(state?.actions || []), ...olderActions];
                  const last = Math.min(...loaded.map((a) => a.revision));
                  const result = await api("/activity?before=" + last);
                  setOlderActions((current) => [...current, ...result.actions]);
                }}
              >
                Load earlier activity
              </button>
            )}
          </div>
        )}
      </section>

      {toast && !error && (
        <div className="toast">
          <Check size={14} />
          {toast}
        </div>
      )}
      {error && dialog && (
        <div className="global-error-toast" role="alert">
          <Info size={18} />
          <div>
            <strong>{error.message}</strong>
            <small>
              {error.code.replaceAll("_", " ")} · no invalid edit was committed
            </small>
          </div>
          <button
            aria-label="Dismiss operation error"
            onClick={() => setError(null)}
          >
            <X size={15} />
          </button>
        </div>
      )}
      <input
        ref={importRef}
        type="file"
        accept=".yaml,.yml,.zip,.rycad"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          if (operationActive.current || sketch || grouping || busy) {
            setToast(
              "Cancel the tool operation before opening a different design.",
            );
            e.target.value = "";
            return;
          }
          setLocalJob({ status: "queued", description: "Open native design" });
          try {
            const response = await fetch("/api/workspace/import", {
              method: "POST",
              body: await file.arrayBuffer(),
              headers: { "Content-Type": "application/octet-stream" },
            });
            const data = await response.json();
            if (!response.ok) throw new ApiError(data.error);
            setCurrentDesignId(data.design_id);
            window.location.reload();
          } catch (error) {
            report(error);
          } finally {
            setLocalJob(null);
            e.target.value = "";
          }
        }}
      />

      {state &&
        dialog === "push-pull" &&
        selection?.face?.controlling_parameter && (
          <PushPullDialog
            state={state}
            parameterId={selection.face.controlling_parameter}
            run={run}
            preview={preview}
            onClose={() => setDialog(null)}
          />
        )}
      {state &&
        dialog &&
        toolList.some((t) => t.id === dialog) &&
        !["sketch"].includes(dialog) && (
          <ToolDialog
            kind={dialog}
            state={state}
            selection={selection}
            run={run}
            preview={preview}
            onClose={() => setDialog(null)}
          />
        )}
      {state && dialog === "rename" && (
        <ToolDialog
          kind="rename"
          state={state}
          selection={selection}
          run={run}
          onClose={() => setDialog(null)}
        />
      )}
      {state && editParameter && state.document.parameters[editParameter] && (
        <div className="parameter-editor-layer">
          <ParameterDialog
            key={editParameter}
            parameter={state.document.parameters[editParameter]}
            state={state}
            run={run}
            preview={preview}
            onNavigate={setEditParameter}
            onClose={() => setEditParameter(null)}
          />
        </div>
      )}
      {state && dialog === "parameters" && <ParametersWindow state={state} run={run} onClose={() => setDialog(null)} />}
      {dialog === "activity-detail" && activityAction && (
        <Modal
          title={activityAction.description}
          eyebrow="ATTRIBUTED DESIGN ACTION"
          onClose={() => setDialog(null)}
        >
          <div className="action-provenance">
            <span className={"actor-badge " + activityAction.actor.kind}>
              {activityAction.actor.name.slice(0, 1)}
            </span>
            <div>
              <strong>{activityAction.actor.name}</strong>
              <small>
                {activityAction.actor.kind} · revision {activityAction.revision}{" "}
                · {new Date(activityAction.timestamp).toLocaleString()}
              </small>
            </div>
          </div>
          <div className="property-row">
            <span>Evaluation before save</span>
            <strong>{numeric(activityAction.duration_ms)} ms</strong>
          </div>
          <div className="property-row">
            <span>Saved result</span>
            <strong>Durable committed revision</strong>
          </div>
          {activityAction.steps?.length > 0 && (
            <section className="atomic-step-list">
              <h3>
                Atomic batch · {activityAction.steps.length} inspected steps
              </h3>
              {activityAction.steps.map((step: any, index: number) => (
                <div key={index}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <strong>{step.description}</strong>
                    <small>
                      {step.arguments?.value !== undefined
                        ? "Value: " + String(step.arguments.value)
                        : step.command.replaceAll(".", " · ")}
                    </small>
                  </div>
                </div>
              ))}
            </section>
          )}
          <div className="inline-note">
            Feature creation and later edits retain separate attribution. Undo
            creates a new action and preserves this record.
          </div>
          <footer>
            <button className="button primary" onClick={() => setDialog(null)}>
              Done
            </button>
          </footer>
        </Modal>
      )}
      {dialog === "palette" && (
        <Modal
          title="Tools and actions"
          eyebrow="COMMAND SEARCH · CTRL K"
          onClose={() => setDialog(null)}
        >
          <div className="search-field palette-search">
            <Search size={18} />
            <input
              value={toolSearch}
              onChange={(e) => setToolSearch(e.target.value)}
              placeholder="Search tools, components, parameters…"
              autoFocus
            />
          </div>
          <div className="palette-results">
            {filteredTools.map((t) => (
              <button key={t.id} onClick={() => chooseTool(t.id)}>
                <t.icon size={19} />
                <span>
                  <strong>{t.label}</strong>
                  <small>{t.category}</small>
                </span>
                <ArrowUpRight size={13} />
              </button>
            ))}
            {state &&
              Object.values(state.document.parameters)
                .filter(
                  (p) =>
                    toolSearch &&
                    p.name.toLowerCase().includes(toolSearch.toLowerCase()),
                )
                .slice(0, 8)
                .map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setEditParameter(p.id);
                      setDialog(null);
                    }}
                  >
                    <SlidersHorizontal size={18} />
                    <span>
                      <strong>{p.name}</strong>
                      <small>Parameter</small>
                    </span>
                    <ArrowUpRight size={13} />
                  </button>
                ))}
          </div>
        </Modal>
      )}
      {dialog === "workspace" && <WorkspaceDialog workspace={workspace} activeDesign={currentDesignId()}
        canSwitch={!busy && !operationActive.current && !sketch && !grouping}
        onClose={() => setDialog(null)} reload={async () => { await refreshWorkspace(); await refresh(true); }} onError={report} />}
      {dialog === "references" && (
        <Modal
          title="Reference designs"
          eyebrow="NATIVE REFERENCE LIBRARY"
          wide
          onClose={() => setDialog(null)}
        >
          <div className="reference-options">
            <button onClick={() => loadRecipe("mold")}>
              <div className="reference-illustration mold-illustration">
                <Boxes size={74} strokeWidth={0.65} />
              </div>
              <span className="eyebrow">MULTI-COMPONENT · FIT STUDY</span>
              <h3>Silicone mold tooling</h3>
              <p>
                Removable printed forms, a locating base and casting master.
                Shared dimensions and explicit clearances.
              </p>
              <span className="reference-link">
                Open editable design
                <ArrowRight size={15} />
              </span>
            </button>
            <button onClick={() => loadRecipe("plate")}>
              <div className="reference-illustration plate-illustration">
                <Box size={74} strokeWidth={0.65} />
              </div>
              <span className="eyebrow">LINKED PARTS · PARAMETRIC DESIGN</span>
              <h3>Mounting plate & pins</h3>
              <p>
                Four edge-located holes, two linked pins and a reusable edge
                fillet. Change the inputs and inspect the result.
              </p>
              <span className="reference-link">
                Open editable design
                <ArrowRight size={15} />
              </span>
            </button>
          </div>
          <div className="inline-note">
            Each reference opens as a separate design in this workspace.
          </div>
        </Modal>
      )}
      {state && dialog === "agents" && (
        <Modal
          title="External agents"
          eyebrow="MCP CONNECTIONS"
          onClose={() => setDialog(null)}
        >
          <p className="dialog-copy">
            An agent uses the same modeling operations as you. Each accepted
            action is visible, attributed and autosaved in this live document.
          </p>
          <MCPSetup />
          <label className="check-field">
            <input
              type="checkbox"
              checked={followAgent}
              onChange={(e) => setFollowAgent(e.target.checked)}
            />
            Follow affected features as agents work
          </label>
          <div className="agent-list">
            {state.agents.map((agent) => (
              <section key={agent.actor.id}>
                <header>
                  <div className="actor-badge agent">
                    <Activity size={15} />
                  </div>
                  <div>
                    <strong>{agent.actor.name}</strong>
                    <small>
                      {!agent.connected
                        ? "Disconnected"
                        : agent.revoked
                          ? "Write access revoked"
                          : agent.paused
                            ? "Paused"
                            : agent.step_mode
                              ? "Step observation enabled"
                              : "Connected · write access enabled"}
                    </small>
                  </div>
                  <span
                    className={
                      "status-orb " +
                      (agent.revoked || !agent.connected ? "muted" : "")
                    }
                  />
                </header>
                <div className="agent-controls">
                  <button
                    className="button secondary small"
                    disabled={agent.revoked || !agent.connected}
                    onClick={() =>
                      controlAgent(
                        agent.actor.id,
                        agent.paused ? "resume" : "pause",
                      )
                    }
                  >
                    {agent.paused ? <Play size={13} /> : <Pause size={13} />}{" "}
                    {agent.paused ? "Resume" : "Pause"}
                  </button>
                  <button
                    className="button secondary small"
                    disabled={agent.revoked || !agent.connected}
                    onClick={() =>
                      controlAgent(
                        agent.actor.id,
                        agent.step_mode ? "step" : "step_mode",
                      )
                    }
                  >
                    <SkipForward size={13} />
                    {agent.step_mode
                      ? "Continue one action"
                      : "Observe step by step"}
                  </button>
                  <button
                    className="text-button danger"
                    disabled={agent.revoked || !agent.connected}
                    onClick={() => controlAgent(agent.actor.id, "revoke")}
                  >
                    Revoke
                  </button>
                </div>
              </section>
            ))}
            {!state.agents.length && (
              <div className="no-agents">
                <Activity size={25} />
                <strong>No external agents connected</strong>
                <span>Manual modeling is fully available.</span>
              </div>
            )}
          </div>
        </Modal>
      )}
      {state && dialog === "checkpoints" && (
        <Modal
          title="Saved checkpoints"
          eyebrow="RECOVERABLE DESIGN HISTORY"
          onClose={() => setDialog(null)}
        >
          <p className="dialog-copy">
            Autosave preserves edits. Checkpoints name a design revision you can
            return to. Feature rollback instead shows an earlier build stage
            with current parameter values.
          </p>
          <button
            className="button secondary full"
            onClick={() => chooseTool("checkpoint")}
          >
            <Plus size={14} />
            Create a checkpoint
          </button>
          <div className="checkpoint-list">
            {state.checkpoints.map((c) => (
              <div key={c.name}>
                <History size={17} />
                <span>
                  <strong>{c.name}</strong>
                  <small>Revision {c.revision}</small>
                </span>
                <button
                  className="button secondary small"
                  disabled={busy}
                  onClick={() =>
                    run("checkpoint.restore", { name: c.name })
                      .then(() => setDialog(null))
                      .catch(() => {})
                  }
                >
                  Restore
                </button>
              </div>
            ))}
            {!state.checkpoints.length && (
              <p className="empty-copy">No named checkpoints yet.</p>
            )}
          </div>
        </Modal>
      )}
      {state && dialog === "export-settings" && (
        <ExportDialog
          state={state}
          selected={selectionSet}
          onExport={exportSTL}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "exports" && exports && (
        <Modal
          title="STL export complete"
          eyebrow="VALIDATED STL EXPORT"
          onClose={() => setDialog(null)}
        >
          <div className="export-success">
            <CheckCheck size={25} />
            <div>
              <strong>{exports.files.length} separate STL files</strong>
              <span>
                Revision {exports.receipt.revision} · millimeter coordinates ·{" "}
                {exports.receipt.linear_deflection_mm} mm deflection
              </span>
            </div>
          </div>
          <div className="export-files">
            {exports.receipt.files.map((f: any) => (
              <a
                href={designUrl(
                  "/api/exports/" +
                  exports.export_id +
                  "/" +
                  encodeURIComponent(f.filename)
                )}
                download
                key={f.filename}
              >
                <Box size={17} />
                <span>
                  <strong>{f.filename}</strong>
                  <small>
                    {numeric(f.triangles, 0)} triangles · closed mesh topology
                  </small>
                </span>
                <ArrowDownToLine size={16} />
              </a>
            ))}
          </div>
          <div className="inline-note">
            Validated native solid, float32 mesh topology and nonadjacent
            triangle intersections. The receipt records numerical coverage.
          </div>
          <footer>
            <a
              className="button secondary"
              href={designUrl("/api/exports/" + exports.export_id + "/receipt.json")}
              download
            >
              Download receipt
            </a>
            <a
              className="button primary"
              href={designUrl("/api/exports/" + exports.export_id)}
              download
            >
              <Download size={15} />
              Download all parts
            </a>
          </footer>
        </Modal>
      )}
      {appearance && state?.document.components[appearance.definition] && (
        <ComponentAppearance
          key={appearance.definition}
          component={state.document.components[appearance.definition]}
          x={appearance.x}
          y={appearance.y}
          focusName={appearance.focusName}
          linkedCount={
            state.occurrences.filter(
              (o) => o.definition === appearance.definition,
            ).length
          }
          run={run}
          onPreview={(color) =>
            setColorPreview(
              color ? { definition: appearance.definition, color } : null,
            )
          }
          onClose={() =>
            setAppearance((current) =>
              current === appearance ? null : current,
            )
          }
        />
      )}
      {contextMenu &&
        (() => {
          const item = contextMenu.selection;
          const part = item && state?.document.components[item.definition];
          const occurrence =
            item && state?.occurrences.find((o) => o.id === item.occurrence);
          const editingDisabled = treeEditingDisabled;
          const actions: ContextAction[] = [];
          if (part && occurrence) {
            if (part.kind === "assembly") {
              actions.push({
                label: "Add component inside group",
                disabled: editingDisabled,
                action: () => void createTreeItem(occurrence.id, "solid"),
              });
              actions.push({
                label: "Add subgroup",
                disabled: editingDisabled,
                action: () => void createTreeItem(occurrence.id, "assembly"),
              });
            } else if (part.purpose !== "tool") {
              actions.push({
                label: "Create group around component",
                disabled: editingDisabled || !!occurrence.pattern_mode,
                action: () => {
                  void run("group.create", {
                    occurrences: [occurrence.id],
                    name: `${part.name} group`,
                  }).catch(() => {});
                },
              });
            }
            actions.push({
              label: "Name & color…",
              hint: "F2",
              disabled: editingDisabled,
              action: () =>
                setAppearance({
                  definition: part.id,
                  x: contextMenu.x,
                  y: contextMenu.y,
                  focusName: true,
                }),
            });
            if (item.edge) {
              actions.push({
                label: "Fillet selected edge…",
                disabled: editingDisabled,
                action: () => chooseTool("fillet"),
              });
              actions.push({
                label: "Chamfer selected edge…",
                disabled: editingDisabled,
                action: () => chooseTool("chamfer"),
              });
            }
            if (item.face?.controlling_parameter)
              actions.push({
                label: "Edit face dimension…",
                disabled: editingDisabled,
                action: () =>
                  setEditParameter(item.face!.controlling_parameter!),
              });
            actions.push({
              label: "Move Component",
              disabled: editingDisabled,
              action: () => chooseTool("transform"),
            });
            actions.push({
              label: occurrence.visible ? "Hide component" : "Show component",
              disabled: editingDisabled,
              action: () => {
                void run("instance.visibility", {
                  id: occurrence.source_id,
                  visible: !occurrence.visible,
                }).catch(() => {});
              },
            });
            actions.push({
              label: "Component organization…",
              disabled: editingDisabled || !!featureEdit || !!operation || !!move,
              action: () => setDialog("component-actions"),
            });
            actions.push({
              label: "Clear selection",
              action: () => select(null),
            });
          }
          actions.push({
            label: "Fit design",
            hint: "F",
            action: () => viewRef.current?.fit(),
          });
          if (!part) {
            actions.push({
              label: "Create component…",
              disabled: editingDisabled,
              action: () => void createTreeItem("", "solid"),
            });
            actions.push({
              label: "Create group",
              disabled: editingDisabled,
              action: () => void createTreeItem("", "assembly"),
            });
            actions.push({
              label: grid ? "Hide grid" : "Show grid",
              hint: "G",
              action: () => setGrid((v) => !v),
            });
          }
          return (
            <ContextMenu
              x={contextMenu.x}
              y={contextMenu.y}
              title={part?.name || "Workspace"}
              actions={actions}
              onClose={() => setContextMenu(null)}
            />
          );
        })()}
      {state && dialog === "component-actions" && component && (
        <ComponentActions
          state={state}
          selection={selection!}
          run={run}
          onClose={() => setDialog(null)}
          onDeleted={() => {
            setSelection(null);
            setSelectionSet([]);
            setDialog(null);
          }}
        />
      )}
      {dialog === "history-confirm" && state && selectedFeature && (
        <Modal
          title="Compute this build stage?"
          eyebrow="COST-AWARE HISTORY"
          onClose={() => setDialog(null)}
        >
          <p className="dialog-copy">
            This uncached path may take time to rebuild. Computation runs in the
            isolated geometry worker; you can cancel while keeping the last
            saved design.
          </p>
          <footer>
            <button
              className="button secondary"
              onClick={() => setDialog(null)}
            >
              Keep current view
            </button>
            <button
              className="button primary"
              onClick={() => computeStage(selectedFeature)}
            >
              <Play size={14} />
              Compute explicitly
            </button>
          </footer>
        </Modal>
      )}
      {dialog === "settings" && state && (
        <Modal
          title="Workspace preferences"
          eyebrow="SETTINGS"
          onClose={() => setDialog(null)}
        >
          <label className="field">
            <span>Display units</span>
            <select
              value={unit}
              onChange={(e) =>
                run("document.units", { units: e.target.value }).catch(() => {})
              }
            >
              <option value="mm">Millimeters</option>
              <option value="in">Inches</option>
            </select>
            <small className="field-help">
              Changing display units does not alter geometry. Expressions use
              explicit units or canonical mm/degrees.
            </small>
          </label>
          <ToolbarSettings />
          <div className="inline-note">
            <Save size={16} />
            Every accepted action is committed durably before Saved is shown.
            The readable YAML snapshot updates automatically.
          </div>
          <footer>
            <button className="button primary" onClick={() => setDialog(null)}>
              Done
            </button>
          </footer>
        </Modal>
      )}
    </div>
    </NamedParameterProvider>
  );
}

function ExportDialog({
  state,
  selected,
  onExport,
  onClose,
}: {
  state: State;
  selected: string[];
  onExport: (options: any) => Promise<void>;
  onClose: () => void;
}) {
  const parts = state.occurrences.filter(
    (o) =>
      o.kind !== "assembly" &&
      state.document.components[o.definition]?.purpose !== "tool" &&
      !o.suppressed,
  );
  const [chosen, setChosen] = useState(
    selected.length
      ? selected
      : parts.filter((o) => o.kind === "solid").map((o) => o.id),
  );
  const [frame, setFrame] = useState("part");
  const [tolerance, setTolerance] = useState("0.03");
  const [angular, setAngular] = useState("0.1");
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title="Export STL"
      eyebrow={"STL · REVISION " + state.document.revision}
      onClose={onClose}
    >
      <p className="dialog-copy">
        Each selected physical part gets its own STL. The export receipt records
        units, coordinate frames, mesh settings and validation.
      </p>
      <div className="export-selection-actions">
        <button
          className="text-button"
          onClick={() =>
            setChosen(parts.filter((o) => o.kind === "solid").map((o) => o.id))
          }
        >
          Select all solid instances
        </button>
        <button className="text-button" onClick={() => setChosen([])}>
          Clear selection
        </button>
      </div>
      <div className="export-selection-list">
        {parts.map((o, index) => (
          <label className="check-field" key={o.id}>
            <input
              type="checkbox"
              checked={chosen.includes(o.id)}
              onChange={(e) =>
                setChosen((current) =>
                  e.target.checked
                    ? [...current, o.id]
                    : current.filter((id) => id !== o.id),
                )
              }
            />
            <span>
              {state.document.components[o.definition].name}
              <small>
                instance {index + 1} ·{" "}
                {o.kind === "solid"
                  ? "solid part"
                  : "planar — convert before STL"}
              </small>
            </span>
          </label>
        ))}
      </div>
      <label className="field">
        <span>Coordinate frame</span>
        <select value={frame} onChange={(e) => setFrame(e.target.value)}>
          <option value="part">
            Local part coordinates · recommended for printing
          </option>
          <option value="assembly">Preserve assembly placement</option>
        </select>
      </label>
      <div className="field-grid">
        <label className="field">
          <span>Linear deflection (mm)</span>
          <input
            type="number"
            min="0.001"
            max="1"
            step="0.001"
            value={tolerance}
            onChange={(e) => setTolerance(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Angular deflection (radians)</span>
          <input
            type="number"
            min="0.01"
            max="0.5"
            step="0.01"
            value={angular}
            onChange={(e) => setAngular(e.target.value)}
          />
        </label>
      </div>
      <div className="segmented">
        {[
          ["0.2", "Draft"],
          ["0.03", "Fine"],
          ["0.005", "Very fine"],
        ].map(([value, label]) => (
          <button
            key={value}
            className={tolerance === value ? "active" : ""}
            onClick={() => setTolerance(value)}
          >
            {label} · {value} mm
          </button>
        ))}
      </div>
      <div className="inline-note">
        The requested mesh tolerance is separate from manufacturing tolerance.
        STL coordinates are written in millimeters.
      </div>
      <footer>
        <button className="button secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="button primary"
          disabled={!chosen.length || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await onExport({
                instance_ids: chosen,
                frame,
                tolerance: Number(tolerance),
                angular: Number(angular),
              });
            } finally {
              setBusy(false);
            }
          }}
        >
          <Download size={14} />
          {busy ? "Validating…" : "Validate and export"}
        </button>
      </footer>
    </Modal>
  );
}

function PushPullDialog({
  state,
  parameterId,
  run,
  preview,
  onClose,
}: {
  state: State;
  parameterId: string;
  run: (name: string, args: any) => Promise<any>;
  preview: (name: string, args: any) => Promise<any>;
  onClose: () => void;
}) {
  const [value, setValue] = useState("2 mm");
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const p = state.document.parameters[parameterId];
  return (
    <Modal
      title="Push / pull"
      eyebrow="EDIT THE GENERATING DIMENSION"
      onClose={onClose}
    >
      <p className="dialog-copy">
        This face is driven by <strong>{p.name}</strong>. The offset edits that
        dimension and keeps its consumers visible. Derived expressions retain
        their dependencies.
      </p>
      <label className="field">
        <span>Offset along the generating direction</span>
        <input
          aria-label="Exact face offset"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setResult(null);
          }}
        />
        <small className="field-help">
          Use a positive or negative length, with explicit units.
        </small>
      </label>
      <div className="current-value">
        <span>Current dimension</span>
        <strong>
          {numeric(state.parameter_graph[p.id].value, 4)} <small>mm</small>
        </strong>
      </div>
      {result && (
        <div className="preview-report">
          <Check size={15} />
          <span>
            Validated resulting dimension:{" "}
            {numeric(result.parameter_values[p.id], 4)} mm. Other dependent
            features are checked.
          </span>
        </div>
      )}
      <footer>
        <button
          className="button secondary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              setResult(
                await preview("parameter.offset", { id: p.id, delta: value }),
              );
            } catch {
            } finally {
              setBusy(false);
            }
          }}
        >
          Preview impact
        </button>
        <button
          className="button primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await run("parameter.offset", { id: p.id, delta: value });
              onClose();
            } catch {
            } finally {
              setBusy(false);
            }
          }}
        >
          Apply exact offset
          <ArrowRight size={14} />
        </button>
      </footer>
    </Modal>
  );
}

function ComponentActions({
  state,
  selection,
  run,
  onClose,
  onDeleted,
}: {
  state: State;
  selection: Selection;
  run: (name: string, args: any) => Promise<any>;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const component = state.document.components[selection.definition];
  const occurrence = state.occurrences.find(
    (i) => i.id === selection.occurrence,
  );
  const [name, setName] = useState(component.name);
  const [color, setColor] = useState(component.color);
  return (
    <Modal
      title={component.name}
      eyebrow="COMPONENT ORGANIZATION"
      onClose={onClose}
    >
      <form
        className="component-form-rename"
        onSubmit={(e) => {
          e.preventDefault();
          run("component.rename", { id: component.id, name, color })
            .then(onClose)
            .catch(() => {});
        }}
      >
        <div className="field-grid">
          <label className="field">
            <span>Part name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="field">
            <span>Display color</span>
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
            />
          </label>
        </div>
        <button className="button secondary small">Update part identity</button>
      </form>
      <div className="project-menu">
        <button
          onClick={() =>
            run(
              component.kind === "assembly"
                ? "group.copy"
                : "component.duplicate",
              component.kind === "assembly"
                ? { occurrence: selection.occurrence }
                : { id: component.id, placement: { x: 30 } },
            )
              .then(onClose)
              .catch(() => {})
          }
        >
          <Copy />
          <span>
            <strong>
              {component.kind === "assembly"
                ? "Copy group"
                : "Repeat linked component"}
            </strong>
            <small>
              {component.kind === "assembly"
                ? "Independent group structure; part geometry stays linked."
                : "Keep one shared definition; starts at X = 30 mm."}
            </small>
          </span>
        </button>
        <button
          disabled={!occurrence || component.kind === "assembly"}
          onClick={() =>
            run("component.independent", {
              instance_id: occurrence?.source_id,
              pattern_index: occurrence?.pattern_index,
            })
              .then(onClose)
              .catch(() => {})
          }
        >
          <Unlink />
          <span>
            <strong>Make this instance independent</strong>
            <small>A new editable definition retains source provenance.</small>
          </span>
        </button>
        <button
          disabled={!occurrence}
          onClick={() =>
            run("instance.suppress", {
              id: occurrence?.source_id,
              suppressed: !occurrence?.suppressed,
            })
              .then(onClose)
              .catch(() => {})
          }
        >
          <EyeOff />
          <span>
            <strong>
              {occurrence?.suppressed ? "Restore" : "Suppress"} manufactured
              instance
            </strong>
            <small>
              Suppression changes quantities; hiding only changes display.
            </small>
          </span>
        </button>
        <button
          className="danger"
          onClick={() =>
            run("component.delete", { id: component.id })
              .then(onDeleted)
              .catch(() => {})
          }
        >
          <Trash2 />
          <span>
            <strong>Delete this component and its instances</strong>
            <small>
              Protected if other parts depend on it. Undo remains available.
            </small>
          </span>
        </button>
      </div>
    </Modal>
  );
}
