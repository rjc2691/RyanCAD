import {Children,isValidElement,useId,useLayoutEffect,useRef,useState,type ReactNode} from 'react';
import {ChevronDown} from 'lucide-react';
import {toolbarAllocation} from './toolbarOverflow';

/** One set of controls, measured at natural width and partitioned into a tray. */
export default function OverflowToolbar({children,pinnedAction}:{children:ReactNode;pinnedAction?:string}){
  const root=useRef<HTMLDivElement>(null);
  const trayId=useId();
  const [allocation,setAllocation]=useState<{visible:number[];hidden:number[]}|null>(null),[open,setOpen]=useState(false);
  const items=Children.toArray(children);
  const pinnedIndex=pinnedAction?items.findIndex(item=>isValidElement(item)&&(item.props as Record<string,unknown>)['data-toolbar-action']===pinnedAction):-1;
  const indices=items.map((_,index)=>index);
  const visible=allocation?allocation.visible.filter(index=>index<items.length):indices;
  // Newly added controls must be mounted for measurement too (e.g. Fit when
  // entering a part), while removed controls must not leave phantom items.
  const hidden=allocation?indices.filter(index=>!visible.includes(index)):[];
  useLayoutEffect(()=>{
    const el=root.current;if(!el)return;
    let frame=0;
    const measure=()=>{
      frame=0;
      const buttons=[...el.querySelectorAll<HTMLElement>('[data-overflow-item]')].sort((a,b)=>Number(a.dataset.overflowItem)-Number(b.dataset.overflowItem));
      const available=el.clientWidth;
      if(!available)return;
      // Every item retains its natural width in both locations. The available
      // width comes only from the sidebar corridor, never from button layout.
      const next=toolbarAllocation(buttons.map(b=>b.getBoundingClientRect().width),available,pinnedIndex);
      setAllocation(old=>old&&old.visible.join(',')===next.visible.join(',')&&old.hidden.join(',')===next.hidden.join(',')?old:next);
    };
    const schedule=()=>{if(!frame)frame=requestAnimationFrame(measure);};
    const resize=new ResizeObserver(schedule);resize.observe(el);
    el.querySelectorAll('[data-overflow-item]').forEach(b=>resize.observe(b));
    measure();void document.fonts.ready.then(schedule);
    return()=>{resize.disconnect();cancelAnimationFrame(frame);};
  },[children,allocation,pinnedIndex]);
  useLayoutEffect(()=>{if(!hidden.length)setOpen(false);},[hidden.length]);
  useLayoutEffect(()=>{
    if(!open)return;
    const click=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node))setOpen(false);};
    const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setOpen(false);root.current?.querySelector<HTMLButtonElement>('.toolbar-overflow-toggle')?.focus();}};
    window.addEventListener('pointerdown',click);window.addEventListener('keydown',key,true);
    return()=>{window.removeEventListener('pointerdown',click);window.removeEventListener('keydown',key,true);};
  },[open]);
  const overflow=hidden.length>0;
  return <div className="overflow-toolbar" ref={root}>
    <div className="toolbar-visible-items">{visible.map(index=><div className="toolbar-item" data-overflow-item={index} key={index}>{items[index]}</div>)}</div>
    {overflow&&<button className="icon-button toolbar-overflow-toggle" aria-label="More tools" aria-expanded={open} aria-controls={trayId} onClick={()=>setOpen(v=>!v)}><ChevronDown size={18}/></button>}
    <div id={trayId} className={`toolbar-overflow-tray ${open&&overflow?'is-open':''}`} inert={!open||!overflow} aria-hidden={!open||!overflow} onClick={e=>{if((e.target as HTMLElement).closest('button:not([aria-expanded])'))setOpen(false);}}>
      {hidden.map(index=><div className="toolbar-item" data-overflow-item={index} key={index}>{items[index]}</div>)}
    </div>
  </div>;
}
