import { X, SquareDashed, MousePointer2 } from "lucide-react";
import type { CSSProperties } from "react";
import { sectionRange, type SectionSettings } from "./sectionView";
import type { Geometry, Occurrence } from "./types";
export default function SectionControls({
  settings,
  onChange,
  onClose,
  occurrences,
  geometry,
  explode,
  picking,
  onPick,
  onCancelPick,
  pickDisabled,
  notice,
}: {
  settings: SectionSettings;
  onChange: (value: SectionSettings) => void;
  onClose: () => void;
  occurrences: Occurrence[];
  geometry: Record<string, Geometry>;
  explode: number;
  picking: boolean;
  onPick: () => void;
  onCancelPick: () => void;
  pickDisabled: boolean;
  notice: string;
}) {
  const range = sectionRange(settings, occurrences, geometry, explode);
  return (
    <section className="section-controls" aria-label="Section view controls">
      <header>
        <strong>Section view</strong>
        <button aria-label="Close section view" onClick={onClose}>
          <X size={16} />
        </button>
      </header>
      <label>
        Plane
        <select
          aria-label="Section plane"
          value={settings.reference ? "reference" : settings.axis}
          onChange={(e) => {
            if (e.target.value === "reference") return;
            onCancelPick();
            const next = {
              ...settings,
              reference: undefined,
              axis: e.target.value as SectionSettings["axis"],
            };
            onChange({
              ...next,
              offset: sectionRange(next, occurrences, geometry, explode).center,
            });
          }}
        >
          {settings.reference && (
            <option value="reference">Reference plane</option>
          )}
          <option value="X">YZ · along X</option>
          <option value="Y">XZ · along Y</option>
          <option value="Z">XY · along Z</option>
        </select>
      </label>
      <div
        className="move-reference-field operation-reference-control section-plane-reference"
        data-picking={picking}
        style={{ "--reference-color": "#b4a0ff" } as CSSProperties}
      >
        <span className="field-label">Plane reference</span>
        <div className="move-reference-row">
          <button
            className={`operation-pick-slot move-reference-pick section-reference-pick ${picking ? "picking" : ""}`}
            disabled={pickDisabled}
            onClick={onPick}
            aria-pressed={picking}
          >
            <SquareDashed size={15} />
            <span>
              {picking
                ? "Pick a planar face or sketch"
                : settings.reference?.label || "Select a face or sketch plane"}
            </span>
            <MousePointer2 size={13} />
          </button>
          {settings.reference && (
            <button
              className="icon-button"
              aria-label="Clear section plane reference"
              title="Clear plane reference"
              onClick={() => {
                onCancelPick();
                onChange({ ...settings, reference: undefined, offset: 0 });
              }}
            >
              <X size={14} />
            </button>
          )}
        </div>
        {settings.reference && (
          <small className="operation-help">
            Plane snapshot · offset along its normal
          </small>
        )}
        {picking && (
          <button className="text-button" onClick={onCancelPick}>
            Cancel picking
          </button>
        )}
        {notice && <small role="status">{notice}</small>}
      </div>
      <label>
        {settings.reference ? "Offset (mm)" : "Position (mm)"}
        <input
          aria-label="Section position"
          type="number"
          step="any"
          value={Number(settings.offset.toFixed(4))}
          onChange={(e) => {
            if (
              e.target.value !== "" &&
              Number.isFinite(e.target.valueAsNumber)
            )
              onChange({ ...settings, offset: e.target.valueAsNumber });
          }}
        />
      </label>
      <input
        aria-label="Move section plane"
        type="range"
        min={Math.min(range.min, settings.offset)}
        max={Math.max(range.max, settings.offset)}
        step={(range.max - range.min) / 500}
        value={settings.offset}
        onChange={(e) =>
          onChange({ ...settings, offset: Number(e.target.value) })
        }
      />
      <footer>
        <button onClick={() => onChange({ ...settings, offset: range.center })}>
          Center
        </button>
        <label>
          <input
            type="checkbox"
            checked={settings.flipped}
            onChange={(e) =>
              onChange({ ...settings, flipped: e.target.checked })
            }
          />
          Flip cut side
        </label>
      </footer>
    </section>
  );
}
