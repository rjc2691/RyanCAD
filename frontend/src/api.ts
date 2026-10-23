export class ApiError extends Error {
  code: string;
  details: any;
  constructor(error: any) {
    super(error.message || "The operation could not be completed.");
    this.code = error.code || "request_failed";
    this.details = error.details || {};
  }
}
export async function api(path: string, options: RequestInit = {}) {
  const response = await fetch("/api" + path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
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
): Promise<any> {
  if (submission.status === "complete") return submission.result;
  if (!submission.job_id)
    throw new ApiError(submission.error || { message: "No job was created." });
  for (;;) {
    const job = await api("/jobs/" + submission.job_id);
    onJob?.(job);
    if (job.status === "complete") return job.result;
    if (job.status === "failed" || job.status === "cancelled")
      throw new ApiError(job.error || { message: "Operation cancelled." });
    await new Promise((resolve) => setTimeout(resolve, 120));
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
