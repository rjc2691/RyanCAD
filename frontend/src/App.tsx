import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Axis3D,
  Box,
  Boxes,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  ChevronsLeftRight,
  Circle,
  Clock3,
  Command,
  Component as ComponentIcon,
  Copy,
  Cuboid,
  Download,
  Ellipsis,
  Expand,
  Eye,
  EyeOff,
  FilePlus2,
  FolderOpen,
  GitBranch,
  Grid2X2,
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
import SketchEditor from "./SketchEditor";
import { api, ApiError, expressionLabel, numeric, waitJob } from "./api";
import type { Feature, Parameter, Selection, State } from "./types";

const toolList = [
  { id: "stock", label: "Stock thickness", icon: Layers, category: "Profiles" },
  { id: "sketch", label: "Sketch", icon: SquareDashed, category: "Construct" },
  { id: "box", label: "Box", icon: Box, category: "Construct" },
  { id: "cylinder", label: "Cylinder", icon: Circle, category: "Construct" },
  { id: "rectangle", label: "Rectangle", icon: Square, category: "Profiles" },
  { id: "circle", label: "Circle profile", icon: Circle, category: "Profiles" },
  { id: "extrude", label: "Extrude", icon: ArrowUpRight, category: "Shape" },
  { id: "revolve", label: "Revolve", icon: RotateCcw, category: "Shape" },
  { id: "holes", label: "Hole", icon: Target, category: "Shape" },
  { id: "fillet", label: "Fillet", icon: ComponentIcon, category: "Refine" },
  { id: "chamfer", label: "Chamfer", icon: Triangle, category: "Refine" },
  { id: "duplicate", label: "Repeat part", icon: Copy, category: "Organize" },
  {
    id: "pattern",
    label: "Connected pattern",
    icon: Grid2X2,
    category: "Shape",
  },
  {
    id: "component_pattern",
    label: "Component pattern",
    icon: Boxes,
    category: "Organize",
  },
  {
    id: "transform",
    label: "Exact placement",
    icon: Move3D,
    category: "Organize",
  },
  {
    id: "mirror",
    label: "Mirror part",
    icon: ChevronsLeftRight,
    category: "Shape",
  },
  { id: "boolean", label: "Boolean", icon: Boxes, category: "Shape" },
  {
    id: "parameter",
    label: "Shared parameter",
    icon: SlidersHorizontal,
    category: "Organize",
  },
  {
    id: "assembly",
    label: "Assembly group",
    icon: FolderOpen,
    category: "Organize",
  },
  { id: "fit", label: "Fit relationship", icon: Ruler, category: "Inspect" },
  {
    id: "measure",
    label: "Measure between parts",
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
const featureIcon: Record<string, any> = {
  box: Box,
  cylinder: Circle,
  rectangle: Square,
  circle: Circle,
  sketch: SquareDashed,
  extrude: ArrowUpRight,
  holes: Target,
  fillet: ComponentIcon,
  chamfer: Triangle,
  pattern: Grid2X2,
  revolve: RotateCcw,
  mirror: ChevronsLeftRight,
  boolean: Boxes,
};

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
  const [state, setState] = useState<State | null>(null);
  const stateRef = useRef<State | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [selectionSet, setSelectionSet] = useState<string[]>([]);
  const [selectedFeature, setSelectedFeature] = useState<string | null>(null);
  const [dialog, setDialog] = useState<string | null>(null);
  const [editParameter, setEditParameter] = useState<string | null>(null);
  const [sketchFeature, setSketchFeature] = useState<Feature | undefined>();
  const [error, setError] = useState<any>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [localJob, setLocalJob] = useState<any>(null);
  const [paramFilter, setParamFilter] = useState("roots");
  const [paramSearch, setParamSearch] = useState("");
  const [toolSearch, setToolSearch] = useState("");
  const [timelineTab, setTimelineTab] = useState("features");
  const [activityAction, setActivityAction] = useState<any>(null);
  const [olderActions, setOlderActions] = useState<any[]>([]);
  const [grid, setGrid] = useState(true);
  const [section, setSection] = useState(false);
  const [explode, setExplode] = useState(0);
  const [historyView, setHistoryView] = useState<any>(null);
  const [exports, setExports] = useState<any>(null);
  const [followAgent, setFollowAgent] = useState(true);
  const [connectionError, setConnectionError] = useState(false);
  const [leftVisible, setLeftVisible] = useState(true);
  const [rightVisible, setRightVisible] = useState(true);
  const viewRef = useRef<ViewportHandle>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const runRef = useRef<any>(null);
  const lastSequence = useRef(-1);
  const statePoll = useRef(false);

  const refresh = useCallback(async (force = false) => {
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
  useEffect(() => {
    refresh(true);
    const timer = setInterval(() => refresh(), 650);
    return () => clearInterval(timer);
  }, [refresh]);
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
            request_id: crypto.randomUUID(),
          }),
        });
        const result = await waitJob(submission, setLocalJob);
        const next = await refresh(true);
        setHistoryView(null);
        if (next) {
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
        if (result.instance_id && next) {
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
        } else if (result.component_id && next) {
          const occurrence = next.occurrences.find(
            (i) => i.definition === result.component_id,
          );
          if (occurrence)
            setSelection({
              occurrence: occurrence.id,
              definition: occurrence.definition,
            });
        }
        if (result.feature_id) {
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
            request_id: crypto.randomUUID(),
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

  const select = (item: Selection | null, add = false) => {
    setSelection(item);
    setSelectedFeature(null);
    if (!item) setSelectionSet([]);
    else
      setSelectionSet((current) =>
        add
          ? Array.from(new Set([...current, item.occurrence]))
          : [item.occurrence],
      );
  };
  const chooseTool = (kind: string) => {
    setToolSearch("");
    if (kind === "sketch") {
      setSketchFeature(undefined);
      setDialog("sketch");
    } else setDialog(kind);
  };
  const loadRecipe = async (recipe: string) => {
    try {
      await run("recipe.load", { recipe, replace: true });
      setSelection(null);
      setSelectedFeature(null);
      setDialog(null);
      setTimeout(() => viewRef.current?.fit(), 350);
    } catch {}
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
  const computeStage = async (id: string) => {
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
      const input = (event.target as HTMLElement).closest(
        "input,textarea,select,[contenteditable=true]",
      );
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setDialog("palette");
        return;
      }
      if (event.key === "Escape") {
        setDialog(null);
        setEditParameter(null);
        setError(null);
        return;
      }
      if (input) return;
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        runRef
          .current?.(event.shiftKey ? "history.redo" : "history.undo")
          .catch(() => {});
        return;
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        window.open("/api/native", "_self");
        return;
      }
      if (event.key.toLowerCase() === "f") viewRef.current?.fit();
      if (event.key.toLowerCase() === "g") setGrid((v) => !v);
      if (event.key === "1") viewRef.current?.view("front");
      if (event.key === "2") viewRef.current?.view("right");
      if (event.key === "7") viewRef.current?.view("top");
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
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
  useEffect(() => {
    if (historyView && historyView.revision !== state?.document.revision)
      setHistoryView(null);
  }, [state?.document.revision, historyView]);
  const feature =
    state && selectedFeature ? state.document.features[selectedFeature] : null;
  const busyJobs =
    state?.jobs.filter((j) =>
      ["queued", "running", "waiting"].includes(j.status),
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
  const params = state ? Object.values(state.document.parameters) : [];
  const filteredParams = params
    .filter((p) => {
      const info = state!.parameter_graph[p.id];
      if (
        paramSearch &&
        !`${p.name} ${p.category} ${p.description}`
          .toLowerCase()
          .includes(paramSearch.toLowerCase())
      )
        return false;
      return paramFilter === "roots"
        ? info.root
        : paramFilter === "shared"
          ? p.owner === "root"
          : paramFilter === "component"
            ? p.owner === component?.id
            : paramFilter === "favorites"
              ? p.favorite
              : paramFilter === "unused"
                ? info.use_count === 0
                : true;
    })
    .sort(
      (a, b) =>
        Number(b.owner === "root") - Number(a.owner === "root") ||
        Number(b.favorite) - Number(a.favorite) ||
        a.name.localeCompare(b.name),
    );
  const filteredTools = toolList.filter((t) =>
    `${t.label} ${t.category}`.toLowerCase().includes(toolSearch.toLowerCase()),
  );
  const featureOrder = state?.document.feature_order || [];
  const visibleFeatures = featureOrder.map(
    (id) => state!.document.features[id],
  );
  const documentName = state?.document.name || "Opening your workspace…";

  // External activity is observable without forcing camera movement or selection changes.
  const previousAction = useRef("");
  useEffect(() => {
    const action = state?.actions[0];
    if (action && action.id !== previousAction.current) {
      previousAction.current = action.id;
      if (action.actor.kind === "agent" && followAgent) {
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

  return (
    <div
      className={
        "app-shell " +
        (!leftVisible ? "left-hidden " : "") +
        (!rightVisible ? "right-hidden" : "")
      }
    >
      <header className="app-header">
        <button
          className="brand"
          onClick={() => setDialog("project")}
          title="Project menu"
        >
          <Logo />
          <span>
            RYAN<span>CAD</span>
          </span>
          <ChevronDown size={12} />
        </button>
        <div className="project-heading">
          <span className="project-breadcrumb">
            LOCAL WORKSPACE <ChevronRight size={11} />
          </span>
          <button onClick={() => setDialog("rename")}>
            {documentName}
            <ChevronDown size={13} />
          </button>
        </div>
        <button className="command-search" onClick={() => setDialog("palette")}>
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
          <button
            className="button export-button"
            onClick={() => setDialog("export-settings")}
            disabled={!state || busy || !state.summary.instances}
          >
            <Download size={15} />
            Export STL
            <ChevronDown size={12} />
          </button>
          <div className="avatar" title="Local human session">
            R
          </div>
        </div>
      </header>
      <nav className="tool-strip" aria-label="Modeling tools">
        <div className="workspace-tab">
          <Cuboid size={16} />
          <span>Design</span>
        </div>
        <div className="tool-divider" />
        {toolList
          .filter((t) =>
            [
              "sketch",
              "extrude",
              "holes",
              "fillet",
              "duplicate",
              "transform",
            ].includes(t.id),
          )
          .map((t) => (
            <button
              key={t.id}
              className="tool-button"
              onClick={() => chooseTool(t.id)}
              disabled={!state || busy || !!historyView}
            >
              <t.icon size={19} />
              <span>{t.label}</span>
            </button>
          ))}
        <button
          className="tool-button more-tools"
          onClick={() => setDialog("palette")}
        >
          <Grid2X2 size={18} />
          <span>All tools</span>
          <ChevronDown size={11} />
        </button>
        <div className="tool-divider" />
        <button
          className="tool-button parameters-tool"
          onClick={() => setDialog("parameters")}
          disabled={!state}
        >
          <SlidersHorizontal size={18} />
          <span>Parameters</span>
        </button>
        <div className="toolbar-spacer" />
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
        <div className="tool-divider" />
        <button
          className="icon-button"
          title="Workspace settings"
          aria-label="Workspace settings"
          onClick={() => setDialog("settings")}
        >
          <Settings2 size={17} />
        </button>
      </nav>

      {leftVisible && (
        <aside className="left-panel">
          <div className="panel-title">
            <span>DESIGN STRUCTURE</span>
            <button
              className="icon-button"
              aria-label="Hide component panel"
              onClick={() => setLeftVisible(false)}
            >
              <PanelLeftClose size={14} />
            </button>
          </div>
          <div className="structure-root" onClick={() => select(null)}>
            <ChevronDown size={13} />
            <Boxes size={18} />
            <strong>{state?.document.name.split(" · ")[0] || "Design"}</strong>
            <span>{state?.summary.instances || 0}</span>
          </div>
          <div className="tree-list">
            {state?.occurrences.map((o) => {
              const c = state.document.components[o.definition];
              const active = selection?.occurrence === o.id;
              const count = state.occurrences.filter(
                (i) => i.definition === o.definition && !i.suppressed,
              ).length;
              return (
                <div
                  className={
                    "component-row " +
                    (active ? "selected " : "") +
                    (!o.visible || o.suppressed ? "muted" : "")
                  }
                  key={o.id}
                  style={{
                    paddingLeft:
                      15 + Math.max(0, o.id.split("/").length - 1) * 12,
                  }}
                >
                  <button
                    className="component-select"
                    onClick={() => {
                      select({ occurrence: o.id, definition: o.definition });
                      setRightVisible(true);
                    }}
                  >
                    <span
                      className="component-swatch"
                      style={{ background: c.color }}
                    />
                    {o.kind === "assembly" ? (
                      <FolderOpen size={15} />
                    ) : (
                      <ComponentIcon size={15} />
                    )}
                    <span>{c.name}</span>
                    {count > 1 && (
                      <span className="instance-count">
                        <Link2 size={10} />
                        {count}
                      </span>
                    )}
                  </button>
                  <button
                    className="tree-eye"
                    title={o.visible ? "Hide in viewport" : "Show in viewport"}
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
              );
            })}
          </div>
          <button
            className="create-part"
            onClick={() => chooseTool("box")}
            disabled={!state || busy}
          >
            <Plus size={15} />
            Create component
            <ChevronRight size={13} />
          </button>
          <div className="panel-rule" />
          <button
            className="structure-section"
            onClick={() => {
              setParamFilter("roots");
              setDialog("parameters");
            }}
          >
            <ChevronRight size={12} />
            <SlidersHorizontal size={15} />
            <span>Design inputs</span>
            <small>
              {params.filter((p) => state!.parameter_graph[p.id].root).length}
            </small>
          </button>
          <button
            className="structure-section"
            onClick={() => setDialog("fits")}
          >
            <ChevronRight size={12} />
            <Ruler size={15} />
            <span>Tolerances & fits</span>
            <small>{state?.fits.length || 0}</small>
          </button>
          <button
            className="structure-section"
            onClick={() => setDialog("checkpoints")}
          >
            <ChevronRight size={12} />
            <History size={15} />
            <span>Checkpoints</span>
            <small>{state?.checkpoints.length || 0}</small>
          </button>
          <div className="left-panel-bottom">
            <div className="design-health">
              <span className="status-orb" />
              <div>
                <strong>
                  {state?.summary.instances
                    ? "Design is organized"
                    : "Ready to create"}
                </strong>
                <span>
                  {state?.summary.definitions || 0} unique parts ·{" "}
                  {state?.summary.instances || 0} placed instances
                </span>
              </div>
              <ShieldCheck size={18} />
            </div>
            <div className="reference-card">
              <span className="eyebrow">NATIVE REFERENCE DESIGNS</span>
              <button onClick={() => setDialog("references")}>
                Start with something useful
                <ArrowUpRight size={15} />
              </button>
              <p>Editable dimensions. Real solid geometry.</p>
            </div>
            <div className="local-footer">
              <span className="status-orb small" />
              LOCAL ENGINE<span>v0.1</span>
            </div>
          </div>
        </aside>
      )}

      <main className="viewport-area">
        <Viewport
          ref={viewRef}
          geometry={historyView?.components || state?.geometry || {}}
          occurrences={state?.occurrences || []}
          revision={state?.document.revision || 0}
          selected={selection}
          onSelect={select}
          explode={explode}
          grid={grid}
          section={section}
          historyKey={historyView?.history_key}
        />
        <div className="viewport-top">
          <div className="viewport-context">
            <span className="eyebrow">
              {historyView ? "HISTORY INSPECTION" : "ASSEMBLY WORKSPACE"}
            </span>
            <div>
              <span className="status-orb small" />
              {historyView
                ? "Earlier build stage · current parameter values"
                : section
                  ? "Section view · clipped display"
                  : "Orthographic · precise geometry"}
            </div>
          </div>
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
              {state?.document.features[historyView.feature_id]?.name}
            </span>
            <button onClick={() => setHistoryView(null)}>
              Return to present
              <ArrowRight size={14} />
            </button>
          </div>
        )}
        {!state?.summary.instances && !busy && (
          <div className="empty-workspace">
            <Logo />
            <span className="eyebrow">PRECISION STARTS WITH INTENT</span>
            <h1>Make your next idea tangible.</h1>
            <p>
              Create a dimensioned part, or explore a fully editable reference
              design.
            </p>
            <div>
              <button
                className="button primary"
                onClick={() => chooseTool("box")}
              >
                <Plus size={16} />
                Create a part
              </button>
              <button
                className="button secondary"
                onClick={() => loadRecipe("mold")}
              >
                Explore mold tooling
                <ArrowRight size={15} />
              </button>
            </div>
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
        <div className="viewport-bottom">
          <div className="axis-widget">
            <svg width="58" height="57" viewBox="0 0 58 57">
              <path
                d="M27 38 49 45M27 38 9 49M27 38 27 10"
                stroke="#637084"
                strokeWidth="1.5"
              />
              <circle cx="27" cy="38" r="3" fill="#c4d0de" />
              <text x="47" y="55" fill="#d18b91">
                X
              </text>
              <text x="2" y="56" fill="#86b79c">
                Y
              </text>
              <text x="24" y="8" fill="#85b4dc">
                Z
              </text>
            </svg>
            <span>{unit}</span>
          </div>
          <div className="navigation-hint">
            <MousePointer2 size={12} />
            <span>
              Drag to orbit <b>·</b> Right-drag to pan <b>·</b> Scroll to zoom
            </span>
          </div>
          <div className="viewport-options">
            <button
              className={section ? "active" : ""}
              title="Toggle display section"
              onClick={() => setSection((v) => !v)}
            >
              <ScanLine size={16} />
            </button>
            <button
              className={grid ? "active" : ""}
              title="Toggle grid · G"
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
            <span />
            <label title="Exploded display only; does not alter placements">
              <Boxes size={15} />
              <input
                aria-label="Exploded display"
                type="range"
                min="0"
                max="45"
                value={explode}
                onChange={(e) => setExplode(Number(e.target.value))}
              />
            </label>
          </div>
        </div>
        <div className="metric-dock">
          <div>
            <ComponentIcon size={15} />
            <span>{historyView ? "CURRENT COMPONENTS" : "COMPONENTS"}</span>
            <strong>
              {state?.summary.instances || 0}
              <small> / {state?.summary.definitions || 0} unique</small>
            </strong>
          </div>
          <div>
            <Box size={15} />
            <span>
              {historyView ? "CURRENT MATERIAL VOLUME" : "MATERIAL VOLUME"}
            </span>
            <strong>
              {numeric((state?.summary.volume_mm3 || 0) / 1000)}
              <small>cm³</small>
            </strong>
          </div>
          <div>
            <Square size={15} />
            <span>{historyView ? "CURRENT SURFACE AREA" : "SURFACE AREA"}</span>
            <strong>
              {numeric((state?.summary.area_mm2 || 0) / 100)}
              <small>cm²</small>
            </strong>
          </div>
          <div>
            <GitBranch size={15} />
            <span>DESIGN REVISION</span>
            <strong>
              {String(state?.document.revision || 0).padStart(3, "0")}
              <small>autosaved</small>
            </strong>
          </div>
        </div>
      </main>

      {rightVisible && (
        <aside className="inspector-panel">
          <div className="panel-title">
            <span>INSPECTOR</span>
            <button
              className="icon-button"
              aria-label="Hide inspector"
              onClick={() => setRightVisible(false)}
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
                    <ComponentIcon size={23} />
                  </div>
                  <div>
                    <span className="eyebrow">
                      {component.kind === "planar"
                        ? "PLANAR PART"
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
                  {geometry?.status === "valid"
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
                  <div className="property-row">
                    <span>Volume</span>
                    <strong>
                      {geometry?.volume
                        ? numeric(geometry.volume / 1000) + " cm³"
                        : "Not a solid"}
                    </strong>
                  </div>
                  <div className="property-row">
                    <span>Surface area</span>
                    <strong>
                      {geometry?.area
                        ? numeric(geometry.area / 100) + " cm²"
                        : "—"}
                    </strong>
                  </div>
                </section>
                {component.kind === "planar" && (
                  <section className="inspector-section">
                    <div className="section-heading">
                      <h3>Planar stock</h3>
                      <span className="mini-badge">one physical part</span>
                    </div>
                    <div className="property-row">
                      <span>Thickness</span>
                      <strong>
                        {geometry?.stock_thickness_mm
                          ? length(geometry.stock_thickness_mm) + " " + unit
                          : "Unspecified"}
                      </strong>
                    </div>
                    <button
                      className="button secondary full"
                      onClick={() => setDialog("stock")}
                    >
                      Set stock thickness
                    </button>
                    {geometry?.thickness_preview && (
                      <p className="field-help">
                        Showing stock preview. Area and bounds describe the
                        nominal planar region; no solid volume is counted.
                      </p>
                    )}
                  </section>
                )}
                {selection?.face && (
                  <section className="inspector-section selected-face">
                    <div className="section-heading">
                      <h3>Selected face</h3>
                      <span className="mini-badge">
                        {selection.face.type.toLowerCase()}
                      </span>
                    </div>
                    <div className="property-row">
                      <span>Face area</span>
                      <strong>{numeric(selection.face.area)} mm²</strong>
                    </div>
                    <div className="property-row">
                      <span>Center · local mm</span>
                      <strong>
                        {selection.face.center
                          .map((v) => numeric(v, 1))
                          .join(", ")}
                      </strong>
                    </div>
                    {selection.face.controlling_parameter &&
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
                    {selection.face.controlling_parameter && (
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
                      <h3>Selected edge</h3>
                      <span className="mini-badge">
                        {selection.edge.type.toLowerCase()}
                      </span>
                    </div>
                    <div className="property-row">
                      <span>Curve length</span>
                      <strong>{numeric(selection.edge.length, 4)} mm</strong>
                    </div>
                    <div className="field-grid">
                      <button
                        className="button secondary small"
                        onClick={() => chooseTool("fillet")}
                      >
                        Round this edge
                      </button>
                      <button
                        className="button secondary small"
                        onClick={() => chooseTool("chamfer")}
                      >
                        Chamfer this edge
                      </button>
                    </div>
                  </section>
                )}
                <section className="inspector-section">
                  <div className="section-heading">
                    <h3>
                      {feature ? "Feature dimensions" : "Design dimensions"}
                    </h3>
                    <button
                      title="Open parameter workspace"
                      onClick={() => {
                        setParamFilter("component");
                        setDialog("parameters");
                      }}
                    >
                      <SlidersHorizontal size={13} />
                    </button>
                  </div>
                  {(feature
                    ? Object.entries(feature.parameters)
                    : params
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
                      setParamFilter("component");
                      setDialog("parameters");
                    }}
                  >
                    All component parameters
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
                            setSketchFeature(feature);
                            setDialog("sketch");
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
                    <span>Origin · assembly mm</span>
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
                    Set exact transform
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
                <div className="assembly-heading">
                  <span className="eyebrow">INFORMATION, AT A GLANCE</span>
                  <h2>
                    Your design.
                    <br />
                    Clearly defined.
                  </h2>
                  <p>
                    Select a component or face to inspect its dimensions,
                    dependencies and tolerances.
                  </p>
                </div>
                <section className="inspector-section">
                  <div className="section-heading">
                    <h3>Assembly overview</h3>
                    <Boxes size={15} />
                  </div>
                  <div className="property-row">
                    <span>Manufactured parts</span>
                    <strong>{state?.summary.instances || 0}</strong>
                  </div>
                  <div className="property-row">
                    <span>Unique definitions</span>
                    <strong>{state?.summary.definitions || 0}</strong>
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
                <section className="inspector-section">
                  <div className="section-heading">
                    <h3>Fit relationships</h3>
                    <button onClick={() => chooseTool("fit")}>
                      <Plus size={14} />
                    </button>
                  </div>
                  {state?.fits.length ? (
                    state.fits.map((f) => (
                      <div className="fit-card" key={f.id}>
                        <div>
                          <span
                            className={
                              "status-orb small " +
                              (f.status === "interference" ? "warning" : "")
                            }
                          />
                          <strong>{f.name}</strong>
                          <Ruler size={13} />
                        </div>
                        <p>
                          {numeric(f.nominal, 3)}{" "}
                          <small>mm {f.convention} clearance</small>
                        </p>
                        <span>
                          {f.limits
                            ? "Limits " +
                              f.limits
                                .map((v: number) => numeric(v, 3))
                                .join(" to ") +
                              " mm"
                            : "Manufacturing tolerances unspecified"}
                        </span>
                      </div>
                    ))
                  ) : (
                    <p className="empty-copy">
                      Create a relationship to keep fits visible as you design.
                    </p>
                  )}
                  <div className="subtle-note">
                    Nominal checks describe geometry. Physical fit needs process
                    calibration.
                  </div>
                </section>
                <section className="inspector-section">
                  <div className="section-heading">
                    <h3>Design intent</h3>
                    <Info size={14} />
                  </div>
                  <p className="design-notes">
                    {state?.document.notes ||
                      "Every part has a component. Every editable dimension has a parameter. Build with precise, inspectable intent."}
                  </p>
                </section>
                <button
                  className="button secondary inspector-parameters"
                  onClick={() => setDialog("parameters")}
                >
                  <GitBranch size={15} />
                  Explore parameter dependencies
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

      <section className="timeline-panel">
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
            <span>
              <span className="status-orb small" />
              {historyView ? "Inspecting build stage" : "At the current design"}
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
          <div className="feature-timeline">
            <div className="timeline-origin">
              <div />
              <span>Origin</span>
            </div>
            <div className="timeline-track" />
            {visibleFeatures.map((f, index) => {
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
                    "\nDouble-click to inspect this build stage"
                  }
                  onClick={() => {
                    setSelectedFeature(f.id);
                    const o = state!.occurrences.find(
                      (o) => o.definition === f.owner,
                    );
                    if (o)
                      setSelection({
                        occurrence: o.id,
                        definition: o.definition,
                      });
                  }}
                  onDoubleClick={() => viewStage(f)}
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
            })}
            <div className="timeline-end">
              <div />
              <span>Now</span>
            </div>
          </div>
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
        <footer>
          <div>
            <span className="status-orb small" />
            PARAMETRIC SOLID ENGINE <span className="footer-separator">/</span>
            <span>OCCT</span>
          </div>
          <span>Double-click a feature to inspect its build stage</span>
          <button onClick={() => setDialog("settings")} className="footer-link">
            LOCAL · OFFLINE READY
          </button>
        </footer>
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
          setLocalJob({ status: "queued", description: "Open native design" });
          try {
            const response = await fetch("/api/import", {
              method: "POST",
              body: await file.arrayBuffer(),
              headers: { "Content-Type": "application/octet-stream" },
            });
            const data = await response.json();
            if (!response.ok) throw new ApiError(data.error);
            await waitJob(data, setLocalJob);
            await refresh(true);
            setDialog(null);
            setSelection(null);
            setTimeout(() => viewRef.current?.fit(), 350);
          } catch (error) {
            report(error);
          } finally {
            setLocalJob(null);
            e.target.value = "";
          }
        }}
      />

      {state && dialog === "measure" && (
        <MeasureDialog
          state={state}
          initial={selection?.occurrence}
          onClose={() => setDialog(null)}
          onError={report}
        />
      )}
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
        !["sketch", "measure"].includes(dialog) && (
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
      {state && dialog === "sketch" && (
        <SketchEditor
          state={state}
          feature={sketchFeature}
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
      {state && dialog === "parameters" && (
        <Modal
          title="Dimensions, connected."
          eyebrow="PARAMETER WORKSPACE"
          wide
          onClose={() => setDialog(null)}
        >
          <div className="parameter-toolbar">
            <div className="search-field">
              <Search size={15} />
              <input
                placeholder="Search dimensions, purpose or category…"
                value={paramSearch}
                onChange={(e) => setParamSearch(e.target.value)}
                autoFocus
              />
            </div>
            <button
              className="button secondary small"
              onClick={() => chooseTool("parameter")}
            >
              <Plus size={14} />
              New parameter
            </button>
          </div>
          <div className="filter-tabs">
            {[
              ["roots", "Root inputs"],
              ["shared", "Shared"],
              ["component", "This component"],
              ["favorites", "Favorites"],
              ["all", "All"],
              ["unused", "Unused"],
            ].map(([id, label]) => (
              <button
                className={paramFilter === id ? "active" : ""}
                onClick={() => setParamFilter(id)}
                key={id}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="parameter-table-wrap">
            <table className="parameter-table">
              <thead>
                <tr>
                  <th />
                  <th>Dimension / purpose</th>
                  <th>Value</th>
                  <th>Role</th>
                  <th>Uses</th>
                  <th>Ownership</th>
                </tr>
              </thead>
              <tbody>
                {filteredParams.map((p) => {
                  const info = state.parameter_graph[p.id];
                  return (
                    <tr key={p.id}>
                      <td>
                        <button
                          className={
                            "star-button " + (p.favorite ? "active" : "")
                          }
                          aria-label={"Favorite " + p.name}
                          onClick={() =>
                            run("parameter.set", {
                              id: p.id,
                              favorite: !p.favorite,
                            }).catch(() => {})
                          }
                        >
                          <Star size={13} />
                        </button>
                      </td>
                      <td>
                        <button onClick={() => setEditParameter(p.id)}>
                          <strong>{p.name}</strong>
                          <small>{p.category}</small>
                        </button>
                      </td>
                      <td>
                        <button
                          className="table-value"
                          onClick={() => setEditParameter(p.id)}
                        >
                          {numeric(info.value, 4)}
                          <small>
                            {p.kind === "length"
                              ? "mm"
                              : p.kind === "angle"
                                ? "°"
                                : ""}
                          </small>
                          {p.tolerance && (
                            <em>
                              −{p.tolerance.minus} / +{p.tolerance.plus}
                            </em>
                          )}
                        </button>
                      </td>
                      <td>
                        <span
                          className={
                            "parameter-role " + (info.root ? "root" : "derived")
                          }
                        >
                          {info.root ? (
                            "Root input"
                          ) : (
                            <>
                              <Link2 size={10} />
                              Derived
                            </>
                          )}
                        </span>
                      </td>
                      <td>{info.use_count}</td>
                      <td>
                        {state.document.components[p.owner]?.name || "Shared"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!filteredParams.length && (
              <p className="empty-copy">No dimensions match this view.</p>
            )}
          </div>
          <div className="inline-note parameter-note">
            <GitBranch size={15} />
            Root inputs have no upstream parameter dependencies. Open any
            dimension to trace its consumers and root inputs.
          </div>
          <footer>
            <span>
              {filteredParams.length} of {params.length} parameters · mm and
              degrees internally
            </span>
            <button
              className="button secondary"
              onClick={() => setDialog(null)}
            >
              Done
            </button>
          </footer>
        </Modal>
      )}
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
          title="Find your next action"
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
      {dialog === "project" && (
        <Modal
          title="Your local workspace"
          eyebrow="PROJECT"
          onClose={() => setDialog(null)}
        >
          <div className="project-menu">
            <button
              onClick={() => {
                setDialog("new-confirm");
              }}
            >
              <FilePlus2 />
              <span>
                <strong>New design</strong>
                <small>Current work stays in revision history.</small>
              </span>
            </button>
            <button onClick={() => importRef.current?.click()}>
              <FolderOpen />
              <span>
                <strong>Open a native design copy</strong>
                <small>Import a YAML manifest or portable .rycad.zip.</small>
              </span>
            </button>
            <a href="/api/native" download>
              <Save />
              <span>
                <strong>Download native project snapshot</strong>
                <small>Editable model and its durable journal.</small>
              </span>
            </a>
            <a href="/api/manifest" download>
              <GitBranch />
              <span>
                <strong>Download readable YAML</strong>
                <small>Current parametric intent.</small>
              </span>
            </a>
            <button onClick={() => setDialog("references")}>
              <Boxes />
              <span>
                <strong>Explore reference designs</strong>
                <small>Fully editable examples.</small>
              </span>
            </button>
          </div>
        </Modal>
      )}
      {dialog === "new-confirm" && (
        <Modal title="Start a new design?" onClose={() => setDialog(null)}>
          <p className="dialog-copy">
            The current design is autosaved. You can download a portable
            snapshot or undo this action to restore it.
          </p>
          <footer>
            <button
              className="button secondary"
              onClick={() => setDialog(null)}
            >
              Keep current design
            </button>
            <button
              className="button primary"
              onClick={() => loadRecipe("blank")}
            >
              Create new design
              <Plus size={15} />
            </button>
          </footer>
        </Modal>
      )}
      {dialog === "references" && (
        <Modal
          title="Start from a useful idea."
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
                <ComponentIcon size={74} strokeWidth={0.65} />
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
            Opening a reference replaces the current working design and is
            undoable. Download a native snapshot to keep a separate copy.
          </div>
        </Modal>
      )}
      {state && dialog === "agents" && (
        <Modal
          title="External agents. Shared intent."
          eyebrow="MCP CONNECTIONS"
          onClose={() => setDialog(null)}
        >
          <p className="dialog-copy">
            An agent uses the same modeling operations as you. Each accepted
            action is visible, attributed and autosaved in this live document.
          </p>
          <div className="connection-instructions">
            <span>Connect from your MCP client</span>
            <code>
              python -m ryancad.mcp_server --connection runtime/connection.json
              --name "CAD agent"
            </code>
            <small>
              Run in the project environment. The local connection file supplies
              the service address and capability token.
            </small>
          </div>
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
      {state && dialog === "fits" && (
        <Modal
          title="Tolerances and fit intent"
          eyebrow="DIMENSIONS WITH CONTEXT"
          onClose={() => setDialog(null)}
        >
          {state.fits.map((f) => (
            <div className="fit-detail" key={f.id}>
              <h3>{f.name}</h3>
              <div className="property-row">
                <span>Nominal {f.convention} clearance</span>
                <strong>{numeric(f.nominal, 4)} mm</strong>
              </div>
              <div className="property-row">
                <span>Tolerance envelope</span>
                <strong>
                  {f.limits
                    ? f.limits.map((v: number) => numeric(v, 4)).join(" to ") +
                      " mm"
                    : "Unspecified"}
                </strong>
              </div>
              <div className="field-grid">
                <button
                  className="button secondary small"
                  onClick={() => setEditParameter(f.pin_parameter)}
                >
                  Edit pin dimension
                </button>
                <button
                  className="button secondary small"
                  onClick={() => setEditParameter(f.socket_parameter)}
                >
                  Edit socket dimension
                </button>
              </div>
              <p>{f.assumptions}</p>
            </div>
          ))}
          <footer>
            <button
              className="button secondary"
              onClick={() => chooseTool("fit")}
            >
              <Plus size={14} />
              Define a fit
            </button>
            <button className="button primary" onClick={() => setDialog(null)}>
              Done
            </button>
          </footer>
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
          title="Your parts are ready."
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
                href={
                  "/api/exports/" +
                  exports.export_id +
                  "/" +
                  encodeURIComponent(f.filename)
                }
                download
                key={f.filename}
              >
                <ComponentIcon size={17} />
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
              href={"/api/exports/" + exports.export_id + "/receipt.json"}
              download
            >
              Download receipt
            </a>
            <a
              className="button primary"
              href={"/api/exports/" + exports.export_id}
              download
            >
              <Download size={15} />
              Download all parts
            </a>
          </footer>
        </Modal>
      )}
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
          eyebrow="LOCAL, PRECISE, INSPECTABLE"
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
          <div className="shortcut-list">
            <div>
              <span>Command search</span>
              <kbd>Ctrl / ⌘ K</kbd>
            </div>
            <div>
              <span>Undo / redo</span>
              <kbd>Ctrl / ⌘ Z · Shift Z</kbd>
            </div>
            <div>
              <span>Fit design</span>
              <kbd>F</kbd>
            </div>
            <div>
              <span>Grid</span>
              <kbd>G</kbd>
            </div>
            <div>
              <span>Front / right / top</span>
              <kbd>1 / 2 / 7</kbd>
            </div>
            <div>
              <span>Multi-select components</span>
              <kbd>Shift + click</kbd>
            </div>
          </div>
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
    (o) => o.kind !== "assembly" && !o.suppressed,
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
      title="Export precise parts"
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

function MeasureDialog({
  state,
  initial,
  onClose,
  onError,
}: {
  state: State;
  initial?: string;
  onClose: () => void;
  onError: (error: any) => void;
}) {
  const parts = state.occurrences.filter(
    (o) => o.kind !== "assembly" && !o.suppressed,
  );
  const [first, setFirst] = useState(initial || parts[0]?.id || "");
  const [second, setSecond] = useState(
    parts.find((o) => o.id !== (initial || parts[0]?.id))?.id || "",
  );
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title="Measure between parts"
      eyebrow="EXACT ASSEMBLY PLACEMENTS"
      onClose={onClose}
    >
      <div className="field-grid">
        {[
          ["First component", first, setFirst],
          ["Second component", second, setSecond],
        ].map(([label, value, setter]: any) => (
          <label className="field" key={label}>
            <span>{label}</span>
            <select
              value={value}
              onChange={(e) => {
                setter(e.target.value);
                setResult(null);
              }}
            >
              {parts.map((o, index) => (
                <option value={o.id} key={o.id}>
                  {state.document.components[o.definition].name} · instance{" "}
                  {index + 1}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
      {result && (
        <div className="measurement-result">
          <div className="property-row">
            <span>Minimum separation</span>
            <strong>{numeric(result.distance, 6)} mm</strong>
          </div>
          <div className="property-row">
            <span>Overlapping solid volume</span>
            <strong>{numeric(result.intersection_volume, 6)} mm³</strong>
          </div>
          <p>
            {result.intersection_volume > 1e-6
              ? "The placed components intersect."
              : "No volumetric interference in this static placement."}
          </p>
          <small>
            Revision {result.revision}. Minimum distance includes all surfaces;
            contact can be zero even when a pin/socket has radial clearance.
          </small>
        </div>
      )}
      <footer>
        <button className="button secondary" onClick={onClose}>
          Done
        </button>
        <button
          className="button primary"
          disabled={!first || !second || first === second || busy}
          onClick={async () => {
            setBusy(true);
            try {
              setResult(
                await waitJob(
                  await api("/measure", {
                    method: "POST",
                    body: JSON.stringify({ first, second }),
                  }),
                ),
              );
            } catch (error) {
              onError(error);
            } finally {
              setBusy(false);
            }
          }}
        >
          <Ruler size={14} />
          {busy ? "Measuring…" : "Calculate"}
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
      title="Push / pull with precision"
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
      {occurrence && (
        <label className="field">
          <span>Assembly ownership</span>
          <select
            value={occurrence.parent}
            onChange={(e) =>
              run("instance.reparent", {
                id: occurrence.source_id,
                parent: e.target.value,
              })
                .then(onClose)
                .catch(() => {})
            }
          >
            {Object.values(state.document.components)
              .filter((c) => c.kind === "assembly")
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
          <small className="field-help">
            The exact local placement is preserved when changing the owning
            assembly.
          </small>
        </label>
      )}
      <div className="project-menu">
        <button
          onClick={() =>
            run("component.duplicate", {
              id: component.id,
              placement: { x: 30 },
            })
              .then(onClose)
              .catch(() => {})
          }
        >
          <Copy />
          <span>
            <strong>Repeat linked component</strong>
            <small>Keep one shared definition; starts at X = 30 mm.</small>
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
