import type {SVGProps} from 'react';
/** Faceted mechanical part with a bore, distinct from folders and trash. */
export default function ReferencePartIcon({size=16,...props}:SVGProps<SVGSVGElement>&{size?:number}){
 return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}><path d="m4 8 5-4 11 4v10l-6 3-10-4Z M4 8l10 4 6-4M14 12v9"/><ellipse cx="12" cy="8" rx="2" ry="1"/></svg>;
}
