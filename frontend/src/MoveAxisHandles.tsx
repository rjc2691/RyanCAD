import {placeMoveDistance,type ScreenRect} from "./moveLabelPlacement";
import {forwardRef,useImperativeHandle,useRef} from "react";
import * as THREE from "three";
import type {Geometry,Occurrence,Selection} from "./types";
import type {MovementGuideData,WorldAxis} from "./movementModel";

export interface MoveAxisHandlesHandle{update:(camera:THREE.Camera,width:number,height:number)=>void}
export function axisDragDistance(dx:number,dy:number,projected:number[],initial=0){
  const squared=projected[0]**2+projected[1]**2;
  return squared<.0025?initial:initial+(dx*projected[0]+dy*projected[1])/squared;
}
export default forwardRef<MoveAxisHandlesHandle,{
  target?:Selection|null;rows:Occurrence[];geometry:Record<string,Geometry>;
  onDistance?:(value:string)=>void;
  guide?:MovementGuideData|null;onSlide?:(axis:WorldAxis,distance:number)=>void;
}>(function MoveAxisHandles(props,ref){
  const root=useRef<SVGSVGElement>(null),latest=useRef(props);latest.current=props;
  const previousLabel=useRef<ScreenRect|undefined>(undefined);
  const projections=useRef<Record<string,number[]>>({});
  const drag=useRef<{axis:WorldAxis;pointer:number;x:number;y:number;vector:number[];initial:number}|null>(null);
  useImperativeHandle(ref,()=>({update(camera,width,height){
    const p=latest.current,svg=root.current;
    if(!svg||!p.target||!p.guide?.slideAvailable)return;
    const box=new THREE.Box3();
    for(const row of p.rows){
      if(row.id!==p.target.occurrence&&!row.id.startsWith(p.target.occurrence+"/"))continue;
      const bounds=p.geometry[row.definition]?.bounds;if(!bounds)continue;
      const matrix=new THREE.Matrix4().set(...row.matrix.flat() as Parameters<THREE.Matrix4['set']>);
      box.union(new THREE.Box3(new THREE.Vector3(...bounds.min),new THREE.Vector3(...bounds.max)).applyMatrix4(matrix));
    }
    svg.setAttribute("viewBox",`0 0 ${width} ${height}`);
    if(box.isEmpty()){svg.style.visibility="hidden";return;}svg.style.visibility="visible";
    const center=box.getCenter(new THREE.Vector3()),half=box.getSize(new THREE.Vector3()).multiplyScalar(.5);
    if(p.guide.origin&&p.guide.destination)center.add(new THREE.Vector3(...p.guide.destination).sub(new THREE.Vector3(...p.guide.origin)));
    const project=(v:THREE.Vector3)=>{v=v.clone().project(camera);return new THREE.Vector2((v.x+1)*width/2,(1-v.y)*height/2);};
    const input=svg.querySelector('[data-distance-input]')!;
    const origin=p.guide.origin?new THREE.Vector3(...p.guide.origin):box.getCenter(new THREE.Vector3());
    const destination=p.guide.destination?new THREE.Vector3(...p.guide.destination):center;
    const midpoint=project(origin.clone().add(destination).multiplyScalar(.5));
    const obstacles:ScreenRect[]=[];
    const screenBox=(world:THREE.Box3)=>{
      const points=[];for(const x of [world.min.x,world.max.x])for(const y of [world.min.y,world.max.y])for(const z of [world.min.z,world.max.z])points.push(project(new THREE.Vector3(x,y,z)));
      const xs=points.map(v=>v.x),ys=points.map(v=>v.y),x=Math.min(...xs),y=Math.min(...ys);
      obstacles.push({x:x-6,y:y-6,width:Math.max(...xs)-x+12,height:Math.max(...ys)-y+12});
    };
    for(const row of p.rows){
      if(!row.visible||row.suppressed)continue;
      const bounds=p.geometry[row.definition]?.bounds;if(!bounds)continue;
      const world=new THREE.Box3(new THREE.Vector3(...bounds.min),new THREE.Vector3(...bounds.max)).applyMatrix4(new THREE.Matrix4().set(...row.matrix.flat() as Parameters<THREE.Matrix4['set']>));
      screenBox(world);
      if(row.id===p.target.occurrence||row.id.startsWith(p.target.occurrence+"/")){
        const delta=p.guide.liveDelta||(p.guide.origin&&p.guide.destination?p.guide.destination.map((v,i)=>v-p.guide!.origin![i]):null);
        if(delta)screenBox(world.clone().translate(new THREE.Vector3(...delta)));
      }
    }
    if(!svg.contains(document.activeElement)){
      const placed=placeMoveDistance(midpoint,obstacles,width,height,previousLabel.current);previousLabel.current=placed;
      input.setAttribute('x',String(placed.x));input.setAttribute('y',String(placed.y));
    }
    for(const [index,axis] of ['X','Y','Z'].entries()){
      const el=svg.querySelector<SVGGElement>(`[data-slide-axis="${axis}"]`)!;
      const unit=new THREE.Vector3().setComponent(index,1),c=project(center),q=project(center.clone().add(unit)),vector=q.sub(c),scale=vector.length();
      projections.current[axis]=[vector.x,vector.y];
      el.style.visibility=scale<.05?'hidden':'visible';if(scale<.05)continue;
      const start=project(center.clone().addScaledVector(unit,half.getComponent(index))).addScaledVector(vector,14/scale);
      const end=start.clone().addScaledVector(vector,64/scale),direction=vector.clone().normalize(),side=new THREE.Vector2(-direction.y,direction.x);
      const a=end.clone().addScaledVector(direction,-10).addScaledVector(side,5),b=end.clone().addScaledVector(direction,-10).addScaledVector(side,-5);
      el.querySelector('[data-shaft]')!.setAttribute('d',`M${start.x},${start.y} L${end.x},${end.y}`);
      el.querySelector('[data-hit]')!.setAttribute('d',`M${start.x},${start.y} L${end.x},${end.y}`);
      el.querySelector('[data-head]')!.setAttribute('d',`M${a.x},${a.y} L${end.x},${end.y} L${b.x},${b.y} Z`);
      const label=end.clone().addScaledVector(direction,12);el.querySelector('text')!.setAttribute('x',String(label.x));el.querySelector('text')!.setAttribute('y',String(label.y));
    }
  }}),[]);
  return <svg ref={root} className="move-axis-handles" aria-label="Slide along world axes" style={{display:props.target&&props.guide?.slideAvailable?undefined:'none'}}>
    <foreignObject data-distance-input width="154" height="48"><div className="move-distance-input" onPointerDown={e=>e.stopPropagation()}>
      <label>Distance (mm)<input aria-label="Viewport movement distance" value={props.guide?.distanceValue||""} onChange={e=>props.onDistance?.(e.target.value)} placeholder="0" inputMode="decimal"/></label>
    </div></foreignObject>
    {(['X','Y','Z'] as WorldAxis[]).map(axis=><g key={axis} data-slide-axis={axis} aria-label={`Drag along world ${axis}`} onPointerDown={e=>{
      if(e.button!==0)return;e.preventDefault();e.stopPropagation();
      const vector=projections.current[axis];if(!vector)return;
      drag.current={axis,pointer:e.pointerId,x:e.clientX,y:e.clientY,vector:[...vector],initial:latest.current.guide?.worldAxis===axis?(latest.current.guide.slideDistance||0):0};
      e.currentTarget.setPointerCapture(e.pointerId);
    }} onPointerMove={e=>{
      const d=drag.current;if(!d||d.pointer!==e.pointerId)return;e.stopPropagation();
      const distance=axisDragDistance(e.clientX-d.x,e.clientY-d.y,d.vector,d.initial);
      latest.current.onSlide?.(d.axis,Math.round(distance*100)/100);
    }} onPointerUp={e=>{if(drag.current?.pointer!==e.pointerId)return;e.stopPropagation();drag.current=null;e.currentTarget.releasePointerCapture(e.pointerId);}}
    onPointerCancel={e=>{const d=drag.current;if(d?.pointer===e.pointerId){latest.current.onSlide?.(d.axis,d.initial);drag.current=null;}}}
    onLostPointerCapture={()=>{drag.current=null;}}>
      <path data-hit stroke="transparent" strokeWidth="22" fill="none"/>
      <path data-shaft/><path data-head/><text textAnchor="middle" dominantBaseline="central">{axis}</text>
    </g>)}
  </svg>;
});
