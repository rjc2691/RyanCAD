import {useRef} from "react";
import ReferencePartPreview from './ReferencePartPreview';
import type {PrimitiveTemplate} from './PrimitiveLibrary';
export function PrimitiveEditor({template,onDone,onContext}:{template:PrimitiveTemplate;onDone:()=>void;onContext:(x:number,y:number)=>void}){
 const right=useRef({x:0,y:0,dragged:false,pending:null as {x:number;y:number}|null});
 return <div className="primitive-editor-view"
 onPointerDownCapture={e=>{if(e.button===2)right.current={x:e.clientX,y:e.clientY,dragged:false,pending:null};}}
 onPointerMoveCapture={e=>{if((e.buttons&2)&&Math.hypot(e.clientX-right.current.x,e.clientY-right.current.y)>5)right.current.dragged=true;}}
 onPointerUpCapture={e=>{const p=right.current.pending;if(e.button===2&&p){right.current.pending=null;if(!right.current.dragged)onContext(p.x,p.y);}}}
 onContextMenu={e=>{e.preventDefault();if(right.current.dragged)return;if(e.buttons&2)right.current.pending={x:e.clientX,y:e.clientY};else onContext(e.clientX,e.clientY);}}>
 <header className="primitive-editor-header"><div><span className="eyebrow">Part Editor</span><strong>{template.name} <small>Primitive template</small></strong></div><button className="button secondary" onClick={onDone}>Done</button></header>
 <ReferencePartPreview source={{workspace:'primitive',design:template.shape,part:template.shape,name:template.name}}/>
 </div>;
}
export function PrimitiveInspector({template}:{template:PrimitiveTemplate}){
 return <div className="primitive-inspector"><div className="component-heading"><div className="large-component-icon"><template.icon size={23}/></div><div><span className="eyebrow">PRIMITIVE TEMPLATE</span><h2>{template.name}</h2></div></div>
 <h3>Parameters</h3><dl>{Object.entries(template.fields).map(([field,value])=><div key={field}><dt>{field[0].toUpperCase()+field.slice(1)}</dt><dd>{value} mm</dd></div>)}</dl><p>Right-click the primitive to add a copy to a layout or active part and set its dimensions.</p></div>;
}
