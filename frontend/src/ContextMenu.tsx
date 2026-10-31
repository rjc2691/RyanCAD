import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

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
  useLayoutEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const panel = ref.current!;
    const viewport=window.visualViewport;
    const place=()=>{
      const left=viewport?.offsetLeft||0,top=viewport?.offsetTop||0;
      const width=viewport?.width||window.innerWidth,height=viewport?.height||window.innerHeight;
      panel.style.maxHeight=`${Math.max(1,height-16)}px`;
      panel.style.minWidth=`${Math.min(218,Math.max(1,width-16))}px`;
      panel.style.maxWidth=`${Math.min(300,Math.max(1,width-16))}px`;
      const bounds=panel.getBoundingClientRect();
      panel.style.left=`${Math.max(left+8,Math.min(x,left+width-bounds.width-8))}px`;
      panel.style.top=`${Math.max(top+8,Math.min(y,top+height-bounds.height-8))}px`;
    };
    place();
    panel.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({preventScroll:true});
    const observer=new ResizeObserver(place);observer.observe(panel);
    const outside = (event: PointerEvent) => {
      if (!panel.contains(event.target as Node)) close.current();
    };
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", place);
    viewport?.addEventListener("resize",place);
    viewport?.addEventListener("scroll",place);
    return () => {
      document.removeEventListener("pointerdown", outside);
      observer.disconnect();
      window.removeEventListener("resize", place);
      viewport?.removeEventListener("resize",place);
      viewport?.removeEventListener("scroll",place);
      previous?.focus({preventScroll:true});
    };
  }, [x, y]);
  return createPortal(
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
          e.stopPropagation();
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
    </div>,document.body
  );
}
