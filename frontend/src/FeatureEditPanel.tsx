import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Check, Crosshair, History, LoaderCircle, LockKeyhole, X } from "lucide-react";
import { ParameterInput } from "./Forms";
import type { Feature, State } from "./types";
import { FEATURE_EDIT_SECTION_ORDER, PATH_TYPE_LABELS, PROFILE_SHAPE_LABELS, featureEditChanges, featureEditValues, featureFieldLabel, featureFieldSection, featureFieldVisible, featureSavedReferences, type SavedFeatureReference } from "./featureEditModel";
import { useOperationPreview } from "./operations/useOperationPreview";

export interface FeatureEditHandle { confirm: () => void; cancel: () => void }

function SavedReferences({role, title, references}: {role: "origin" | "profile" | "path"; title: string; references: SavedFeatureReference[]}) {
  return <div className="operation-reference-control" data-reference-role={role} role="group" aria-label={`Saved ${title} references`}>
    <div className="operation-pick-slot operation-readonly-reference">
      <Crosshair size={15} aria-hidden="true" />
      <span><strong>{title} reference</strong><small>{references.length > 1 ? `${references.length} saved ${role === "path" ? "edges" : "profiles"}` : references[0]?.label}</small></span>
      <LockKeyhole size={13} aria-label="Read only" />
    </div>
    {references.length > 1 ? <div className="operation-reference-set"><small>Read only</small><div>{references.map((reference, index) => <span key={index} title={reference.detail}><span>{reference.label}</span></span>)}</div></div>
      : <p className="operation-reference-status">{references[0]?.detail}</p>}
  </div>;
}

export default forwardRef<FeatureEditHandle, {
  feature: Feature; state: State; renderedToken: string | null;
  onPreview: (report: any) => void; onCommit: (report: any) => Promise<void>; onClose: () => void;
}>(function FeatureEditPanel({ feature, state, renderedToken, onPreview, onCommit, onClose }, ref) {
  const [initial] = useState(() => featureEditValues(feature, state));
  const [revision] = useState(state.document.revision);
  const [values, setValues] = useState(initial);
  const [name, setName] = useState(feature.name);
  const [options, setOptions] = useState<Record<string, any>>({});
  const [suppressed, setSuppressed] = useState(feature.suppressed);
  const [error, setError] = useState("");
  const [committing, setCommitting] = useState(false);
  const committingRef = useRef(false);
  const [confirmIntent, setConfirmIntent] = useState("");
  const stale = revision !== state.document.revision;
  const changes = featureEditChanges(feature, initial, values, name, options, suppressed);
  const problem = !name.trim() ? "Give the feature a name." : Object.values(values).some(v => !v.trim()) ? "Enter a value for each dimension." : stale ? "The design changed while this editor was open. Cancel and reopen the feature." : "";
  const args = problem ? null : changes;
  const signature = args ? JSON.stringify(args) : "";
  const preview = useOperationPreview(args, revision, onPreview, "feature.update");
  const ready = preview.ready && renderedToken === preview.report?.preview_token;
  const apply = async () => {
    if (!ready || problem || committingRef.current) return;
    committingRef.current = true; setCommitting(true); setError(""); setConfirmIntent("");
    try { await onCommit(preview.report); }
    catch (e: any) { setError(e.message || "The change could not be applied."); }
    finally { committingRef.current = false; setCommitting(false); }
  };
  const confirm = () => {
    if (!changes) { onClose(); return; }
    if (problem || preview.error || committingRef.current) return;
    if (ready) void apply();
    else { setConfirmIntent(signature); preview.flush(); }
  };
  useImperativeHandle(ref, () => ({ confirm, cancel: onClose }));
  useEffect(() => {
    if (!confirmIntent) return;
    if (confirmIntent !== signature || preview.error || problem) setConfirmIntent("");
    else if (ready) void apply();
  }, [confirmIntent, signature, ready, preview.error, problem]);
  const sections = feature.type === "operation" ? ["Tool Profile", "Tool Path", "Tool Origin"] : [...new Set(Object.keys(values).filter(featureFieldVisible).map(field => featureFieldSection(feature, field)))];
  sections.sort((a, b) => FEATURE_EDIT_SECTION_ORDER.indexOf(a) - FEATURE_EDIT_SECTION_ORDER.indexOf(b));
  const finish = ["fillet", "chamfer"].includes(feature.options.profile);
  const effectKey = feature.type === "operation" ? "result" : "operation";
  const effect = options[effectKey] ?? feature.options[effectKey];
  const showEffect = feature.type === "operation" || effect !== undefined;
  const first = state.document.components[feature.owner]?.feature_ids[0] === feature.id;
  const status = problem || error || preview.error || (committing ? "Applying changes…" : !changes ? "No changes" : ready ? "Preview validated" : preview.pending ? "Rebuilding design…" : "Loading preview…");
  return <aside className="operation-panel feature-edit-panel" aria-label="Edit feature">
    <header className="operation-header"><div><span className="eyebrow">EDIT EXISTING FEATURE</span><h2><History size={17} /> {feature.name}</h2></div><button className="icon-button" aria-label="Cancel feature edit" onClick={onClose}><X size={17} /></button></header>
    <div className="operation-fields">
      <p className="feature-edit-context">{state.document.components[feature.owner]?.name} · Feature {state.document.feature_order.indexOf(feature.id) + 1} of {state.document.feature_order.length}</p>
      <p className="feature-edit-help">Changes rebuild this feature and all later features. Original profile and references are retained.</p>
      {showEffect && <section className="operation-section" data-tool-section="effect"><h3>Tool Effect</h3><label className="field"><select aria-label="Tool Effect Type" disabled={finish} value={finish ? "finish" : effect || "add"} onChange={e => setOptions(o => ({...o, [effectKey]: e.target.value}))}>
        {finish ? <option value="finish">Refine edge</option> : <>{first && <option value="new">New component</option>}{feature.type === "operation" && <option value="auto">Auto · detect add / remove</option>}<option value="add">Add material</option><option value="cut">Remove material</option><option value="intersect">Keep intersection</option></>}
      </select></label></section>}
      {sections.map(section => <section className="operation-section" key={section} data-tool-section={section.replace("Tool ", "").toLowerCase()}><h3>{section}</h3>
        {section === "Tool Profile" && <><label className="field"><span>Tool Profile Shape</span><select aria-label="Tool Profile Shape" disabled value={feature.options.profile}><option value={feature.options.profile}>{PROFILE_SHAPE_LABELS[feature.options.profile] || feature.options.profile}</option></select></label><SavedReferences role="profile" title="Tool Profile" references={featureSavedReferences(feature, state, "profile")} /></>}
        {section === "Tool Path" && <><label className="field"><span>Tool Path Type</span><select aria-label="Tool Path Type" disabled value={feature.options.motion}><option value={feature.options.motion}>{finish ? "Native edge finish" : PATH_TYPE_LABELS[feature.options.motion] || feature.options.motion}</option></select></label><SavedReferences role="path" title="Tool Path" references={featureSavedReferences(feature, state, "path")} />{featureSavedReferences(feature, state, "target").length > 0 && <SavedReferences role="path" title="Travel target point" references={featureSavedReferences(feature, state, "target")} />}</>}
        {section === "Tool Origin" && <SavedReferences role="origin" title="Tool Origin" references={featureSavedReferences(feature, state, "origin")} />}
        {Object.keys(values).some(field => featureFieldVisible(field) && featureFieldSection(feature, field) === section) && <div className="field-grid">{Object.keys(values).filter(field => featureFieldVisible(field) && featureFieldSection(feature, field) === section).map(field => <ParameterInput key={field} state={state} label={featureFieldLabel(feature, field)} value={values[field]} kind={state.document.parameters[feature.parameters[field]].kind} unitLabel={field === "path_percent" ? "%" : undefined} onChange={value => {setError(""); setValues(v => ({...v, [field]: value}));}} />)}</div>}
        {section === "Tool Path" && !finish && feature.options.motion !== "none" && <>
          {feature.options.motion === "linear" && "distance" in feature.parameters && <label className="field"><span>Path Direction</span><select aria-label="Path Direction" value={options.extent ?? feature.options.extent} onChange={e => setOptions(o => ({...o, extent: e.target.value}))}><option value="distance">One direction</option><option value="symmetric">Symmetric</option><option value="through">Through all</option></select></label>}
          <label className="checkbox"><input type="checkbox" checked={options.reverse ?? feature.options.reverse ?? false} onChange={e => setOptions(o => ({...o, reverse: e.target.checked}))} />Reverse direction</label>
        </>}
      </section>)}
      <section className="operation-section"><label className="checkbox"><input type="checkbox" checked={suppressed} onChange={e => setSuppressed(e.target.checked)} />Suppress feature</label></section>
    </div>
    <footer className="operation-footer"><label className="field"><span>Feature Name</span><input aria-label="Feature Name" value={name} maxLength={120} onChange={e => {setName(e.target.value);setError("");}} /></label>
      {(problem || error || preview.error) && <p className="feature-edit-error" role="alert">{status}</p>}
      <div className="operation-commit-row"><button className="button primary" disabled={!ready || !!problem || committing} onClick={() => void apply()}><Check size={13} />Apply changes</button><button className="button secondary" onClick={onClose}>Cancel</button><span className="operation-preview-status" role="status">{preview.pending || committing ? <LoaderCircle className="spin" size={12} /> : ready ? <Check size={12} /> : null}{!problem && !error && !preview.error ? status : "Preview unavailable"}</span></div>
    </footer>
  </aside>;
});
