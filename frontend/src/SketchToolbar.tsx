import {shortcutAttributes,shortcutLabel} from './toolbarShortcuts';
import {
  Check,
  Link2, Unlink, Move3D,
  Circle,
  Crosshair,
  Dot,
  MousePointer2,
  PencilLine,
  Radius,
  Ruler,
  RectangleHorizontal,
  Undo2,
  X,
} from "lucide-react";
import type { SketchDraft, SketchTool } from "./sketchModel";

const tools: {
  id: SketchTool;
  label: string;
  key: string;
  icon: typeof Circle;
}[] = [
  { id: "select", label: "Select", key: "Space", icon: MousePointer2 },
  {id:"move",label:"Move",key:"M",icon:Move3D},
  { id: "line", label: "Line", key: "L", icon: PencilLine },
  { id: "rectangle", label: "Rectangle", key: "R", icon: RectangleHorizontal },
  { id: "circle", label: "Circle", key: "C", icon: Circle },
  { id: "arc", label: "Center arc", key: "A", icon: Radius },
  { id: "point", label: "Point", key: "P", icon: Dot },
  { id: "project", label: "Project", key: "J", icon: Crosshair },
  { id: "dimension", label: "Dimension", key: "D", icon: Ruler },
  { id: "connect", label: "Connect", key: "K", icon: Link2 },
  { id: "disconnect", label: "Disconnect", key: "U", icon: Unlink },
];
export default function SketchToolbar({
  draft,
  disabled,
  busy,
  onTool,
  onFinish,
  onCancel,
  onUndo,
}: {
  draft: SketchDraft;
  disabled: boolean;
  busy: boolean;
  onTool: (tool: SketchTool) => void;
  onFinish: () => void;
  onCancel: () => void;
  onUndo: () => void;
}) {
  return (
    <>
      {tools.map((t) => (
        <button
          key={t.id}
          {...shortcutAttributes("sketch_"+t.id)}
          className={`tool-button ${draft.tool === t.id ? "active" : ""}`}
          aria-label={`Sketch ${t.label}`}

          aria-pressed={draft.tool === t.id}
          title={`${t.label} · ${t.key}`}
          disabled={disabled}
          onClick={() => onTool(t.id)}
        >
          <t.icon size={18} />
          <span>{t.label}</span>
          <kbd>{shortcutLabel("sketch_"+t.id)}</kbd>
        </button>
      ))}
      <div className="tool-divider" />
      <button
        className="tool-button"
        disabled={disabled}
        onClick={onUndo}
        title="Undo sketch edit · Ctrl Z"
        aria-keyshortcuts="Control+z Meta+z"
      >
        <Undo2 size={18} />
        <span>Undo</span>
        <kbd>Ctrl/⌘+Z</kbd>
      </button>
      <div className="toolbar-spacer" />
      <button
        className="tool-button primary-tool"
        disabled={disabled || !draft.entities.length}
        onClick={onFinish}
        title="Finish sketch · Enter"
        aria-keyshortcuts="Enter"
      >
        <Check size={18} />
        <span>Finish sketch</span>
        <kbd>Enter</kbd>
      </button>
      <button
        className="tool-button"
        disabled={busy}
        onClick={onCancel}
        title="Cancel sketch · Esc"
        aria-keyshortcuts="Escape"
      >
        <X size={18} />
        <span>Cancel sketch</span>
        <kbd>Esc</kbd>
      </button>
    </>
  );
}
