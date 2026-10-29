import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { expressionLabel, api, waitJob } from "./api";
import { NumericInput, ResolvedNumericInput, resolveNumericText } from "./NumericInput";
import { expressionParameterNames } from "./parameterNames";
import { Check, Crosshair, Trash2, Undo2, X } from "lucide-react";
import {
  SKETCH_FIELDS,
  sketchClick,
  sketchAnchors,
  projectSketchReference,
  worldSketchFrame,
  type SketchDraft,
  type SketchPoint,
} from "./sketchModel";
import type { Selection, State } from "./types";
export interface SketchPanelHandle {
  point: (
    point: SketchPoint,
    tolerance: number,
    selection: Selection | null,
  ) => void;
  finish: () => void;
  escape: () => void;
  undo: () => void;
  dimensionKey: (key: string) => boolean;
  dimensionChange: (value: string) => void;
}
export default forwardRef<
  SketchPanelHandle,
  {
    draft: SketchDraft;
    state: State;
    onChange: (draft: SketchDraft) => void;
    onFinish: (draft: SketchDraft) => Promise<void>;
    onCancel: () => void;
    onFacePlane: () => void;
    onAlign: () => void;
    embedded: boolean;
    planePicking: boolean;
    onPlaneChosen: () => void;
    onDimensionEditor: (
      editor: { line: string; value: string; error?: string } | null,
    ) => void;
  }
>(function SketchPanel(
  {
    draft: d,
    state,
    onChange,
    onFinish,
    onCancel,
    onFacePlane,
    onAlign,
    embedded,
    planePicking,
    onPlaneChosen,
    onDimensionEditor,
  },
  ref,
) {
  const resolveLength = (text: string) => resolveNumericText(text, Object.values(state.document.parameters),
    Object.fromEntries(Object.entries(state.parameter_graph).map(([id, info]) => [id, info.value])), "length");
  const [u, setU] = useState("0"),
    [v, setV] = useState("0"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const history = useRef<SketchDraft[]>([]);
  const [constraintType, setConstraintType] = useState("horizontal"),
    [constraintA, setConstraintA] = useState(""),
    [constraintB, setConstraintB] = useState(""),
    [constraintValue, setConstraintValue] = useState("10");
  const [dimensionLine, setDimensionLine] = useState<string | null>(null);
  const [dimensionValue, setDimensionValue] = useState("");
  const dimensionBase = useRef<SketchDraft | null>(null);
  const latest = useRef(d);
  latest.current = d;
  const [dimensionStatus, setDimensionStatus] = useState<
    "idle" | "working" | "valid" | "error"
  >("idle");
  const [dimensionError, setDimensionError] = useState("");
  const lastValid = useRef("");
  useEffect(() => {
    onDimensionEditor(
      dimensionLine
        ? { line: dimensionLine, value: dimensionValue, error: dimensionError }
        : null,
    );
  }, [dimensionLine, dimensionValue, dimensionError, onDimensionEditor]);
  useEffect(() => () => onDimensionEditor(null), [onDimensionEditor]);
  const openLine = (line: SketchDraft["entities"][number]) => {
    const c = d.constraints.find(
      (c) =>
        c.type === "distance" &&
        ((c.a === `${line.id}.start` && c.b === `${line.id}.end`) ||
          (c.b === `${line.id}.start` && c.a === `${line.id}.end`)),
    );
    const parameter =
      c?.parameter_key &&
      d.feature &&
      state.document.parameters[d.feature.parameters[c.parameter_key]];
    const expression = parameter
      ? parameter.category === "Sketch constraints"
        ? expressionLabel(parameter.expression, state.document.parameters)
        : `[${parameter.name}]`
      : undefined;
    const value =
      c?.pendingExpression ??
      expression ??
      String(
        c?.value ??
          Number(Math.hypot(line.x2 - line.x1, line.y2 - line.y1).toFixed(4)),
      );
    dimensionBase.current = d;
    lastValid.current = "";
    setDimensionError("");
    setDimensionStatus("working");
    setDimensionValue(value);
    setDimensionLine(line.id);
    onChange({ ...d, selected: line.id, selectedAnchor: null, message: "" });
  };
  useEffect(() => {
    if (d.tool === "dimension" && d.selected && !dimensionLine) {
      const line = (d.solvedEntities || d.entities).find(
        (e) => e.id === d.selected && e.type === "line",
      );
      if (line) openLine(line);
    }
  }, [d.tool]);
  useEffect(() => {
    if (!dimensionLine || !dimensionBase.current) return;
    let cancelled = false;
    const value = dimensionValue.trim();
    setDimensionStatus("working");
    setDimensionError("");
    const timer = setTimeout(async () => {
      try {
        if (!value) throw new Error("Enter a length or parameter.");
        if (Number.isFinite(Number(value)) && Number(value) <= 0)
          throw new Error("Dimension must be greater than zero.");
        const base = dimensionBase.current!;
        const a = `${dimensionLine}.start`,
          b = `${dimensionLine}.end`;
        const old = base.constraints.find(
          (c) =>
            c.type === "distance" &&
            ((c.a === a && c.b === b) || (c.a === b && c.b === a)),
        );
        const constraint = {
          ...(old || { type: "distance", a, b }),
          value: old?.value ?? 0,
          pendingExpression: value,
        };
        const constraints = old
          ? base.constraints.map((c) => (c === old ? constraint : c))
          : [...base.constraints, constraint];
        const entities = base.entities.map((e) =>
          e.id === dimensionLine ? { ...e, fixed: false } : e,
        );
        const command = base.feature
          ? {
              name: "sketch.update",
              args: {
                feature_id: base.feature.id,
                name: base.name,
                entities,
                constraints: constraints.map(({ pendingExpression, ...c }) =>
                  pendingExpression !== undefined
                    ? { ...c, value: pendingExpression }
                    : c,
                ),
              },
            }
          : {
              name: "sketch.create",
              args: {
                name: base.name,
                owner: "root",
                plane: base.plane === "custom" ? "XY" : base.plane,
                frame: base.frame,
                entities,
                constraints: constraints.map(({ pendingExpression, ...c }) =>
                  pendingExpression !== undefined
                    ? { ...c, value: pendingExpression }
                    : c,
                ),
              },
            };
        const submission = await api("/sketch-preview", {
          method: "POST",
          body: JSON.stringify({
            ...command,
            expected_revision: state.document.revision,
          }),
        });
        const result = await waitJob(submission);
        if (cancelled) return;
        const solved = entities.map((e) => {
          const q = result.sketch.entities.find((x: any) => x.id === e.id);
          if (!q) return e;
          if (e.type === "line")
            return {
              ...e,
              x1: q.start[0],
              y1: q.start[1],
              x2: q.end[0],
              y2: q.end[1],
            };
          if (e.type === "point") return { ...e, x: q.point[0], y: q.point[1] };
          return {
            ...e,
            x: q.center[0],
            y: q.center[1],
            radius: q.radius,
            ...(e.type === "arc"
              ? {
                  start_angle: (q.start_angle * 180) / Math.PI,
                  end_angle: (q.end_angle * 180) / Math.PI,
                }
              : {}),
          };
        });
        const resolved = constraints.map((c, i) =>
          result.constraint_values[i] == null
            ? c
            : { ...c, value: result.constraint_values[i], parameterName: expressionParameterNames(state.document.parameters, String(c.pendingExpression || "")).join(", ") || c.parameterName },
        );
        lastValid.current = value;
        setDimensionStatus("valid");
        setDimensionError("");
        onChange({
          ...latest.current,
          entities,
          constraints: resolved,
          solvedEntities: solved,
          selected: dimensionLine,
          message: "",
        });
      } catch (e: any) {
        if (!cancelled) {
          setDimensionStatus("error");
          setDimensionError(e.message || "Could not solve this dimension.");
        }
      }
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [dimensionLine, dimensionValue, state.document.revision]);
  const patch = (change: Partial<SketchDraft>) => onChange({ ...d, ...change });
  const change = (next: SketchDraft) => {
    if (next.entities !== d.entities || next.constraints !== d.constraints)
      history.current.push(d);
    onChange(next);
  };
  const point = (
    p: SketchPoint,
    tolerance: number,
    selection: Selection | null,
  ) => {
    if (d.tool === "dimension") {
      if (dimensionLine) return;
      const shown = {
        ...d,
        entities: d.solvedEntities || d.entities,
        tool: "select" as const,
      };
      const hit = sketchClick(shown, p, tolerance);
      const line = shown.entities.find(
        (e) => e.id === hit.selected && e.type === "line",
      );
      if (line) openLine(line);
      else patch({ message: "Select a line segment to dimension." });
      return;
    }
    const shown = d.solvedEntities ? { ...d, entities: d.solvedEntities } : d;
    if (d.tool === "select") {
      const picked = sketchClick(shown, p, tolerance);
      onChange({
        ...d,
        selected: picked.selected,
        selectedAnchor: picked.selectedAnchor,
      });
      return;
    }
    const editable = d.solvedEntities
      ? { ...d, entities: d.solvedEntities, solvedEntities: undefined }
      : d;
    change(
      d.tool === "project"
        ? projectSketchReference(editable, selection, state)
        : sketchClick(editable, p, tolerance),
    );
  };
  const applyDimension = () => {
    if (!dimensionLine) return;
    if (
      dimensionStatus !== "valid" ||
      lastValid.current !== dimensionValue.trim()
    ) {
      setDimensionError(
        dimensionStatus === "working"
          ? "Solving…"
          : dimensionError || "Enter a valid dimension.",
      );
      return;
    }
    if (dimensionBase.current) history.current.push(dimensionBase.current);
    dimensionBase.current = null;
    setDimensionLine(null);
    setDimensionError("");
  };
  const cancelDimension = () => {
    const base = dimensionBase.current;
    dimensionBase.current = null;
    setDimensionLine(null);
    setDimensionError("");
    if (base) onChange(base);
  };
  const dimensionKey = (key: string) => {
    if (!dimensionLine) return false;
    if (key === "Enter") applyDimension();
    else if (key === "Escape") cancelDimension();
    else return false;
    return true;
  };
  useEffect(() => {
    if (d.tool !== "dimension" && dimensionLine) cancelDimension();
  }, [d.tool]);
  const finish = async () => {
    if (busy || planePicking) return;
    if (document.querySelector('.sketch-panel input[aria-invalid="true"]')) {
      setError("Resolve the highlighted numeric field before finishing the sketch.");
      return;
    }
    if (dimensionLine) {
      applyDimension();
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onFinish({ ...d, pending: [], cursor: null });
    } catch (e: any) {
      setError(e.message || "Sketch could not be saved.");
    } finally {
      setBusy(false);
    }
  };
  const escape = () => {
    if (d.pending.length) patch({ pending: [], cursor: null, message: "" });
    else onCancel();
  };
  const undo = () => {
    if (busy || planePicking) return;
    const previous = history.current.pop();
    if (previous)
      onChange({
        ...previous,
        tool: d.tool,
        gridSnapEnabled: d.gridSnapEnabled,
        snap: d.snap,
        pending: [],
        cursor: null,
        selectedAnchor: null,
      });
  };
  useImperativeHandle(ref, () => ({
    point,
    finish,
    escape,
    undo,
    dimensionKey,
    dimensionChange: setDimensionValue,
  }));
  const selected = d.entities.find((e) => e.id === d.selected);
  const selectedAnchor = sketchAnchors(d).find(
    (a) => a.id === d.selectedAnchor?.id,
  );
  const hint =
    d.tool === "dimension"
      ? "Select a line, then enter a length or parameter."
      : d.tool === "select"
        ? "Click geometry to edit exact values."
        : d.tool === "project"
          ? "Pick a component edge, vertex or face. Projection creates independent construction geometry."
          : d.tool === "arc"
            ? "Pick center, start, then end. Arcs run counterclockwise."
            : d.tool === "line"
              ? "Pick points for connected lines. End chain stops the current line."
              : d.tool === "rectangle"
                ? "Pick opposite corners."
                : d.tool === "circle"
                  ? "Pick center, then a point on the radius."
                  : "Pick a point.";
  return (
    <aside
      className="operation-panel sketch-panel"
      aria-label="Sketch workspace"
    >
      <header className="operation-header">
        <h2>
          {d.feature ? "Edit sketch" : "Sketch"} <kbd>E</kbd>
        </h2>
        <button
          className="icon-button"
          onClick={onCancel}
          aria-label="Cancel sketch"
        >
          <X size={16} />
        </button>
      </header>
      <div className="operation-fields sketch-panel-scroll">
        {d.tool === "dimension" && (
          <section className="sketch-dimension-editor">
            <h3>Dimension</h3>
            {dimensionLine ? (
              <>
                <label className="field">
                  <span>{dimensionLine} length (mm)</span>
                  <NumericInput kind="length"
                    aria-label="Dimension length"
                    value={dimensionValue}
                    onChange={(e) => setDimensionValue(e.target.value)}
                  />
                </label>
                <datalist id="sketch-dimension-parameters">
                  {Object.values(state.document.parameters)
                    .filter((p) => p.kind === "length")
                    .map((p) => (
                      <option key={p.id} value={`[${p.name}]`} />
                    ))}
                </datalist>
                <button onClick={applyDimension}>Set dimension</button>{" "}
                <button onClick={cancelDimension}>Cancel</button>
              </>
            ) : (
              <p className="sketch-help">
                Select a line in the viewport to set its length.
              </p>
            )}
          </section>
        )}
        <section>
          <h3>Sketch plane</h3>
          <label className="field">
            <span>Plane</span>
            <select
              aria-label="Sketch plane"
              value={d.plane}
              disabled={!!d.feature || d.entities.length > 0}
              onChange={(e) => {
                onPlaneChosen();
                patch({
                  plane: e.target.value,
                  frame: worldSketchFrame(e.target.value),
                  pending: [],
                });
              }}
            >
              <option value="XY">World XY</option>
              <option value="XZ">World XZ</option>
              <option value="YZ">World YZ</option>
              {d.plane === "custom" && (
                <option value="custom">Picked / tool profile plane</option>
              )}
            </select>
          </label>
          <div
            className="operation-reference-control sketch-plane-reference"
            data-reference-role="profile"
          >
            <button
              className={`operation-pick-slot ${planePicking ? "picking" : ""}`}
              onClick={onFacePlane}
              disabled={!!d.feature || d.entities.length > 0}
            >
              <Crosshair size={13} />
              <span>
                <strong>Sketch plane reference</strong>
                <small>
                  {planePicking
                    ? "Pick a world plane or planar face in the viewport"
                    : "Pick world plane or planar face"}
                </small>
              </span>
            </button>
            <button onClick={onAlign} disabled={planePicking}>
              Align view
            </button>
          </div>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={d.showComponents}
              onChange={(e) => patch({ showComponents: e.target.checked })}
            />
            Show reference components
          </label>
        </section>
        <section inert={planePicking}>
          <h3>Drawing settings</h3>
          <p className="sketch-help">{hint}</p>
          {d.pending.length > 0 && (
            <button onClick={() => patch({ pending: [], cursor: null })}>
              End chain / reset points
            </button>
          )}
          <div className="field-grid">
            <label className="field">
              <span>U (mm)</span>
              <NumericInput kind="length"
                aria-label="Sketch U"
                step="any"
                value={u}
                onChange={(e) => setU(e.target.value)}
              />
            </label>
            <label className="field">
              <span>V (mm)</span>
              <NumericInput kind="length"
                aria-label="Sketch V"
                step="any"
                value={v}
                onChange={(e) => setV(e.target.value)}
              />
            </label>
          </div>
          <button
            disabled={
              d.tool === "project" ||
              d.tool === "select" ||
              d.tool === "dimension" ||
              !Number.isFinite(resolveLength(u)) ||
              !Number.isFinite(resolveLength(v))
            }
            onClick={() =>
              change({
                ...sketchClick({ ...d, snap: 0 }, [resolveLength(u), resolveLength(v)], 0),
                snap: d.snap,
              })
            }
          >
            Place exact point
          </button>
          <label className="field">
            <span>Grid snap (mm; 0 = off)</span>
            <input
              aria-label="Sketch grid snap"
              type="number"
              min="0"
              step=".1"
              value={d.snap}
              onChange={(e) =>
                patch({ snap: Math.max(0, Number(e.target.value)) })
              }
            />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={d.construction}
              onChange={(e) => patch({ construction: e.target.checked })}
            />
            Construction geometry
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={d.fixed}
              onChange={(e) => patch({ fixed: e.target.checked })}
            />
            Fix new geometry to exact coordinates
          </label>
          <button disabled={!history.current.length || busy} onClick={undo}>
            <Undo2 size={13} />
            Undo sketch edit
          </button>
        </section>
        <section inert={planePicking}>
          <h3>
            Geometry <small>{d.entities.length} / 200</small>
          </h3>
          <select
            aria-label="Sketch entity"
            value={d.selected || ""}
            onChange={(e) =>
              patch({
                selected: e.target.value || null,
                selectedAnchor: null,
                tool: "select",
                pending: [],
              })
            }
          >
            <option value="">Select geometry</option>
            {d.entities.map((e) => (
              <option key={e.id} value={e.id}>
                {e.id} · {e.type}
                {e.construction ? " · construction" : ""}
              </option>
            ))}
          </select>
          {selectedAnchor && (
            <div className="sketch-point-info" role="status">
              <strong>
                {selectedAnchor.entity} ·{" "}
                {selectedAnchor.kind === "mid"
                  ? "Midpoint"
                  : selectedAnchor.kind}
              </strong>
              <span>
                U {selectedAnchor.point[0].toFixed(3)} · V{" "}
                {selectedAnchor.point[1].toFixed(3)} mm
              </span>
            </div>
          )}
          {selected && (
            <>
              <div className="field-grid">
                {SKETCH_FIELDS[selected.type].map((field) => (
                  <label className="field" key={field}>
                    <span>{field.replaceAll("_", " ")}</span>
                    <ResolvedNumericInput kind={field.includes("angle") ? "angle" : "length"}
                      step="any"
                      aria-label={`Entity ${field}`}
                      value={selected.expressions?.[field] ?? selected[field]}
                      onValue={(number, expression) =>
                        change({
                          ...d,
                          entities: d.entities.map((item) =>
                            item.id === selected.id
                              ? { ...item, [field]: number, expressions: { ...item.expressions, [field]: expression } }
                              : item,
                          ),
                        })
                      }
                    />
                  </label>
                ))}
              </div>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={selected.construction}
                  onChange={(e) =>
                    change({
                      ...d,
                      entities: d.entities.map((item) =>
                        item.id === selected.id
                          ? { ...item, construction: e.target.checked }
                          : item,
                      ),
                    })
                  }
                />
                Construction
              </label>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={selected.fixed}
                  onChange={(e) =>
                    change({
                      ...d,
                      entities: d.entities.map((item) =>
                        item.id === selected.id
                          ? { ...item, fixed: e.target.checked }
                          : item,
                      ),
                    })
                  }
                />
                Fixed coordinates
              </label>
              <button
                onClick={() =>
                  change({
                    ...d,
                    selected: null,
                    entities: d.entities.filter((e) => e.id !== selected.id),
                    constraints: d.constraints.filter(
                      (c) =>
                        ![c.a, c.b].some(
                          (r) =>
                            r === selected.id ||
                            r?.startsWith(selected.id + "."),
                        ),
                    ),
                  })
                }
              >
                <Trash2 size={13} />
                Delete geometry
              </button>
            </>
          )}
          <h4>Relationships & dimensions</h4>
          <select
            aria-label="Sketch constraint type"
            value={constraintType}
            onChange={(e) => setConstraintType(e.target.value)}
          >
            {[
              "horizontal",
              "vertical",
              "coincident",
              "parallel",
              "perpendicular",
              "equal",
              "distance",
              "angle",
              "radius",
              "diameter",
              "fix",
              "tangent",
              "point_on_line",
              "point_on_circle",
            ].map((type) => (
              <option key={type} value={type}>
                {type.replaceAll("_", " ")}
              </option>
            ))}
          </select>
          {(
            [
              ["A", constraintA, setConstraintA],
              ["B", constraintB, setConstraintB],
            ] as const
          ).map(([label, value, set]) => (
            <label className="field" key={label}>
              <span>Reference {label}</span>
              <select
                aria-label={`Constraint reference ${label}`}
                value={value}
                onChange={(e) => set(e.target.value)}
              >
                <option value="">Choose geometry / point</option>
                {d.entities
                  .flatMap((e) => [
                    e.id,
                    ...(e.type === "line"
                      ? [e.id + ".start", e.id + ".end"]
                      : e.type === "point"
                        ? []
                        : [
                            e.id + ".center",
                            ...(e.type === "arc"
                              ? [e.id + ".start", e.id + ".end"]
                              : []),
                          ]),
                  ])
                  .map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
              </select>
            </label>
          ))}
          {["distance", "angle", "radius", "diameter"].includes(
            constraintType,
          ) && (
            <label className="field">
              <span>
                Value ({constraintType === "angle" ? "degrees" : "mm"})
              </span>
              <NumericInput kind={constraintType === "angle" ? "angle" : "length"}
                aria-label="Constraint value"
                value={constraintValue}
                onChange={(e) => setConstraintValue(e.target.value)}
              />
            </label>
          )}
          <button
            disabled={!constraintA}
            onClick={() => {
              const involved = [
                constraintA.split(".")[0],
                constraintB.split(".")[0],
              ];
              change({
                ...d,
                entities: d.entities.map((e) =>
                  involved.includes(e.id) ? { ...e, fixed: false } : e,
                ),
                constraints: [
                  ...d.constraints,
                  {
                    type: constraintType,
                    a: constraintA,
                    b: constraintB,
                    ...(["distance", "angle", "radius", "diameter"].includes(
                      constraintType,
                    )
                      ? { value: constraintValue }
                      : {}),
                  },
                ],
                message:
                  "Relationships solve when you finish the sketch. Geometry involved in this relationship is now free to solve.",
              });
            }}
          >
            Add relationship
          </button>
          {d.constraints.length > 0 && (
            <>
              <h4>Existing constraints</h4>
              {d.constraints.map((c, i) => (
                <div className="sketch-constraint-row" key={c.id || i}>
                  <span>
                    {c.type} · {c.a}
                    {c.b ? ` / ${c.b}` : ""}
                  </span>
                  {c.value !== undefined && (
                    <NumericInput kind={c.type === "angle" ? "angle" : "length"}
                      aria-label={`Constraint ${i + 1} value`}
                      value={c.value}
                      onChange={(e) =>
                        change({
                          ...d,
                          constraints: d.constraints.map((v, j) =>
                            j === i
                              ? {
                                  ...v,
                                  value: e.target.value,
                                  pendingExpression: e.target.value,
                                }
                              : v,
                          ),
                        })
                      }
                    />
                  )}
                  <button
                    aria-label={`Remove constraint ${i + 1}`}
                    onClick={() =>
                      change({
                        ...d,
                        constraints: d.constraints.filter((_, j) => i !== j),
                      })
                    }
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </>
          )}
        </section>
        {(d.message || error) && (
          <p role={error ? "alert" : "status"} className="sketch-help">
            {error || d.message}
          </p>
        )}
      </div>
      <footer className="operation-commit-row sketch-commit">
        <label className="field">
          <span>Sketch name</span>
          <input
            aria-label="Sketch name"
            value={d.name}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </label>
        <div>
          <button
            className="primary"
            disabled={
              busy ||
              planePicking ||
              !d.entities.length ||
              d.entities.length > 200
            }
            onClick={finish}
          >
            <Check size={14} />
            {busy
              ? "Saving…"
              : embedded
                ? "Finish & use profile"
                : "Finish sketch"}
          </button>
          <button disabled={busy} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </footer>
    </aside>
  );
});
