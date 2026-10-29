/** Shortcuts activate the real toolbar button, preserving its current disabled state. */
export const TOOLBAR_SHORTCUTS: Record<
  string,
  { label: string; code: string; shift?: boolean; command?: boolean }
> = {
  tool: { label: "T", code: "KeyT" },
  assembly: { label: "G", code: "KeyG" },
  sketch: { label: "E", code: "KeyE" },
  transform: { label: "M", code: "KeyM" },
  duplicate: { label: "Shift+D", code: "KeyD", shift: true },
  component_pattern: { label: "Shift+A", code: "KeyA", shift: true },
  measure: { label: "I", code: "KeyI" },
  checkpoint: { label: "Shift+S", code: "KeyS", shift: true },
  parameters: { label: "P", code: "KeyP" },
  experiments: { label: "Shift+X", code: "KeyX", shift: true },
  reports: { label: "Shift+B", code: "KeyB", shift: true },
  settings: { label: "Shift+,", code: "Comma", shift: true },
  import: { label: "Shift+I", code: "KeyI", shift: true },
  export: { label: "Shift+E", code: "KeyE", shift: true },
  agents: { label: "Shift+N", code: "KeyN", shift: true },
  account: { label: "Shift+U", code: "KeyU", shift: true },
  search: { label: "Ctrl/⌘+K", code: "KeyK", command: true },
  sketch_select: { label: "V", code: "KeyV" },
  sketch_line: { label: "L", code: "KeyL" },
  sketch_rectangle: { label: "R", code: "KeyR" },
  sketch_circle: { label: "C", code: "KeyC" },
  sketch_arc: { label: "A", code: "KeyA" },
  sketch_point: { label: "P", code: "KeyP" },
  sketch_project: { label: "J", code: "KeyJ" },
  sketch_dimension: { label: "D", code: "KeyD" },
};
export type Binding = (typeof TOOLBAR_SHORTCUTS)[string];
export const MODEL_TOOLBAR_ORDER = [
  "tool",
  "assembly",
  "sketch",
  "transform",
  "duplicate",
  "component_pattern",
  "measure",
  "checkpoint",
  "parameters",
  "experiments",
  "reports",
  "settings",
];
export const ACTION_NAMES: Record<string, string> = {
  tool: "Tool operation",
  assembly: "Group components",
  sketch: "Sketch",
  transform: "Move Component",
  duplicate: "Repeat part",
  component_pattern: "Array parts",
  measure: "Measure",
  checkpoint: "Checkpoint",
  parameters: "Parameters",
  experiments: "Experimental features",
  reports: "Bug reports",
  settings: "Settings",
  import: "Import",
  export: "Export",
  agents: "Agents",
  account: "Account menu",
  search: "Command search",
  sketch_select: "Sketch Select",
  sketch_line: "Sketch Line",
  sketch_rectangle: "Sketch Rectangle",
  sketch_circle: "Sketch Circle",
  sketch_arc: "Sketch Center arc",
  sketch_point: "Sketch Point",
  sketch_project: "Sketch Project",
  sketch_dimension: "Sketch Dimension",
};
const GLOBAL = new Set(["import", "export", "agents", "account", "search"]);
export const shortcutScope = (id: string) =>
  GLOBAL.has(id) ? "global" : id.startsWith("sketch_") ? "sketch" : "model";
export interface ToolbarPreferences {
  bindings: Record<string, Binding | null>;
  order: string[];
}
export const TOOLBAR_PREFERENCES_KEY = "ryancad-toolbar-v1";
export function normalizeToolbarPreferences(raw: any): ToolbarPreferences {
  const bindings: Record<string, Binding | null> = {};
  for (const id of Object.keys(TOOLBAR_SHORTCUTS)) {
    const b = raw?.bindings?.[id];
    if (b === null) bindings[id] = null;
    else if (
      b &&
      typeof b.code === "string" &&
      /^(Key[A-Z]|Digit[0-9]|F[1-9][0-2]?|Comma|Period|Slash|Semicolon|Quote|BracketLeft|BracketRight|Backslash|Minus|Equal)$/.test(
        b.code,
      )
    )
      bindings[id] = {
        code: b.code,
        shift: b.shift === true,
        command: b.command === true,
        label: bindingLabel(b),
      };
  }
  const order = [
    ...new Set<string>(
      (Array.isArray(raw?.order) ? raw.order : []).filter((id: any) =>
        MODEL_TOOLBAR_ORDER.includes(id),
      ),
    ),
  ];
  return {
    bindings,
    order: [
      ...order,
      ...MODEL_TOOLBAR_ORDER.filter((id) => !order.includes(id)),
    ],
  };
}
export function bindingLabel(b: Pick<Binding, "code" | "command" | "shift">) {
  const key =
    (
      {
        Comma: ",",
        Period: ".",
        Slash: "/",
        Semicolon: ";",
        Quote: "'",
        BracketLeft: "[",
        BracketRight: "]",
        Backslash: "\\",
        Minus: "-",
        Equal: "=",
      } as Record<string, string>
    )[b.code] || b.code.replace(/^Key|^Digit/, "");
  return `${b.command ? "Ctrl/⌘+" : ""}${b.shift ? "Shift+" : ""}${key}`;
}
let preferences: ToolbarPreferences;
try {
  preferences = normalizeToolbarPreferences(
    JSON.parse(localStorage.getItem(TOOLBAR_PREFERENCES_KEY) || "null"),
  );
} catch {
  preferences = normalizeToolbarPreferences(null);
}
const listeners = new Set<() => void>();
export const getToolbarPreferences = () => preferences;
export const subscribeToolbar = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
export function saveToolbarPreferences(value: ToolbarPreferences) {
  preferences = normalizeToolbarPreferences(value);
  try {
    localStorage.setItem(TOOLBAR_PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {}
  listeners.forEach((l) => l());
}
export const bindingFor = (id: string) =>
  Object.hasOwn(preferences.bindings, id)
    ? preferences.bindings[id]
    : TOOLBAR_SHORTCUTS[id];
export const shortcutLabel = (id: string) =>
  bindingFor(id)?.label || "Unassigned";
export function shortcutConflicts(id: string, b: Binding) {
  return Object.keys(TOOLBAR_SHORTCUTS).filter((other) => {
    const current = bindingFor(other),
      a = shortcutScope(id),
      c = shortcutScope(other);
    return (
      other !== id &&
      current &&
      current.code === b.code &&
      !!current.shift === !!b.shift &&
      !!current.command === !!b.command &&
      (a === c || a === "global" || c === "global")
    );
  });
}
export function assignShortcut(id: string, b: Binding) {
  const bindings = { ...preferences.bindings, [id]: b };
  for (const other of shortcutConflicts(id, b)) bindings[other] = null;
  saveToolbarPreferences({ ...preferences, bindings });
}
export function reorderToolbar(source: string, target: string) {
  if (
    source === target ||
    !MODEL_TOOLBAR_ORDER.includes(source) ||
    !MODEL_TOOLBAR_ORDER.includes(target)
  )
    return;
  const order = preferences.order.filter((id) => id !== source);
  order.splice(order.indexOf(target), 0, source);
  saveToolbarPreferences({ ...preferences, order });
}
export function shortcutAttributes(id: string) {
  const s = bindingFor(id);
  const chord = s
    ? `${s.shift ? "Shift+" : ""}${bindingLabel({ code: s.code })}`
    : undefined;
  return {
    "data-toolbar-action": id,
    draggable: MODEL_TOOLBAR_ORDER.includes(id),
    "aria-keyshortcuts": s?.command ? `Control+${chord} Meta+${chord}` : chord,
  };
}
export function toolbarShortcut(
  event: Pick<
    KeyboardEvent,
    | "key"
    | "code"
    | "shiftKey"
    | "altKey"
    | "ctrlKey"
    | "metaKey"
    | "isComposing"
    | "repeat"
  >,
  scope: "model" | "sketch" = "model",
) {
  if (event.isComposing || event.repeat || event.altKey) return null;
  const code =
    event.code ||
    (/^[a-z]$/i.test(event.key)
      ? "Key" + event.key.toUpperCase()
      : event.key === ","
        ? "Comma"
        : event.key);
  return (
    Object.keys(TOOLBAR_SHORTCUTS).find((id) => {
      const s = bindingFor(id);
      if (!s || (shortcutScope(id) !== "global" && shortcutScope(id) !== scope))
        return false;
      return (
        s.code === code &&
        !!s.shift === event.shiftKey &&
        !!s.command === (event.ctrlKey || event.metaKey)
      );
    }) || null
  );
}
export function dispatchToolbarShortcut(event: KeyboardEvent) {
  const target = event.target as HTMLElement;
  if (
    target?.closest(
      "input,textarea,select,[contenteditable]:not([contenteditable=false]),[role=dialog],[role=menu]",
    ) ||
    document.querySelector("[role=dialog]")
  )
    return false;
  const id = toolbarShortcut(
    event,
    document.querySelector(".tool-strip")?.getAttribute("aria-label") ===
      "Sketch tools"
      ? "sketch"
      : "model",
  );
  if (!id) return false;
  const button = document.querySelector<HTMLButtonElement>(
    `button[data-toolbar-action="${id}"]`,
  );
  if (!button) return false;
  event.preventDefault();
  event.stopImmediatePropagation();
  if (!button.disabled) {
    button.click();
  }
  return true;
}
