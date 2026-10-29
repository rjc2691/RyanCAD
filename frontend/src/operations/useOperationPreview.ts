import { useEffect, useRef, useState } from "react";
import { api, waitJob, newRequestId } from "../api";
const DEBOUNCE_MS = 120;

/** One native evaluation in flight, newest draft wins. Superseded results never apply. */
export function useOperationPreview(
  args: any | null,
  revision: number,
  onPreview: (report: any | null) => void,
  commandName = "operation.create",
) {
  const signature = args ? JSON.stringify([revision, commandName, args]) : "";
  const [result, setResult] = useState<{
    signature: string;
    report: any;
    error: string;
    status: string;
  }>({ signature: "", report: null, error: "", status: "idle" });
  const latest = useRef({
    signature,
    args,
    commandName,
    revision,
    changed: performance.now(),
  });
  const notify = useRef(onPreview);
  const cache = useRef(new Map<string, { report: any; time: number }>());
  const lastReport = useRef<any>(null);
  notify.current = onPreview;
  const runtime = useRef({
    running: false,
    mounted: true,
    job: "",
    timer: 0,
    completed: "",
  });
  const drive = async () => {
    const r = runtime.current,
      snapshot = latest.current;
    if (
      r.running ||
      !r.mounted ||
      !snapshot.signature ||
      r.completed === snapshot.signature
    )
      return;
    r.running = true;
    setResult({
      signature: snapshot.signature,
      report: null,
      error: "",
      status: "building",
    });
    try {
      const submission = await api("/previews", {
        method: "POST",
        body: JSON.stringify({
          name: snapshot.commandName,
          args: snapshot.args,
          expected_revision: snapshot.revision,
          request_id: newRequestId(),
        }),
      });
      r.job = submission.job_id;
      if (!r.mounted && r.job) {
        await api(`/jobs/${r.job}/cancel`, { method: "POST" });
        return;
      }
      const report = await waitJob(submission, undefined, 35);
      if (r.mounted && latest.current.signature === snapshot.signature) {
        r.completed = snapshot.signature;
        cache.current.set(snapshot.signature, {
          report,
          time: performance.now(),
        });
        if (cache.current.size > 6)
          cache.current.delete(cache.current.keys().next().value!);
        lastReport.current = report;
        setResult({
          signature: snapshot.signature,
          report,
          error: "",
          status: "ready",
        });
        notify.current(report);
      }
    } catch (error: any) {
      if (r.mounted && latest.current.signature === snapshot.signature) {
        setResult({
          signature: snapshot.signature,
          report: null,
          error: error.message || "The candidate could not be built.",
          status: "error",
        });
        r.completed = snapshot.signature;
        notify.current(
          lastReport.current ? { ...lastReport.current, stale: true } : null,
        );
      }
    } finally {
      r.job = "";
      r.running = false;
      if (
        r.mounted &&
        latest.current.signature &&
        latest.current.signature !== snapshot.signature
      )
        r.timer = window.setTimeout(
          drive,
          Math.max(
            0,
            DEBOUNCE_MS - (performance.now() - latest.current.changed),
          ),
        );
    }
  };
  useEffect(() => {
    latest.current = {
      signature,
      args,
      commandName,
      revision,
      changed: performance.now(),
    };
    if (!signature) {
      lastReport.current = null;
      runtime.current.completed = "";
      notify.current(null);
      setResult({ signature: "", report: null, error: "", status: "idle" });
      return;
    }
    notify.current(
      lastReport.current ? { ...lastReport.current, stale: true } : null,
    );
    const saved = cache.current.get(signature);
    if (saved && performance.now() - saved.time < 60000) {
      runtime.current.completed = signature;
      lastReport.current = saved.report;
      setResult({
        signature,
        report: saved.report,
        error: "",
        status: "ready",
      });
      notify.current(saved.report);
      return;
    }
    runtime.current.completed = "";
    runtime.current.timer = window.setTimeout(drive, DEBOUNCE_MS);
    return () => clearTimeout(runtime.current.timer);
  }, [signature]);
  useEffect(() => {
    runtime.current.mounted = true;
    return () => {
      const r = runtime.current;
      r.mounted = false;
      clearTimeout(r.timer);
      notify.current(null);
      if (r.job)
        void api(`/jobs/${r.job}/cancel`, { method: "POST" }).catch(() => {});
    };
  }, []);
  return {
    retry: () => {
      cache.current.delete(signature);
      runtime.current.completed = "";
      setResult({ signature, report: null, error: "", status: "building" });
      notify.current(
        lastReport.current ? { ...lastReport.current, stale: true } : null,
      );
      void drive();
    },
    flush: () => {
      clearTimeout(runtime.current.timer);
      void drive();
    },
    ...result,
    error: result.signature === signature ? result.error : "",
    ready:
      !!signature &&
      result.signature === signature &&
      result.status === "ready",
    pending:
      !!signature &&
      (result.signature !== signature || result.status === "building"),
  };
}
