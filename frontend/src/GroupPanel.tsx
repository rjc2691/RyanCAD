import { forwardRef, useImperativeHandle, useState } from "react";
import { Check, FolderPlus, X } from "lucide-react";
import type { Occurrence } from "./types";
export interface GroupPanelHandle {
  confirm: () => void;
  cancel: () => void;
}
export default forwardRef<
  GroupPanelHandle,
  {
    rows: Occurrence[];
    selected: string[];
    onSelected: (ids: string[]) => void;
    onApply: (mode: string, name: string, target: string) => Promise<void>;
    onClose: () => void;
  }
>(function GroupPanel({ rows, selected, onSelected, onApply, onClose }, ref) {
  const [name, setName] = useState("Component group"),
    [target, setTarget] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const toggle = (id: string) =>
    onSelected(
      selected.includes(id)
        ? selected.filter((v) => v !== id)
        : [...selected, id],
    );
  const apply = async () => {
    if (busy || !selected.length || (!target && !name.trim())) return;
    setBusy(true);
    setError("");
    try {
      await onApply(target ? "add" : "new", name, target);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  useImperativeHandle(ref, () => ({
    confirm: () => void apply(),
    cancel: () => {
      if (!busy) onClose();
    },
  }));
  return (
    <aside className="operation-panel" aria-label="Group components workspace">
      <header className="operation-header">
        <h2>
          <FolderPlus size={18} />
          Group components
        </h2>
        <button
          className="icon-button"
          disabled={busy}
          aria-label="Cancel grouping"
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </header>
      <div className="operation-fields">
        <section className="operation-section">
          <label className="field">
            <span>Destination</span>
            <select
              aria-label="Group destination"
              value={target}
              onChange={(e) => {
                setTarget(e.target.value);
                onSelected(selected.filter((id) => id !== e.target.value));
              }}
            >
              <option value="">Create new group</option>
              {rows
                .filter((o) => o.kind === "assembly" && !o.pattern_mode)
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    Add to {o.name}
                  </option>
                ))}
            </select>
          </label>
          {!target && (
            <label className="field">
              <span>Group name</span>
              <input
                aria-label="Group name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
              />
            </label>
          )}
          <h3>Members · {selected.length} selected</h3>
          <p className="field-help">
            Pick components in the viewport or use this list. Existing positions
            are preserved.
          </p>
          {rows
            .filter((o) => o.id !== target)
            .map((o) => (
              <label className="group-member" key={o.id}>
                <input
                  type="checkbox"
                  aria-label={`Include ${o.name}`}
                  checked={selected.includes(o.id)}
                  disabled={busy || !!o.pattern_mode}
                  onChange={() => toggle(o.id)}
                />
                <span>
                  <strong>{o.name}</strong>
                  <small>
                    {o.kind === "assembly"
                      ? "Group"
                      : o.pattern_mode
                        ? "Pattern · make members independent first"
                        : "Component"}
                  </small>
                </span>
              </label>
            ))}
          {!rows.length && (
            <p className="field-help">
              Create components first, or finish editing this group to select
              other parts.
            </p>
          )}
          {target && (
            <p className="field-help">
              Adding to a moved group rebases member placement into the group's
              frame. Existing placement parameter identities remain available.
            </p>
          )}
          {error && (
            <p role="alert" className="operation-error">
              {error}
            </p>
          )}
        </section>
      </div>
      <footer className="group-commit">
        <button
          className="primary"
          disabled={busy || !selected.length || (!target && !name.trim())}
          onClick={apply}
        >
          <Check size={14} />
          {busy ? "Grouping…" : target ? "Add to group" : "Create group"}
        </button>
        <button disabled={busy} onClick={onClose}>
          Cancel
        </button>
      </footer>
    </aside>
  );
});
