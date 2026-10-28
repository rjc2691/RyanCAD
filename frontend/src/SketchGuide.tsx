import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { sketchMeasurements } from "./sketchMeasurements";
import { sketchPlaneBounds } from "./sketchGrid";
import * as THREE from "three";
import {
  entityPoints,
  sketchAnchors,
  sketchBasis,
  type SketchDraft,
  type SketchPoint,
} from "./sketchModel";
export interface SketchGuideHandle {
  update: (camera: THREE.Camera, width: number, height: number) => void;
}
export interface SketchDimensionEditor {
  line: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
}
export default forwardRef<
  SketchGuideHandle,
  {
    draft?: SketchDraft | null;
    dimensionEditor?: SketchDimensionEditor | null;
    gridOnly?: boolean;
  }
>(function SketchGuide({ draft, dimensionEditor, gridOnly }, ref) {
  const root = useRef<SVGSVGElement>(null),
    latest = useRef(draft),
    editorRoot = useRef<HTMLDivElement>(null),
    editorInput = useRef<HTMLInputElement>(null),
    latestEditor = useRef(dimensionEditor);
  latestEditor.current = dimensionEditor;
  useEffect(() => {
    if (dimensionEditor?.line) {
      editorInput.current?.focus();
      editorInput.current?.select();
    }
  }, [dimensionEditor?.line]);
  const measurements = useMemo(
    () => (draft ? sketchMeasurements(draft) : []),
    [draft?.entities, draft?.constraints],
  );
  const latestMeasurements = useRef(measurements);
  latestMeasurements.current = measurements;
  latest.current = draft;
  useImperativeHandle(ref, () => ({
    update(camera, width, height) {
      const svg = root.current,
        d = latest.current;
      if (!svg || !d) return;
      const f = sketchBasis(d.frame);
      const bounds = sketchPlaneBounds(camera, d.frame);
      if (!bounds) return;
      const { minU, maxU, minV, maxV } = bounds,
        span = Math.max(maxU - minU, maxV - minV);
      const target = span / 30,
        power = 10 ** Math.floor(Math.log10(Math.max(target, 0.001))),
        ratio = target / power,
        step = (ratio < 2 ? 1 : ratio < 5 ? 2 : 5) * power;
      const project = (p: SketchPoint) => {
        const v = f.origin
          .clone()
          .addScaledVector(f.u, p[0])
          .addScaledVector(f.v, p[1])
          .project(camera);
        return [((v.x + 1) * width) / 2, ((1 - v.y) * height) / 2];
      };
      const editor = latestEditor.current;
      const targetLine =
        editor &&
        d.entities.find((e) => e.id === editor.line && e.type === "line");
      if (editorRoot.current && targetLine) {
        const [x1, y1] = project([targetLine.x1, targetLine.y1]);
        const [x2, y2] = project([targetLine.x2, targetLine.y2]);
        const length = Math.hypot(x2 - x1, y2 - y1) || 1;
        const x = Math.max(
          8,
          Math.min(width - 178, (x1 + x2) / 2 - ((y2 - y1) / length) * 28 - 85),
        );
        const y = Math.max(
          8,
          Math.min(height - 76, (y1 + y2) / 2 + ((x2 - x1) / length) * 28 - 17),
        );
        editorRoot.current.style.transform = `translate(${x}px, ${y}px)`;
      }
      const path = (ps: SketchPoint[]) =>
        ps
          .map((p, i) => {
            const [x, y] = project(p);
            return `${i ? "L" : "M"}${x},${y}`;
          })
          .join(" ");
      const set = (key: string, attr: string, value: string) =>
        svg.querySelector(`[data-sketch="${key}"]`)?.setAttribute(attr, value);
      svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
      let minor = "",
        major = "";
      if (Number.isFinite(span) && span > 0) {
        for (
          let i = Math.ceil(minU / step);
          i <= Math.floor(maxU / step) && i < Math.ceil(minU / step) + 200;
          i++
        ) {
          const s = path([
            [i * step, minV],
            [i * step, maxV],
          ]);
          if (i % 5 === 0) major += s;
          else minor += s;
        }
        for (
          let i = Math.ceil(minV / step);
          i <= Math.floor(maxV / step) && i < Math.ceil(minV / step) + 200;
          i++
        ) {
          const s = path([
            [minU, i * step],
            [maxU, i * step],
          ]);
          if (i % 5 === 0) major += s;
          else minor += s;
        }
      }
      set("grid", "d", minor);
      set("major", "d", major);
      set(
        "u",
        "d",
        path([
          [minU, 0],
          [maxU, 0],
        ]),
      );
      set(
        "v",
        "d",
        path([
          [0, minV],
          [0, maxV],
        ]),
      );
      set("u-label", "x", String(width - 24));
      set(
        "u-label",
        "y",
        String(Math.max(24, Math.min(height - 24, project([0, 0])[1] - 8))),
      );
      set(
        "v-label",
        "x",
        String(Math.max(24, Math.min(width - 24, project([0, 0])[0] + 10))),
      );
      set("v-label", "y", "24");
      for (const e of d.entities) {
        const ps = entityPoints(e);
        set(
          e.id,
          "d",
          e.type === "point"
            ? path([
                [e.x - 0.25, e.y],
                [e.x + 0.25, e.y],
              ]) +
                " " +
                path([
                  [e.x, e.y - 0.25],
                  [e.x, e.y + 0.25],
                ])
            : path(ps),
        );
      }
      for (const anchor of sketchAnchors(d)) {
        const [x, y] = project(anchor.point);
        set(anchor.id, "transform", `translate(${x} ${y})`);
      }
      for (const item of latestMeasurements.current) {
        const g = svg.querySelector<SVGGElement>(
          `[data-measurement="${item.id}"]`,
        );
        if (!g) continue;
        const [x1, y1] = project(item.start),
          [x2, y2] = project(item.end);
        const line = g.querySelector("path"),
          label = g.querySelector("text");
        if (!line || !label) continue;
        if (item.kind === "length") {
          const length = Math.hypot(x2 - x1, y2 - y1),
            nx = length ? -(y2 - y1) / length : 0,
            ny = length ? (x2 - x1) / length : 1;
          const offset = item.constrained ? 20 : 9,
            ax = x1 + nx * offset,
            ay = y1 + ny * offset,
            bx = x2 + nx * offset,
            by = y2 + ny * offset;
          g.setAttribute(
            "visibility",
            !item.constrained && length < 40 ? "hidden" : "visible",
          );
          line.setAttribute(
            "d",
            item.constrained
              ? `M${x1},${y1}L${ax},${ay}M${x2},${y2}L${bx},${by}M${ax},${ay}L${bx},${by}M${ax - ny * 3},${ay + nx * 3}L${ax + ny * 3},${ay - nx * 3}M${bx - ny * 3},${by + nx * 3}L${bx + ny * 3},${by - nx * 3}`
              : "",
          );
          label.setAttribute("x", String((ax + bx) / 2));
          label.setAttribute("y", String((ay + by) / 2 - 3));
        } else if (item.vertex) {
          const [cx, cy] = project(item.vertex),
            u = [x1 - cx, y1 - cy],
            v = [x2 - cx, y2 - cy],
            lu = Math.hypot(...u),
            lv = Math.hypot(...v);
          if (lu < 20 || lv < 20) {
            g.setAttribute(
              "visibility",
              item.constrained ? "visible" : "hidden",
            );
          } else g.setAttribute("visibility", "visible");
          const radius = Math.min(24, lu * 0.3, lv * 0.3),
            ux = u[0] / (lu || 1),
            uy = u[1] / (lu || 1),
            vx = v[0] / (lv || 1),
            vy = v[1] / (lv || 1);
          const cross = ux * vy - uy * vx,
            px = cx + radius * ux,
            py = cy + radius * uy,
            qx = cx + radius * vx,
            qy = cy + radius * vy;
          line.setAttribute(
            "d",
            `M${px},${py} A${radius},${radius} 0 0 ${cross > 0 ? 1 : 0} ${qx},${qy}`,
          );
          const bx = ux + vx,
            by = uy + vy,
            bl = Math.hypot(bx, by) || 1;
          label.setAttribute("x", String(cx + ((radius + 13) * bx) / bl));
          label.setAttribute("y", String(cy + ((radius + 13) * by) / bl));
        }
      }
      let preview: SketchPoint[] = [];
      const a = d.pending[0],
        p = d.cursor;
      if (a && p) {
        if (d.tool === "rectangle")
          preview = [a, [p[0], a[1]], p, [a[0], p[1]], a];
        else if (d.tool === "circle" || d.tool === "arc") {
          const r =
            d.tool === "arc" && d.pending[1]
              ? Math.hypot(d.pending[1][0] - a[0], d.pending[1][1] - a[1])
              : Math.hypot(p[0] - a[0], p[1] - a[1]);
          let start = 0,
            end = 360;
          if (d.tool === "arc" && d.pending[1]) {
            start =
              (Math.atan2(d.pending[1][1] - a[1], d.pending[1][0] - a[0]) *
                180) /
              Math.PI;
            end = (Math.atan2(p[1] - a[1], p[0] - a[0]) * 180) / Math.PI;
            while (end <= start) end += 360;
          }
          preview = entityPoints({
            id: "pending",
            type: "arc",
            construction: false,
            fixed: true,
            x: a[0],
            y: a[1],
            radius: r,
            start_angle: start,
            end_angle: end,
          });
        } else if (d.tool === "line") preview = [a, p];
      }
      set("preview", "d", path(preview));
      if (p) {
        const [x, y] = project(p);
        set("cursor", "transform", `translate(${x} ${y})`);
        set(
          "cursor",
          "visibility",
          d.tool === "project" ? "hidden" : "visible",
        );
      } else set("cursor", "visibility", "hidden");
      const label = svg.querySelector('[data-sketch="dimension"]');
      if (label) {
        let text = "",
          anchor: SketchPoint | undefined;
        if (a && p && d.tool !== "select" && d.tool !== "project") {
          anchor = p;
          const du = p[0] - a[0],
            dv = p[1] - a[1];
          text =
            d.tool === "rectangle"
              ? `${Math.abs(du).toFixed(2)} × ${Math.abs(dv).toFixed(2)} mm`
              : d.tool === "circle"
                ? `Ø ${(2 * Math.hypot(du, dv)).toFixed(2)} mm`
                : `${Math.hypot(du, dv).toFixed(2)} mm`;
        } else {
          const e = d.entities.find((e) => e.id === d.selected);
          if (e && e.type !== "line") {
            anchor = entityPoints(e)[0];
            text =
              e.type === "circle" || e.type === "arc"
                ? `R ${e.radius.toFixed(2)} mm`
                : `${e.x.toFixed(2)}, ${e.y.toFixed(2)} mm`;
          }
        }
        label.textContent = text;
        if (anchor) {
          const [x, y] = project(anchor);
          label.setAttribute(
            "x",
            String(Math.min(width - 150, Math.max(12, x + 14))),
          );
          label.setAttribute(
            "y",
            String(Math.min(height - 24, Math.max(24, y - 14))),
          );
        }
      }
      const scale = svg.querySelector('[data-sketch="scale"]');
      if (scale)
        scale.textContent = `Grid ${step.toLocaleString()} mm · coordinates in mm`;
    },
  }));
  if (!draft) return null;
  return (
    <>
      <svg
        ref={root}
        className={`sketch-viewport-guide${gridOnly ? " sketch-grid-preview" : ""}`}
        aria-label="Sketch geometry and coordinate grid"
      >
        <path data-sketch="grid" className="sketch-grid-minor" />
        <path data-sketch="major" className="sketch-grid-major" />
        {!gridOnly && (
          <>
            <path data-sketch="u" className="sketch-axis-u" />
            <path data-sketch="v" className="sketch-axis-v" />
            <text data-sketch="u-label" className="sketch-axis-label">
              U
            </text>
            <text data-sketch="v-label" className="sketch-axis-label">
              V
            </text>
          </>
        )}
        {!gridOnly && (
          <>
            {draft.entities.map((e) => (
              <path
                key={e.id}
                data-sketch={e.id}
                className={`sketch-entity ${e.construction ? "construction" : ""} ${e.id === draft.selected ? "selected" : ""}`}
              />
            ))}
            {sketchAnchors(draft).map((a) => (
              <g
                key={a.id}
                data-sketch={a.id}
                aria-label={`${a.entity} ${a.kind === "mid" ? "midpoint" : a.kind}`}
                className={`sketch-anchor ${a.kind} ${draft.selectedAnchor?.id === a.id ? "selected" : ""} ${draft.cursor && Math.hypot(draft.cursor[0] - a.point[0], draft.cursor[1] - a.point[1]) < 1e-6 ? "hovered" : ""}`}
              >
                {a.kind === "mid" ? (
                  <path d="M0 -4L4 0L0 4L-4 0Z" />
                ) : (
                  <circle r={a.kind === "center" ? 3 : 3.5} />
                )}
              </g>
            ))}
            {measurements.map((m) => (
              <g
                key={m.id}
                data-measurement={m.id}
                className={`sketch-measurement ${m.constrained ? "constrained" : "reference"}`}
                aria-label={`${m.constrained ? "Constrained dimension" : "Reference measurement"} ${m.label}`}
              >
                <path />
                <text textAnchor="middle">{m.label}</text>
              </g>
            ))}
            <path data-sketch="preview" className="sketch-rubberband" />
            <g data-sketch="cursor" className="sketch-cursor">
              <path d="M-8 0H8 M0-8V8" />
              <circle r="4" />
            </g>
            <text data-sketch="dimension" className="sketch-live-dimension" />
          </>
        )}
        {!gridOnly && (
          <text
            data-sketch="scale"
            x="24"
            y="80"
            className="sketch-grid-scale"
          />
        )}
      </svg>
      {dimensionEditor && (
        <div
          ref={editorRoot}
          className="sketch-dimension-inline"
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
        >
          <label>
            <span className="sketch-dimension-inline-label">Length</span>
            <input
              ref={editorInput}
              aria-label="Viewport dimension length"
              type="text"
              value={dimensionEditor.value}
              onChange={(e) => dimensionEditor.onChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  e.stopPropagation();
                  dimensionEditor.onConfirm();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  dimensionEditor.onCancel();
                }
              }}
            />
            <span className="sketch-dimension-inline-unit">mm</span>
          </label>
          {dimensionEditor.error && (
            <div role="status" className="sketch-dimension-inline-error">
              {dimensionEditor.error}
            </div>
          )}
        </div>
      )}
    </>
  );
});
