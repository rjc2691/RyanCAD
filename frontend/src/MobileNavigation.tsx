import { useEffect, useState } from "react";
import { Boxes, History, Scan, SlidersHorizontal } from "lucide-react";

export type MobilePane = "viewport" | "design" | "inspector" | "history";

export function useMobileLayout() {
  const [mobile, setMobile] = useState(
    () => window.matchMedia("(max-width: 999px)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(max-width: 999px)");
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return mobile;
}

export default function MobileNavigation({
  pane,
  onChange,
  operation,
}: {
  pane: MobilePane;
  onChange: (pane: MobilePane) => void;
  operation: string | null;
}) {
  return (
    <nav className="mobile-navigation" aria-label="Mobile workspace panels">
      {(
        [
          ["viewport", "View", Scan],
          ["design", "Design", Boxes],
          ["inspector", operation || "Inspector", SlidersHorizontal],
          ["history", "History", History],
        ] as const
      ).map(([id, label, Icon]) => (
        <button
          key={id}
          aria-label={`Show ${id === "inspector" ? "inspector" : label.toLowerCase()}`}
          aria-pressed={pane === id}
          onClick={() => onChange(id)}
        >
          <Icon size={19} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}
