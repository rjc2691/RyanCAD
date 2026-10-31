import * as THREE from "three";

/** Extend reference rays beyond the screen, independently of finite grid size.
 * Orthographic projection is linear; measure each axis in projected space so
 * even a foreshortened ray reaches the edge. A truly end-on axis has no line.
 */
export function worldAxisScales(camera:THREE.OrthographicCamera,baseLength=500){
  const origin=new THREE.Vector3().project(camera);
  return [new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1)].map(direction=>{
    const projected=direction.project(camera).sub(origin);
    const span=Math.max(Math.abs(projected.x),Math.abs(projected.y));
    if(span<1e-10)return 0;
    return (Math.max(Math.abs(origin.x),Math.abs(origin.y))+3)/span/baseLength;
  });
}
