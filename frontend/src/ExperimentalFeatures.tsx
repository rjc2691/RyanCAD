import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FlaskConical, X, RotateCcw, ChevronRight } from "lucide-react";
import {
  ACTIVE_APPEARANCE_ID,
  ACTIVE_APPEARANCE_STYLES,
  defaultAppearance,
  type Experiments,
} from "./experiments";

function ExperimentSection({
  id,
  title,
  enabled,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  enabled: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <section>
      <div className="experiment-heading">
        <button
          className="experiment-disclosure"
          aria-label={`${title} settings`}
          aria-expanded={expanded}
          aria-controls={`experiment-${id}`}
          onClick={() => setExpanded(!expanded)}
        >
          <ChevronRight
            size={15}
            style={{ transform: expanded ? "rotate(90deg)" : undefined }}
          />
          <strong>{title}</strong>
        </button>
        <button
          className="experiment-toggle"
          role="switch"
          aria-label={title}
          aria-checked={enabled}
          onClick={onToggle}
        >
          {enabled ? "On" : "Off"}
        </button>
      </div>
      {expanded && (
        <div className="experiment-settings" id={`experiment-${id}`}>
          {children}
        </div>
      )}
    </section>
  );
}
export default function ExperimentalFeatures({
  value,
  onChange,
}: {
  value: Experiments;
  onChange: (value: Experiments) => void;
}) {
  const [open, setOpen] = useState(false),
    [position, setPosition] = useState({ left: 8, top: 110 });
  const button = useRef<HTMLButtonElement>(null),
    panel = useRef<HTMLDivElement>(null);
  const setting = value[ACTIVE_APPEARANCE_ID];
  const update = (patch: Partial<typeof setting>) =>
    onChange({ ...value, [ACTIVE_APPEARANCE_ID]: { ...setting, ...patch } });
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = button.current!.getBoundingClientRect();
      setPosition({
        left: Math.max(8, Math.min(innerWidth - 368, r.left)),
        top: r.bottom + 8,
      });
    };
    const outside = (e: PointerEvent) => {
      if (
        !button.current?.contains(e.target as Node) &&
        !panel.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
      }
    };
    place();
    panel.current
      ?.querySelector<HTMLButtonElement>(".experiment-disclosure")
      ?.focus();
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", key);
      window.removeEventListener("resize", place);
    };
  }, [open]);
  return (
    <>
      <button
        ref={button}
        className={`tool-button experimental-tool ${open ? "active" : ""}`}
        aria-label="Experimental features"
        aria-expanded={open}
        aria-controls="experimental-features-panel"
        title="Experimental features"
        onClick={() => setOpen(!open)}
      >
        <FlaskConical size={18} />
        <span>Experimental features</span>
        {setting.enabled && <i className="experiment-enabled-dot" />}
      </button>
      {open &&
        createPortal(
          <div
            ref={panel}
            id="experimental-features-panel"
            role="dialog"
            aria-label="Experimental features"
            className="experimental-popover"
            style={{
              left: position.left,
              top: position.top,
              maxHeight: `calc(100dvh - ${position.top + 12}px)`,
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                close();
              }
              e.stopPropagation();
            }}
          >
            <header>
              <strong>
                <FlaskConical size={17} />
                Experimental features
              </strong>
              <button
                className="icon-button"
                aria-label="Close experimental features"
                onClick={close}
              >
                <X size={17} />
              </button>
            </header>
            <p>
              Test optional UI changes. Settings stay in this browser and do not
              change designs.
            </p>
            <ExperimentSection
              id={ACTIVE_APPEARANCE_ID}
              title="Active component appearance"
              enabled={setting.enabled}
              onToggle={() => update({ enabled: !setting.enabled })}
            >
              <code>{ACTIVE_APPEARANCE_ID}</code>
              <p>
                Replaces the active part’s amber edge highlight with surface
                shading. Selected faces, edges, vertices and hover keep their
                usual styles.
              </p>
              <label>
                Style
                <select
                  aria-label="Active component appearance style"
                  disabled={!setting.enabled}
                  value={setting.style}
                  onChange={(e) =>
                    update({ style: e.target.value as typeof setting.style })
                  }
                >
                  {ACTIVE_APPEARANCE_STYLES.map((style) => (
                    <option key={style.id} value={style.id}>
                      {style.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Strength <output>{Math.round(setting.strength * 100)}%</output>
                <input
                  aria-label="Active component shading strength"
                  type="range"
                  min=".1"
                  max="1"
                  step=".05"
                  disabled={!setting.enabled}
                  value={setting.strength}
                  onChange={(e) => update({ strength: Number(e.target.value) })}
                />
              </label>
              <label>
                Tint
                <input
                  aria-label="Active component shading tint"
                  type="color"
                  disabled={!setting.enabled}
                  value={setting.tint}
                  onChange={(e) => update({ tint: e.target.value })}
                />
              </label>
              <small>
                {setting.style === "soft-glow"
                  ? "Soft glow: gentle light over the surface, stronger toward its silhouette."
                  : setting.style === "rim-glow"
                    ? "Rim glow: light concentrates toward the silhouette and changes with the camera."
                    : "Height gradient: shading grows from the bottom to the top in the part’s local Z direction."}
              </small>
              <button
                className="text-button"
                onClick={() =>
                  onChange({
                    ...value,
                    [ACTIVE_APPEARANCE_ID]: defaultAppearance(),
                  })
                }
              >
                <RotateCcw size={13} />
                Reset this experiment
              </button>
            </ExperimentSection>
            <footer>
              Off restores the current amber edge styling. Refer to the
              experiment ID and style name when requesting changes.
            </footer>
          </div>,
          document.body,
        )}
    </>
  );
}
