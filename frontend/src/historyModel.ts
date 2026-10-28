import type { Component, Feature } from "./types";
export interface HistoryLane {
  id: string;
  name: string;
  features: { feature: Feature; column: number }[];
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
