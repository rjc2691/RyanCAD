/** Deterministic fit: the budget never depends on the current visible controls. */
export function toolbarVisibleCount(widths:readonly number[],available:number,gap=4,toggle=40):number{
  const budget=Math.max(0,Math.floor(available));
  const sizes=widths.map(width=>Math.max(0,Math.ceil(width)));
  const total=sizes.reduce((sum,width)=>sum+width,0)+gap*Math.max(0,sizes.length-1);
  if(total<=budget)return sizes.length;
  let used=toggle,count=0;
  for(const width of sizes){
    if(used+gap+width>budget)break;
    used+=gap+width;count++;
  }
  return count;
}

/** A pinned utility stays immediately before More, without changing the width budget. */
export function toolbarAllocation(widths:readonly number[],available:number,pinnedIndex=-1){
  const indices=widths.map((_,index)=>index);
  const count=toolbarVisibleCount(widths,available);
  if(count===widths.length)return {visible:indices,hidden:[] as number[]};
  if(pinnedIndex<0||pinnedIndex>=widths.length)return {visible:indices.slice(0,count),hidden:indices.slice(count)};
  const ordinary=indices.filter(index=>index!==pinnedIndex);
  const prefix=toolbarVisibleCount(ordinary.map(index=>widths[index]),available-Math.ceil(widths[pinnedIndex])-4);
  return {visible:[...ordinary.slice(0,prefix),pinnedIndex],hidden:ordinary.slice(prefix)};
}
