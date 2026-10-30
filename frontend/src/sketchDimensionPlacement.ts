type Point=[number,number];
/** Screen-space placement keeps the input near its guide without swallowing line picks. */
export function placeSketchDimension(preferred:Point,size:Point,viewport:Point,lines:[Point,Point][]){
  const [w,h]=size,[width,height]=viewport;
  const clamp=([x,y]:Point):Point=>[Math.max(8,Math.min(width-w-8,x)),Math.max(8,Math.min(height-h-8,y))];
  const overlap=(a:Point,b:Point,p:Point)=>{
    const dx=b[0]-a[0],dy=b[1]-a[1];let lo=0,hi=1;
    for(const [delta,margin] of [[-dx,a[0]-p[0]+5],[dx,p[0]+w+5-a[0]],[-dy,a[1]-p[1]+5],[dy,p[1]+h+5-a[1]]]){
      if(Math.abs(delta)<1e-8){if(margin<0)return 0;continue;}
      const t=margin/delta;if(delta<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);if(lo>hi)return 0;
    }
    return Math.max(0,hi-lo)*Math.hypot(dx,dy);
  };
  const candidates:Point[]=[clamp(preferred)];
  for(const radius of [16,40,80,180])for(const [x,y] of [[0,-1],[0,1],[-1,0],[1,0],[-1,-1],[1,-1],[-1,1],[1,1]])candidates.push(clamp([preferred[0]+x*radius,preferred[1]+y*radius]));
  const score=(p:Point)=>lines.reduce((s,[a,b])=>{const length=overlap(a,b,p);return s+(length>.25?10000+length*20:0);},((p[0]-preferred[0])**2+(p[1]-preferred[1])**2)*.01);
  let best=candidates[0],cost=score(best);for(const p of candidates.slice(1)){const next=score(p);if(next<cost){best=p;cost=next;}}
  return best;
}
