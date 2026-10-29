import type { Component, Feature } from "./types";
export interface HistoryLane {
  id: string;
  name: string;
  features: { feature: Feature; column: number }[];
}

/** Shared by the timeline grid and its SVG; connections must stay on the same
 * global columns when lanes are merged, restored, or scrolled. */
export const HISTORY_LAYOUT = {
  labelWidth: 144,
  originWidth: 40,
  columnWidth: 112,
  featureWidth: 83,
  tileWidth: 43,
  rowHeight: 96,
  unifiedRowHeight: 88,
  paddingTop: 8,
  trackY: 21,
} as const;

export interface HistoryConnection {
  from: string;
  to: string;
  fromLane: string;
  toLane: string;
  fromColumn: number;
  toColumn: number;
  jump: boolean;
  path: string;
}

/** Follow creation order, not ownership or geometry dependencies. The diagonal
 * lives to the right of the source caption, with rounded horizontal entries. */
export function historyConnections(lanes: HistoryLane[]): HistoryConnection[] {
  const layout = HISTORY_LAYOUT;
  const events = lanes
    .flatMap((lane, row) =>
      lane.features.map(({ feature, column }) => ({
        id: feature.id,
        lane: lane.id,
        row,
        column,
      })),
    )
    .sort((a, b) => a.column - b.column);
  const number = (value: number) => Number(value.toFixed(3));
  const point = (x: number, y: number) => `${number(x)} ${number(y)}`;
  return events.slice(1).map((to, index) => {
    const from = events[index];
    const x0 = from.column * layout.columnWidth + layout.tileWidth;
    const x3 = to.column * layout.columnWidth;
    const y0 = from.row * layout.rowHeight + layout.trackY;
    const y3 = to.row * layout.rowHeight + layout.trackY;
    const jump = from.row !== to.row;
    let path = `M${point(x0, y0)} L${point(x3, y3)}`;
    if (jump) {
      const x1 = from.column * layout.columnWidth + layout.featureWidth + 6;
      const x2 = x3 - 6;
      const length = Math.hypot(x2 - x1, y3 - y0);
      const radius = Math.min(12, length / 4);
      const dx = ((x2 - x1) / length) * radius;
      const dy = ((y3 - y0) / length) * radius;
      path =
        `M${point(x0, y0)} H${number(x1 - 6)}` +
        ` Q${point(x1, y0)} ${point(x1 + dx, y0 + dy)}` +
        ` L${point(x2 - dx, y3 - dy)}` +
        ` Q${point(x2, y3)} ${point(x3, y3)}`;
    }
    return {
      from: from.id,
      to: to.id,
      fromLane: from.lane,
      toLane: to.lane,
      fromColumn: from.column,
      toColumn: to.column,
      jump,
      path,
    };
  });
}
export function currentHistoryLane(
  lanes: HistoryLane[],
  activeComponent?: string | null,
): string {
  return lanes.some((lane) => lane.id === activeComponent)
    ? activeComponent!
    : "root";
}
/** Columns are global creation positions, never compacted within a component. */
export function historyLanes(
  features: Feature[],
  components: Record<string, Component>,
  split: boolean,
  merged: ReadonlySet<string>,
): HistoryLane[] {
  const lanes: HistoryLane[] = [
    { id: "root", name: split ? "Design / merged" : "Design", features: [] },
  ];
  const byOwner = new Map<string, HistoryLane>([["root", lanes[0]]]);
  features.forEach((feature, index) => {
    const owner = split && !merged.has(feature.owner) ? feature.owner : "root";
    let lane = byOwner.get(owner);
    if (!lane) {
      lane = {
        id: owner,
        name: components[owner]?.name || "Component",
        features: [],
      };
      byOwner.set(owner, lane);
      lanes.push(lane);
    }
    lane.features.push({ feature, column: index });
  });
  return lanes;
}
export function historyStep(
  order: string[],
  current: string | null,
  direction: -1 | 1,
) {
  const index =
    current === "origin"
      ? -1
      : current
        ? order.indexOf(current)
        : order.length - 1;
  const next = index + direction;
  return next < 0 ? "origin" : next >= order.length - 1 ? null : order[next];
}
