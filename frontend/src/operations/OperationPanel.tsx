import { referenceLabel } from "../geometryLabels";
import {
  referenceMembers,
  groupedSelectionProblem,
  followsPathOrigin,
  orderedPath,
} from "./groupedSelection";
import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  Check,
  Crosshair,
  LoaderCircle,
  MousePointer2,
  Plus,
  RotateCcw,
  X,
  Zap,
} from "lucide-react";
import { ParameterInput } from "../Forms";
import type { Selection, State } from "../types";
import {
  applyPreset,
  isFinish,
  operationCommand,
  operationFrame,
  operationPathLength,
  pathMeasure,
  operationProblem,
  reference,
  inferOperationSelection,
  inferFacePath,
  withSketchProfile,
  operationPathPickProblem,
  type OperationDraft,
  type OperationReference,
  type PickSlot,
} from "./operationModel";
import { useOperationPreview } from "./useOperationPreview";

export interface OperationPanelHandle {
  chooseOrigin: () => void;
  chooseAxis: (axis: "X" | "Y" | "Z") => void;
  canChooseAxis: () => boolean;
  cancel: () => void;
  confirm: () => void;
  capture: (selection: Selection | null, add?: boolean) => void;
  sketchPoint: (point: number[]) => void;
  startPreset: (preset: string) => void;
  useSketch: (featureId: string, drawn?: boolean) => void;
}
export default forwardRef<
  OperationPanelHandle,
  {
    state: State;
    initial: OperationDraft;
    onChange: (draft: OperationDraft, slot: PickSlot, report: any) => void;
    onPreview: (report: any) => void;
    renderedToken: string | null;
    onCommit: (report: any) => Promise<void>;
    onAlign: () => void;
    onClose: () => void;
    onHoverReference: (selection: Selection | null) => void;
    onDrawProfile: (draft: OperationDraft) => void;
    suspended?: boolean;
  }
>(function OperationPanel(
  {
    state,
    initial,
    onChange,
    onPreview,
    onCommit,
    onClose,
    onAlign,
    onHoverReference,
    renderedToken,
    onDrawProfile,
    suspended,
  },
  ref,
) {
  const [draft, setDraft] = useState(initial);
  useEffect(() => () => onHoverReference(null), [onHoverReference]);
  const [pick, setPick] = useState<PickSlot>(null);
  const [notice, setNotice] = useState("");
  const [selectionNotice, setSelectionNotice] = useState<{
    section: "origin" | "profile" | "path";
    text: string;
  } | null>(null);
  const [committing, setCommitting] = useState(false);
  const committingRef = useRef(false);
  const [confirmIntent, setConfirmIntent] = useState("");
  const amountRef = useRef<HTMLDivElement>(null);
  const problem =
    operationProblem(draft) || groupedSelectionProblem(draft, state);
  const args =
    suspended || problem || pick === "sketch" || pick === "place"
      ? null
      : operationCommand(draft);
  const preview = useOperationPreview(args, state.document.revision, onPreview);
  const ready =
    preview.ready && renderedToken === preview.report?.preview_token;
  const draftSignature = args
    ? JSON.stringify([state.document.revision, args])
    : "";
  const notify = useRef(onChange);
  notify.current = onChange;
  useLayoutEffect(() => {
    notify.current(draft, pick, preview.ready ? preview.report : null);
  }, [draft, pick, preview.ready, preview.report]);
  const scrollSection = (id: string) =>
    requestAnimationFrame(() => {
      const body = amountRef.current,
        section = body?.querySelector<HTMLElement>(
          `[data-tool-section="${id}"]`,
        );
      if (body && section)
        body.scrollTo({
          top:
            body.scrollTop +
            section.getBoundingClientRect().top -
            body.getBoundingClientRect().top,
          behavior: "smooth",
        });
    });
  useEffect(() => {
    amountRef.current
      ?.querySelector<HTMLSelectElement>('[data-tool-section="effect"] select')
      ?.focus({ preventScroll: true });
    amountRef.current?.scrollTo({ top: 0 });
  }, []);
  const patch = (change: Partial<OperationDraft>) => {
    setNotice("");
    setDraft((d) => ({ ...d, ...change }));
  };
  const quantity = (key: string, label: string, help?: string) => (
    <ParameterInput
      key={key}
      state={state}
      label={label}
      value={draft.values[key] ?? "0"}
      kind={
        key === "angle"
          ? "angle"
          : key === "count"
            ? "count"
            : key === "path_percent"
              ? "ratio"
              : "length"
      }
      unitLabel={key === "path_percent" ? "%" : undefined}
      unitControl={
        ["distance", "path_percent"].includes(key) &&
        ["linear", "sweep"].includes(draft.motion)
          ? {
              label: "Path extent units",
              value: pathMeasure(draft),
              options: [
                { value: "distance", label: "mm" },
                {
                  value: "percent",
                  label: "%",
                  disabled: !draft.pathReference?.selection.edge,
                },
              ],
              onChange: (value) =>
                patch({ pathMeasure: value as "distance" | "percent" }),
            }
          : undefined
      }
      help={help}
      onChange={(value) => {
        setNotice("");
        setDraft((d) => ({
          ...d,
          ...(["distance", "path_percent"].includes(key)
            ? { travelTarget: null }
            : {}),
          ...(key.startsWith("origin_") ? { originPinned: true } : {}),
          values: { ...d.values, [key]: value },
        }));
      }}
    />
  );
  const preset = (id: string) => {
    if (id === "sketch") {
      onDrawProfile(draft);
      return;
    }
    setDraft((d) => applyPreset(d, id));
    if (
      id === "holes" &&
      draft.target &&
      state.document.components[draft.target.definition].kind === "planar"
    )
      setDraft((d) => ({ ...d, motion: "none", extent: "distance" }));
    setPick(
      id === "holes" && draft.profileReference?.selection.face ? "place" : null,
    );
    if (id === "holes" && draft.profileReference?.selection.face)
      setDraft((d) => ({
        ...d,
        reference: d.profileReference,
        origin: "reference",
      }));
    setNotice("");
    scrollSection(
      [
        "fillet",
        "chamfer",
        "holes",
        "box",
        "cylinder",
        "emboss",
        "sketch",
      ].includes(id)
        ? "profile"
        : "path",
    );
  };
  const beginPick = (slot: PickSlot) => {
    setNotice("");
    setPick(slot);
  };
  useImperativeHandle(ref, () => ({
    canChooseAxis: () =>
      !committingRef.current &&
      !isFinish(draft) &&
      !["none", "mirror"].includes(draft.motion) &&
      (!pick || pick === "path"),
    useSketch(featureId, drawn = false) {
      setDraft((d) => withSketchProfile(d, state, featureId, drawn));
      setNotice("");
      setPick(null);
    },
    cancel: onClose,
    chooseOrigin() {
      if (isFinish(draft) && pick !== "travelTarget") {
        setNotice(
          "Native corner finishes start on the selected edge. Use a travel target to limit a straight finish.",
        );
        return;
      }
      const item = reference(
        { worldOrigin: true, definition: "root", occurrence: "" },
        state,
      );
      patch(
        pick === "travelTarget"
          ? {
              travelTarget: item,
              values: { ...draft.values, distance: "", path_percent: "" },
            }
          : { origin: "reference", reference: item, originPinned: true },
      );
      setPick(null);
    },
    chooseAxis(axis) {
      if (committingRef.current) return;
      if (isFinish(draft)) {
        setNotice("Select model edges for fillet or chamfer paths.");
        return;
      }
      setDraft((d) => ({
        ...d,
        direction: axis,
        pathReference: null,
        pathReferences: [],
        motion: d.motion === "sweep" ? "linear" : d.motion,
      }));
      setPick(null);
      setNotice("");
      setConfirmIntent("");
    },
    confirm: () => {
      if (committingRef.current) return;
      if (problem || !args || preview.error) {
        setNotice(
          problem ||
            preview.error ||
            "Finish placing or closing the profile before applying.",
        );
        return;
      }
      if (ready) void accept();
      else {
        setConfirmIntent(draftSignature);
        preview.flush();
        setNotice(
          "Enter received · waiting for this preview to validate and display…",
        );
      }
    },
    capture(selection, add = false) {
      const blocked = operationPathPickProblem(draft, pick, selection);
      if (blocked) {
        setNotice(blocked);
        return;
      }
      if (!selection) {
        if (pick)
          setNotice(
            "Pick geometry in the viewport, or enter exact coordinates in Tool Origin.",
          );
        return;
      }
      if (!pick) {
        const update = inferOperationSelection(draft, selection, state, add);
        setDraft(update.draft);
        setSelectionNotice({
          section: selection.vertex
            ? "origin"
            : selection.edge
              ? "path"
              : "profile",
          text: update.message,
        });
        setNotice("");
        return;
      }
      const slot = pick;
      setSelectionNotice(null);
      const item = reference(selection, state);
      if (slot === "place" || slot === "sketch") {
        setNotice("Click the shown profile plane to place an exact point.");
        return;
      }
      if (slot === "origin")
        patch({ origin: "reference", reference: item, originPinned: true });
      else if (slot === "travelTarget")
        patch({
          travelTarget: item,
          extent: "distance",
          values: { ...draft.values, distance: "", path_percent: "" },
        });
      else if (slot === "path") {
        if (selection.face) {
          try {
            const update = inferFacePath(draft, selection, state, add);
            patch(update.draft);
            setSelectionNotice({ section: "path", text: update.message });
            setPick(null);
          } catch (e: any) {
            setNotice(e.message);
          }
          return;
        }
        if (!selection.edge) {
          setNotice(
            "Pick an edge for the path. A straight edge can also define an axis.",
          );
          return;
        }
        patch(inferOperationSelection(draft, selection, state, add).draft);
      } else if (slot === "plane") {
        if (selection.face?.type !== "PLANE") {
          setNotice("Pick a planar support face.");
          return;
        }
        patch(
          draft.profile === "body"
            ? { reference: item, origin: "reference", plane: "face" }
            : { profileReference: item, plane: "face" },
        );
      } else if (slot === "profile") {
        if (draft.profile === "body")
          patch({
            profileReference: reference(
              {
                ...selection,
                face: undefined,
                edge: undefined,
                vertex: undefined,
              },
              state,
            ),
          });
        else if (isFinish(draft)) {
          if (selection.face) {
            try {
              patch(inferFacePath(draft, selection, state, add).draft);
              setPick(null);
            } catch (e: any) {
              setNotice(e.message);
            }
            return;
          }
          if (!selection.edge) {
            setNotice(
              "Pick the edge to round or bevel; this becomes the operation path.",
            );
            return;
          }
          patch(inferOperationSelection(draft, selection, state, add).draft);
        } else if (
          draft.profile === "face" &&
          !draft.profileReference &&
          selection.edge
        ) {
          patch({
            profile: "fillet",
            motion: "sweep",
            pathReference: reference(selection, state, "start"),
            reference: reference(selection, state, "start"),
            origin: "reference",
            plane: "perpendicular",
            direction: "edge",
          });
        } else if (selection.face?.type === "PLANE")
          patch(inferOperationSelection(draft, selection, state, add).draft);
        else {
          setNotice("Pick a planar face, or switch the profile to a 3D body.");
          return;
        }
      }
      setPick(null);
    },
    sketchPoint(point) {
      if (pick === "place") {
        setDraft((d) => ({
          ...d,
          values: {
            ...d.values,
            offset_u: String(point[0]),
            offset_v: String(point[1]),
          },
        }));
        setPick(null);
        return;
      }
      if (pick === "sketch")
        setDraft((d) => ({ ...d, points: [...d.points, point] }));
    },
    startPreset: preset,
  }));
  const slotButton = (
    slot: PickSlot,
    label: string,
    value?: OperationReference | null,
  ) => (
    <button
      type="button"
      className={"operation-pick-slot " + (pick === slot ? "picking" : "")}
      onClick={() => beginPick(slot)}
      onMouseEnter={() => value && onHoverReference(value.selection)}
      onMouseLeave={() => onHoverReference(null)}
      onFocus={() => value && onHoverReference(value.selection)}
      onBlur={() => onHoverReference(null)}
    >
      <Crosshair size={15} />
      <span>
        <strong>{label}</strong>
        <small>
          {value
            ? value.sketch
              ? value.label
              : referenceLabel(value.selection, state)
            : "Click here, then pick in the viewport"}
        </small>
      </span>
      <MousePointer2 size={13} />
    </button>
  );
  const groupSummary = (role: "path" | "profile") => {
    const refs = referenceMembers(draft, role);
    if (
      !refs.length ||
      (role === "profile" && !["face", "sketch"].includes(draft.profile))
    )
      return null;
    return (
      <div
        className="operation-reference-set"
        aria-label={
          role === "path" ? "Selected path edges" : "Selected tool profiles"
        }
      >
        <small>
          {`${refs.length} ${role === "path" ? "edge" : "profile"}${refs.length === 1 ? "" : "s"} · Shift-click to add/remove`}
        </small>
        {refs.length > 0 && (
          <div>
            {refs.map((r, i) => (
              <span key={i}>
                <button
                  type="button"
                  className="operation-reference-name"
                  aria-label={`Highlight ${r.sketch ? r.label : referenceLabel(r.selection, state)}`}
                  onMouseEnter={() => onHoverReference(r.selection)}
                  onMouseLeave={() => onHoverReference(null)}
                  onFocus={() => onHoverReference(r.selection)}
                  onBlur={() => onHoverReference(null)}
                  onClick={() => onHoverReference(r.selection)}
                >
                  {r.sketch ? r.label : referenceLabel(r.selection, state)}
                </button>
                <button
                  aria-label={`Remove ${role} ${i + 1}`}
                  onClick={() => {
                    onHoverReference(null);
                    const remaining = refs.filter((_, j) => j !== i),
                      first = remaining[0];
                    patch(
                      role === "path"
                        ? {
                            pathReferences: remaining,
                            pathReference: first || null,
                            ...(followsPathOrigin(draft)
                              ? {
                                  reference: (() => {
                                    try {
                                      const start = orderedPath(
                                        remaining,
                                        state,
                                      )[0];
                                      return start
                                        ? {
                                            ...start.reference,
                                            anchor: start.reverse
                                              ? ("end" as const)
                                              : ("start" as const),
                                          }
                                        : null;
                                    } catch {
                                      return first || null;
                                    }
                                  })(),
                                }
                              : {}),
                          }
                        : {
                            profileReferences: remaining,
                            profileReference: first?.sketch
                              ? null
                              : first || null,
                            profile: first?.sketch ? "sketch" : "face",
                            sketch: first?.sketch || "",
                            sketchOccurrence: first?.selection.occurrence || "",
                            ...(!draft.originPinned
                              ? { reference: first || null }
                              : {}),
                          },
                    );
                  }}
                >
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };
  const selectionFeedback = (section: "origin" | "profile" | "path") => {
    if (!selectionNotice || selectionNotice.section !== section) return null;
    // Counts and Shift-click instructions already live in the authoritative group rows.
    if (
      section === "path" ||
      (section === "profile" && ["face", "sketch"].includes(draft.profile))
    )
      return null;
    return (
      <p
        className="operation-selection-feedback"
        role="status"
        aria-label="Selection update"
      >
        {selectionNotice.text}
      </p>
    );
  };
  const accept = async () => {
    if (!ready || committingRef.current) return;
    committingRef.current = true;
    setConfirmIntent("");
    setCommitting(true);
    try {
      await onCommit(preview.report);
    } catch (error: any) {
      if (error.code === "expired_preview") {
        setNotice("");
        preview.retry();
        return;
      }
      setNotice(
        error.message ||
          "The preview could not be committed. Review the current revision and preview again.",
      );
    } finally {
      committingRef.current = false;
      setCommitting(false);
    }
  };
  useEffect(() => {
    if (!confirmIntent) return;
    if (confirmIntent !== draftSignature || preview.error) {
      setConfirmIntent("");
      setNotice("");
    } else if (ready) void accept();
  }, [confirmIntent, draftSignature, ready, preview.error]);
  return (
    <aside
      className="right-panel operation-panel"
      aria-label="Tool operation workspace"
      data-locked-target={draft.target?.definition || "new"}
    >
      <header className="operation-header">
        <div>
          <h2>
            Tool operation <kbd>T</kbd>
          </h2>
        </div>
        <button
          className="icon-button"
          aria-label="Cancel tool operation"
          disabled={committing}
          onClick={onClose}
        >
          <X size={18} />
        </button>
      </header>
      <div className="operation-fields" ref={amountRef}>
        <p className="operation-introduction">
          Use these options to configure a tool operation. Select an origin
          point, a tool profile/shape, and a path for the tool to travel along
          in order to either add to or remove from the active component.
        </p>
        <section
          className="operation-section"
          data-tool-section="effect"
          aria-labelledby="tool-effect-title"
        >
          <h3 id="tool-effect-title">Tool Effect</h3>
          <label className="field">
            <select
              aria-label="Tool Effect Type"
              value={isFinish(draft) ? "finish" : draft.result}
              disabled={isFinish(draft)}
              onChange={(e) =>
                patch({ result: e.target.value as OperationDraft["result"] })
              }
            >
              {isFinish(draft) ? (
                <option value="finish">Refine edge</option>
              ) : (
                [
                  ["auto", "Auto · detect add / remove"],
                  ["new", "New component"],
                  ["add", "Add material"],
                  ["cut", "Remove material"],
                  ["intersect", "Keep intersection"],
                ].map(([id, label]) => (
                  <option
                    key={id}
                    value={id}
                    disabled={id !== "new" && !draft.target}
                  >
                    {label}
                  </option>
                ))
              )}
            </select>
          </label>
          {draft.target &&
            state.occurrences.filter(
              (o) => o.definition === draft.target!.definition,
            ).length > 1 && (
              <p className="operation-help">
                Edits affect all linked instances.
              </p>
            )}
          {draft.result === "auto" && !isFinish(draft) && (
            <div
              className="operation-auto-decision"
              role="note"
              aria-label="Automatic Tool Effect"
              data-mode={
                preview.ready
                  ? preview.report?.operation_decision?.mode ||
                    (preview.report?.changes?.ownership_change ? "new" : "add")
                  : "pending"
              }
            >
              {preview.ready
                ? preview.report?.changes?.ownership_change
                  ? "Auto · New component · separate material"
                  : `Auto · ${preview.report?.operation_decision?.mode === "cut" ? "Remove" : "Add"} material · ${Math.round((preview.report?.operation_decision?.overlap_fraction || 0) * 100)}% of tool inside target`
                : "Auto · detecting material overlap…"}
            </div>
          )}
          {preview.ready &&
            preview.report?.changes?.ownership_change &&
            draft.result !== "auto" && (
              <p className="operation-help">
                Separate material creates a new component.
              </p>
            )}
        </section>
        <section
          className="operation-section"
          data-tool-section="origin"
          aria-labelledby="tool-origin-title"
        >
          <h3 id="tool-origin-title">Tool Origin</h3>
          <div
            className="operation-reference-control"
            data-reference-role="origin"
          >
            {isFinish(draft) ? (
              <>
                <div className="operation-reference-derived">
                  <strong>From Tool Path</strong>
                  <small>
                    {draft.pathReference?.label || "Pick an edge in Tool Path"}
                  </small>
                </div>
                <p className="operation-reference-status">
                  Origin follows the start of the selected path.
                </p>
              </>
            ) : draft.profile === "body" &&
              draft.keepBodyPlacement &&
              draft.motion !== "mirror" ? (
              <>
                <div className="operation-reference-derived">
                  <strong>From Tool Profile body</strong>
                  <small>
                    {draft.profileReference?.label ||
                      "Pick a body in Tool Profile"}
                  </small>
                </div>
                <p className="operation-reference-status">
                  Uses the body's placed location and orientation.
                </p>
                <button
                  className="text-button"
                  onClick={() => patch({ keepBodyPlacement: false })}
                >
                  Anchor the body at an origin
                </button>
              </>
            ) : (
              <>
                {slotButton("origin", "Tool Origin reference", draft.reference)}
                {selectionFeedback("origin") || (
                  <p className="operation-reference-status">
                    Origin follows this reference and its offsets.
                  </p>
                )}
              </>
            )}
          </div>
          {!isFinish(draft) &&
            !(
              draft.profile === "body" &&
              draft.keepBodyPlacement &&
              draft.motion !== "mirror"
            ) && (
              <>
                {draft.reference?.selection.edge && (
                  <label className="field">
                    <span>Point on edge</span>
                    <select
                      value={draft.reference.anchor}
                      onChange={(e) =>
                        patch({
                          reference: {
                            ...draft.reference!,
                            anchor: e.target.value as any,
                          },
                        })
                      }
                    >
                      <option value="start">Start vertex</option>
                      <option value="mid">Exact midpoint</option>
                      <option value="end">End vertex</option>
                    </select>
                  </label>
                )}
                <div
                  className="operation-reference-offset"
                  role="group"
                  aria-label="Reference point offset"
                >
                  <span className="operation-field-label">
                    Reference point offset
                  </span>
                  <div className="operation-quantity-grid">
                    {quantity("offset_u", "Along U")}
                    {quantity("offset_v", "Along V")}
                    {quantity("offset_n", "Normal offset")}
                  </div>
                </div>
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={!!draft.originPinned}
                    onChange={(e) => patch({ originPinned: e.target.checked })}
                  />
                  Keep this origin when replacing faces or paths
                </label>
              </>
            )}
        </section>
        <section
          className="operation-section"
          data-tool-section="profile"
          aria-labelledby="tool-profile-title"
        >
          <div className="operation-section-heading">
            <h3 id="tool-profile-title">Tool Profile</h3>
            {!isFinish(draft) && draft.profile !== "body" && (
              <button
                className="text-button operation-align"
                aria-label="Look straight at Tool Profile plane"
                onClick={onAlign}
              >
                <Crosshair size={13} />
                Align view
              </button>
            )}
          </div>
          <label className="field">
            <span>Tool Profile Shape</span>
            <select
              aria-label="Tool Profile Shape"
              value={draft.profile}
              onChange={(e) => {
                const id = e.target.value;
                if (id === "polygon") {
                  onDrawProfile(draft);
                  return;
                }
                patch({
                  profile: id as any,
                  ...(["circle", "rectangle", "polygon"].includes(id) &&
                  draft.pathReference?.selection.edge &&
                  draft.direction === "edge"
                    ? {
                        plane: "perpendicular" as const,
                        ...(isFinish(draft)
                          ? {
                              origin: "reference" as const,
                              reference: draft.pathReference,
                              originPinned: false,
                            }
                          : {}),
                      }
                    : {}),
                  ...(id === "body" ? { motion: "none" as const } : {}),
                  ...(id === "fillet" || id === "chamfer"
                    ? { motion: "sweep" as const }
                    : {}),
                });
                // A profile change replaces the current acquisition action too.
                // Leaving Draw Profile must not keep swallowing viewport picks.
                setPick(id === "polygon" ? "sketch" : null);
              }}
            >
              {[
                ["face", "Selected face"],
                ["circle", "Circle"],
                ["rectangle", "Rectangle"],
                ["polygon", "Draw profile"],
                ["sketch", "Existing sketch"],
                ["body", "3D body"],
                ["fillet", "Round corner"],
                ["chamfer", "Bevel corner"],
              ].map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <div
            className="operation-reference-control"
            data-reference-role="profile"
          >
            {!["face", "sketch", "body", "fillet", "chamfer"].includes(
              draft.profile,
            ) && (
              <>
                <label className="field">
                  <span>Profile plane</span>
                  <select
                    aria-label="Profile plane"
                    value={draft.plane}
                    onChange={(e) => patch({ plane: e.target.value as any })}
                  >
                    <option value="face">On a support face</option>
                    <option value="perpendicular">
                      Perpendicular to Tool Path
                    </option>
                    <option value="axial">
                      Contains the rotation axis direction
                    </option>
                    <option value="XY">World XY</option>
                    <option value="XZ">World XZ</option>
                    <option value="YZ">World YZ</option>
                  </select>
                </label>
                {draft.plane === "face" &&
                  slotButton("plane", "Support plane", draft.profileReference)}
              </>
            )}
            {["face", "body"].includes(draft.profile) &&
              slotButton(
                "profile",
                "Tool Profile reference",
                draft.profileReference,
              )}
            {draft.profile === "sketch" && (
              <label className="field">
                <span>Closed profile</span>
                <select
                  aria-label="Closed profile"
                  value={
                    draft.sketch
                      ? `${draft.sketch}|${draft.sketchOccurrence}`
                      : ""
                  }
                  onChange={(e) => {
                    const [sketch, sketchOccurrence] =
                      e.target.value.split("|");
                    const chosen = sketch
                      ? {
                          selection: {
                            definition: state.document.features[sketch].owner,
                            occurrence: sketchOccurrence,
                          },
                          sketch,
                          anchor: "center" as const,
                          label: state.document.features[sketch].name,
                        }
                      : null;
                    setSelectionNotice(null);
                    patch({
                      sketch,
                      sketchOccurrence,
                      profileReference: null,
                      profileReferences: chosen ? [chosen] : [],
                      plane: "XY",
                      ...(!draft.originPinned
                        ? { reference: chosen, origin: "reference" as const }
                        : {}),
                    });
                  }}
                >
                  <option value="">Choose a profile…</option>
                  {Object.values(state.document.features)
                    .filter(
                      (f) =>
                        ["sketch", "rectangle", "circle"].includes(f.type) ||
                        (f.type === "operation" &&
                          state.profiles?.[f.id]?.status === "closed"),
                    )
                    .flatMap((f) =>
                      f.owner === "root"
                        ? [
                            <option key={f.id} value={`${f.id}|`}>
                              {f.name} · Design sketch
                            </option>,
                          ]
                        : state.occurrences
                            .filter(
                              (o) => o.definition === f.owner && !o.suppressed,
                            )
                            .map((o) => (
                              <option
                                key={f.id + o.id}
                                value={`${f.id}|${o.id}`}
                              >
                                {state.document.components[f.owner]?.name} ·{" "}
                                {f.name} · {o.id.slice(-4)}
                              </option>
                            )),
                    )}
                </select>
              </label>
            )}

            {draft.profile === "sketch" &&
              slotButton(
                "profile",
                "Tool Profile reference",
                referenceMembers(draft, "profile")[0],
              )}
            {isFinish(draft) && (
              <div className="operation-reference-derived">
                <strong>Native corner section</strong>
                <small>Perpendicular to the selected Tool Path</small>
              </div>
            )}
            {!["face", "sketch", "body", "fillet", "chamfer"].includes(
              draft.profile,
            ) &&
              draft.plane !== "face" && (
                <div className="operation-reference-derived">
                  <strong>
                    {["XY", "XZ", "YZ"].includes(draft.plane)
                      ? `World ${draft.plane} plane`
                      : draft.plane === "perpendicular"
                        ? "Perpendicular to Tool Path"
                        : "Contains the rotation axis"}
                  </strong>
                  <small>Positioned at Tool Origin</small>
                </div>
              )}
            {groupSummary("profile")}
            {selectionFeedback("profile")}
          </div>
          {isFinish(draft) ? (
            <>
              {quantity(
                "amount",
                draft.profile === "fillet" ? "Radius" : "Bevel distance",
              )}
              <p className="operation-help">
                Native perpendicular{" "}
                {preview.report?.operation_display?.finish_section?.effect ||
                  "corner"}{" "}
                section
                {preview.ready &&
                preview.report?.operation_display?.finish_section?.area
                  ? ` · ${preview.report.operation_display.finish_section.area.toFixed(3)} mm²`
                  : ""}
                . Partial straight finishes have planar end caps.
              </p>
            </>
          ) : (
            <>
              {draft.profile === "circle" && (
                <>
                  <button
                    className="text-button"
                    onClick={() => preset("holes")}
                  >
                    Hole setup · place a circle and cut through
                  </button>
                  {quantity("diameter", "Profile diameter")}
                  {draft.profileReference?.selection.face && (
                    <button
                      className="operation-pick-slot"
                      onClick={() => {
                        patch({
                          reference: draft.profileReference,
                          origin: "reference",
                        });
                        beginPick("place");
                      }}
                    >
                      <Crosshair size={15} />
                      <span>
                        <strong>Place on support face</strong>
                        <small>Snap to exact 1 mm U/V coordinates</small>
                      </span>
                    </button>
                  )}
                </>
              )}
              {draft.profile === "rectangle" && (
                <div className="field-grid">
                  {quantity("width", "Profile width")}
                  {quantity("height", "Profile height")}
                </div>
              )}
              {draft.profile === "body" && (
                <label className="field">
                  <span>3D Tool Body library</span>
                  <select
                    aria-label="3D Tool Body library"
                    value={
                      state.document.components[
                        draft.profileReference?.selection.definition || ""
                      ]?.purpose === "tool"
                        ? draft.profileReference?.selection.definition
                        : ""
                    }
                    onChange={(e) => {
                      const source = state.occurrences.find(
                        (o) => o.definition === e.target.value,
                      );
                      if (source)
                        patch({
                          profileReference: reference(
                            {
                              occurrence: source.id,
                              definition: source.definition,
                            },
                            state,
                          ),
                          keepBodyPlacement: false,
                        });
                    }}
                  >
                    <option value="">Choose a reusable tool body</option>
                    {Object.values(state.document.components)
                      .filter(
                        (c) =>
                          c.purpose === "tool" &&
                          state.geometry[c.id]?.status === "valid",
                      )
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              {draft.profile === "body" &&
                state.document.components[
                  draft.profileReference?.selection.definition || ""
                ]?.purpose !== "tool" && (
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={draft.keepBodyPlacement}
                      onChange={(e) =>
                        patch({ keepBodyPlacement: e.target.checked })
                      }
                    />
                    Keep the body's placed orientation and location
                  </label>
                )}
              {draft.profile === "polygon" && (
                <button onClick={() => onDrawProfile(draft)}>
                  Edit drawn profile
                </button>
              )}
            </>
          )}
        </section>
        <section
          className="operation-section"
          data-tool-section="path"
          aria-labelledby="tool-path-title"
        >
          <h3 id="tool-path-title">Tool Path</h3>
          {isFinish(draft) ? (
            <label className="field">
              <span>Tool Path Type</span>
              <select aria-label="Tool Path Type" disabled value="finish">
                <option value="finish">Native edge finish</option>
              </select>
            </label>
          ) : (
            <label className="field">
              <span>Tool Path Type</span>
              <select
                aria-label="Tool Path Type"
                value={draft.motion}
                onChange={(e) => patch({ motion: e.target.value as any })}
              >
                <option value="linear">Straight travel / extrusion</option>
                <option value="sweep">Follow a design edge / sweep</option>
                <option value="revolve">Rotate about an axis</option>
                <option value="helix">Rotate and travel / helix</option>
                <option value="none">No motion / placed Boolean</option>
                <option value="mirror">Mirror about a plane</option>
                <option value="pattern">
                  Connected repeat along direction
                </option>
              </select>
            </label>
          )}
          <div
            className="operation-reference-control"
            data-reference-role="path"
          >
            {isFinish(draft) ? (
              <>
                <div className="operation-reference-derived">
                  <strong>Native edge finish</strong>
                </div>
                {slotButton("path", "Tool Path reference", draft.pathReference)}
              </>
            ) : (
              <>
                {!["mirror", "none"].includes(draft.motion) && (
                  <>
                    <label className="field">
                      <span>Direction or axis</span>
                      <select
                        aria-label="Direction or axis"
                        value={draft.direction}
                        onChange={(e) =>
                          patch({
                            direction: e.target.value as any,
                            ...(e.target.value !== "edge"
                              ? { pathReference: null, pathReferences: [] }
                              : {}),
                          })
                        }
                      >
                        <option value="normal">Profile normal</option>
                        <option value="edge">Picked edge direction</option>
                        <option value="X">World X</option>
                        <option value="Y">World Y</option>
                        <option value="Z">World Z</option>
                      </select>
                    </label>
                    {draft.direction === "edge" || draft.motion === "sweep" ? (
                      slotButton(
                        "path",
                        "Tool Path reference",
                        draft.pathReference,
                      )
                    ) : (
                      <div className="operation-reference-derived">
                        <strong>
                          {draft.direction === "normal"
                            ? "Tool Profile normal"
                            : `World ${draft.direction} direction`}
                        </strong>
                        <small>Implicit path through Tool Origin</small>
                      </div>
                    )}
                  </>
                )}
                {draft.motion === "mirror" && (
                  <label className="field">
                    <span>Mirror plane through the origin</span>
                    <select
                      value={draft.plane}
                      onChange={(e) => patch({ plane: e.target.value as any })}
                    >
                      <option value="XY">World XY</option>
                      <option value="XZ">World XZ</option>
                      <option value="YZ">World YZ</option>
                      <option value="face">Selected support face</option>
                    </select>
                    {draft.plane === "face" &&
                      slotButton(
                        "plane",
                        "Mirror plane",
                        draft.profileReference,
                      )}
                  </label>
                )}
                {draft.motion === "none" && (
                  <div className="operation-reference-derived">
                    <strong>No travel</strong>
                    <small>Apply the body at its placed location</small>
                  </div>
                )}
              </>
            )}
            {(isFinish(draft) ||
              draft.direction === "edge" ||
              draft.motion === "sweep") &&
              groupSummary("path")}
            {selectionFeedback("path")}
          </div>
          {["linear", "sweep", "helix"].includes(draft.motion) &&
            draft.extent !== "through" && (
              <div className="operation-path-travel">
                <div className="operation-path-target-row">
                  <div
                    className="operation-reference-control"
                    data-reference-role="path"
                  >
                    {slotButton(
                      "travelTarget",
                      "Travel target point",
                      draft.travelTarget,
                    )}
                    <div className="operation-section-heading">
                      <button
                        className="text-button"
                        onClick={() => {
                          patch({
                            travelTarget: reference(
                              {
                                worldOrigin: true,
                                definition: "root",
                                occurrence: "",
                              },
                              state,
                            ),
                            values: {
                              ...draft.values,
                              distance: "",
                              path_percent: "",
                            },
                          });
                          setPick(null);
                        }}
                      >
                        World origin
                      </button>
                      {draft.travelTarget && (
                        <button
                          className="icon-button"
                          aria-label="Clear travel target"
                          onClick={() => patch({ travelTarget: null })}
                        >
                          <X size={13} />
                        </button>
                      )}
                    </div>
                  </div>
                  {draft.travelTarget ? (
                    <label className="field operation-projected-distance">
                      <span>Projected travel</span>
                      <div className="quantity-input">
                        <input
                          aria-label="Projected travel"
                          readOnly
                          value={
                            preview.ready
                              ? (
                                  preview.report?.operation_display?.travel
                                    ?.distance || 0
                                ).toLocaleString(undefined, {
                                  maximumFractionDigits: 3,
                                })
                              : "…"
                          }
                        />
                        <small>mm</small>
                      </div>
                    </label>
                  ) : !isFinish(draft) ? (
                    draft.motion === "helix" ? (
                      quantity("distance", "Axial rise")
                    ) : pathMeasure(draft) === "percent" ? (
                      quantity("path_percent", "Path percentage")
                    ) : (
                      quantity("distance", "Path distance")
                    )
                  ) : null}
                </div>
                <p className="operation-reference-status">
                  Target projects onto the travel path. Blank distance and no
                  target use the full finite path.
                </p>
                {!isFinish(draft) && (
                  <div className="operation-path-length-actions">
                    <button
                      className="text-button"
                      onClick={() =>
                        patch({
                          travelTarget: null,
                          pathMeasure: "distance",
                          values: {
                            ...draft.values,
                            distance: "",
                            path_percent: "",
                          },
                        })
                      }
                    >
                      {draft.motion === "helix"
                        ? "Use full axis length"
                        : "Use full path"}
                    </button>
                    {(() => {
                      const length = operationPathLength(draft, state);
                      return length ? (
                        <p className="operation-extent-total">
                          Total path:{" "}
                          <strong>
                            {length.toLocaleString(undefined, {
                              maximumFractionDigits: 3,
                            })}{" "}
                            mm
                          </strong>
                        </p>
                      ) : null;
                    })()}
                  </div>
                )}
                {isFinish(draft) && (
                  <p className="operation-help">
                    Full selected edges unless a travel target is chosen.
                    Target-limited finishes require one straight edge and end
                    with a planar cap.
                  </p>
                )}
              </div>
            )}
          {!["none", "mirror"].includes(draft.motion) && (
            <section
              className="operation-path-extent"
              aria-label="Path Direction"
            >
              <h4>Path Direction</h4>
              <select
                aria-label="Extent"
                value={
                  draft.motion === "linear" && !isFinish(draft)
                    ? draft.extent
                    : "distance"
                }
                disabled={draft.motion !== "linear" || isFinish(draft)}
                onChange={(e) => patch({ extent: e.target.value as any })}
              >
                <option value="distance">
                  {isFinish(draft) ? "Along selected edges" : "One direction"}
                </option>
                {draft.motion === "linear" && !isFinish(draft) && (
                  <>
                    <option value="symmetric">Symmetric about origin</option>
                    <option value="through">
                      Through target in both directions
                    </option>
                  </>
                )}
              </select>
              {!isFinish(draft) && (
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={draft.reverse}
                    onChange={(e) => patch({ reverse: e.target.checked })}
                  />
                  Reverse reference direction
                </label>
              )}
            </section>
          )}
          {!isFinish(draft) && (
            <>
              {draft.motion === "pattern" && (
                <>
                  {quantity("count", "Copies including original")}
                  {quantity("spacing", "Copy spacing")}
                  <p className="operation-help">
                    Copies must form one connected part. Repeat part in the
                    toolbar creates separate linked components.
                  </p>
                </>
              )}
              {["revolve", "helix"].includes(draft.motion) && (
                <>
                  {quantity("angle", "Rotation angle")}
                  {(draft.direction !== "edge" || !draft.pathReference) && (
                    <details>
                      <summary>Axis through an exact world point</summary>
                      <div className="operation-quantity-grid">
                        {quantity("axis_x", "Axis X")}
                        {quantity("axis_y", "Axis Y")}
                        {quantity("axis_z", "Axis Z")}
                      </div>
                    </details>
                  )}
                </>
              )}
            </>
          )}
        </section>
      </div>
      <footer className="operation-footer">
        {pick && (
          <div className="operation-pick-prompt">
            <MousePointer2 size={15} />
            <span>
              {pick === "place"
                ? "Place on the face · exact 1 mm U/V snap"
                : pick === "sketch"
                  ? "Draw exact points on the profile plane"
                  : `Pick ${pick === "plane" ? "Tool Profile plane" : `Tool ${pick[0].toUpperCase()}${pick.slice(1)}`} geometry in the viewport`}
            </span>
            <button aria-label="Stop picking" onClick={() => setPick(null)}>
              <X size={14} />
            </button>
          </div>
        )}
        {preview.ready && (
          <div className="operation-preview-metrics">
            {(() => {
              const owner =
                preview.report.changes?.component_id ||
                draft.target?.definition;
              const next = preview.report.components?.[owner]?.volume;
              const before = preview.report.changes?.component_id
                ? 0
                : state.geometry[owner || ""]?.volume;
              if (typeof next !== "number") return "Planar region validated";
              const change = (next - (before || 0)) / 1000;
              return `Material volume ${change >= 0 ? "+" : ""}${change.toLocaleString(undefined, { maximumFractionDigits: 3 })} cm³`;
            })()}
          </div>
        )}
        <label className="field">
          <span>Feature Name</span>
          <input
            value={draft.name}
            onChange={(e) => patch({ name: e.target.value })}
          />
        </label>
        <div className="operation-commit-row">
          <button
            className="button primary"
            disabled={!ready || committing}
            onClick={() => void accept()}
          >
            {committing ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <Check size={15} />
            )}
            Apply operation
          </button>
          <button
            className="button secondary"
            disabled={committing}
            onClick={onClose}
          >
            Cancel
          </button>
          <div
            className={
              "operation-preview-status " + (preview.error ? "invalid" : "")
            }
            role="status"
          >
            {preview.pending ? (
              <LoaderCircle size={15} className="spin" />
            ) : preview.ready ? (
              <Check size={15} />
            ) : (
              <Crosshair size={15} />
            )}
            <span>
              {notice ||
                problem ||
                preview.error ||
                (pick === "place"
                  ? "Choose a position on the support plane"
                  : pick === "sketch"
                    ? "Close the profile to build a preview"
                    : preview.ready && !ready
                      ? "Rendering validated preview…"
                      : preview.ready
                        ? "Preview validated · ready to apply"
                        : "Preparing preview…")}
            </span>
          </div>
        </div>
      </footer>
    </aside>
  );
});
