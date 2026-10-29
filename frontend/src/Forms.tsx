import { useEffect, useState } from "react";
import {
  ArrowRight,
  Link2,
  X,
  SlidersHorizontal,
  Eye,
  Check,
  Info,
} from "lucide-react";
import type { Parameter, RunCommand, Selection, State } from "./types";
import { expressionLabel, numeric } from "./api";
import { NumericInput } from "./NumericInput";

export function Modal({
  title,
  eyebrow,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={"modal " + (wide ? "wide" : "")}
      >
        <header>
          <div>
            <span className="eyebrow">{eyebrow || "DESIGN TOOLS"}</span>
            <h2>{title}</h2>
          </div>
          <button
            className="icon-button"
            aria-label="Close dialog"
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

export function ParameterInput({
  label,
  value,
  onChange,
  state,
  kind = "length",
  help,
  unitLabel,
  unitControl,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  state: State;
  kind?: string;
  help?: string;
  unitLabel?: string;
  unitControl?: {
    label: string;
    value: string;
    options: { value: string; label: string; disabled?: boolean }[];
    onChange: (value: string) => void;
  };
}) {
  const reused = value.startsWith("@");
  return (
    <label className="field">
      <span>{label}</span>
      <div className={"quantity-input " + (reused ? "linked" : "")}>
        <NumericInput kind={kind}
          aria-label={label}
          value={
            reused
              ? state.document.parameters[value.slice(1)]?.name || value
              : value
          }
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
        />
        {unitControl && (
          <select
            className="quantity-unit-select"
            aria-label={unitControl.label}
            value={unitControl.value}
            onChange={(e) => unitControl.onChange(e.target.value)}
          >
            {unitControl.options.map((option) => (
              <option
                key={option.value}
                value={option.value}
                disabled={option.disabled}
              >
                {option.label}
              </option>
            ))}
          </select>
        )}
        {reused ? (
          <button
            type="button"
            aria-label={"Detach " + label}
            onClick={() =>
              onChange(
                String(state.parameter_graph[value.slice(1)]?.value || 0),
              )
            }
          >
            <Link2 size={13} />
          </button>
        ) : !unitControl ? (
          <small>
            {unitLabel ??
              (kind === "length"
                ? "mm"
                : kind === "angle"
                  ? "°"
                  : kind === "count"
                    ? "×"
                    : "")}
          </small>
        ) : null}
      </div>
      {help && <small className="field-help">{help}</small>}
    </label>
  );
}

const fields: Record<string, Array<[string, string, string]>> = {
  box: [
    ["length", "Length", "40"],
    ["width", "Width", "30"],
    ["height", "Height", "10"],
  ],
  cylinder: [
    ["diameter", "Diameter", "20"],
    ["height", "Height", "20"],
  ],
  rectangle: [
    ["length", "Length", "60"],
    ["width", "Width", "40"],
  ],
  circle: [["diameter", "Diameter", "20"]],
  holes: [
    ["diameter", "Hole diameter", "5"],
    ["depth", "Depth when not through all", "10"],
    ["count_x", "Columns", "1"],
    ["count_y", "Rows", "1"],
    ["spacing_x", "Column spacing", "20"],
    ["spacing_y", "Row spacing", "20"],
  ],
  extrude: [["distance", "Distance", "6"]],
  revolve: [["angle", "Angle", "360"]],
  fillet: [["radius", "Radius", "2"]],
  chamfer: [["distance", "Distance", "1"]],
  pattern: [
    ["count", "Copies including original", "2"],
    ["spacing", "Spacing", "10"],
  ],
  component_pattern: [
    ["count", "Instances including original", "3"],
    ["spacing", "Linear spacing", "25"],
    ["angle", "Angular increment", "45"],
  ],
};
const titles: Record<string, string> = {
  box: "Create a box",
  cylinder: "Create a cylinder",
  rectangle: "Dimensioned rectangle",
  circle: "Dimensioned circle",
  holes: "Locate holes",
  extrude: "Extrude a profile",
  revolve: "Revolve a profile",
  fillet: "Round selected edges",
  chamfer: "Chamfer edges",
  pattern: "Repeat connected geometry",
  component_pattern: "Pattern linked components",
  stock: "Planar stock thickness",
  duplicate: "Repeat a component",
  transform: "Move Component",
  parameter: "Create a shared parameter",
  checkpoint: "Name a checkpoint",
  rename: "Rename design",
  assembly: "Create an assembly",
  fit: "Define a fit relationship",
  mirror: "Create a mirrored component",
  boolean: "Combine component geometry",
};

export function ToolDialog({
  kind,
  state,
  selection,
  run: commitCommand,
  preview,
  onClose,
}: {
  kind: string;
  state: State;
  selection: Selection | null;
  run: RunCommand;
  preview?: RunCommand;
  onClose: () => void;
}) {
  const selected = selection?.definition;
  const occurrence = state.occurrences.find(
    (i) => i.id === selection?.occurrence,
  );
  const physical = Object.values(state.document.components).filter((c) =>
    kind === "stock" ? c.kind === "planar" : c.kind !== "assembly",
  );
  const defaultOwner = selected || physical[0]?.id || "";
  const [owner, setOwner] = useState(defaultOwner);
  const [name, setName] = useState(
    kind === "rename"
      ? state.document.name
      : kind === "parameter"
        ? "New dimension"
        : kind === "checkpoint"
          ? "Design checkpoint"
          : kind === "assembly"
            ? "Assembly"
            : kind === "box"
              ? "Box"
              : kind === "cylinder"
                ? "Cylinder"
                : "",
  );
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      [
        ...(fields[kind] || []),
        ["x", "X position", "0"],
        ["y", "Y position", "0"],
        ["z", "Z position", "0"],
        ["rx", "X rotation", "0"],
        ["ry", "Y rotation", "0"],
        ["rz", "Z rotation", "0"],
      ].map(([id, , value]) => [
        id,
        kind === "stock" && id === "z"
          ? String(
              state.parameter_graph[
                state.document.components[defaultOwner]?.stock_thickness || ""
              ]?.value || 3,
            )
          : kind === "transform" && occurrence?.placement[id]
            ? expressionLabel(
                state.document.parameters[occurrence.placement[id]].expression,
                state.document.parameters,
              )
            : value,
      ]),
    ),
  );
  const [operation, setOperation] = useState(
    ["box", "cylinder", "rectangle", "circle"].includes(kind) ? "new" : "add",
  );
  const [selector, setSelector] = useState(
    selection?.edge ? "semantic" : "vertical",
  );
  const [plane, setPlane] = useState("XY");
  const [axis, setAxis] = useState("Y");
  const [patternMode, setPatternMode] = useState("linear");
  const [quantity, setQuantity] = useState("length");
  const [through, setThrough] = useState(true);
  const [stockPreview, setStockPreview] = useState(true);
  const [busy, setBusy] = useState(false);
  const [impact, setImpact] = useState<any>(null);
  useEffect(
    () => setImpact(null),
    [values, owner, operation, name, selector, plane, axis],
  );
  const profiles = (state.document.components[owner]?.feature_ids || [])
    .map((id) => state.document.features[id])
    .filter((f) => ["rectangle", "circle", "sketch"].includes(f.type));
  const [profile, setProfile] = useState(
    profiles[profiles.length - 1]?.id || "",
  );
  const [source, setSource] = useState(
    kind === "boolean"
      ? physical.find((c) => c.id !== defaultOwner)?.id || ""
      : defaultOwner,
  );
  const [pin, setPin] = useState("");
  const [socket, setSocket] = useState("");
  const set = (key: string, value: string) =>
    setValues((current) => ({ ...current, [key]: value }));
  const decode = (value: string) =>
    value.startsWith("@") ? { parameter: value.slice(1) } : value;
  const featureKind = !!fields[kind];
  const newCapable = ["box", "cylinder", "rectangle", "circle"].includes(kind);
  const submit = async (event: React.FormEvent, previewOnly = false) => {
    event.preventDefault();
    setBusy(true);
    const run: RunCommand =
      previewOnly && preview
        ? async (name, args = {}) => {
            const candidate = await preview(name, args);
            setImpact(candidate);
            return candidate;
          }
        : commitCommand;
    try {
      if (kind === "parameter")
        await run("parameter.create", {
          name,
          value: decode(values.x),
          kind: quantity,
          owner: "root",
        });
      else if (kind === "checkpoint") await run("checkpoint.create", { name });
      else if (kind === "stock")
        await run("component.stock", {
          id: owner,
          value: decode(values.z || "3"),
          preview: stockPreview,
        });
      else if (kind === "rename") await run("document.rename", { name });
      else if (kind === "assembly")
        await run("component.create", { name, kind: "assembly" });
      else if (kind === "fit")
        await run("fit.create", {
          name: name || "Pin / socket fit",
          pin_parameter: pin,
          socket_parameter: socket,
          convention: selector === "radial" ? "radial" : "diametral",
        });
      else if (kind === "duplicate")
        await run("component.duplicate", {
          id: owner,
          parent: occurrence?.parent || "root",
          placement: Object.fromEntries(
            ["x", "y", "z"].map((k) => [k, decode(values[k])]),
          ),
        });
      else if (kind === "component_pattern")
        await run("component.pattern", {
          instance_id: state.occurrences.find((i) => i.definition === owner)
            ?.source_id,
          mode: patternMode,
          axis,
          count: decode(values.count),
          spacing: decode(values.spacing),
          angle: decode(values.angle),
        });
      else if (kind === "transform")
        await run("instance.transform", {
          id: occurrence?.source_id,
          ...Object.fromEntries(
            ["x", "y", "z", "rx", "ry", "rz"].map((k) => [
              k,
              decode(values[k]),
            ]),
          ),
        });
      else if (kind === "mirror")
        await run("feature.create", {
          type: "mirror",
          component_name: name || "Mirrored part",
          references: { component: source },
          options: { plane },
        });
      else if (kind === "boolean")
        await run("feature.create", {
          owner,
          type: "boolean",
          name: name || "Component Boolean",
          references: { component: source },
          options: { operation: operation === "add" ? "add" : operation },
        });
      else if (featureKind) {
        const v = Object.fromEntries(
          (fields[kind] || []).map(([id]) => [id, decode(values[id])]),
        );
        if (["box", "cylinder", "holes"].includes(kind))
          for (const key of ["x", "y", "z"]) v[key] = decode(values[key]);
        if (["rectangle", "circle"].includes(kind)) v.z = decode(values.z);
        if (kind === "circle") {
          v.x = decode(values.x);
          v.y = decode(values.y);
        }
        await run("feature.create", {
          type: kind,
          name: name || undefined,
          ...(newCapable && operation === "new"
            ? { component_name: name || titles[kind] }
            : { owner }),
          values: v,
          options: {
            operation: operation === "new" ? "new" : operation,
            selector: {
              group: selector,
              ...(selector === "semantic"
                ? { signature: selection?.edge?.signature }
                : {}),
            },
            plane,
            axis,
            through,
          },
          references: ["extrude", "revolve"].includes(kind)
            ? { profile: profile || profiles[profiles.length - 1]?.id }
            : {},
        });
      }
      if (!previewOnly) onClose();
    } catch {
      /* The application displays the actionable engine error. Keep the form. */
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title={titles[kind] || kind} onClose={onClose}>
      <form onSubmit={submit}>
        {newCapable && (
          <div className="segmented intent-selector">
            {["new", "add", "cut"].map((mode) => (
              <button
                key={mode}
                type="button"
                className={operation === mode ? "active" : ""}
                onClick={() => setOperation(mode)}
              >
                {mode === "new"
                  ? "New component"
                  : mode === "add"
                    ? "Add to part"
                    : "Cut from part"}
              </button>
            ))}
          </div>
        )}
        {(!newCapable || operation !== "new") &&
          ![
            "parameter",
            "checkpoint",
            "rename",
            "assembly",
            "fit",
            "mirror",
          ].includes(kind) && (
            <label className="field">
              <span>Component</span>
              <select
                value={owner}
                onChange={(e) => {
                  setOwner(e.target.value);
                  setProfile("");
                  if (kind === "boolean" && source === e.target.value)
                    setSource(
                      physical.find((c) => c.id !== e.target.value)?.id || "",
                    );
                }}
              >
                {physical.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        {![
          "holes",
          "extrude",
          "fillet",
          "chamfer",
          "pattern",
          "transform",
          "duplicate",
          "revolve",
          "stock",
        ].includes(kind) && (
          <label className="field">
            <span>{kind === "parameter" ? "Parameter name" : "Name"}</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required={["parameter", "checkpoint", "rename"].includes(kind)}
            />
          </label>
        )}
        {kind === "stock" && (
          <>
            <ParameterInput
              label="Stock thickness"
              value={values.z}
              onChange={(value) => set("z", value)}
              state={state}
            />
            <label className="check-field">
              <input
                type="checkbox"
                checked={stockPreview}
                onChange={(e) => setStockPreview(e.target.checked)}
              />
              Show thickness preview
            </label>
            <div className="inline-note">
              The preview stays part of this planar component. It does not
              create a solid, add volume, or become an STL output. Use Extrude
              to convert the profile explicitly.
            </div>
          </>
        )}
        {featureKind && (
          <div className="field-grid">
            {(fields[kind] || []).map(([id, label]) => (
              <ParameterInput
                key={id}
                label={label}
                value={values[id]}
                onChange={(value) => set(id, value)}
                state={state}
                kind={
                  id.startsWith("count")
                    ? "count"
                    : id === "angle"
                      ? "angle"
                      : "length"
                }
              />
            ))}
          </div>
        )}
        {["extrude", "revolve"].includes(kind) && (
          <label className="field">
            <span>Profile</span>
            <select
              value={profile || profiles[profiles.length - 1]?.id || ""}
              onChange={(e) => setProfile(e.target.value)}
            >
              {profiles.map((f) => (
                <option value={f.id} key={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            {!profiles.length && (
              <small className="warning-text">
                Create a closed profile in this component first.
              </small>
            )}
          </label>
        )}
        {["fillet", "chamfer"].includes(kind) && (
          <label className="field">
            <span>Edge selection</span>
            <select
              value={selector}
              onChange={(e) => setSelector(e.target.value)}
            >
              {selection?.edge && (
                <option value="semantic">
                  Selected edge · semantic reference
                </option>
              )}
              <option value="vertical">All vertical edges</option>
              <option value="top">Top boundary edges</option>
              <option value="bottom">Bottom boundary edges</option>
              <option value="all">All edges</option>
              <option value="x">Edges parallel to X</option>
              <option value="y">Edges parallel to Y</option>
            </select>
            <small className="field-help">
              The engine remembers the selection count and stops if topology
              becomes ambiguous.
            </small>
          </label>
        )}
        {["rectangle", "circle", "mirror"].includes(kind) && (
          <label className="field">
            <span>Reference plane</span>
            <select value={plane} onChange={(e) => setPlane(e.target.value)}>
              {["XY", "XZ", "YZ"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
        )}
        {kind === "component_pattern" && (
          <label className="field">
            <span>Pattern type</span>
            <select
              value={patternMode}
              onChange={(e) => setPatternMode(e.target.value)}
            >
              <option value="linear">Linear · exact spacing</option>
              <option value="circular">Circular · about assembly origin</option>
            </select>
          </label>
        )}
        {["revolve", "pattern", "component_pattern"].includes(kind) && (
          <label className="field">
            <span>Axis</span>
            <select value={axis} onChange={(e) => setAxis(e.target.value)}>
              {["X", "Y", "Z"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </label>
        )}
        {["mirror", "boolean"].includes(kind) && (
          <label className="field">
            <span>Source component</span>
            <select value={source} onChange={(e) => setSource(e.target.value)}>
              {physical
                .filter((c) => kind !== "boolean" || c.id !== owner)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </label>
        )}
        {["boolean", "extrude", "revolve"].includes(kind) && (
          <label className="field">
            <span>Operation</span>
            <select
              value={operation}
              onChange={(e) => setOperation(e.target.value)}
            >
              <option value="add">Union</option>
              <option value="cut">Subtract source</option>
              <option value="intersect">Intersection</option>
            </select>
          </label>
        )}
        {kind === "parameter" && (
          <>
            <label className="field">
              <span>Quantity type</span>
              <select
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
              >
                {["length", "angle", "count", "ratio"].map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            </label>
            <ParameterInput
              label="Value or expression"
              value={values.x}
              onChange={(value) => set("x", value)}
              state={state}
              kind={quantity}
            />
          </>
        )}
        {kind === "fit" && (
          <>
            <div className="field-grid">
              <label className="field">
                <span>Pin diameter parameter</span>
                <select
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  required
                >
                  <option value="">Select dimension</option>
                  {Object.values(state.document.parameters)
                    .filter((p) => p.kind === "length")
                    .map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="field">
                <span>Socket diameter parameter</span>
                <select
                  value={socket}
                  onChange={(e) => setSocket(e.target.value)}
                  required
                >
                  <option value="">Select dimension</option>
                  {Object.values(state.document.parameters)
                    .filter((p) => p.kind === "length")
                    .map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.name}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <label className="field">
              <span>Clearance convention</span>
              <select
                value={selector}
                onChange={(e) => setSelector(e.target.value)}
              >
                <option value="diametral">Diametral / total</option>
                <option value="radial">Radial / per side</option>
              </select>
            </label>
          </>
        )}
        {kind === "holes" && (
          <label className="check-field">
            <input
              type="checkbox"
              checked={through}
              onChange={(e) => setThrough(e.target.checked)}
            />
            Through all
          </label>
        )}
        {[
          "box",
          "cylinder",
          "holes",
          "circle",
          "rectangle",
          "duplicate",
          "transform",
        ].includes(kind) && (
          <details
            className="placement-details"
            open={["holes", "duplicate", "transform"].includes(kind)}
          >
            <summary>
              Exact placement <span>In the component's local frame</span>
            </summary>
            <div className="field-grid three">
              {(["rectangle"].includes(kind) ? ["z"] : ["x", "y", "z"]).map(
                (id) => (
                  <ParameterInput
                    key={id}
                    label={id.toUpperCase() + " position"}
                    value={values[id]}
                    onChange={(v) => set(id, v)}
                    state={state}
                  />
                ),
              )}
            </div>
            {kind === "transform" && (
              <div className="field-grid three">
                {["rx", "ry", "rz"].map((id) => (
                  <ParameterInput
                    key={id}
                    label={id.slice(1).toUpperCase() + " rotation"}
                    value={values[id]}
                    onChange={(v) => set(id, v)}
                    state={state}
                    kind="angle"
                  />
                ))}
              </div>
            )}
          </details>
        )}
        {featureKind && (
          <div className="inline-note">
            <Link2 size={14} />
            <span>
              Every dimension gets a named parameter. Use ↗ to reuse an
              existing input.
            </span>
          </div>
        )}
        {impact && (
          <div className="inline-note">
            <Check size={16} />
            <div>
              <strong>Candidate evaluated successfully</strong>
              <p>
                {impact.changes?.ownership_change
                  ? "Disconnected addition → a new physical component will be created."
                  : impact.description}
              </p>
              <small>
                {Object.keys(impact.components || {}).length} part definitions
                evaluated · not committed
              </small>
            </div>
          </div>
        )}
        <footer>
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          {preview && featureKind && (
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={(event) => submit(event, true)}
            >
              <Eye size={14} />
              Preview
            </button>
          )}
          <button
            className="button primary"
            disabled={
              busy ||
              (!owner &&
                !newCapable &&
                ![
                  "parameter",
                  "checkpoint",
                  "rename",
                  "assembly",
                  "fit",
                  "mirror",
                ].includes(kind))
            }
          >
            {busy ? "Evaluating…" : "Apply"}
            <ArrowRight size={15} />
          </button>
        </footer>
      </form>
    </Modal>
  );
}

export function ParameterDialog({ parameter, state, run, onClose, preview }: {
  parameter: Parameter; state: State; run: RunCommand; onClose: () => void;
  preview: (name: string, args: any) => Promise<any>; onNavigate: (id: string) => void;
}) {
  const [value, setValue] = useState(expressionLabel(parameter.expression, state.document.parameters));
  const [minus, setMinus] = useState(String(parameter.tolerance?.minus || 0));
  const [plus, setPlus] = useState(String(parameter.tolerance?.plus || 0));
  const [specified, setSpecified] = useState(!!parameter.tolerance);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const args = () => ({ id: parameter.id, value, tolerance: specified ? { minus: Number(minus), plus: Number(plus) } : null });
  const [previewValid, setPreviewValid] = useState(false);
  return <Modal title={parameter.named ? parameter.name : "Edit dimension"} eyebrow={parameter.named ? "NAMED PARAMETER" : "LOCAL DIMENSION"} onClose={onClose}>
    <form onSubmit={async e => {
      e.preventDefault(); setBusy(true); setError("");
      try { await run("parameter.set", args()); onClose(); } catch (e: any) { setError(e.message); } finally { setBusy(false); }
    }}>
      <ParameterInput label="Value or parameter name" value={value} onChange={value => { setValue(value); setPreviewValid(false); }} state={state} kind={parameter.kind} />
      {parameter.kind === "length" && <section className="tolerance-panel">
        <label className="check-field"><input type="checkbox" checked={specified} onChange={e => setSpecified(e.target.checked)} /> Specify dimensional tolerance</label>
        {specified && <div className="field-grid">
          <label className="field"><span>Lower deviation</span><input aria-label="Lower tolerance" type="number" min="0" step="any" value={minus} onChange={e => setMinus(e.target.value)} /></label>
          <label className="field"><span>Upper deviation</span><input aria-label="Upper tolerance" type="number" min="0" step="any" value={plus} onChange={e => setPlus(e.target.value)} /></label>
        </div>}
      </section>}
      {error && <p role="alert">{error}</p>}
      {previewValid && <p role="status">Dimension preview validated.</p>}
      <footer><button type="button" className="button secondary" onClick={onClose}>Cancel</button>
        <button type="button" className="button secondary" disabled={busy} onClick={async () => {
          setBusy(true); setError(""); setPreviewValid(false); try { await preview("parameter.set", args()); setPreviewValid(true); } catch(e: any) { setError(e.message); } finally { setBusy(false); }
        }}>Preview</button>
        <button className="button primary" disabled={busy}>Apply dimension</button>
      </footer>
    </form>
  </Modal>;
}
