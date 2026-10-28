import { EyeOff } from "lucide-react";
import type { ReactNode, CSSProperties } from "react";
import type { HistoryLane } from "./historyModel";
export default function FeatureHistory({
  lanes,
  count,
  split,
  renderFeature,
  onMerge,
}: {
  lanes: HistoryLane[];
  count: number;
  split: boolean;
  renderFeature: (id: string, index: number) => ReactNode;
  onMerge: (id: string) => void;
}) {
  return (
    <div
      className={`feature-history-scroll ${split ? "parallel-history" : ""}`}
      aria-label="Feature timeline lanes"
    >
      <div
        className="history-lane-grid"
        style={{
          gridTemplateColumns: `144px 40px repeat(${Math.max(count, 1)}, 92px) 40px`,
        }}
      >
        {lanes.map((lane, row) => (
          <div
            className="history-lane"
            role="group"
            aria-label={`${lane.name} timeline`}
            key={lane.id}
            style={{ "--lane-row": row + 1 } as CSSProperties}
          >
            <div className="history-lane-label" style={{ gridColumn: 1 }}>
              <span title={lane.name}>{lane.name}</span>
              {split && lane.id !== "root" && (
                <button
                  className="icon-button"
                  title="Merge features into the design lane"
                  aria-label={`Merge ${lane.name} into design timeline`}
                  onClick={() => onMerge(lane.id)}
                >
                  <EyeOff size={12} />
                </button>
              )}
            </div>
            <div className="history-lane-rule" />
            <div className="timeline-origin" style={{ gridColumn: 2 }}>
              <div />
              <span>Origin</span>
            </div>
            {lane.features.map(({ feature, column }) => (
              <div
                className="history-slot"
                data-feature={feature.id}
                data-column={column}
                key={feature.id}
                style={{ gridColumn: column + 3 }}
              >
                {renderFeature(feature.id, column)}
              </div>
            ))}
            <div
              className="timeline-end"
              style={{ gridColumn: Math.max(count, 1) + 3 }}
            >
              <div />
              <span>Now</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
