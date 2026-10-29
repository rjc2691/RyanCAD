import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Modal } from "./Forms";
import { NumericInput } from "./NumericInput";
import { expressionLabel, numeric } from "./api";
import type { Parameter, State, RunCommand } from "./types";

function ParameterRow({ p, state, run }: { p: Parameter; state: State; run: RunCommand }) {
  const [name, setName] = useState(p.name);
  const [value, setValue] = useState(expressionLabel(p.expression, state.document.parameters));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const dirty = name !== p.name || value !== expressionLabel(p.expression, state.document.parameters);
  return <div className="simple-parameter-row">
    <input aria-label={`Name of ${p.name}`} value={name} onChange={e => setName(e.target.value)} />
    <NumericInput aria-label={`Value of ${p.name}`} kind={p.kind} value={value} onChange={e => setValue(e.target.value)} />
    <span>{numeric(state.parameter_graph[p.id]?.value, 4)} {p.kind === "length" ? "mm" : p.kind === "angle" ? "°" : ""}</span>
    <button className="button secondary small" disabled={!dirty || busy} onClick={async () => {
      setBusy(true); setError("");
      try { await run("parameter.set", { id: p.id, name, value }); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
    }}>Save</button>
    <button className="icon-button" aria-label={`Delete parameter ${p.name}`} disabled={busy} onClick={async () => {
      try { await run("parameter.delete", { id: p.id }); } catch (e: any) { setError(e.message); }
    }}><Trash2 size={14} /></button>
    {error && <small className="parameter-row-error" role="alert">{error}</small>}
  </div>;
}
export default function ParametersWindow({ state, run, onClose }: { state: State; run: RunCommand; onClose: () => void }) {
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [kind, setKind] = useState("length");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const parameters = Object.values(state.document.parameters).filter(p => p.named).sort((a,b) => a.name.localeCompare(b.name));
  return <Modal title="Parameters" eyebrow="NAMED VALUES" wide onClose={onClose}>
    <p className="dialog-copy">Type a parameter name in a dimension field to reuse its value. Changing it updates the fields that use it.</p>
    <div className="simple-parameter-list">
      {parameters.map(p => <ParameterRow key={`${p.id}:${p.expression}:${p.name}`} p={p} state={state} run={run} />)}
      {!parameters.length && <p className="empty-copy">No named parameters. Numeric dimensions stay local to their operation.</p>}
    </div>
    <form className="simple-parameter-create" onSubmit={async e => {
      e.preventDefault(); setBusy(true); setError("");
      try { await run("parameter.create", { name, value, kind }); setName(""); setValue(""); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
    }}>
      <label className="field"><span>Parameter name</span><input aria-label="Parameter name" disabled={busy} value={name} onChange={e => setName(e.target.value)} /></label>
      <label className="field"><span>Value</span><NumericInput aria-label="Parameter value" disabled={busy} kind={kind} value={value} onChange={e => setValue(e.target.value)} /></label>
      <label className="field"><span>Type</span><select aria-label="Parameter type" value={kind} onChange={e => setKind(e.target.value)}><option value="length">Length (mm)</option><option value="angle">Angle (°)</option><option value="count">Count</option><option value="ratio">Number</option></select></label>
      <button className="button primary" disabled={busy || !name.trim() || !value.trim()}><Plus size={14} /> Add parameter</button>
    </form>
    {error && <p role="alert">{error}</p>}
    <footer><button className="button secondary" onClick={onClose}>Done</button></footer>
  </Modal>;
}
