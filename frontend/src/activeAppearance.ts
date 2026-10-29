import * as THREE from "three";
import { LineSegments2 } from "three/addons/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/addons/lines/LineSegmentsGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import type { ActiveAppearance } from "./experiments.ts";

const pulseTime = { value: 0 };
export function updateEdgePulseTime(seconds: number) {
  pulseTime.value = seconds % 3600;
}
/** Normalized arclength per native edge, not per tessellated segment. */
export function edgePulseProgress(
  positions: ArrayLike<number>,
  edges: { segment_start: number; segment_count: number }[] = [],
) {
  const count = Math.floor(positions.length / 6),
    start = new Float32Array(count),
    end = new Float32Array(count),
    covered = new Uint8Array(count);
  const ranges = edges.length
    ? edges
    : [{ segment_start: 0, segment_count: count }];
  for (const edge of ranges) {
    const first = Math.max(0, Math.floor(edge.segment_start)),
      last = Math.min(
        count,
        first + Math.max(0, Math.floor(edge.segment_count)),
      );
    let total = 0;
    const lengths: number[] = [];
    for (let i = first; i < last; i++) {
      const j = i * 6,
        length = Math.hypot(
          positions[j + 3] - positions[j],
          positions[j + 4] - positions[j + 1],
          positions[j + 5] - positions[j + 2],
        );
      lengths.push(length);
      total += length;
    }
    let distance = 0;
    for (let i = first; i < last; i++) {
      start[i] = total ? distance / total : 0;
      distance += lengths[i - first];
      end[i] = total ? distance / total : 0;
      covered[i] = 1;
    }
  }
  for (let i = 0; i < count; i++)
    if (!covered[i]) {
      start[i] = 0;
      end[i] = 1;
    }
  return { start, end };
}
function pulseStroke(
  positions: ArrayLike<number>,
  progress: ReturnType<typeof edgePulseProgress>,
  halo: boolean,
) {
  const geometry = new LineSegmentsGeometry();
  geometry.setPositions(Array.from(positions));
  geometry.setAttribute(
    "cadPulseStart",
    new THREE.InstancedBufferAttribute(progress.start.slice(), 1),
  );
  geometry.setAttribute(
    "cadPulseEnd",
    new THREE.InstancedBufferAttribute(progress.end.slice(), 1),
  );
  const material = new LineMaterial({
    color: "#79bfff",
    linewidth: halo ? 8 : 2.1,
    transparent: true,
    depthWrite: false,
    depthTest: true,
  });
  material.toneMapped = false;
  const uniforms = {
    cadPulseTime: pulseTime,
    cadPulseSpeed: { value: 0.16 },
    cadPulseCount: { value: 3 },
    cadPulseStrength: { value: 0.8 },
  };
  Object.assign(material.uniforms, uniforms);
  material.vertexShader =
    "attribute float cadPulseStart; attribute float cadPulseEnd; varying float vCadPulse;\n" +
    material.vertexShader;
  material.vertexShader = material.vertexShader.replace(
    "void main() {",
    "void main() {\n vCadPulse = position.y < 0.5 ? cadPulseStart : cadPulseEnd;",
  );
  material.vertexShader = material.vertexShader.replace(
    "#include <clipping_planes_vertex>",
    "#include <clipping_planes_vertex>\n gl_Position.z -= 0.00001 * gl_Position.w;",
  );
  material.fragmentShader =
    "uniform float cadPulseTime; uniform float cadPulseSpeed; uniform float cadPulseCount; uniform float cadPulseStrength; varying float vCadPulse;\n" +
    material.fragmentShader;
  material.fragmentShader = material.fragmentShader.replace(
    "gl_FragColor = vec4( diffuseColor.rgb, alpha );",
    `
 float cadPhase=fract((vCadPulse-cadPulseTime*cadPulseSpeed)*cadPulseCount);
 float cadHead=exp(-pow((cadPhase-0.82)/0.055,2.0));
 float cadTail=pow(clamp(cadPhase/0.80,0.0,1.0),3.0)*(1.0-smoothstep(0.80,0.94,cadPhase));
 float cadSignal=clamp((cadHead+cadTail*0.65)*cadPulseStrength,0.0,1.0);
 ${halo ? "alpha *= cadSignal * pow(clamp(1.0-abs(vUv.x),0.0,1.0),2.0) * 0.5;" : "alpha *= 0.10 + cadSignal * 0.9;"}
 if(alpha < 0.003) discard;
 gl_FragColor=vec4(${halo ? "diffuseColor.rgb" : "mix(diffuseColor.rgb, vec3(0.96,0.99,1.0),cadHead*0.65)"}, alpha);
 `,
  );
  const line = new LineSegments2(geometry, material);
  line.userData.overlay = true;
  line.userData.edgePulse = true;
  line.renderOrder = halo ? 2 : 3;
  line.raycast = () => {};
  return line;
}
/** Own overlay buffers; keep the source geometry, material and picking untouched. */
export function syncActiveEdgePulse(
  group: THREE.Object3D,
  edges: THREE.BufferGeometry | undefined,
  ranges: any[] | undefined,
  active: boolean,
  settings?: ActiveAppearance,
  clip: THREE.Plane[] = [],
) {
  let pulse = group.userData.edgePulseLayer as THREE.Group | undefined;
  if (
    !pulse &&
    active &&
    settings?.enabled &&
    edges?.getAttribute("position")?.count
  ) {
    const positions = edges.getAttribute("position").array,
      progress = edgePulseProgress(positions, ranges);
    pulse = new THREE.Group();
    pulse.name = "Active component edge pulses";
    pulse.userData.edgePulse = true;
    pulse.add(
      pulseStroke(positions, progress, true),
      pulseStroke(positions, progress, false),
    );
    group.add(pulse);
    group.userData.edgePulseLayer = pulse;
  }
  if (!pulse) return;
  pulse.visible = active && !!settings?.enabled;
  if (!pulse.visible) return;
  for (const child of pulse.children) {
    const material = (child as LineSegments2).material as LineMaterial;
    material.color.set(settings!.tint);
    material.uniforms.cadPulseSpeed.value = settings!.speed;
    material.uniforms.cadPulseCount.value = settings!.pulses;
    material.uniforms.cadPulseStrength.value = settings!.strength;
    if (material.clippingPlanes?.length !== clip.length) {
      material.needsUpdate = true;
    }
    material.clippingPlanes = clip;
  }
}
