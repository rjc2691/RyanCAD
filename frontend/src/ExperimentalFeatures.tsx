import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { shortcutAttributes, shortcutLabel } from "./toolbarShortcuts";
import { FlaskConical, X, RotateCcw, ChevronRight } from "lucide-react";
import {
  ACTIVE_APPEARANCE_ID,
  SIDEBAR_TOOLBAR_LAYOUT_ID,
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
    button.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
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
    if (!panel.current?.contains(document.activeElement))
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
  }, [open, value[SIDEBAR_TOOLBAR_LAYOUT_ID].enabled]);
  return (
    <>
      <button
        ref={button}
        className={`tool-button experimental-tool ${open ? "active" : ""}`}
        aria-label="Experimental features"
        {...shortcutAttributes("experiments")}
        aria-expanded={open}
        aria-controls="experimental-features-panel"
        title={`Experimental features · ${shortcutLabel("experiments")}`}
        onClick={() => setOpen(!open)}
      >
        <FlaskConical size={18} />
        <span>Experimental features</span>
        {(setting.enabled || value[SIDEBAR_TOOLBAR_LAYOUT_ID].enabled) && (
          <i className="experiment-enabled-dot" />
        )}
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
                Slow gradient pulses trace every native edge of the active
                component. Pulses share one clock, with a bright head and fading
                electrical trail.
              </p>
              <label>
                Pulse color
                <input
                  aria-label="Active component pulse color"
                  type="color"
                  disabled={!setting.enabled}
                  value={setting.tint}
                  onChange={(e) => update({ tint: e.target.value })}
                />
              </label>
              <label>
                Pulse speed<output>{setting.speed.toFixed(2)} cycles/s</output>
                <input
                  aria-label="Active component pulse speed"
                  type="range"
                  min=".02"
                  max="1"
                  step=".02"
                  disabled={!setting.enabled}
                  value={setting.speed}
                  onChange={(e) => update({ speed: Number(e.target.value) })}
                />
              </label>
              <small>
                One end-to-end traversal in {(1 / setting.speed).toFixed(1)}{" "}
                seconds. All edges stay in sync.
              </small>
              <label>
                Pulses per edge
                <select
                  aria-label="Active component pulse count"
                  disabled={!setting.enabled}
                  value={setting.pulses}
                  onChange={(e) => update({ pulses: Number(e.target.value) })}
                >
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Glow strength
                <output>{Math.round(setting.strength * 100)}%</output>
                <input
                  aria-label="Active component pulse strength"
                  type="range"
                  min=".1"
                  max="1"
                  step=".05"
                  disabled={!setting.enabled}
                  value={setting.strength}
                  onChange={(e) => update({ strength: Number(e.target.value) })}
                />
              </label>
              <small>
                Selected faces, edges and vertices keep their own styling. Off
                restores the standard amber component edges.
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
            <ExperimentSection
              id={SIDEBAR_TOOLBAR_LAYOUT_ID}
              title="Toolbar between sidebars"
              enabled={value[SIDEBAR_TOOLBAR_LAYOUT_ID].enabled}
              onToggle={() =>
                onChange({
                  ...value,
                  [SIDEBAR_TOOLBAR_LAYOUT_ID]: {
                    ...value[SIDEBAR_TOOLBAR_LAYOUT_ID],
                    enabled: !value[SIDEBAR_TOOLBAR_LAYOUT_ID].enabled,
                  },
                })
              }
            >
              <code>{SIDEBAR_TOOLBAR_LAYOUT_ID}</code>
              <label>
                Layout
                <select
                  aria-label="Sidebar toolbar layout mode"
                  value={value[SIDEBAR_TOOLBAR_LAYOUT_ID].mode || "between"}
                  onChange={(e) =>
                    onChange({
                      ...value,
                      [SIDEBAR_TOOLBAR_LAYOUT_ID]: {
                        ...value[SIDEBAR_TOOLBAR_LAYOUT_ID],
                        mode: e.target.value as "between" | "inset-buttons",
                      },
                    })
                  }
                >
                  <option value="between">Sidebars beside toolbar</option>
                  <option value="inset-buttons">
                    Full-width bar, inset buttons
                  </option>
                </select>
              </label>
              <p>
                {value[SIDEBAR_TOOLBAR_LAYOUT_ID].mode === "inset-buttons"
                  ? "Keep the toolbar full width, with its buttons inset between the sidebar boundaries. Sidebars begin below the toolbar."
                  : "Extend both sidebars up to the header, with the tool toolbar between them above the viewport."}{" "}
                Applies to desktop widths; mobile keeps its panel layout.
              </p>
              <button
                className="text-button"
                onClick={() =>
                  onChange({
                    ...value,
                    [SIDEBAR_TOOLBAR_LAYOUT_ID]: { enabled: false },
                  })
                }
              >
                <RotateCcw size={13} /> Reset this experiment
              </button>
            </ExperimentSection>
            <footer>
              Each experiment is independent. Refer to its ID when requesting
              changes.
            </footer>
          </div>,
          document.body,
        )}
    </>
  );
}
