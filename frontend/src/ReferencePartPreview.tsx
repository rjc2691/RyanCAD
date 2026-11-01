import {useEffect,useRef,useState} from 'react';
import {Maximize,Orbit,Hand} from 'lucide-react';
import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {api} from './api';
export type ReferencePreviewSource={workspace:string;design:string;part:string;name:string};
export default function ReferencePartPreview({source,endpoint="/reference-parts/preview",emptyPrompt="Select a part to preview."}:{source:ReferencePreviewSource|null;endpoint?:string;emptyPrompt?:string}){
 const host=useRef<HTMLDivElement>(null),viewer=useRef<{controls:OrbitControls;fit:()=>void}|null>(null);
 const [report,setReport]=useState<any>(null),[error,setError]=useState(''),[mode,setMode]=useState<'orbit'|'pan'>('orbit');
 const modeRef=useRef(mode);modeRef.current=mode;
 const cache=useRef(new Map<string,any>()),signature=source?JSON.stringify([endpoint,source.workspace,source.design,source.part]):'';
 useEffect(()=>{
  setReport(null);setError('');if(!source)return;
  const controller=new AbortController();let live=true;
  const saved=cache.current.get(signature);if(saved){setReport(saved);return;}
  const timer=setTimeout(()=>{void api(endpoint,{method:'POST',body:JSON.stringify(source),signal:controller.signal}).then(data=>{
   if(!live)return;cache.current.set(signature,data);if(cache.current.size>8)cache.current.delete(cache.current.keys().next().value!);setReport(data);
  }).catch(e=>{if(live&&e.name!=='AbortError')setError(e.message);});},150);
  return()=>{live=false;clearTimeout(timer);controller.abort();};
 },[signature]);
 useEffect(()=>{
  const element=host.current;if(!element||!report||!report.placements?.length)return;
  const scene=new THREE.Scene(),model=new THREE.Group(),resources=new Set<THREE.BufferGeometry>();
  const material=new THREE.MeshStandardMaterial({color:'#9ab6c7',roughness:.58,metalness:.16,side:THREE.DoubleSide}),edgeMaterial=new THREE.LineBasicMaterial({color:'#344b5d'});
  let renderer:THREE.WebGLRenderer|undefined,controls:OrbitControls|undefined,resize:ResizeObserver|undefined;
  try{
   const meshes=new Map<string,{body:THREE.BufferGeometry;edges:THREE.BufferGeometry}>();
   for(const [id,encoded] of Object.entries(report.meshes)){
    const bytes=Uint8Array.from(atob(encoded as string),c=>c.charCodeAt(0)),buffer=bytes.buffer,header=new DataView(buffer),vertices=header.getUint32(8,true),indices=header.getUint32(12,true),lines=header.getUint32(16,true);
    const body=new THREE.BufferGeometry(),edges=new THREE.BufferGeometry();let offset=20;
    body.setAttribute('position',new THREE.BufferAttribute(new Float32Array(buffer,offset,vertices*3),3));offset+=vertices*12;
    body.setIndex(new THREE.BufferAttribute(new Uint32Array(buffer,offset,indices),1));offset+=indices*4;body.computeVertexNormals();
    edges.setAttribute('position',new THREE.BufferAttribute(new Float32Array(buffer,offset,lines*3),3));meshes.set(id,{body,edges});resources.add(body);resources.add(edges);
   }
   for(const placement of report.placements){const geometry=meshes.get(placement.definition);if(!geometry)continue;const item=new THREE.Group();item.add(new THREE.Mesh(geometry.body,material),new THREE.LineSegments(geometry.edges,edgeMaterial));item.applyMatrix4(new THREE.Matrix4().fromArray(placement.matrix.flat()).transpose());model.add(item);}
   const bounds=new THREE.Box3().setFromObject(model);if(bounds.isEmpty())throw Error('This part has no geometry to preview.');
   const center=bounds.getCenter(new THREE.Vector3()),radius=Math.max(bounds.getBoundingSphere(new THREE.Sphere()).radius,.01);model.position.sub(center);scene.add(model);
   scene.add(new THREE.HemisphereLight('#e2efff','#344150',2));const light=new THREE.DirectionalLight('#ffffff',2.5);light.position.set(2,-3,5);scene.add(light);
   const camera=new THREE.PerspectiveCamera(40,1,radius*.001,radius*50);camera.up.set(0,0,1);
   renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor('#141e29',1);renderer.domElement.setAttribute('aria-label','Part preview canvas');element.appendChild(renderer.domElement);
   controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=false;controls.minDistance=radius*1.25;controls.maxDistance=radius*10;controls.maxTargetRadius=radius*.65;controls.panSpeed=.65;controls.zoomSpeed=.8;controls.mouseButtons.LEFT=modeRef.current==='pan'?THREE.MOUSE.PAN:THREE.MOUSE.ROTATE;controls.mouseButtons.RIGHT=THREE.MOUSE.PAN;controls.touches.ONE=modeRef.current==='pan'?THREE.TOUCH.PAN:THREE.TOUCH.ROTATE;
   const render=()=>{renderer?.render(scene,camera);element.dataset.ready='true';element.dataset.distance=String(camera.position.distanceTo(controls!.target)/radius);element.dataset.pan=String(controls!.target.length()/radius);};
   const fit=()=>{controls!.target.set(0,0,0);const angle=THREE.MathUtils.degToRad(camera.fov/2),distance=radius/Math.sin(Math.atan(Math.tan(angle)*Math.min(camera.aspect,1)))*1.15;camera.position.copy(new THREE.Vector3(1.4,-1.9,1.35).normalize().multiplyScalar(Math.min(distance,radius*10)));controls!.update();render();};
   controls.addEventListener('change',render);viewer.current={controls,fit};
   resize=new ResizeObserver(()=>{const width=element.clientWidth,height=element.clientHeight;if(!width||!height)return;camera.aspect=width/height;camera.updateProjectionMatrix();renderer!.setSize(width,height);render();});resize.observe(element);
   camera.aspect=Math.max(element.clientWidth,1)/Math.max(element.clientHeight,1);camera.updateProjectionMatrix();renderer.setSize(element.clientWidth,element.clientHeight);fit();
  }catch(e:any){setError(e.message||'The 3D preview is unavailable.');}
  return()=>{viewer.current=null;resize?.disconnect();controls?.dispose();renderer?.dispose();renderer?.domElement.remove();for(const resource of resources)resource.dispose();material.dispose();edgeMaterial.dispose();delete element.dataset.ready;};
 },[report]);
 const empty=!source||!!(report&&!report.placements?.length);
 return <section className="reference-part-preview" data-empty={empty||undefined} aria-label="Part preview">
 <header><ReferencePreviewTitle name={source?.name} layout={report?.layout_name}/>{!empty&&<div className="reference-preview-controls"><button type="button" className="icon-button" title="Orbit preview" aria-label="Orbit preview" aria-pressed={mode==='orbit'} onClick={()=>{setMode('orbit');if(viewer.current){viewer.current.controls.mouseButtons.LEFT=THREE.MOUSE.ROTATE;viewer.current.controls.touches.ONE=THREE.TOUCH.ROTATE;}}}><Orbit size={15}/></button><button type="button" className="icon-button" title="Pan preview" aria-label="Pan preview" aria-pressed={mode==='pan'} onClick={()=>{setMode('pan');if(viewer.current){viewer.current.controls.mouseButtons.LEFT=THREE.MOUSE.PAN;viewer.current.controls.touches.ONE=THREE.TOUCH.PAN;}}}><Hand size={15}/></button><button type="button" className="icon-button" aria-label="Fit preview" title="Fit preview" disabled={!report||!report.placements?.length||!!error} onClick={()=>viewer.current?.fit()}><Maximize size={15}/></button></div>}</header>
 <div className="reference-preview-stage" ref={host} data-source={source?.part}>
 {(!report||!report.placements?.length||error)&&<p role={error?'alert':'status'}>{error||(!source?emptyPrompt:!report?'Loading preview…':report.empty_message||'This part has no geometry to preview.')}</p>}
 </div>
 {!empty&&<small>Drag to {mode} · Right-drag to pan · Scroll to zoom<br/>Touch: one finger {mode}s · two fingers pan / zoom</small>}
 </section>;
}
function ReferencePreviewTitle({name,layout}:{name?:string;layout?:string}){return <div className="reference-preview-title"><span>Preview</span>{name&&<strong title={name}>{name}</strong>}{layout&&<small>Layout: {layout}</small>}</div>;}
