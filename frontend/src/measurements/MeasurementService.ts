/** View-independent measurement policy. Values are canonical mm / mm², never pixels.
 * Providers and weighted signals are replaceable independently of the SVG/Three adapter.
 */
export type Vec3 = [number, number, number];
export type Vec2 = [number, number];
export interface EdgeMeasure {
  id: string;
  type: string;
  length: number;
  a: Vec3;
  b: Vec3;
  anchor: Vec3;
}
export interface FaceMeasure {
  id: string;
  type: string;
  area: number;
  center: Vec3;
  normal: Vec3;
  bounds: { min: number[]; max: number[]; size: number[] };
}
export interface MeasurementPart {
  id: string;
  definition: string;
  edges: EdgeMeasure[];
  faces: FaceMeasure[];
  focusFaceIds?: string[];
  bounds: { min: number[]; max: number[]; size: number[] };
}
export interface Focus {
  occurrence: string;
  entity?: string;
  face?: FaceMeasure;
  point?: Vec3;
}
export interface Candidate {
  id: string;
  occurrence: string;
  entity: string;
  kind: "length" | "extent" | "curve" | "area";
  value: number;
  a: Vec3;
  b: Vec3;
  anchor: Vec3;
  axis?: number;
  group: string;
  qualifier: string;
  confidence: number;
  /** A measured boundary can be relevant to a face without being a design parameter. */
  onFaces?: string[];
}
export interface ProjectedPoint {
  x: number;
  y: number;
  visible: boolean;
}
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface ScoreContext {
  selected: Focus | null;
  hovered: Focus | null;
  selectedItems?: Focus[];
  hoveredItems?: Focus[];
  now: number;
  width: number;
  height: number;
  units: "mm" | "in";
  project: (occurrence: string, point: Vec3) => ProjectedPoint;
  /** Optional adapter query, bounded to the most promising candidates. */
  visibility?: (candidate: Candidate) => number;
  covered?: (rect: Rect) => number;
  reserved: Rect[];
}
export interface RankedCandidate {
  candidate: Candidate;
  score: number;
  signals: Record<string, number>;
}
export interface Placement {
  candidate: Candidate;
  score: number;
  signals: Record<string, number>;
  label: string;
  hint: string;
  rect: Rect;
  angle: number;
  a: Vec2;
  b: Vec2;
  p: Vec2;
  q: Vec2;
  labelPoint: Vec2;
  compact: boolean;
  hover: boolean;
}
export type CandidateProvider = (part: MeasurementPart) => Candidate[];
export type ScoreSignal = (
  candidate: Candidate,
  context: ScoreContext,
) => number;
const clamp = (value: number) => Math.max(0, Math.min(1, value));
const center = (a: number[], b: number[]): Vec3 =>
  a.map((v, i) => (v + b[i]) / 2) as Vec3;
const distance = (a: number[], b: number[]) =>
  Math.hypot(...a.map((v, i) => v - b[i]));
const dot = (a: number[], b: number[]) =>
  a.reduce((s, v, i) => s + v * b[i], 0);
const normalizedAxis = (a: Vec3, b: Vec3) => {
  const d = b.map((v, i) => v - a[i]);
  const length = Math.hypot(...d);
  const first = d.find((v) => Math.abs(v) > length * 0.0005) || 1;
  return d
    .map((v) => {
      const n = (Math.sign(first) * v) / (length || 1);
      return (Math.abs(n) < 0.0005 ? 0 : n).toFixed(3);
    })
    .join(",");
};
const overlap = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));

export function formatMeasurement(c: Candidate, units: "mm" | "in") {
  const value =
    c.value / (units === "in" ? (c.kind === "area" ? 25.4 ** 2 : 25.4) : 1);
  const number = value.toLocaleString(undefined, {
    maximumFractionDigits: units === "in" ? 4 : 3,
  });
  return `${c.kind === "area" ? "a=" : c.kind === "curve" ? "L " : ""}${number} ${units}${c.kind === "area" ? "²" : ""}`;
}

export const edgeProvider: CandidateProvider = (part) =>
  part.edges
    .filter((e) => e.length > 1e-7)
    .map((edge) => {
      const faces = part.faces.filter((f) => {
        if (f.type !== "PLANE") return false;
        const tolerance = Math.max(
          1e-4,
          Math.hypot(...part.bounds.size) * 1e-6,
        );
        return [edge.a, edge.b, edge.anchor].every(
          (p) =>
            p.every(
              (v, i) =>
                v >= f.bounds.min[i] - tolerance &&
                v <= f.bounds.max[i] + tolerance,
            ) &&
            Math.abs(
              dot(
                p.map((v, i) => v - f.center[i]),
                f.normal,
              ),
            ) < tolerance,
        );
      });
      return {
        id: `${part.id}:edge:${edge.id}`,
        occurrence: part.id,
        entity: `edge:${edge.id}`,
        kind: edge.type === "LINE" ? "length" : "curve",
        value: edge.length,
        a: edge.a,
        b: edge.b,
        anchor: edge.anchor,
        group: `${part.id}:${edge.type}:${normalizedAxis(edge.a, edge.b)}:${edge.length.toPrecision(12)}`,
        qualifier:
          edge.type === "LINE"
            ? "Edge length"
            : "Curve length (along the curve)",
        confidence: 1,
        onFaces: faces.map((f) => f.id),
      };
    });

export const extentProvider: CandidateProvider = (part) =>
  part.bounds.size.flatMap((value, axis) => {
    if (value < 1e-6) return [];
    // Anchor on real local bounding planes. The adapter applies occurrence placement.
    const a = [...part.bounds.max] as Vec3,
      b = [...part.bounds.max] as Vec3;
    a[axis] = part.bounds.min[axis];
    return [
      {
        id: `${part.id}:extent:${axis}`,
        occurrence: part.id,
        entity: "component",
        kind: "extent" as const,
        value,
        a,
        b,
        anchor: center(a, b),
        axis,
        group: `${part.id}:LINE:${normalizedAxis(a, b)}:${value.toPrecision(12)}`,
        qualifier: `Overall ${["X", "Y", "Z"][axis]} extent (component-local frame)`,
        confidence: 1,
      },
    ];
  });

export const areaProvider: CandidateProvider = (part) =>
  part.faces
    .filter((f) => f.area > 1e-8)
    .map((face) => ({
      id: `${part.id}:face:${face.id}`,
      occurrence: part.id,
      entity: `face:${face.id}`,
      kind: "area",
      value: face.area,
      a: face.center,
      b: face.center,
      anchor: face.center,
      group: `${part.id}:area:${face.id}`,
      qualifier: "Face area",
      confidence: 1,
    }));

export class MeasurementService {
  readonly providers = new Map<string, CandidateProvider>([
    ["edges", edgeProvider],
    ["extents", extentProvider],
    ["areas", areaProvider],
  ]);
  readonly signals = new Map<string, { weight: number; score: ScoreSignal }>();
  private recent = new Map<string, { time: number; strength: number }>();
  private previous = new Set<string>();
  private parts = new Map<string, MeasurementPart>();
  private density = new Map<string, number>();
  private diagnostics: RankedCandidate[] = [];

  constructor() {
    this.signals.set("selection", {
      weight: 62,
      score: (c, x) =>
        Math.max(
          this.relevance(c, x.selected),
          ...(x.selectedItems || []).map((f) => this.relevance(c, f)),
        ),
    });
    this.signals.set("hover", {
      weight: 43,
      score: (c, x) =>
        Math.max(
          this.relevance(c, x.hovered),
          ...(x.hoveredItems || []).map((f) => this.relevance(c, f)),
        ),
    });
    this.signals.set("recency", {
      weight: 14,
      score: (c, x) => {
        const recent = this.recent.get(`${c.occurrence}:${c.entity}`);
        return recent
          ? recent.strength * Math.exp(-(x.now - recent.time) / 12000)
          : 0;
      },
    });
    this.signals.set("legibility", {
      weight: 16,
      score: (c, x) => {
        if (c.kind === "area" || c.kind === "curve") return 0.4;
        const a = x.project(c.occurrence, c.a),
          b = x.project(c.occurrence, c.b);
        return clamp(Math.hypot(a.x - b.x, a.y - b.y) / 140);
      },
    });
    this.signals.set("information", {
      weight: 24,
      score: (c) => (c.kind === "area" ? -0.7 : c.kind === "curve" ? 0.55 : 1),
    });
    this.signals.set("thinPart", {
      weight: 19,
      score: (c) => {
        const sizes = this.parts.get(c.occurrence)?.bounds.size || [];
        return c.kind === "extent" &&
          c.value === Math.min(...sizes.filter((v) => v > 1e-6))
          ? clamp(1 - c.value / Math.max(...sizes))
          : 0;
      },
    });
    this.signals.set("stability", {
      weight: 9,
      score: (c) => (this.previous.has(c.id) ? 1 : 0),
    });
    this.signals.set("competition", {
      weight: -9,
      score: (c) => clamp(Math.log2(this.density.get(c.group) || 1) / 4),
    });
  }

  observe(focus: Focus | null, kind: "select" | "hover", now: number) {
    if (!focus) return;
    this.recent.set(`${focus.occurrence}:${focus.entity || "component"}`, {
      time: now,
      strength: kind === "select" ? 1 : 0.55,
    });
    while (this.recent.size > 48)
      this.recent.delete(this.recent.keys().next().value!);
  }
  reset() {
    this.previous.clear();
    this.recent.clear();
  }
  candidates(parts: MeasurementPart[]) {
    this.parts = new Map(parts.map((p) => [p.id, p]));
    const candidates = parts.flatMap((p) =>
      Array.from(this.providers.values()).flatMap((provider) => provider(p)),
    );
    this.density.clear();
    for (const c of candidates)
      this.density.set(c.group, (this.density.get(c.group) || 0) + 1);
    return candidates;
  }
  explain() {
    return this.diagnostics;
  }
  rememberDisplayed(ids: string[]) {
    this.previous = new Set(ids);
  }
  private relevance(c: Candidate, focus: Focus | null) {
    if (!focus || c.occurrence !== focus.occurrence) return 0;
    if (focus.entity === c.entity) return 1;
    if (!focus.entity) return c.kind === "area" ? 0.05 : 0.5;
    if (focus.face) {
      if (c.kind === "area") return 0;
      const part = this.parts.get(c.occurrence);
      const a = focus.point || focus.face.center;
      const proximity =
        1 -
        clamp(
          distance(c.anchor, a) /
            Math.max(1, Math.hypot(...(part?.bounds.size || [1]))),
        );
      if (c.onFaces?.includes(focus.face.id)) return 0.72 + 0.16 * proximity;
      if (c.kind === "extent") return 0.61 + 0.12 * proximity;
      return 0.2 + 0.18 * proximity;
    }
    return c.kind === "extent" ? 0.24 : 0.12;
  }
  rank(candidates: Candidate[], context: ScoreContext) {
    const ranked: RankedCandidate[] = [];
    for (const candidate of candidates) {
      if (candidate.confidence < 1 || !Number.isFinite(candidate.value))
        continue;
      if (
        candidate.occurrence !== context.selected?.occurrence &&
        candidate.occurrence !== context.hovered?.occurrence &&
        !context.selectedItems?.some(
          (f) => f.occurrence === candidate.occurrence,
        ) &&
        !context.hoveredItems?.some(
          (f) => f.occurrence === candidate.occurrence,
        )
      )
        continue;
      const a = context.project(candidate.occurrence, candidate.a),
        b = context.project(candidate.occurrence, candidate.b),
        p = context.project(candidate.occurrence, candidate.anchor);
      if (!a.visible && !b.visible && !p.visible) continue;
      if (
        !["area", "curve"].includes(candidate.kind) &&
        Math.hypot(a.x - b.x, a.y - b.y) < 9
      )
        continue;
      // Unrelated face areas never compete with lengths; area of the focused face can.
      if (
        candidate.kind === "area" &&
        ![context.selected?.entity, context.hovered?.entity].includes(
          candidate.entity,
        )
      )
        continue;
      const signals: Record<string, number> = {};
      for (const [name, signal] of this.signals)
        signals[name] = signal.weight * signal.score(candidate, context);
      ranked.push({
        candidate,
        signals,
        score: Object.values(signals).reduce((a, b) => a + b, 0),
      });
    }
    ranked.sort(
      (a, b) =>
        b.score - a.score || a.candidate.id.localeCompare(b.candidate.id),
    );
    // Visibility is comparatively expensive. Evaluate a bounded shortlist after cheap ranking.
    const shortlist = ranked.slice(0, 64);
    for (const item of shortlist) {
      const visible = context.visibility?.(item.candidate) ?? 1;
      item.signals.visibility = -(1 - visible) * 48;
      item.score += item.signals.visibility;
      if (visible <= 0) item.score = -Infinity;
    }
    shortlist.sort(
      (a, b) =>
        b.score - a.score || a.candidate.id.localeCompare(b.candidate.id),
    );
    this.diagnostics = shortlist;
    return shortlist;
  }

  place(
    ranked: RankedCandidate[],
    context: ScoreContext,
    maxCount = context.width < 560 || !context.selected ? 2 : 3,
  ): Placement[] {
    const placed: Placement[] = [];
    const groups = new Set<string>();
    const partsCenter = new Map<string, Vec2>();
    for (const [id, part] of this.parts) {
      const p = context.project(id, center(part.bounds.min, part.bounds.max));
      partsCenter.set(id, [p.x, p.y]);
    }
    for (const item of ranked) {
      const c = item.candidate;
      if (placed.length >= maxCount) break;
      if (item.score < 25 || groups.has(c.group)) continue;
      const a = context.project(c.occurrence, c.a),
        b = context.project(c.occurrence, c.b);
      const anchor = context.project(c.occurrence, c.anchor);
      const compact = c.kind === "area" || c.kind === "curve";
      const label = formatMeasurement(c, context.units);
      const width = label.length * 7.4 + 14,
        height = 24;
      const length = Math.hypot(b.x - a.x, b.y - a.y);
      let dx = (b.x - a.x) / (length || 1),
        dy = (b.y - a.y) / (length || 1);
      if (compact) {
        dx = 1;
        dy = 0;
      }
      let nx = -dy,
        ny = dx;
      const mx = compact ? anchor.x : (a.x + b.x) / 2,
        my = compact ? anchor.y : (a.y + b.y) / 2;
      const middle = partsCenter.get(c.occurrence) || [
        context.width / 2,
        context.height / 2,
      ];
      if (nx * (mx - middle[0]) + ny * (my - middle[1]) < 0) {
        nx = -nx;
        ny = -ny;
      }
      let best: Placement | null = null,
        bestCost = Infinity;
      for (const side of [1, -1])
        for (const offset of [20, 32, 48, 68, 90]) {
          for (const labelMode of ["center", "after", "before"]) {
            const ox = nx * offset * side,
              oy = ny * offset * side;
            const p: Vec2 = [a.x + ox, a.y + oy],
              q: Vec2 = [b.x + ox, b.y + oy];
            const small = length < width + 20;
            if ((!small || compact) && labelMode !== "center") continue;
            const labelPoint: Vec2 =
              labelMode === "after"
                ? [q[0] + dx * (width / 2 + 12), q[1] + dy * (width / 2 + 12)]
                : labelMode === "before"
                  ? [p[0] - dx * (width / 2 + 12), p[1] - dy * (width / 2 + 12)]
                  : [
                      mx + ox + (small ? nx * side * 15 : 0),
                      my + oy + (small ? ny * side * 15 : 0),
                    ];
            let angle = compact ? 0 : (Math.atan2(dy, dx) * 180) / Math.PI;
            if (angle > 90) angle -= 180;
            if (angle < -90) angle += 180;
            const rad = (angle * Math.PI) / 180;
            const rw =
              Math.abs(Math.cos(rad)) * width +
              Math.abs(Math.sin(rad)) * height;
            const rh =
              Math.abs(Math.sin(rad)) * width +
              Math.abs(Math.cos(rad)) * height;
            const rect = {
              x: labelPoint[0] - rw / 2,
              y: labelPoint[1] - rh / 2,
              width: rw,
              height: rh,
            };
            if (
              rect.x < 12 ||
              rect.y < 70 ||
              rect.x + rw > context.width - 12 ||
              rect.y + rh > context.height - 55
            )
              continue;
            const collisions = [
              ...context.reserved,
              ...placed.map((p) => p.rect),
            ].reduce((sum, r) => sum + overlap(rect, r), 0);
            // Prefer outward positions and shorter extensions, but use the other side when needed.
            const cost =
              collisions * 3 +
              offset * 0.08 +
              (side === -1 ? 7 : 0) +
              (labelMode === "center" ? 0 : 2) +
              (context.covered?.(rect) || 0) * 25;
            if (cost < bestCost) {
              bestCost = cost;
              best = {
                candidate: c,
                score: item.score,
                signals: item.signals,
                label,
                hint: c.qualifier,
                rect,
                angle,
                a: [a.x, a.y],
                b: [b.x, b.y],
                p,
                q,
                labelPoint,
                compact,
                hover:
                  context.hovered?.occurrence === c.occurrence &&
                  this.relevance(c, context.hovered) >
                    this.relevance(c, context.selected),
              };
            }
          }
        }
      // Never purchase one more dimension by covering another label or a control.
      if (!best || bestCost > 45) continue;
      placed.push(best);
      groups.add(c.group);
    }
    this.previous = new Set(placed.map((p) => p.candidate.id));
    return placed;
  }
}
