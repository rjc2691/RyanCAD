import {useLayoutEffect,useState,type RefObject} from "react";

/** Measure the actual buttons so custom shortcuts and sketch tools fit too. */
export function useAdaptiveToolbar(shell:RefObject<HTMLDivElement|null>,content:RefObject<HTMLDivElement|null>){
  const [layout,setLayout]=useState({mode:"between",left:248,right:360});
  const update=(left:number,right:number,mode:string)=>setLayout(old=>old.left===left&&old.right===right&&old.mode===mode?old:{left,right,mode});
  useLayoutEffect(()=>{
    const root=shell.current,row=content.current;if(!root||!row)return;
    let frame=0,alive=true;
    const measure=()=>{
      frame=0;if(!alive)return;
      if(!window.matchMedia("(min-width:1000px)").matches){update(0,0,"full-width");return;}
      const columns=getComputedStyle(root).gridTemplateColumns.split(" ").map(parseFloat);
      const left=columns[0]||0,right=columns[2]||0;
      const style=getComputedStyle(row),children=[...row.children].filter(el=>getComputedStyle(el).display!=="none");
      const required=children.reduce((sum,el)=>{
        if(el.classList.contains("toolbar-spacer"))return sum;
        const css=getComputedStyle(el);
        return sum+el.getBoundingClientRect().width+(parseFloat(css.marginLeft)||0)+(parseFloat(css.marginRight)||0);
      },(parseFloat(style.paddingLeft)||0)+(parseFloat(style.paddingRight)||0)+(parseFloat(style.columnGap)||0)*Math.max(0,children.length-1));
      // Keep the preferred sidebar insets whenever possible. If the buttons
      // need more space, consume only that much margin rather than snapping
      // the entire row to the outer edges of the window.
      const marginBudget=Math.max(0,root.clientWidth-Math.ceil(required)-2);
      const scale=left+right>0?Math.min(1,marginBudget/(left+right)):1;
      const insetLeft=Math.floor(left*scale*2)/2,insetRight=Math.floor(right*scale*2)/2;
      update(insetLeft,insetRight,scale===1?"between":scale>0?"inset":"full-width");
    };
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(measure);};
    const resize=new ResizeObserver(schedule);
    const observe=()=>{resize.disconnect();resize.observe(root);resize.observe(row);for(const child of row.children)resize.observe(child);};
    const mutations=new MutationObserver(()=>{observe();schedule();});
    mutations.observe(row,{childList:true,subtree:true,characterData:true});
    const shellChanges=new MutationObserver(schedule);shellChanges.observe(root,{attributes:true,attributeFilter:["class"]});
    observe();measure();void document.fonts.ready.then(schedule);
    return()=>{alive=false;resize.disconnect();mutations.disconnect();shellChanges.disconnect();cancelAnimationFrame(frame);};
  },[shell,content]);
  return layout;
}
