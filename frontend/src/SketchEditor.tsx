import { useMemo, useState } from "react";
import {
  Circle,
  CornerUpRight,
  MousePointer2,
  Plus,
  Trash2,
  Minus,
  LockKeyhole,
  ArrowRight,
} from "lucide-react";
import { Modal } from "./Forms";
import type { Feature, RunCommand, State } from "./types";

const entityFields: Record<string, string[]> = {
  point: ["x", "y"],
  line: ["x1", "y1", "x2", "y2"],
  circle: ["x", "y", "radius"],
  arc: ["x", "y", "radius", "start_angle", "end_angle"],
};

export default function SketchEditor({
  state,
  run,
  onClose,
  feature,
}: {
  state: State;
  run: RunCommand;
  onClose: () => void;
  feature?: Feature;
}) {
  const [name, setName] = useState(feature?.name || "Planar profile");
  const [plane, setPlane] = useState(feature?.options.plane || "XY");
  const [owner, setOwner] = useState(feature?.owner || "");
  const [entities, setEntities] = useState<any[]>(() =>
    feature
      ? feature.options.entities.map((e: any) => ({
          ...e,
          ...Object.fromEntries(
            entityFields[e.type].map((field) => [
              field,
              state.parameter_graph[feature.parameters[e.id + "." + field]]
                ?.value || 0,
            ]),
          ),
        }))
      : [],
  );
  const [constraints, setConstraints] = useState<any[]>(() =>
    feature
      ? feature.options.constraints.map((c: any) => ({
          ...c,
          value: c.parameter_key
            ? state.parameter_graph[feature.parameters[c.parameter_key]]?.value
            : undefined,
        }))
      : [],
  );
  const [tool, setTool] = useState("line");
  const [pending, setPending] = useState<number[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [fixed, setFixed] = useState(true);
  const [construction, setConstruction] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ctype, setCtype] = useState("horizontal");
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [value, setValue] = useState("10");
  const selectedEntity = entities.find((e) => e.id === selected);
  const points = useMemo(
    () =>
      entities.flatMap((e) =>
        e.type === "line"
          ? [e.id + ".start", e.id + ".end"]
          : e.type === "point"
            ? [e.id]
            : [
                e.id + ".center",
                ...(e.type === "arc" ? [e.id + ".start", e.id + ".end"] : []),
              ],
      ),
    [entities],
  );
  const coordinate = (event: React.MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return [
      Math.round((((event.clientX - rect.left) / rect.width) * 120 - 60) * 2) /
        2,
      Math.round((45 - ((event.clientY - rect.top) / rect.height) * 90) * 2) /
        2,
    ];
  };
  const addEntity = (type: string, data: any) => {
    const id =
      "e" +
      (Math.max(0, ...entities.map((e) => Number(e.id.slice(1)) || 0)) + 1);
    setEntities((current) => [
      ...current,
      { id, type, fixed, construction, ...data },
    ]);
    setSelected(id);
  };
  const click = (event: React.MouseEvent<SVGSVGElement>) => {
    if (tool === "select") return;
    const p = coordinate(event);
    if (tool === "point") {
      addEntity("point", { x: p[0], y: p[1] });
      return;
    }
    if (!pending) {
      setPending(p);
      return;
    }
    if (tool === "line")
      addEntity("line", { x1: pending[0], y1: pending[1], x2: p[0], y2: p[1] });
    if (tool === "circle" || tool === "arc")
      addEntity(tool, {
        x: pending[0],
        y: pending[1],
        radius:
          Math.round(Math.hypot(p[0] - pending[0], p[1] - pending[1]) * 100) /
          100,
        ...(tool === "arc" ? { start_angle: 0, end_angle: 90 } : {}),
      });
    if (tool === "rectangle") {
      const x1 = pending[0],
        y1 = pending[1],
        x2 = p[0],
        y2 = p[1];
      const base = Math.max(
        0,
        ...entities.map((e) => Number(e.id.slice(1)) || 0),
      );
      setEntities((current) => [
        ...current,
        ...[
          [x1, y1, x2, y1],
          [x2, y1, x2, y2],
          [x2, y2, x1, y2],
          [x1, y2, x1, y1],
        ].map((v, i) => ({
          id: "e" + (base + i + 1),
          type: "line",
          x1: v[0],
          y1: v[1],
          x2: v[2],
          y2: v[3],
          fixed,
          construction,
        })),
      ]);
    }
    setPending(null);
  };
  const update = (field: string, value: any) =>
    setEntities((current) =>
      current.map((e) => (e.id === selected ? { ...e, [field]: value } : e)),
    );
  const save = async () => {
    setBusy(true);
    try {
      if (feature) {
        await run("sketch.update", {
          feature_id: feature.id,
          entities,
          constraints,
        });
      } else
        await run("sketch.create", {
          name,
          plane,
          owner: owner || undefined,
          entities,
          constraints: constraints.map(({ type, a, b, value }) => ({
            type,
            a,
            b,
            value,
          })),
        });
      onClose();
    } catch {
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={feature ? "Edit constrained sketch" : "Create a precise sketch"}
      eyebrow="PLANAR GEOMETRY · SAME DESIGN WORKSPACE"
      wide
      onClose={onClose}
    >
      <div className="sketch-editor">
        <div className="sketch-canvas-column">
          <div className="sketch-tools">
            {[
              ["select", "Select"],
              ["point", "Point"],
              ["line", "Line"],
              ["rectangle", "Rectangle"],
              ["circle", "Circle"],
              ["arc", "Arc"],
            ].map(([id, label]) => (
              <button
                className={tool === id ? "active" : ""}
                key={id}
                onClick={() => {
                  setTool(id);
                  setPending(null);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <svg
            className="sketch-canvas"
            viewBox="-60 -45 120 90"
            onClick={click}
          >
            <defs>
              <pattern
                id="sketchGrid"
                width="5"
                height="5"
                patternUnits="userSpaceOnUse"
              >
                <path
                  d="M 5 0 L 0 0 0 5"
                  fill="none"
                  stroke="#2a3544"
                  strokeWidth=".18"
                />
              </pattern>
            </defs>
            <rect
              x="-60"
              y="-45"
              width="120"
              height="90"
              fill="url(#sketchGrid)"
            />
            <line
              x1="-60"
              x2="60"
              y1="0"
              y2="0"
              stroke="#774d55"
              strokeWidth=".3"
            />
            <line
              x1="0"
              x2="0"
              y1="-45"
              y2="45"
              stroke="#4a7461"
              strokeWidth=".3"
            />
            {entities.map((e) => {
              const common = {
                stroke:
                  e.id === selected
                    ? "#adf0df"
                    : e.construction
                      ? "#6e8eae"
                      : "#9db2ca",
                strokeWidth: 0.5,
                fill: "none",
                strokeDasharray: e.construction ? "1.5 1" : undefined,
                onClick: (event: React.MouseEvent) => {
                  event.stopPropagation();
                  setSelected(e.id);
                },
              };
              if (e.type === "line")
                return (
                  <line
                    key={e.id}
                    x1={e.x1}
                    y1={-e.y1}
                    x2={e.x2}
                    y2={-e.y2}
                    {...common}
                  />
                );
              if (e.type === "circle")
                return (
                  <circle
                    key={e.id}
                    cx={e.x}
                    cy={-e.y}
                    r={e.radius}
                    {...common}
                  />
                );
              if (e.type === "point")
                return (
                  <circle
                    key={e.id}
                    cx={e.x}
                    cy={-e.y}
                    r=".7"
                    {...common}
                    fill={common.stroke}
                  />
                );
              const a = (e.start_angle * Math.PI) / 180,
                b = (e.end_angle * Math.PI) / 180;
              return (
                <path
                  key={e.id}
                  d={
                    "M " +
                    (e.x + e.radius * Math.cos(a)) +
                    " " +
                    (-e.y - e.radius * Math.sin(a)) +
                    " A " +
                    e.radius +
                    " " +
                    e.radius +
                    " 0 " +
                    (Math.abs(b - a) > Math.PI ? 1 : 0) +
                    " 0 " +
                    (e.x + e.radius * Math.cos(b)) +
                    " " +
                    (-e.y - e.radius * Math.sin(b))
                  }
                  {...common}
                />
              );
            })}
            {pending && (
              <circle cx={pending[0]} cy={-pending[1]} r=".7" fill="#e0c68e" />
            )}
          </svg>
          <div className="sketch-hint">
            {feature
              ? "Select an entity to edit its exact seed coordinates."
              : pending
                ? "Choose the second point."
                : "Click to place " +
                  (tool === "select" ? "or select geometry" : tool) +
                  "."}
            <span>0.5 mm snap · XY-style local coordinates</span>
          </div>
          <div className="entity-list">
            {entities.map((e) => (
              <button
                className={selected === e.id ? "active" : ""}
                key={e.id}
                onClick={() => setSelected(e.id)}
              >
                <span>{e.id}</span>
                {e.type}
                {e.fixed && <LockKeyhole size={11} />}
              </button>
            ))}
          </div>
        </div>
        <aside className="sketch-properties">
          <label className="field">
            <span>Sketch name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              readOnly={!!feature}
            />
          </label>
          {!feature && (
            <>
              <div className="field-grid">
                <label className="field">
                  <span>Plane</span>
                  <select
                    value={plane}
                    onChange={(e) => setPlane(e.target.value)}
                  >
                    {["XY", "XZ", "YZ"].map((p) => (
                      <option key={p}>{p}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Ownership</span>
                  <select
                    value={owner}
                    onChange={(e) => setOwner(e.target.value)}
                  >
                    <option value="">New planar component</option>
                    {Object.values(state.document.components)
                      .filter((c) => c.kind !== "assembly")
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </label>
              </div>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={fixed}
                  onChange={(e) => setFixed(e.target.checked)}
                />
                Fix new geometry at specified coordinates
              </label>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={construction}
                  onChange={(e) => setConstruction(e.target.checked)}
                />
                Construction geometry
              </label>
            </>
          )}
          {selectedEntity && (
            <section className="sketch-entity">
              <h4>
                {selectedEntity.id} · {selectedEntity.type}
              </h4>
              <div className="field-grid">
                {entityFields[selectedEntity.type].map((field) => (
                  <label className="field" key={field}>
                    <span>{field.replace("_", " ")}</span>
                    <input
                      type="number"
                      step="any"
                      value={selectedEntity[field]}
                      onChange={(e) => update(field, Number(e.target.value))}
                    />
                  </label>
                ))}
              </div>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={selectedEntity.fixed}
                  onChange={(e) => update("fixed", e.target.checked)}
                />
                Fix this entity's coordinates
              </label>
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={selectedEntity.construction}
                  onChange={(e) => update("construction", e.target.checked)}
                />
                Construction entity
              </label>
              <button
                className="text-button danger"
                onClick={() => {
                  setEntities((current) =>
                    current.filter((e) => e.id !== selected),
                  );
                  setSelected(null);
                }}
              >
                <Trash2 size={12} />
                Remove entity
              </button>
            </section>
          )}
          <section className="constraint-section">
            <h4>Explicit relationships</h4>
            <label className="field">
              <span>Constraint</span>
              <select value={ctype} onChange={(e) => setCtype(e.target.value)}>
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
                ].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <div className="field-grid">
              {[
                ["A", a, setA],
                ["B", b, setB],
              ].map(([label, v, setter]: any) => (
                <label className="field" key={label}>
                  <span>Reference {label}</span>
                  <select value={v} onChange={(e) => setter(e.target.value)}>
                    <option value="">Select reference</option>
                    <optgroup label="Entities">
                      {entities.map((e) => (
                        <option key={e.id}>{e.id}</option>
                      ))}
                    </optgroup>
                    <optgroup label="Points">
                      {points.map((p) => (
                        <option key={p}>{p}</option>
                      ))}
                    </optgroup>
                  </select>
                </label>
              ))}
            </div>
            {["distance", "angle", "radius", "diameter"].includes(ctype) && (
              <label className="field">
                <span>Dimension</span>
                <input
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
              </label>
            )}
            <button
              className="button secondary small"
              disabled={!a}
              onClick={() =>
                setConstraints((current) => [
                  ...current,
                  { type: ctype, a, b, value },
                ])
              }
            >
              <Plus size={13} />
              Add relationship
            </button>
            <div className="constraint-list">
              {constraints.map((c, i) => (
                <div key={i}>
                  <span>
                    {c.type} · {c.a}
                    {c.b ? " / " + c.b : ""}
                    {c.value !== undefined ? " = " + c.value : ""}
                  </span>
                  <button
                    aria-label="Remove relationship"
                    onClick={() =>
                      setConstraints((current) =>
                        current.filter((_, j) => i !== j),
                      )
                    }
                  >
                    <XIcon />
                  </button>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </div>
      <div className="inline-note sketch-note">
        Native PlaneGCS evaluates relationships and reports remaining freedom or
        conflicts. Every editable dimensional input is parameter-backed.
      </div>
      <footer>
        <button className="button secondary" onClick={onClose}>
          Cancel
        </button>
        <button
          className="button primary"
          disabled={!entities.length || busy}
          onClick={save}
        >
          {busy ? "Solving…" : feature ? "Apply sketch" : "Create sketch"}
          <ArrowRight size={15} />
        </button>
      </footer>
    </Modal>
  );
}
function XIcon() {
  return <span style={{ fontSize: 16 }}>×</span>;
}
