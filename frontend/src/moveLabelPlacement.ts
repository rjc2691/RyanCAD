export type ScreenRect={x:number;y:number;width:number;height:number};
export function placeMoveDistance(midpoint:{x:number;y:number},obstacles:ScreenRect[],width:number,height:number,previous?:ScreenRect){
  const w=154,h=48,pad=10;
  const clamp=(x:number,y:number):ScreenRect=>({x:Math.max(pad,Math.min(Math.max(pad,width-w-pad),x)),y:Math.max(pad,Math.min(Math.max(pad,height-h-pad),y)),width:w,height:h});
  const score=(r:ScreenRect)=>{
    let overlap=0,count=0;
    for(const b of obstacles){const area=Math.max(0,Math.min(r.x+w,b.x+b.width)-Math.max(r.x,b.x))*Math.max(0,Math.min(r.y+h,b.y+b.height)-Math.max(r.y,b.y));if(area>0){overlap+=area/(w*h);count++;}}
    return overlap*500+count*120+Math.hypot(r.x+w/2-midpoint.x,r.y+h/2-midpoint.y);
  };
  let best=clamp(midpoint.x-w/2,midpoint.y-h-24),bestScore=score(best);
  for(const radius of [50,90,140,210,300,430])for(let i=0;i<16;i++){
    const angle=i*Math.PI/8,r=clamp(midpoint.x+Math.cos(angle)*radius-w/2,midpoint.y+Math.sin(angle)*radius-h/2),s=score(r);
    if(s<bestScore){best=r;bestScore=s;}
  }
  if(previous){const p=clamp(previous.x,previous.y);if(score(p)<=bestScore+22)return p;}
  return best;
}
