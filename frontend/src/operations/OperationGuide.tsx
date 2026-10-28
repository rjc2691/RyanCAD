import { forwardRef, useImperativeHandle, useRef } from "react";
import * as THREE from "three";
import {
  isFinish,
  type OperationDraft,
  type OperationFrame,
  type PickSlot,
} from "./operationModel";
export interface OperationGuideHandle {
  update: (camera: THREE.Camera, width: number, height: number) => void;
}
export default forwardRef<
  OperationGuideHandle,
  {
    frame?: OperationFrame;
    draft?: OperationDraft;
    pick?: PickSlot;
  }
>(function OperationGuide(props, ref) {
  const latest = useRef(props);
  latest.current = props;
  const svg = useRef<SVGSVGElement>(null);
  useImperativeHandle(
    ref,
    () => ({
      update(camera, width, height) {
        const { frame: f, draft: d, pick } = latest.current,
          root = svg.current;
        if (!root || !f || !d) return;
        const project = (v: THREE.Vector3) => {
          const p = v.clone().project(camera);
          return { x: ((p.x + 1) * width) / 2, y: ((1 - p.y) * height) / 2 };
        };
        const path = (points: THREE.Vector3[], closed = false) =>
          points
            .map((p, i) => {
              const s = project(p);
              return `${i ? "L" : "M"}${s.x},${s.y}`;
            })
            .join(" ") + (closed && points.length ? " Z" : "");
        root.setAttribute("viewBox", `0 0 ${width} ${height}`);
        const guide = (name: string) =>
          root.querySelector(`[data-guide="${name}"]`)!;
        const drawing = pick === "sketch" || pick === "place";
        const planePoints = [
          [-30, -30],
          [30, -30],
          [30, 30],
          [-30, 30],
        ].map(([u, v]) =>
          f.origin.clone().addScaledVector(f.u, u).addScaledVector(f.v, v),
        );
        guide("plane").setAttribute(
          "d",
          drawing ? path(planePoints, true) : "",
        );
        let grid = "";
        if (drawing)
          for (let i = -30; i <= 30; i += 5) {
            grid +=
              path([
                f.origin
                  .clone()
                  .addScaledVector(f.u, i)
                  .addScaledVector(f.v, -30),
                f.origin
                  .clone()
                  .addScaledVector(f.u, i)
                  .addScaledVector(f.v, 30),
              ]) + " ";
            grid +=
              path([
                f.origin
                  .clone()
                  .addScaledVector(f.v, i)
                  .addScaledVector(f.u, -30),
                f.origin
                  .clone()
                  .addScaledVector(f.v, i)
                  .addScaledVector(f.u, 30),
              ]) + " ";
          }
        guide("grid").setAttribute("d", grid);
        const loops = f.profileLoops || [f.outline];
        root.querySelectorAll("[data-profile-region]").forEach((el) => {
          const i = Number(el.getAttribute("data-profile-region"));
          const region = f.profileRegions?.[i] || (i === 0 ? [f.outline] : []);
          el.setAttribute(
            "d",
            d.profile === "body"
              ? ""
              : region
                  .map((loop) =>
                    path(loop, loop.length >= 3 && pick !== "sketch"),
                  )
                  .join(" "),
          );
        });
        const origin = project(f.origin);
        guide("origin").setAttribute(
          "transform",
          `translate(${origin.x} ${origin.y})`,
        );
        const showFrame =
          drawing ||
          ["offset_u", "offset_v", "offset_n"].some(
            (k) => parseFloat(d.values[k]) !== 0,
          );
        const axes = [f.u, f.v, f.normal].map((vector) => {
          const p = project(f.origin.clone().add(vector)),
            dx = p.x - origin.x,
            dy = p.y - origin.y,
            len = Math.hypot(dx, dy);
          return len > 0.01
            ? { x: origin.x + (dx / len) * 31, y: origin.y + (dy / len) * 31 }
            : origin;
        });
        guide("frame").setAttribute(
          "d",
          (showFrame ? axes : [])
            .slice(0, 2)
            .map((p) => `M${origin.x},${origin.y} L${p.x},${p.y}`)
            .join(" "),
        );
        root.querySelectorAll("[data-axis]").forEach((el, i) => {
          el.setAttribute("x", String(axes[i].x));
          el.setAttribute("y", String(axes[i].y));
          (el as SVGElement).style.display =
            !showFrame ||
            Math.hypot(axes[i].x - origin.x, axes[i].y - origin.y) < 18
              ? "none"
              : "";
        });
        const showPath = isFinish(d) || !["none", "mirror"].includes(d.motion);
        const referencePaths = f.referencePaths || [f.referencePath];
        const travelPaths =
          isFinish(d) && !f.finishPartial ? referencePaths : [f.travelPath];
        const reference = showPath
          ? referencePaths.map((points) => path(points)).join(" ")
          : "";
        guide("reference-halo").setAttribute("d", reference);
        guide("reference").setAttribute("d", reference);
        guide("travel-halo").setAttribute(
          "d",
          showPath ? travelPaths.map((points) => path(points)).join(" ") : "",
        );
        guide("travel").setAttribute(
          "d",
          showPath ? travelPaths.map((points) => path(points)).join(" ") : "",
        );
        guide("offset").setAttribute("d", showPath ? path(f.pathOffset) : "");
        const target = guide("target"),
          gap = guide("target-gap");
        target.setAttribute(
          "visibility",
          f.travelTarget ? "visible" : "hidden",
        );
        if (f.travelTarget) {
          const p = project(f.travelTarget);
          target.setAttribute("transform", `translate(${p.x} ${p.y})`);
        }
        gap.setAttribute(
          "d",
          f.travelTarget && f.projectedTarget
            ? path([f.projectedTarget, f.travelTarget])
            : "",
        );
        const profileLabel = guide("profile-label");
        const labelPoint = loops
          .flat()
          .map(project)
          .reduce<{ x: number; y: number; distance: number } | null>(
            (best, p) => {
              const distance = Math.hypot(p.x - origin.x, p.y - origin.y);
              return !best || distance > best.distance
                ? { ...p, distance }
                : best;
            },
            null,
          );
        if (
          labelPoint &&
          labelPoint.distance > 80 &&
          d.profile !== "body" &&
          true
        ) {
          profileLabel.setAttribute("x", String(labelPoint.x + 9));
          profileLabel.setAttribute("y", String(labelPoint.y - 12));
          profileLabel.textContent = isFinish(d)
            ? `${f.sectionEffect || "Corner"} section`
            : "Tool Profile";
        } else profileLabel.textContent = "";
      },
    }),
    [],
  );
  if (!props.frame || !props.draft) return null;
  const finish = isFinish(props.draft);
  return (
    <>
      <svg
        className={`operation-guide path-${props.frame.pathStyle}`}
        ref={svg}
        data-path-style={props.frame.pathStyle}
        aria-label="Tool Origin, Tool Profile plane, and Tool Path guide"
      >
        <defs>
          <marker
            id="operationArrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="4"
            markerHeight="4"
            orient="auto-start-reverse"
          >
            <path d="M0 0 10 5 0 10Z" className="guide-arrow" />
          </marker>
          <pattern
            id="operationProfileHatch"
            width="8"
            height="8"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(32)"
          >
            <path d="M0 0V8" className="guide-hatch" />
          </pattern>
        </defs>
        <path data-guide="plane" className="guide-plane" />
        <path data-guide="grid" className="guide-grid" />
        {Array.from(
          { length: Math.max(1, props.frame.profileRegions?.length || 0) },
          (_, i) => (
            <g key={i}>
              <path
                data-profile-region={i}
                className="guide-profile-fill"
                fillRule="evenodd"
              />
              <path
                data-profile-region={i}
                className="guide-profile"
                fillRule="evenodd"
              />
            </g>
          ),
        )}
        <path data-guide="frame" className="guide-frame" />
        <path data-guide="reference-halo" className="guide-reference-halo" />
        <path data-guide="reference" className="guide-reference" />
        <path data-guide="offset" className="guide-offset" />
        <path data-guide="target-gap" className="guide-target-gap" />
        <g data-guide="target" className="guide-target">
          <path d="M0 -7 L7 0 L0 7 L-7 0Z" />
          <text x="11" y="-9">
            Travel target
          </text>
        </g>
        <path data-guide="travel-halo" className="guide-reference-halo" />
        <path
          data-guide="travel"
          className="guide-travel"
          markerEnd="url(#operationArrow)"
          markerStart={
            props.draft.motion === "linear" && props.draft.extent !== "distance"
              ? "url(#operationArrow)"
              : undefined
          }
        />
        <g data-guide="origin" className="guide-origin">
          <circle r="10" />
          <path d="M-16 0H-6M6 0H16M0-16V-6M0 6V16" />
          <circle r="2.5" className="guide-origin-center" />
          <text x="17" y="-15">
            Origin
          </text>
        </g>
        <text data-axis="u">U</text>
        <text data-axis="v">V</text>
        <text data-axis="n">N</text>
        <text data-guide="profile-label" className="guide-profile-label" />
      </svg>
      <div className="operation-role-key" aria-label="Tool reference colors">
        <span data-role="origin">Origin</span>
        <span data-role="profile">
          Profile{props.draft.profile === "body" ? " · body" : ""}
        </span>
        <span data-role="path">Path</span>
      </div>
      {(finish || !["none", "mirror"].includes(props.draft.motion)) && (
        <div
          className={`operation-path-legend path-${props.frame.pathStyle}`}
          role="note"
          aria-label="Tool Path reference"
        >
          <span className="path-sample" />
          <span>{props.frame.pathLabel}</span>
        </div>
      )}
    </>
  );
});
