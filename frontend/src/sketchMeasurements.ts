import type { SketchDraft, SketchEntity, SketchPoint } from "./sketchModel";
export type SketchAnnotation = {
  id: string;
  kind: "length" | "angle";
  constrained: boolean;
  label: string;
  start: SketchPoint;
  end: SketchPoint;
  vertex?: SketchPoint;
  parameterName?: string;
};
const fmt = (n: number) =>
  Number(n.toFixed(2)).toLocaleString(undefined, { maximumFractionDigits: 2 });
const end = (e: SketchEntity, n: 1 | 2): SketchPoint => [
  e[`x${n}`],
  e[`y${n}`],
];
const dist = (a: SketchPoint, b: SketchPoint) =>
  Math.hypot(a[0] - b[0], a[1] - b[1]);
const text = (c: any, measured: number, unit: string) => {
  const value =
    typeof c?.value === "number" && Number.isFinite(c.value)
      ? fmt(c.value)
      : typeof c?.value === "string" && c.value.trim()
        ? c.value.trim()
        : fmt(measured);
  return `${c?.parameterName ? "p: " : ""}${value} ${unit}`;
};
export function sketchMeasurements(
  d: Pick<SketchDraft, "entities" | "constraints">,
): SketchAnnotation[] {
  const lines = d.entities.filter(
    (e) => e.type === "line" && dist(end(e, 1), end(e, 2)) > 1e-8,
  );
  const out: SketchAnnotation[] = [];
  for (const e of lines) {
    const a = end(e, 1),
      b = end(e, 2),
      length = dist(a, b);
    const c = d.constraints.find(
      (c) =>
        c.type === "distance" &&
        ((c.a === `${e.id}.start` && c.b === `${e.id}.end`) ||
          (c.b === `${e.id}.start` && c.a === `${e.id}.end`)),
    );
    out.push({
      id: `length:${e.id}`,
      kind: "length",
      constrained: !!c,
      parameterName: c?.parameterName,
      label: text(c, length, "mm"),
      start: a,
      end: b,
    });
  }
  for (let i = 0; i < lines.length; i++)
    for (let j = i + 1; j < lines.length; j++) {
      const a = lines[i],
        b = lines[j];
      const c = d.constraints.find(
        (c) =>
          c.type === "angle" &&
          ((c.a === a.id && c.b === b.id) || (c.a === b.id && c.b === a.id)),
      );
      const pairs = ([1, 2] as const)
        .flatMap((x) =>
          ([1, 2] as const).map((y) => ({
            x,
            y,
            d: dist(end(a, x), end(b, y)),
          })),
        )
        .sort((x, y) => x.d - y.d);
      if (pairs[0].d > 1e-5 && !c) continue;
      const p = pairs[0],
        vertex = end(a, p.x),
        u = end(a, p.x === 1 ? 2 : 1),
        v = end(b, p.y === 1 ? 2 : 1);
      const ux = u[0] - vertex[0],
        uy = u[1] - vertex[1],
        vx = v[0] - vertex[0],
        vy = v[1] - vertex[1];
      const angle =
        (Math.acos(
          Math.max(
            -1,
            Math.min(
              1,
              (ux * vx + uy * vy) / (Math.hypot(ux, uy) * Math.hypot(vx, vy)),
            ),
          ),
        ) *
          180) /
        Math.PI;
      if (!Number.isFinite(angle) || (!c && (angle < 1 || angle > 179)))
        continue;
      out.push({
        id: `angle:${a.id}:${b.id}`,
        kind: "angle",
        constrained: !!c,
        parameterName: c?.parameterName,
        label: text(c, angle, "°"),
        start: u,
        end: v,
        vertex,
      });
    }
  return out;
}
