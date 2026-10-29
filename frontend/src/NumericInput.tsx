import { createContext, forwardRef, useContext, useEffect, useId, useRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Parameter } from "./types";

export const NamedParameters = createContext<Parameter[]>([]);
const NamedValues = createContext<Record<string, number>>({});
export function NamedParameterProvider({ parameters, values = {}, children }: { parameters: Parameter[]; values?: Record<string, number>; children: ReactNode }) {
  return <NamedParameters.Provider value={parameters.filter(p => p.named === true)}><NamedValues.Provider value={values}>{children}</NamedValues.Provider></NamedParameters.Provider>;
}
export function resolveNumericText(text: string, parameters: Parameter[], values: Record<string, number>, kind?: string) {
  const label = text.trim().replace(/^\[/, "").replace(/\]$/, "");
  const p = parameters.find(p => p.named && (!kind || p.kind === kind) && (p.name.toLowerCase() === label.toLowerCase() || p.id === label));
  if (p) return values[p.id];
  if (!text.trim()) return NaN;
  return Number(text);
}
export function ResolvedNumericInput({ value, onValue, kind, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & { value: string | number; onValue: (number: number, expression: string) => void; kind?: string }) {
  const parameters = useContext(NamedParameters), values = useContext(NamedValues);
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return <NumericInput {...props} kind={kind} value={text} aria-invalid={!Number.isFinite(resolveNumericText(text, parameters, values, kind))} onChange={e => {
    setText(e.target.value);
    const number = resolveNumericText(e.target.value, parameters, values, kind);
    if (Number.isFinite(number)) onValue(number, e.target.value);
  }} />;
}
export const NumericInput = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { kind?: string }>(
function NumericInput({ kind, onChange, onKeyDown, onFocus, onBlur, className = "", ...props }, ref) {
  const parameters = useContext(NamedParameters).filter(p => !kind || p.kind === kind);
  const input = useRef<HTMLInputElement | null>(null);
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [cycle, setCycle] = useState<{ query: string; index: number } | null>(null);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const id = useId();
  const value = String(props.value ?? "");
  const query = cycle?.query ?? value.replace(/^\[/, "").replace(/\]$/, "");
  const matches = /[a-zA-Z_]/.test(query) ? parameters.filter(p => p.name.toLowerCase().includes(query.toLowerCase())).sort((a,b) => Number(b.name.toLowerCase().startsWith(query.toLowerCase())) - Number(a.name.toLowerCase().startsWith(query.toLowerCase())) || a.name.localeCompare(b.name)) : [];
  const open = focused && !dismissed && matches.length > 0 && !!rect;
  const selected = cycle?.index ?? 0;
  const exact = parameters.find(p => value === p.name || value === `[${p.name}]` || value === `@${p.id}`);
  useEffect(() => { if (open) document.getElementById(id)?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" }); }, [cycle?.index, open]);
  const choose = (index: number, keepOpen = false) => {
    const el = input.current, p = matches[index];
    if (!el || !p) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(el, /^[a-zA-Z_]\w*$/.test(p.name) ? p.name : `[${p.name}]`);
    onChange?.({ target: el, currentTarget: el } as React.ChangeEvent<HTMLInputElement>);
    setCycle({ query, index });
    setDismissed(!keepOpen);
    el.focus();
  };
  return <>
    <input {...props} ref={el => { input.current = el; if (typeof ref === "function") ref(el); else if (ref) ref.current = el; }}
      className={`${className} ${exact ? "named-value-input" : ""}`} title={exact ? `Parameter: ${exact.name}` : props.title}
      role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={open ? id : undefined}
      onFocus={e => { setFocused(true); setRect(e.currentTarget.getBoundingClientRect()); onFocus?.(e); }}
      onBlur={e => { setFocused(false); setCycle(null); onBlur?.(e); }}
      onChange={e => { setCycle(null); setDismissed(false); setRect(e.currentTarget.getBoundingClientRect()); onChange?.(e); }}
      onKeyDown={e => {
        if (open && ["Tab", "ArrowDown", "ArrowUp", "Enter"].includes(e.key)) {
          e.preventDefault(); e.stopPropagation();
          if (e.key === "Enter") choose(selected);
          else if (e.key === "Tab") choose(cycle ? (selected + (e.shiftKey ? matches.length - 1 : 1)) % matches.length : 0, true);
          else setCycle({ query, index: (selected + (e.key === "ArrowUp" ? matches.length - 1 : 1)) % matches.length });
          return;
        }
        if (e.key === "Escape") setDismissed(true);
        onKeyDown?.(e);
      }} />
    {open && createPortal(<div id={id} role="listbox" aria-label="Matching parameters" className="parameter-suggestions"
      style={{ position: "fixed", left: Math.max(8, Math.min(rect!.left, window.innerWidth - 280)), top: window.innerHeight - rect!.bottom > 230 ? rect!.bottom + 3 : Math.max(8, rect!.top - 224), width: Math.max(rect!.width, 250) }}>
      {matches.map((p, i) => <button type="button" role="option" aria-selected={i === selected} key={p.id}
        className={i === selected ? "active" : ""} onMouseDown={e => e.preventDefault()} onClick={() => choose(i)}>
        <span>{p.name}</span><small>{p.kind}</small>
      </button>)}
    </div>, document.body)}
  </>;
});
