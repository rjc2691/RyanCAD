export class ApiError extends Error {
  code: string;
  details: any;
  constructor(error: any) {
    super(error.message || "The operation could not be completed.");
    this.code = error.code || "request_failed";
    this.details = error.details || {};
  }
}
/** Request IDs are for idempotency, not authentication. Non-secure origins
 * commonly lack randomUUID but still expose cryptographic random bytes. */
export function newRequestId(
  source: Crypto | null | undefined = globalThis.crypto,
): string | undefined {
  if (typeof source?.randomUUID === "function") return source.randomUUID();
  if (typeof source?.getRandomValues !== "function") return undefined;
  const bytes = source.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
const designKey = "ryancad-active-design";
export function currentDesignId(): string | null {
  return sessionStorage.getItem(designKey);
}
export function setCurrentDesignId(id: string | null) {
  if (id) sessionStorage.setItem(designKey, id);
  else sessionStorage.removeItem(designKey);
}
export function designHeaders(id = currentDesignId()): Record<string, string> {
  return id ? { "X-RyanCAD-Design": id } : {};
}
export function designUrl(path: string): string {
  const id = currentDesignId();
  return id ? path + (path.includes("?") ? "&" : "?") + "design_id=" + encodeURIComponent(id) : path;
}
export async function api(path: string, options: RequestInit = {}) {
  const headers = new Headers({ "Content-Type": "application/json", ...designHeaders() });
  new Headers(options.headers).forEach((value, key) => headers.set(key, value));
  const response = await fetch("/api" + path, {
    cache: "no-store",
    ...options,
    headers,
  });
  if (!response.ok) {
    let payload;
    try {
      payload = await response.json();
    } catch {
      payload = { error: { message: response.statusText } };
    }
    throw new ApiError(payload.error || payload);
  }
  return response.json();
}
export async function waitJob(
  submission: any,
  onJob?: (job: any) => void,
  pollIntervalMs = 120,
  designId?: string,
): Promise<any> {
  if (submission.status === "complete") return submission.result;
  if (!submission.job_id)
    throw new ApiError(submission.error || { message: "No job was created." });
  for (;;) {
    const job = await api("/jobs/" + submission.job_id, { headers: designHeaders(designId) });
    onJob?.(job);
    if (job.status === "complete") return job.result;
    if (job.status === "failed" || job.status === "cancelled")
      throw new ApiError(job.error || { message: "Operation cancelled." });
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}
export function expressionLabel(
  expression: string,
  parameters: Record<string, any>,
): string {
  let result = expression.replace(
    /quantity\(([^,]+),\s*['"](\w+)['"]\)/g,
    "$1 $2",
  );
  return result.replace(/\bp_[a-f0-9]+\b/g, (id) => {
    const parameter = parameters[id];
    if (!parameter) return id;
    const duplicate =
      Object.values(parameters).filter((p) => p.name === parameter.name)
        .length > 1;
    return duplicate ? id : "[" + parameter.name + "]";
  });
}
export function numeric(value: number | undefined, precision = 2) {
  return value === undefined
    ? "—"
    : new Intl.NumberFormat("en-US", {
        maximumFractionDigits: precision,
      }).format(value);
}
