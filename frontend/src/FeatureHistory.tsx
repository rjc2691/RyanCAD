import { EyeOff } from "lucide-react";
import type { ReactNode, CSSProperties } from "react";
import type { HistoryLane } from "./historyModel";
import {
  currentHistoryLane,
  historyConnections,
  HISTORY_LAYOUT,
} from "./historyModel";
export default function FeatureHistory({
  lanes,
  count,
  split,
  renderFeature,
  onMerge,
  activeComponent,
}: {
  lanes: HistoryLane[];
  count: number;
  split: boolean;
  renderFeature: (id: string, index: number) => ReactNode;
  onMerge: (id: string) => void;
  activeComponent?: string | null;
}) {
  const nowLane = currentHistoryLane(lanes, activeComponent);
  const layout = HISTORY_LAYOUT;
  const connections = split ? historyConnections(lanes) : [];
  return (
    <div
      className={`feature-history-scroll ${split ? "parallel-history" : ""}`}
      aria-label="Feature timeline lanes"
    >
      <div
        className="history-lane-grid"
        style={
          {
            gridTemplateColumns: `${layout.labelWidth}px ${layout.originWidth}px repeat(${Math.max(count, 1)}, ${layout.columnWidth}px) 40px`,
            "--history-row-height": `${split ? layout.rowHeight : layout.unifiedRowHeight}px`,
            "--history-padding-top": `${layout.paddingTop}px`,
            "--history-feature-width": `${layout.featureWidth}px`,
            "--history-tile-width": `${layout.tileWidth}px`,
            "--history-track-y": `${layout.trackY}px`,
          } as CSSProperties
        }
      >
        {connections.length > 0 && (
          <svg
            className="history-chronology"
            aria-hidden="true"
            focusable="false"
            width={Math.max(count, 1) * layout.columnWidth}
            height={lanes.length * layout.rowHeight}
            style={{
              left: layout.labelWidth + layout.originWidth,
              top: layout.paddingTop,
            }}
          >
            {connections.map((connection) => (
              <g
                key={`${connection.from}:${connection.to}`}
                data-from-feature={connection.from}
                data-to-feature={connection.to}
                data-from-lane={connection.fromLane}
                data-to-lane={connection.toLane}
                data-lane-jump={connection.jump}
              >
                <path className="history-connection-halo" d={connection.path} />
                <path className="history-connection" d={connection.path} />
              </g>
            ))}
          </svg>
        )}
        {lanes.map((lane, row) => (
          <div
            className="history-lane"
            role="group"
            aria-label={`${lane.name} timeline`}
            key={lane.id}
            style={{ "--lane-row": row + 1 } as CSSProperties}
          >
            <div
              className="history-lane-label"
              data-active={lane.id === nowLane}
              style={{ gridColumn: 1 }}
            >
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
            {lane.id === nowLane && (
              <div
                className="timeline-end"
                style={{ gridColumn: Math.max(count, 1) + 3 }}
              >
                <div />
                <span>Now</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
