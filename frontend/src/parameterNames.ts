import type { Parameter } from "./types";

export function parameterNames(parameters: Record<string, Parameter>, identifier: string, seen = new Set<string>()): string[] {
  if (seen.has(identifier)) return [];
  seen.add(identifier);
  const p = parameters[identifier];
  if (!p) return [];
  if (p.named) return [p.name];
  return [...new Set((p.expression.match(/\bp_[a-f0-9]+\b/g) || []).flatMap(id => parameterNames(parameters, id, seen)))];
}
export function expressionParameterNames(parameters: Record<string, Parameter>, expression: string): string[] {
  return Object.values(parameters).filter(p => p.named && (expression === p.name || expression.includes(`[${p.name}]`) || expression.includes(p.id) || (new RegExp(`\\b${p.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`)).test(expression))).map(p => p.name);
}
