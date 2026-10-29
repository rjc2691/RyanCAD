import {
  Check,
  Crosshair,
  MousePointer2,
  Ruler,
  Trash2,
  X,
} from "lucide-react";
import { numeric } from "./api";
import { measureVector, pointLetter, type MeasurePoint } from "./measureModel";
import type { Selection } from "./types";

export default function MeasurePanel({
  points,
  replace,
  notice,
  units,
  onReplace,
  onRemove,
  onClear,
  onClose,
  onHover,
}: {
  points: MeasurePoint[];
  replace: number | null;
  notice: string;
  units: "mm" | "in";
  onReplace: (index: number | null) => void;
  onRemove: (index: number) => void;
  onClear: () => void;
  onClose: () => void;
  onHover: (selection: Selection | null) => void;
}) {
  const scale = units === "in" ? 25.4 : 1;
  const length = (v: number) => `${numeric(v / scale, 4)} ${units}`;
  const pairs = points
    .slice(1)
    .map((p, i) => ({
      from: i,
      to: i + 1,
      ...measureVector(points[i].point, p.point),
    }));
  return (
    <aside
      className="right-panel operation-panel measure-panel"
      aria-label="Measure workspace"
    >
      <header className="operation-header">
        <h2>
          <Ruler size={17} /> Measure
        </h2>
        <button
          className="icon-button"
          aria-label="Close Measure"
          onClick={onClose}
        >
          <X size={17} />
        </button>
      </header>
      <div className="operation-fields">
        <p className="measure-instructions">
          Pick two points, vertices, midpoints, or locations on edges and faces.
          Shift-click adds or removes points.
        </p>
        <section className="operation-section">
          <h3>Reference points</h3>
          <p className="measure-pick-status" role="status">
            {notice ||
              (replace !== null
                ? `Pick a replacement for point ${pointLetter(replace)}.`
                : points.length === 0
                  ? "Pick point A."
                  : points.length === 1
                    ? "Pick point B."
                    : "Click to start a new pair, or Shift-click to extend this chain.")}
          </p>
          <ol className="measure-points">
            {points.map((p, i) => (
              <li
                key={i}
                className={`measure-point ${replace === i ? "picking" : ""}`}
                style={
                  {
                    "--measure-color": i === 0 ? "#f3b879" : "#8be9ff",
                  } as React.CSSProperties
                }
              >
                <div className="measure-point-row">
                  <button
                    className="measure-reference"
                    aria-label={`Replace point ${pointLetter(i)}`}
                    onClick={() => onReplace(replace === i ? null : i)}
                    onMouseEnter={() => onHover(p.selection)}
                    onMouseLeave={() => onHover(null)}
                    onFocus={() => onHover(p.selection)}
                    onBlur={() => onHover(null)}
                  >
                    <Crosshair size={15} />
                    <span>
                      <strong>Point {pointLetter(i)}</strong>
                      <small>{p.label}</small>
                    </span>
                    <MousePointer2 size={13} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Remove point ${pointLetter(i)}`}
                    onClick={() => onRemove(i)}
                  >
                    <X size={13} />
                  </button>
                </div>
                <div
                  className="measure-coordinates"
                  aria-label={`Point ${pointLetter(i)} coordinates`}
                >
                  {p.point.map((v, j) => (
                    <span key={j}>
                      {"XYZ"[j]} <b>{numeric(v / scale, 4)}</b>
                    </span>
                  ))}
                  <small>{units}</small>
                </div>
                {p.detail && (
                  <div className="property-row">
                    <span>{p.detail.name}</span>
                    <strong>
                      {numeric(p.detail.value / scale ** p.detail.power, 4)}{" "}
                      {units}
                      {p.detail.power === 2 ? "²" : ""}
                    </strong>
                  </div>
                )}
              </li>
            ))}
          </ol>
          {points.length > 0 && (
            <button className="text-button" onClick={onClear}>
              <Trash2 size={13} /> Clear points
            </button>
          )}
        </section>
        <section
          className="operation-section measure-results"
          aria-label="Measurement results"
        >
          <h3>
            {pairs.length > 1
              ? "Consecutive distances"
              : "Point-to-point distance"}
          </h3>
          {pairs.length === 0 ? (
            <p>Select two points to measure.</p>
          ) : (
            pairs.map((p) => (
              <div className="measure-vector" key={p.to}>
                <div className="property-row">
                  <span>
                    {pointLetter(p.from)} → {pointLetter(p.to)}
                  </span>
                  <strong className="measure-distance">
                    {length(p.distance)}
                  </strong>
                </div>
                <dl className="measure-deltas">
                  {p.delta.map((v, i) => (
                    <div key={i}>
                      <dt>Δ{"XYZ"[i]}</dt>
                      <dd>{length(v)}</dd>
                    </div>
                  ))}
                </dl>
                <div className="property-row">
                  <span>Unit direction</span>
                  <strong>
                    {p.direction
                      ? p.direction.map((v) => numeric(v, 4)).join(", ")
                      : "Undefined · coincident points"}
                  </strong>
                </div>
              </div>
            ))
          )}
          {pairs.length > 1 && (
            <div className="property-row">
              <span>Total chain length</span>
              <strong>
                {length(pairs.reduce((sum, p) => sum + p.distance, 0))}
              </strong>
            </div>
          )}
        </section>
      </div>
      <footer className="operation-footer">
        <button className="button primary" onClick={onClose}>
          <Check size={14} /> Done
        </button>
      </footer>
    </aside>
  );
}
