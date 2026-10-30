import * as THREE from "three";

/** Fade only the grid, not axes, geometry, snapping or reference targets. */
export function gridAngleOpacity(camera: THREE.Camera, normal: THREE.Vector3) {
  const incidence = Math.abs(camera.getWorldDirection(new THREE.Vector3()).dot(normal));
  // Smooth transition from an almost edge-on view to the ordinary grid strength.
  return THREE.MathUtils.smoothstep(incidence, 0.05, 0.42);
}

export function createFadingGrid(size = 1000, divisions = 100) {
  const grid = new THREE.GridHelper(size, divisions, "#4a5869", "#303a49");
  grid.rotation.x = Math.PI / 2;
  grid.position.z = -0.12;
  const material = grid.material as THREE.LineBasicMaterial;
  material.transparent = true;
  material.depthWrite = false;
  material.opacity = 0.23;
  // Fragment-level fading hides the finite perimeter, including on long lines
  // with no intermediate vertices. Vertex opacity would leave those lines flat.
  material.onBeforeCompile = (shader) => {
    shader.uniforms.ryanGridHalfSize = { value: size / 2 };
    shader.vertexShader = `varying vec2 vRyanGridPosition;\n${shader.vertexShader}`
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvRyanGridPosition = position.xz;");
    shader.fragmentShader = `varying vec2 vRyanGridPosition;\nuniform float ryanGridHalfSize;\n${shader.fragmentShader}`
      .replace("#include <color_fragment>", `#include <color_fragment>
        float gridBoundary = max(abs(vRyanGridPosition.x), abs(vRyanGridPosition.y)) / ryanGridHalfSize;
        diffuseColor.a *= 1.0 - smoothstep(0.65, 1.0, gridBoundary);`);
  };
  material.customProgramCacheKey = () => "ryancad-grid-boundary-fade-v1";
  const normal = new THREE.Vector3(0, 0, 1);
  return { grid, update: (camera: THREE.Camera) => {
    material.opacity = 0.23 * gridAngleOpacity(camera, normal);
  } };
}
