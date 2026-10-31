import type {SVGProps} from "react";

/** Flat-ended cutter with a plain shank and three helical flute passes. */
export default function EndMillIcon({size=19,...props}:SVGProps<SVGSVGElement>&{size?:number}){
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
    <g>
      <path d="M9 9V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v6l1 2v10h-3l-1-1-1 1H8V11l1-2Z"/>
      <path d="M9 9h6M8 13c4 0 4-3 8-3M8 17c4 0 4-4 8-4M8 21c4 0 4-4 8-4"/>
    </g>
  </svg>;
}
