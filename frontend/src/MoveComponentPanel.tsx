import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import {
  Check,
  LoaderCircle,
  RotateCcw,
  X,
  Crosshair,
  Target,
  MoveUpRight,
  MousePointer2,
} from "lucide-react";
import { ParameterInput } from "./Forms";
import { numeric } from "./api";
import {
  moveReference,
  movePoint,
  moveDirection,
  worldMovePoint,
  worldAxisReference,
  inferredMovementDistance,
  type WorldAxis,
  type MovementGuideData,
  type MovementMethod,
  type MoveSlot,
  type MovePick,
  inferMovePick,
  inferredMoveLabel,
  movementArgs,
  type MoveReference,
} from "./movementModel";
import type { Selection, State } from "./types";
import { useOperationPreview } from "./operations/useOperationPreview";
export interface MoveComponentHandle {
  confirm: () => void;
  cancel: () => void;
  capture: (selection: Selection | null) => void;
  chooseAxis: (axis: WorldAxis) => void;
  canChooseAxis: () => boolean;
  chooseOrigin: () => void;
}
export default forwardRef<
  MoveComponentHandle,
  {
    state: State;
    target: Selection | null;
    axisRequest?: { axis: WorldAxis; id: number };
    renderedToken: string | null;
    onTarget: (target: Selection | null) => void;
    onPreview: (report: any | null) => void;
    onCommit: (report: any) => Promise<void>;
    onClose: () => void;
    onHoverReference: (selection: Selection | null) => void;
    onGuide: (guide: MovementGuideData | null) => void;
  }
>(function MoveComponentPanel(
  {
    state,
    target,
    axisRequest,
    renderedToken,
    onTarget,
    onPreview,
    onCommit,
    onClose,
    onHoverReference,
    onGuide,
  },
  ref,
) {
  const occurrence = state.occurrences.find((o) => o.id === target?.occurrence);
  const initial = () =>
    Object.fromEntries(
      ["x", "y", "z", "rx", "ry", "rz", "angle", "distance"].map((k) => [
        k,
        k === "distance" ? "" : "0",
      ]),
    );
  const [method, setMethod] = useState<MovementMethod>("reference");
  const [pick, setPick] = useState<MovePick>(null);
  const [refs, setRefs] = useState<
    Partial<Record<Exclude<MoveSlot, null>, MoveReference>>
  >({});
  const [reverse, setReverse] = useState(false);
  const updateReference = (
    slot: Exclude<MoveSlot, null>,
    ref: MoveReference,
  ) => {
    setRefs((r) => ({ ...r, [slot]: ref }));
    setConfirmIntent("");
    setNotice("");
  };
  const [values, setValues] = useState(initial),
    [notice, setNotice] = useState(""),
    [committing, setCommitting] = useState(false),
    [confirmIntent, setConfirmIntent] = useState("");
  const committingRef = useRef(false),
    fields = useRef<HTMLDivElement>(null);
  const pendingAxis = useRef<WorldAxis | null>(null);
  useLayoutEffect(() => {
    setValues(initial());
    setRefs(
      pendingAxis.current
        ? { direction: worldAxisReference(pendingAxis.current) }
        : {},
    );
    if (occurrence) pendingAxis.current = null;
    setPick(null);
    setReverse(false);
    setNotice("");
    setConfirmIntent("");
  }, [target?.occurrence]);
  const chooseAxis = (axis: WorldAxis) => {
    if (committingRef.current) return;
    if (!occurrence) pendingAxis.current = axis;
    if (method === "axes") setMethod("reference");
    updateReference("direction", worldAxisReference(axis));
    setPick(null);
  };
  useEffect(() => {
    if (axisRequest) chooseAxis(axisRequest.axis);
  }, [axisRequest?.id]);
  const automaticDistance =
    occurrence && method === "reference"
      ? inferredMovementDistance(refs, state, occurrence, reverse)
      : "";
  let problem = "",
    args: Record<string, any> | null = null;
  try {
    if (occurrence) {
      args = movementArgs(method, occurrence, refs, values, reverse);
    }
  } catch (e: any) {
    problem = e.message;
    args = null;
  }
  const preview = useOperationPreview(
    args,
    state.document.revision,
    onPreview,
    "instance.move",
  );
  const signature = JSON.stringify([state.document.revision, args]),
    ready =
      !problem &&
      !!args &&
      preview.ready &&
      renderedToken === preview.report?.preview_token;
  useEffect(() => {
    if (!args) onPreview(null);
  }, [signature, onPreview]);
  useEffect(() => {
    fields.current?.querySelector("input")?.focus({ preventScroll: true });
  }, [target?.occurrence]);
  const accept = async () => {
    if (!ready || committingRef.current) return;
    committingRef.current = true;
    setCommitting(true);
    setConfirmIntent("");
    try {
      await onCommit(preview.report);
    } catch (e: any) {
      if (e.code === "expired_preview") {
        preview.retry();
        setNotice("Preview expired. Review the new preview and apply again.");
      } else setNotice(e.message || "The move could not be applied.");
    } finally {
      committingRef.current = false;
      setCommitting(false);
    }
  };
  useImperativeHandle(ref, () => ({
    canChooseAxis: () =>
      !committingRef.current &&
      method !== "axes" &&
      (!pick || pick === "direction"),
    cancel: onClose,
    chooseAxis,
    chooseOrigin() {
      if (!occurrence) {
        setNotice("Choose a component before selecting its movement points.");
        return;
      }
      const slot = pick === "origin" ? "origin" : "target";
      updateReference(
        slot,
        moveReference(
          { worldOrigin: true, definition: "root", occurrence: "" },
          state,
        ),
      );
      setPick(null);
    },
    capture(selection) {
      if (!selection || committingRef.current) return;
      const slot = occurrence
        ? inferMovePick(method, occurrence.id, selection, pick)
        : "component";
      if (slot === "component") {
        onTarget({
          occurrence: selection.occurrence,
          definition: selection.definition,
        });
        setPick(null);
        setNotice("");
        return;
      }
      if (!slot || !occurrence) {
        setNotice(
          method === "rotate"
            ? "Select a straight edge for the rotation axis."
            : "Choose a component or edit the XYZ fields.",
        );
        return;
      }
      if (
        slot === "origin" &&
        !selection.worldOrigin &&
        selection.occurrence !== occurrence.id &&
        !selection.occurrence.startsWith(occurrence.id + "/")
      ) {
        setNotice("Pick the origin on the active component.");
        return;
      }
      const reference = moveReference(
        slot === "direction" && selection.vertex?.anchor === "mid"
          ? { ...selection, vertex: undefined, edge: selection.vertex.edge }
          : selection,
        state,
      );
      try {
        if (slot === "direction") moveDirection(reference);
      } catch (e: any) {
        setNotice(e.message);
        return;
      }
      updateReference(slot, reference);
      setPick(null);
    },
    confirm() {
      if (committingRef.current) return;
      if (!args || preview.error) {
        setNotice(problem || preview.error || "Select a component to move.");
        return;
      }
      if (ready) void accept();
      else {
        setConfirmIntent(signature);
        preview.flush();
      }
    },
  }));
  useEffect(() => {
    if (confirmIntent && confirmIntent !== signature) setConfirmIntent("");
    else if (confirmIntent && ready) void accept();
  }, [signature, confirmIntent, ready]);
  const change = (key: string, value: string) => {
    setNotice("");
    setConfirmIntent("");
    setValues((v) => ({ ...v, [key]: value }));
  };
  useEffect(() => () => onHoverReference(null), [onHoverReference]);
  useEffect(() => {
    const guide: MovementGuideData = preview.ready
      ? { ...preview.report?.changes?.movement }
      : {};
    guide.worldAxis = method !== "axes" ? refs.direction?.worldAxis : undefined;
    if (refs.origin && method === "reference")
      guide.origin = worldMovePoint(refs.origin, state);
    if (refs.target && method === "reference")
      guide.target = worldMovePoint(refs.target, state);
    if (refs.direction && method !== "axes") {
      const r = refs.direction,
        e = r.selection.edge;
      guide.directionStart = worldMovePoint({ ...r, anchor: "start" }, state);
      if (e || r.worldAxis) {
        const end = worldMovePoint({ ...r, anchor: "end" }, state);
        guide.directionEnd = end;
        if (end && guide.directionStart) {
          const v = end.map((n, i) => n - guide.directionStart![i]),
            len = Math.hypot(...v);
          guide.direction = v.map((n) => (n / len) * (reverse ? -1 : 1));
        }
      }
    }
    onGuide(guide);
  }, [
    refs,
    method,
    reverse,
    preview.ready,
    preview.report,
    state.document.revision,
    onGuide,
  ]);
  useEffect(() => () => onGuide(null), [onGuide]);
  const referenceField = (slot: Exclude<MoveSlot, null>, label: string) => {
    const ref = refs[slot];
    const RoleIcon =
      slot === "origin" ? Crosshair : slot === "target" ? Target : MoveUpRight;
    const color =
      slot === "origin" ? "#ffc281" : slot === "target" ? "#a5caff" : "#b4a0ff";
    return (
      <div
        className="move-reference-field operation-reference-control"
        data-move-role={slot}
        style={{ "--reference-color": color } as CSSProperties}
        key={slot}
      >
        <span className="field-label">{label}</span>
        <div className="move-reference-row">
          <button
            className={`operation-pick-slot move-reference-pick ${pick === slot ? "picking" : ""}`}
            aria-pressed={pick === slot}
            onClick={() => {
              setPick(slot);
              setNotice("");
            }}
            onMouseEnter={() =>
              onHoverReference(ref?.worldAxis ? null : ref?.selection || null)
            }
            onMouseLeave={() => onHoverReference(null)}
            onFocus={() =>
              onHoverReference(ref?.worldAxis ? null : ref?.selection || null)
            }
            onBlur={() => onHoverReference(null)}
          >
            <RoleIcon size={15} />
            <span>
              {ref
                ? ref.label
                : slot === "direction"
                  ? "Pick a straight edge"
                  : slot === "origin"
                    ? "Pick on active component"
                    : "Pick in design"}
            </span>
            <MousePointer2 size={13} />
          </button>
          {ref && (
            <button
              className="icon-button"
              aria-label={`Clear ${label.toLowerCase()}`}
              title={`Clear ${label.toLowerCase()}`}
              onClick={() => {
                setRefs((current) => {
                  const next = { ...current };
                  delete next[slot];
                  return next;
                });
                if (slot === "direction") setReverse(false);
                setPick(null);
                setNotice("");
                setConfirmIntent("");
                onHoverReference(null);
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>
        {ref &&
          ref.selection.edge &&
          !ref.selection.vertex &&
          slot !== "direction" && (
            <label className="field">
              <span>Point on reference</span>
              <select
                aria-label={`${label} anchor`}
                value={ref.anchor}
                onChange={(e) =>
                  updateReference(slot, {
                    ...ref,
                    anchor: e.target.value as MoveReference["anchor"],
                  })
                }
              >
                {ref.selection.vertex ? (
                  <option value={ref.anchor}>Vertex</option>
                ) : ref.selection.edge ? (
                  <>
                    <option value="start">Start point</option>
                    {(ref.selection.edge.type === "LINE" ||
                      ref.selection.edge.midpoint) && (
                      <option value="mid">Midpoint</option>
                    )}
                    <option value="end">End point</option>
                  </>
                ) : (
                  <option value="center">
                    {ref.selection.face ? "Face center" : "Component origin"}
                  </option>
                )}
              </select>
            </label>
          )}
        {slot === "direction" && (
          <div className="move-world-axes" aria-label="World axis directions">
            <small>World axes</small>
            {(["X", "Y", "Z"] as const).map((axis) => (
              <button
                key={axis}
                aria-label={`Use world ${axis} axis`}
                aria-pressed={ref?.worldAxis === axis}
                onClick={() => chooseAxis(axis)}
              >
                {axis}
              </button>
            ))}
          </div>
        )}
        <small className="operation-help">
          {pick === slot
            ? `Picking ${label.toLowerCase()} in viewport`
            : ref
              ? slot === "direction"
                ? ref.worldAxis
                  ? `Global ${ref.worldAxis} direction${method === "rotate" ? " · through world origin" : ""}`
                  : "Straight edge direction · start → end"
                : ref.selection.vertex
                  ? ref.selection.vertex.anchor === "mid"
                    ? "Native edge midpoint"
                    : "Exact vertex"
                  : ref.selection.edge
                    ? `${ref.anchor === "mid" ? "Midpoint" : ref.anchor === "start" ? "Start point" : "End point"} of edge`
                    : ref.selection.face
                      ? "Geometric face center"
                      : ref.selection.worldOrigin
                        ? "World origin · (0, 0, 0)"
                        : "Component origin"
              : ""}
        </small>
      </div>
    );
  };
  const sameSource = state.occurrences.filter(
    (o) => o.source_id === occurrence?.source_id,
  ).length;
  return (
    <aside
      className="right-panel operation-panel move-component-panel"
      aria-label="Move Component workspace"
    >
      <header className="operation-header">
        <h2>Move Component</h2>
        <button
          className="icon-button"
          aria-label="Cancel Move Component"
          disabled={committing}
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      <div className="operation-fields" ref={fields}>
        <section className="operation-section">
          <label className="field">
            <span>Movement method</span>
            <select
              aria-label="Movement method"
              value={method}
              onChange={(e) => {
                const next = e.target.value as MovementMethod;
                setMethod(next);
                setNotice("");
                setConfirmIntent("");
                setPick(null);
                onHoverReference(null);
              }}
            >
              <option value="reference">Reference movement</option>
              <option value="axes">XYZ distances and rotation</option>
              <option value="rotate">Rotation</option>
            </select>
          </label>
        </section>
        <section className="operation-section">
          <h3>Component</h3>
          {occurrence ? (
            <>
              <div className="move-component-choice">
                <button
                  className="move-target"
                  aria-label="Change component"
                  onClick={() => {
                    setPick("component");
                    setNotice("Click the component to move.");
                  }}
                >
                  <strong>
                    {state.document.components[occurrence.definition]?.name ||
                      occurrence.name}
                  </strong>
                  <small>
                    Placement in{" "}
                    {state.document.components[occurrence.parent]?.name ||
                      "World"}{" "}
                    coordinates
                  </small>
                </button>
                <button
                  className="icon-button"
                  aria-label="Clear component"
                  title="Clear component"
                  onClick={() => onTarget(null)}
                >
                  <X size={14} />
                </button>
              </div>
              {sameSource > 1 && (
                <p className="operation-help">
                  This placement is shared by {sameSource} occurrences. Their
                  movement is previewed together.
                </p>
              )}
              {occurrence.pattern_mode && (
                <p className="operation-help">
                  Moves the component pattern placement; copies keep their
                  pattern spacing.
                </p>
              )}
            </>
          ) : (
            <label className="field">
              <span>Component to move</span>
              <select
                aria-label="Component to move"
                value=""
                onChange={(e) => {
                  const o = state.occurrences.find(
                    (o) => o.id === e.target.value,
                  );
                  if (o)
                    onTarget({ definition: o.definition, occurrence: o.id });
                }}
              >
                <option value="">
                  Pick a component in the viewport or choose here
                </option>
                {state.occurrences
                  .filter((o) => !o.suppressed)
                  .map((o) => (
                    <option key={o.id} value={o.id}>
                      {state.document.components[o.definition]?.name || o.name}{" "}
                      · {o.id.slice(-6)}
                    </option>
                  ))}
              </select>
            </label>
          )}
        </section>
        {occurrence && (
          <>
            {method === "axes" ? (
              <>
                <section className="operation-section">
                  <h3>Translation distances</h3>
                  <div className="field-grid three">
                    {["x", "y", "z"].map((k) => (
                      <ParameterInput
                        key={k}
                        state={state}
                        label={`${k.toUpperCase()} distance`}
                        value={values[k]}
                        onChange={(v) => change(k, v)}
                      />
                    ))}
                  </div>
                </section>
                <section className="operation-section">
                  <h3>Rotation increments</h3>
                  <div className="field-grid three">
                    {["rx", "ry", "rz"].map((k) => (
                      <ParameterInput
                        key={k}
                        state={state}
                        kind="angle"
                        label={`${k[1].toUpperCase()} rotation`}
                        value={values[k]}
                        onChange={(v) => change(k, v)}
                      />
                    ))}
                  </div>
                  <p className="operation-help">
                    Distances are offsets from the starting placement in the
                    parent frame. Rotation increments add to its X/Y/Z angles
                    about the component origin.
                  </p>
                </section>
              </>
            ) : (
              <section className="operation-section move-reference-section">
                {method === "reference" && (
                  <>
                    <div className="move-inferred-effect" role="note">
                      {inferredMoveLabel(refs, values.distance)}
                    </div>
                    {referenceField("origin", "Origin point")}
                    {!refs.origin && (
                      <small className="operation-help">
                        Uses the component origin until a point is selected.
                      </small>
                    )}
                    {referenceField("target", "Target point")}
                    {referenceField("direction", "Reference direction")}
                    <ParameterInput
                      state={state}
                      label="Movement distance"
                      value={values.distance || automaticDistance}
                      help={
                        values.distance
                          ? "Exact distance overrides reference-based travel."
                          : automaticDistance
                            ? "Automatic from references · edit to set an exact distance."
                            : "Select points to infer travel, or enter an exact distance."
                      }
                      onChange={(v) => change("distance", v)}
                    />
                    {values.distance && (
                      <button
                        className="text-button"
                        onClick={() => change("distance", "")}
                      >
                        Use inferred distance
                      </button>
                    )}
                    <p className="operation-help">
                      A point on this component sets the origin. A point
                      elsewhere sets the target. An edge sets direction. Exact
                      distance overrides target alignment.
                    </p>
                  </>
                )}
                {method === "rotate" && (
                  <>
                    {referenceField("direction", "Rotation axis")}
                    <ParameterInput
                      state={state}
                      kind="angle"
                      label="Rotation angle"
                      value={values.angle}
                      onChange={(v) => change("angle", v)}
                    />
                    <p className="operation-help">
                      Rotates around the selected line at its actual location.
                      Positive angles follow the right-hand rule from the edge's
                      start toward its end.
                    </p>
                  </>
                )}
                {refs.direction && (
                  <label className="checkbox move-reverse">
                    <input
                      type="checkbox"
                      checked={reverse}
                      onChange={(e) => {
                        setReverse(e.target.checked);
                        setConfirmIntent("");
                      }}
                    />
                    Reverse direction
                  </label>
                )}
              </section>
            )}
            <button
              className="text-button move-reset"
              onClick={() => {
                setValues(initial());
                setRefs({});
                setPick(null);
                setReverse(false);
                setNotice("");
                setConfirmIntent("");
              }}
            >
              <RotateCcw size={13} />
              Reset movement
            </button>
          </>
        )}
      </div>
      <footer className="operation-footer">
        {preview.ready && preview.report?.changes?.movement && (
          <div
            className="move-displacement-summary"
            aria-label="Movement measurements"
          >
            <span>
              {method === "rotate" ? "Angle" : "Travel"}{" "}
              <strong>
                {numeric(
                  method === "rotate"
                    ? preview.report.changes.movement.rotation_angle
                    : Math.hypot(
                        ...preview.report.changes.movement.displacement,
                      ),
                  3,
                )}{" "}
                {method === "rotate" ? "°" : "mm"}
              </strong>
            </span>
            {method === "reference" && refs.target && (
              <span>
                Remaining gap{" "}
                <strong>
                  {numeric(preview.report.changes.movement.remaining_gap, 3)} mm
                </strong>
              </span>
            )}
          </div>
        )}

        <div className="operation-commit-row">
          <button
            className="button primary"
            disabled={!ready || committing}
            onClick={() => void accept()}
          >
            {committing ? (
              <LoaderCircle size={12} className="spin" />
            ) : (
              <Check size={12} />
            )}
            Apply move
          </button>
          <button
            className="button secondary"
            disabled={committing}
            onClick={onClose}
          >
            Cancel
          </button>
          <div
            className={`operation-preview-status ${preview.error || problem ? "invalid" : ""}`}
            role="status"
          >
            {preview.pending ? (
              <LoaderCircle size={12} className="spin" />
            ) : ready ? (
              <Check size={12} />
            ) : null}
            <span>
              {notice ||
                problem ||
                preview.error ||
                (!occurrence
                  ? "Select a component to move"
                  : preview.pending
                    ? "Preparing move preview…"
                    : ready
                      ? "Preview validated · ready to apply"
                      : "Rendering move preview…")}
            </span>
          </div>
        </div>
      </footer>
    </aside>
  );
});
