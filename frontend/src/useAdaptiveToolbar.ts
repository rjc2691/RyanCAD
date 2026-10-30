import {useLayoutEffect,useState,type RefObject} from "react";

/** Measure the actual buttons so custom shortcuts and sketch tools fit too. */
export function useAdaptiveToolbar(shell:RefObject<HTMLDivElement|null>,content:RefObject<HTMLDivElement|null>){
  const [fullWidth,setFullWidth]=useState(false);
  useLayoutEffect(()=>{
    const root=shell.current,row=content.current;if(!root||!row)return;
    let frame=0,alive=true;
    const measure=()=>{
      frame=0;if(!alive)return;
      if(!window.matchMedia("(min-width:1000px)").matches){setFullWidth(false);return;}
      const columns=getComputedStyle(root).gridTemplateColumns.split(" ").map(parseFloat);
      const available=root.clientWidth-(columns[0]||0)-(columns[2]||0);
      const style=getComputedStyle(row),children=[...row.children].filter(el=>getComputedStyle(el).display!=="none");
      const required=children.reduce((sum,el)=>{
        if(el.classList.contains("toolbar-spacer"))return sum;
        const css=getComputedStyle(el);
        return sum+el.getBoundingClientRect().width+(parseFloat(css.marginLeft)||0)+(parseFloat(css.marginRight)||0);
      },(parseFloat(style.paddingLeft)||0)+(parseFloat(style.paddingRight)||0)+(parseFloat(style.columnGap)||0)*Math.max(0,children.length-1));
      setFullWidth(current=>current?available<required+8:available<required);
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
  return fullWidth;
}
