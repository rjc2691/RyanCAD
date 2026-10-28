import { useEffect, useRef, useState } from "react";
import { Box, Check, X } from "lucide-react";
import type { Component, RunCommand } from "./types";

export const PART_COLORS = [
  ["Glacier", "#689ac5"],
  ["Sage", "#70a997"],
  ["Clay", "#c18e70"],
  ["Iris", "#9c8fbe"],
  ["Ochre", "#c5aa68"],
  ["Rose", "#b77d8e"],
  ["Mist", "#acbcc9"],
  ["Graphite", "#657487"],
];

export default function ComponentAppearance({
  component,
  x,
  y,
  linkedCount,
  run,
  onPreview,
  onClose,
  focusName = false,
}: {
  component: Component;
  x: number;
  y: number;
  linkedCount: number;
  run: RunCommand;
  onPreview: (color: string | null) => void;
  onClose: () => void;
  focusName?: boolean;
}) {
  const [name, setName] = useState(component.name);
  const [color, setColor] = useState(component.color);
  const [hex, setHex] = useState(component.color);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const committed = useRef({ name: component.name, color: component.color });
  const savingRef = useRef(false);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const previewRef = useRef(onPreview);
  previewRef.current = onPreview;
  const save = async (nextColor = color) => {
    if (savingRef.current) return false;
    const nextName = name.trim();
    if (!nextName) {
      setError("Give this component a name.");
      return false;
    }
    if (
      nextName === committed.current.name &&
      nextColor === committed.current.color
    )
      return true;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      await run("component.rename", {
        id: component.id,
        name: nextName,
        color: nextColor,
      });
      committed.current = { name: nextName, color: nextColor };
      return true;
    } catch {
      setError("Could not save. Your previous appearance is preserved.");
      setName(committed.current.name);
      setColor(committed.current.color);
      setHex(committed.current.color);
      onPreview(committed.current.color);
      return false;
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };
  const finish = async () => {
    if (await save()) closeRef.current();
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;
  const preview = (value: string) => {
    setColor(value);
    setHex(value);
    onPreview(value);
  };
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    if (focusName) {
      nameInput.current?.focus();
      nameInput.current?.select();
    } else panel.current?.focus();
    const outside = (event: PointerEvent) => {
      if (!panel.current?.contains(event.target as Node) && !savingRef.current)
        void finishRef.current();
    };
    // A temporarily disabled slider can release focus to the document while saving.
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        if (!savingRef.current) closeRef.current();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
      previewRef.current(null);
      previousFocus?.focus();
    };
  }, []);
  const rgb = [1, 3, 5].map((start) =>
    parseInt(color.slice(start, start + 2), 16),
  );
  return (
    <div
      className="appearance-popover"
      ref={panel}
      role="dialog"
      aria-label="Component appearance"
      tabIndex={-1}
      style={{
        left: Math.max(8, Math.min(x, window.innerWidth - 310)),
        top: Math.max(8, Math.min(y, window.innerHeight - 470)),
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          if (!savingRef.current) onClose();
        }
        if (event.key === "Tab") {
          const nodes = Array.from(
            panel.current!.querySelectorAll<HTMLElement>(
              "button:not(:disabled), input:not(:disabled)",
            ),
          );
          if (
            event.shiftKey &&
            (document.activeElement === nodes[0] ||
              document.activeElement === panel.current)
          ) {
            event.preventDefault();
            nodes.at(-1)?.focus();
          } else if (
            !event.shiftKey &&
            document.activeElement === nodes.at(-1)
          ) {
            event.preventDefault();
            nodes[0]?.focus();
          }
        }
      }}
    >
      <header>
        <Box size={17} />
        <strong>Component appearance</strong>
        <button
          disabled={saving}
          aria-label="Close appearance"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void finish()}
        >
          <X size={16} />
        </button>
      </header>
      <label className="field">
        <span>Component name</span>
        <input
          ref={nameInput}
          value={name}
          disabled={saving}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => void save()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void save();
            }
          }}
        />
      </label>
      <div className="appearance-preview">
        <i style={{ background: color }} />
        <span>
          <strong>Display color</strong>
          <small>Preview on the model as you adjust</small>
        </span>
      </div>
      <div
        className="part-color-palette"
        onPointerLeave={() => onPreview(color)}
      >
        {PART_COLORS.map(([label, value]) => (
          <button
            key={value}
            disabled={saving}
            title={label}
            aria-label={label + " color"}
            aria-pressed={color.toLowerCase() === value}
            style={{ background: value }}
            onPointerEnter={() => {
              if (!saving) onPreview(value);
            }}
            onFocus={() => onPreview(value)}
            onBlur={() => onPreview(color)}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              preview(value);
              void save(value);
            }}
          >
            {color.toLowerCase() === value && <Check size={17} />}
          </button>
        ))}
      </div>
      <div className="color-sliders">
        {["Red", "Green", "Blue"].map((channel, index) => (
          <label key={channel}>
            <span>{channel}</span>
            <input
              type="range"
              min="0"
              max="255"
              value={rgb[index]}
              disabled={saving}
              aria-label={channel}
              onChange={(e) => {
                const next = [...rgb];
                next[index] = Number(e.target.value);
                preview(
                  "#" +
                    next.map((v) => v.toString(16).padStart(2, "0")).join(""),
                );
              }}
              onPointerUp={() => void save()}
              onKeyUp={(e) => {
                if (
                  [
                    "ArrowLeft",
                    "ArrowRight",
                    "ArrowUp",
                    "ArrowDown",
                    "Home",
                    "End",
                    "PageUp",
                    "PageDown",
                  ].includes(e.key)
                )
                  void save();
              }}
              onBlur={() => void save()}
            />
            <output>{rgb[index]}</output>
          </label>
        ))}
      </div>
      <label className="color-hex">
        <span>HEX</span>
        <input
          aria-label="Hex color"
          value={hex}
          disabled={saving}
          spellCheck={false}
          maxLength={7}
          aria-invalid={!/^#[0-9a-f]{6}$/i.test(hex)}
          onChange={(e) => {
            setHex(e.target.value);
            if (/^#[0-9a-f]{6}$/i.test(e.target.value)) {
              setColor(e.target.value);
              onPreview(e.target.value);
            }
          }}
          onBlur={() => {
            setHex(color);
            void save();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              setHex(color);
              void save();
            }
          }}
        />
        <small>
          {saving
            ? "Saving…"
            : name.trim() !== committed.current.name ||
                color !== committed.current.color
              ? "Editing…"
              : "Saved automatically"}
        </small>
      </label>
      {error && (
        <p role="alert" className="appearance-error">
          {error}
        </p>
      )}
      <footer>
        {linkedCount > 1
          ? `Shared by ${linkedCount} linked instances. Name and color update together.`
          : "Name: Enter or click away. Color: click a swatch or release a slider."}
      </footer>
    </div>
  );
}
