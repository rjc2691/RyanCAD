import { useEffect, useRef } from "react";

export interface ContextAction {
  label: string;
  action: () => void;
  disabled?: boolean;
  hint?: string;
}
export default function ContextMenu({
  x,
  y,
  title,
  actions,
  onClose,
}: {
  x: number;
  y: number;
  title: string;
  actions: ContextAction[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const panel = ref.current!;
    const bounds = panel.getBoundingClientRect();
    panel.style.left = `${Math.max(8, Math.min(x, window.innerWidth - bounds.width - 8))}px`;
    panel.style.top = `${Math.max(8, Math.min(y, window.innerHeight - bounds.height - 8))}px`;
    panel.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const outside = (event: PointerEvent) => {
      if (!panel.contains(event.target as Node)) close.current();
    };
    const dismiss = () => close.current();
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", dismiss);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", dismiss);
      previous?.focus();
    };
  }, [x, y]);
  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Design actions"
      className="design-context-menu"
      style={{ left: x, top: y }}
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={(e) => {
        if (["Escape", "Tab"].includes(e.key)) {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }
        if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
          e.preventDefault();
          const items = Array.from(
            ref.current!.querySelectorAll<HTMLButtonElement>(
              "button:not(:disabled)",
            ),
          );
          const current = items.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          const next =
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? items.length - 1
                : (current + (e.key === "ArrowDown" ? 1 : -1) + items.length) %
                  items.length;
          items[next]?.focus();
        }
      }}
    >
      <small>{title}</small>
      {actions.map((item) => (
        <button
          key={item.label}
          role="menuitem"
          disabled={item.disabled}
          onClick={() => {
            onClose();
            item.action();
          }}
        >
          <span>{item.label}</span>
          {item.hint && <kbd>{item.hint}</kbd>}
        </button>
      ))}
    </div>
  );
}
