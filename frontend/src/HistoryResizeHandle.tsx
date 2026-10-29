import { useRef, useState } from "react";
export default function HistoryResizeHandle() {
  const drag = useRef<{ pointer: number; y: number; height: number } | null>(
    null,
  );
  const [value, setValue] = useState<number | null>(null);
  const shell = (element: HTMLElement) =>
    element.closest<HTMLElement>(".app-shell")!;
  const resize = (element: HTMLElement, height: number) => {
    const app = shell(element),
      mobile = matchMedia("(max-width:999px)").matches;
    const header = app
      .querySelector(".app-header")!
      .getBoundingClientRect().height;
    const tools = app
      .querySelector(".tool-strip")!
      .getBoundingClientRect().height;
    const nav = mobile
      ? app.querySelector(".mobile-navigation")?.getBoundingClientRect()
          .height || 0
      : 0;
    const maximum = Math.max(
      88,
      app.clientHeight - header - tools - nav - (mobile ? 120 : 180),
    );
    const size = Math.round(Math.max(88, Math.min(maximum, height)));
    app.style.setProperty("--history-height", size + "px");
    app.dataset.historySized = "true";
    setValue(size);
  };
  const reset = (element: HTMLElement) => {
    const app = shell(element);
    delete app.dataset.historySized;
    app.style.removeProperty("--history-height");
    setValue(null);
  };
  return (
    <div
      className="history-resize-handle"
      role="separator"
      aria-label="Resize feature history"
      aria-orientation="horizontal"
      tabIndex={0}
      aria-valuemin={88}
      aria-valuenow={value || undefined}
      title="Drag to resize history · Double-click to reset"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        drag.current = {
          pointer: e.pointerId,
          y: e.clientY,
          height: e.currentTarget.parentElement!.getBoundingClientRect().height,
        };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        const current = drag.current;
        if (current && current.pointer === e.pointerId)
          resize(e.currentTarget, current.height + current.y - e.clientY);
      }}
      onPointerUp={(e) => {
        drag.current = null;
        if (e.currentTarget.hasPointerCapture(e.pointerId))
          e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
      onLostPointerCapture={() => {
        drag.current = null;
      }}
      onDoubleClick={(e) => reset(e.currentTarget)}
      onKeyDown={(e) => {
        if (["ArrowUp", "ArrowDown", "Home", "Enter"].includes(e.key)) {
          e.preventDefault();
          if (e.key === "Enter") {
            reset(e.currentTarget);
            return;
          }
          const height =
            e.currentTarget.parentElement!.getBoundingClientRect().height;
          resize(
            e.currentTarget,
            e.key === "Home"
              ? 88
              : height +
                  (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 50 : 20),
          );
        }
      }}
    >
      <span />
    </div>
  );
}
