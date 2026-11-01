import type {SVGProps} from 'react';
/** Simple ribbed cylinder for reusable reference parts. */
export default function ReferencePartIcon({size=16,...props}:SVGProps<SVGSVGElement>&{size?:number}){
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v14c0 1.7 3.1 3 7 3s7-1.3 7-3V5M9 11v7m3-6v7m3-8v7"/></svg>;
}
