import { useEffect, useRef, useState } from "react";
import {
  ACTION_NAMES,
  TOOLBAR_SHORTCUTS,
  MODEL_TOOLBAR_ORDER,
  getToolbarPreferences,
  subscribeToolbar,
  saveToolbarPreferences,
  shortcutLabel,
  shortcutScope,
  shortcutConflicts,
  assignShortcut,
  bindingLabel,
  type Binding,
} from "./toolbarShortcuts";
export default function ToolbarSettings({moveLabel="Move Component"}:{moveLabel?:string}) {
  const actionName=(id:string)=>id==="transform"?moveLabel:ACTION_NAMES[id];
  const [prefs, setPrefs] = useState(getToolbarPreferences),
    [editing, setEditing] = useState<string | null>(null),
    [pending, setPending] = useState<Binding | null>(null),
    [warning, setWarning] = useState("");
  const capture = useRef<HTMLDivElement>(null);
  useEffect(
    () => subscribeToolbar(() => setPrefs(getToolbarPreferences())),
    [],
  );
  useEffect(() => {
    if (editing) capture.current?.focus();
  }, [editing]);
  const cancel = () => {
    setEditing(null);
    setPending(null);
    setWarning("");
  };
  return (
    <section className="toolbar-settings">
      <h3>Keyboard shortcuts</h3>
      <p>
        Click a shortcut, then press a new key combination. Settings are saved
        in this browser. Sketch shortcuts apply only while sketching.
      </p>
      {editing && (
        <div
          className="shortcut-capture"
          data-shortcut-capture
          tabIndex={0}
          ref={capture}
          role="group"
          aria-label="Press new shortcut"
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              cancel();
              return;
            }
            if (e.key === "Tab" || e.target !== e.currentTarget) return;
            e.preventDefault();
            e.stopPropagation();
            if (
              e.repeat ||
              e.nativeEvent.isComposing ||
              ["Shift", "Control", "Meta", "Alt"].includes(e.key)
            )
              return;
            const code = e.code,
              command = e.ctrlKey || e.metaKey;
            if (
              e.altKey ||
              !/^(Key[A-Z]|Digit[0-9]|F[1-9][0-2]?|Comma|Period|Slash|Semicolon|Quote|BracketLeft|BracketRight|Backslash|Minus|Equal)$/.test(
                code,
              ) ||
              (["KeyF", "Digit1", "Digit2", "Digit7"].includes(code) &&
                !command &&
                !e.shiftKey) ||
              (code === "KeyG" && e.shiftKey && !command) ||
              (command &&
                [
                  "KeyC",
                  "KeyV",
                  "KeyZ",
                  "KeyS",
                  "KeyR",
                  "KeyW",
                  "KeyQ",
                  "KeyT",
                  "KeyN",
                  "KeyL",
                  "KeyP",
                ].includes(code))
            ) {
              setWarning(
                "That combination is reserved for browser or existing navigation/edit controls. Choose another.",
              );
              setPending(null);
              return;
            }
            const b = {
              code,
              command,
              shift: e.shiftKey,
              label: bindingLabel({ code, command, shift: e.shiftKey }),
            };
            const conflicts = shortcutConflicts(editing, b);
            if (conflicts.length) {
              setPending(b);
              setWarning(
                `${b.label} is assigned to ${conflicts.map((id) => actionName(id)).join(", ")}. Replace it? Those actions will become unassigned.`,
              );
            } else {
              assignShortcut(editing, b);
              cancel();
            }
          }}
        >
          <strong>Press new shortcut for {actionName(editing)}</strong>
          <p>Esc cancels. Modifier keys alone are ignored.</p>
          {warning && <p role="alert">{warning}</p>}
          {pending && (
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                assignShortcut(editing, pending);
                cancel();
              }}
            >
              Replace conflicting shortcut
            </button>
          )}
          <button type="button" className="text-button" onClick={cancel}>
            Cancel shortcut edit
          </button>
        </div>
      )}
      <div className="shortcut-edit-list">
        {Object.keys(TOOLBAR_SHORTCUTS).map((id) => (
          <div key={id}>
            <span>
              {actionName(id)}
              <small>
                {shortcutScope(id) === "sketch"
                  ? "Sketch"
                  : shortcutScope(id) === "global"
                    ? "Header"
                    : "Modeling"}
              </small>
            </span>
            <button
              type="button"
              className="shortcut-edit-button"
              aria-label={`Edit shortcut for ${actionName(id)}`}
              onClick={() => {
                setEditing(id);
                setPending(null);
                setWarning("");
              }}
            >
              {shortcutLabel(id)}
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="button secondary"
        onClick={() => {
          saveToolbarPreferences({ ...prefs, bindings: {} });
          cancel();
        }}
      >
        Reset shortcuts to defaults
      </button>
      <h3>Toolbar order</h3>
      <p>
        Drag modeling toolbar buttons to reorder them. You can also move them
        with these controls.
      </p>
      <div className="toolbar-order-list">
        {prefs.order.map((id, i) => (
          <div key={id}>
            <span>{actionName(id)}</span>
            <button
              type="button"
              aria-label={`Move ${actionName(id)} earlier`}
              disabled={i === 0}
              onClick={() => {
                const order = [...prefs.order];
                [order[i], order[i - 1]] = [order[i - 1], order[i]];
                saveToolbarPreferences({ ...prefs, order });
              }}
            >
              ↑
            </button>
            <button
              type="button"
              aria-label={`Move ${actionName(id)} later`}
              disabled={i === prefs.order.length - 1}
              onClick={() => {
                const order = [...prefs.order];
                [order[i], order[i + 1]] = [order[i + 1], order[i]];
                saveToolbarPreferences({ ...prefs, order });
              }}
            >
              ↓
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className="button secondary"
        onClick={() =>
          saveToolbarPreferences({ ...prefs, order: [...MODEL_TOOLBAR_ORDER] })
        }
      >
        Reset toolbar order
      </button>
      <p>
        Enter/Escape, sketch Undo, view navigation, grid snapping and ordinary
        Undo/Redo retain their existing workflow bindings.
      </p>
    </section>
  );
}
