import type {SketchEntity, SketchPoint, SketchFrame} from "./sketchModel";

/** Endpoint rays and winding keep an interior dimension independent of line direction. */
export interface SketchAngleFrame { a:"start"|"end"; b:"start"|"end"; orientation:1|-1 }
const endpoint=(e:SketchEntity,end:"start"|"end"):SketchPoint=>end==="start"?[e.x1,e.y1]:[e.x2,e.y2];
const distance=(a:SketchPoint,b:SketchPoint)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const positive=(n:number)=>((n%360)+360)%360;
export function interiorAngleValue(directed:number,frame:SketchAngleFrame){
  const offset=(frame.b==="end"?180:0)-(frame.a==="end"?180:0);
  return positive(frame.orientation*(directed+offset));
}

export function sketchAngle(entities:SketchEntity[],a:SketchEntity,b:SketchEntity){
  const pairs=(["start","end"] as const).flatMap(x=>(["start","end"] as const).map(y=>({a:x,b:y,d:distance(endpoint(a,x),endpoint(b,y))}))).sort((x,y)=>x.d-y.d);
  const pair=pairs[0],connected=pair.d<1e-5;
  let vertex=endpoint(a,pair.a),u=endpoint(a,pair.a==="start"?"end":"start"),v=endpoint(b,pair.b==="start"?"end":"start");
  if(!connected){
    const ax=a.x2-a.x1,ay=a.y2-a.y1,bx=b.x2-b.x1,by=b.y2-b.y1,cross=ax*by-ay*bx;
    vertex=[a.x1,a.y1];
    if(Math.abs(cross)>1e-8){
      const t=((b.x1-a.x1)*by-(b.y1-a.y1)*bx)/cross;
      const intersection:SketchPoint=[a.x1+t*ax,a.y1+t*ay];
      // Near-parallel intersections can be far offscreen; use a local direction guide instead.
      if(distance(intersection,vertex)<4*Math.max(Math.hypot(ax,ay),Math.hypot(bx,by)))vertex=intersection;
    }
    u=[vertex[0]+ax,vertex[1]+ay];v=[vertex[0]+bx,vertex[1]+by];
  }
  let frame:SketchAngleFrame={a:connected?pair.a:"start",b:connected?pair.b:"start",orientation:1};
  const directed=Math.atan2((a.x2-a.x1)*(b.y2-b.y1)-(a.y2-a.y1)*(b.x2-b.x1),(a.x2-a.x1)*(b.x2-b.x1)+(a.y2-a.y1)*(b.y2-b.y1))*180/Math.PI;
  const raw=interiorAngleValue(directed,frame);
  frame.orientation=raw>180?-1:1;

  // Follow an unambiguous closed line loop. Its winding distinguishes reflex corners.
  if(connected&&!a.construction&&!b.construction){
    const lines=entities.filter(e=>e.type==="line"&&!e.construction);
    const visited=new Set([a.id]);const polygon=[vertex,u];let current=u,previous=a.id;
    for(let i=0;i<lines.length;i++){
      const next=lines.filter(e=>e.id!==previous&&(["start","end"] as const).some(end=>distance(endpoint(e,end),current)<1e-5));
      if(next.length!==1)break;
      const e=next[0];if(visited.has(e.id))break;
      visited.add(e.id);
      current=endpoint(e,distance(endpoint(e,"start"),current)<1e-5?"end":"start");polygon.push(current);previous=e.id;
      if(distance(current,vertex)<1e-5){
        if(e.id===b.id&&visited.size>=3){
          const area=polygon.slice(0,-1).reduce((sum,p,i)=>sum+p[0]*polygon[i+1][1]-p[1]*polygon[i+1][0],0);
          if(Math.abs(area)>1e-8)frame.orientation=area>0?1:-1;
        }
        break;
      }
    }
  }
  return {frame,value:interiorAngleValue(directed,frame),vertex,start:u,end:v,connected};
}

/** Convert legacy directed expressions without changing their evaluated corner. */
export function interiorAngleExpression(expression:string,value:number,frame:SketchAngleFrame){
  if(expression.trim()&&Number.isFinite(Number(expression)))return String(Number(interiorAngleValue(value,frame).toFixed(4)));
  const offset=interiorAngleValue(value,frame)-frame.orientation*value;
  if(frame.orientation===1&&Math.abs(offset)<1e-8)return expression;
  const term=`${frame.orientation===-1?"-":""}(${expression})`;
  return Math.abs(offset)<1e-8?term:`${term} ${offset<0?"-":"+"} ${Math.abs(offset)}${/[a-z_\[]/i.test(expression)?" deg":""}`;
}

export function sketchAxisAngle(frame:SketchFrame,axis:string,line:SketchEntity){
  const i="XYZ".indexOf(axis),u=frame.u,n=frame.normal;
  if(i<0)throw Error("Choose a world X, Y or Z axis.");
  const v=[n[1]*u[2]-n[2]*u[1],n[2]*u[0]-n[0]*u[2],n[0]*u[1]-n[1]*u[0]];
  const direction:SketchPoint=[u[i],v[i]],projection=Math.hypot(...direction);
  if(projection<1e-8)throw Error(`World ${axis} is perpendicular to this sketch plane. Choose an axis with a direction in the plane.`);
  const dx=line.x2-line.x1,dy=line.y2-line.y1,length=Math.hypot(dx,dy);
  const value=Math.acos(Math.max(-1,Math.min(1,(dx*direction[0]+dy*direction[1])/length)))*180/Math.PI;
  const angleFrame:SketchAngleFrame={a:"start",b:"start",orientation:dx*direction[1]-dy*direction[0]<0?-1:1};
  return {value,frame:angleFrame,direction:direction.map(c=>c/projection) as SketchPoint,projection};
}
