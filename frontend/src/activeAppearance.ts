import * as THREE from "three";
import type { ActiveAppearance } from "./experiments.ts";

/** Preserve standard lighting, clipping and geometry; add only emissive shading.
 * One shader is shared across modes. Live controls change uniforms, not meshes. */
export function applyActiveAppearance(
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>,
  active: boolean,
  settings?: ActiveAppearance,
) {
  const material = mesh.material;
  let uniforms = material.userData.activeAppearance;
  if (!uniforms && !(active && settings?.enabled)) return;
  if (!uniforms) {
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox;
    uniforms = {
      cadActiveMode: { value: 0 },
      cadActiveStrength: { value: 0 },
      cadActiveTint: { value: new THREE.Color() },
      cadActiveMinZ: { value: box?.min.z || 0 },
      cadActiveSpanZ: {
        value: Math.max(1e-6, (box?.max.z || 0) - (box?.min.z || 0)),
      },
    };
    material.userData.activeAppearance = uniforms;
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader =
        "varying float vCadActiveHeight;\n" + shader.vertexShader;
      shader.vertexShader = shader.vertexShader.replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvCadActiveHeight = position.z;",
      );
      shader.fragmentShader =
        `varying float vCadActiveHeight;\nuniform float cadActiveMode;\nuniform float cadActiveStrength;\nuniform vec3 cadActiveTint;\nuniform float cadActiveMinZ;\nuniform float cadActiveSpanZ;\n` +
        shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
    if (cadActiveMode > 0.5) {
      float cadRim = pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))),0.0,1.0),2.2);
      float cadFactor = 0.18 + cadRim * 0.42;
      if(cadActiveMode > 1.5 && cadActiveMode < 2.5) cadFactor = 0.025 + cadRim * 0.9;
      if(cadActiveMode > 2.5) cadFactor = 0.06 + smoothstep(0.0,1.0,clamp((vCadActiveHeight-cadActiveMinZ)/cadActiveSpanZ,0.0,1.0))*0.58;
      totalEmissiveRadiance += cadActiveTint * cadActiveStrength * cadFactor;
    }`,
      );
    };
    material.customProgramCacheKey = () => "ryancad-active-appearance-v1";
    material.needsUpdate = true;
  }
  uniforms.cadActiveMode.value =
    active && settings?.enabled
      ? { "soft-glow": 1, "rim-glow": 2, "height-gradient": 3 }[settings.style]
      : 0;
  uniforms.cadActiveStrength.value = settings?.strength || 0;
  uniforms.cadActiveTint.value.set(settings?.tint || "#f3b879");
  if (active && settings?.enabled) material.emissiveIntensity = 0;
}
