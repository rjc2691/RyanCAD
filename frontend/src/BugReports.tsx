import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {shortcutAttributes,shortcutLabel} from './toolbarShortcuts';
import {
  Bug,
  Plus,
  X,
  ChevronLeft,
  RefreshCw,
  ImagePlus,
  Trash2,
  Pencil,
  Save,
} from "lucide-react";
import { api, newRequestId } from "./api";

interface Screenshot {
  id: string;
  filename: string;
  media_type: string;
  size: number;
}
interface Report {
  id: string;
  kind: "bug" | "feature";
  title: string;
  date: string;
  steps: string;
  error: string;
  notes: string;
  environment: string;
  created_at: string;
  updated_at: string;
  version: number;
  screenshots: Screenshot[];
}
interface PendingImage extends Screenshot {
  data: string;
}
interface Draft {
  id?: string;
  version?: number;
  kind: "bug" | "feature";
  title: string;
  date: string;
  steps: string;
  error: string;
  notes: string;
  environment: string;
  screenshots: Screenshot[];
  images: PendingImage[];
}
const environment = () =>
  [
    `User agent: ${navigator.userAgent}`,
    `Platform (browser reported): ${navigator.platform || "Unavailable"}`,
    `Language: ${navigator.language}`,
    `Viewport: ${innerWidth} × ${innerHeight}; pixel ratio: ${devicePixelRatio}`,
    `Screen: ${screen.width} × ${screen.height}; touch points: ${navigator.maxTouchPoints}`,
    `Time zone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
  ].join("\n");
const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const blank = (): Draft => ({
  kind: "bug",
  title: "",
  date: localDate(),
  steps: "",
  error: "",
  notes: "",
  environment: environment(),
  screenshots: [],
  images: [],
});
const imageUrl = (report: string, image: string) =>
  `/api/reports/${report}/images/${image}`;

export default function BugReports() {
  const [open, setOpen] = useState(false),
    [position, setPosition] = useState({ left: 8, top: 110 });
  const [reports, setReports] = useState<Report[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null),
    [saving, setSaving] = useState(false),
    [reading, setReading] = useState(false),
    [deleting, setDeleting] = useState<string | null>(null),
    [confirmDelete, setConfirmDelete] = useState<string | null>(null),
    [query, setQuery] = useState("");
  const [dragging, setDragging] = useState(false);
  const button = useRef<HTMLButtonElement>(null),
    panel = useRef<HTMLDivElement>(null),
    files = useRef<HTMLInputElement>(null);
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  const refresh = async () => {
    setLoading(true);
    try {
      const r = await api("/reports");
      setReports(r.reports);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (!open) return;
    void refresh();
    const timer = setInterval(() => void refresh(), 15000);
    return () => clearInterval(timer);
  }, [open]);
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = button.current!.getBoundingClientRect();
      setPosition({
        left: Math.max(
          8,
          Math.min(innerWidth - Math.min(500, innerWidth - 16) - 8, r.left),
        ),
        top: r.bottom + 8,
      });
    };
    const outside = (e: PointerEvent) => {
      if (
        !panel.current?.contains(e.target as Node) &&
        !button.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    place();
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    document.addEventListener("pointerdown", outside);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("pointerdown", outside);
      window.removeEventListener("resize", place);
    };
  }, [open]);
  const patch = (value: Partial<Draft>) =>
    setDraft((d) => (d ? { ...d, ...value } : d));
  const addImages = async (incoming: File[]) => {
    if (!draft || reading || saving) return;
    const total = [...draft.screenshots, ...draft.images];
    if (
      total.length + incoming.length > 8 ||
      total.reduce((n, f) => n + f.size, 0) +
        incoming.reduce((n, f) => n + f.size, 0) >
        5_000_000
    ) {
      setError(
        "Use at most 8 screenshots, totaling no more than 5 MB per report.",
      );
      return;
    }
    if (
      incoming.some(
        (f) =>
          f.size > 4_000_000 ||
          !["image/png", "image/jpeg", "image/webp"].includes(f.type),
      )
    ) {
      setError(
        "Choose PNG, JPEG or WebP screenshots, no larger than 4 MB each.",
      );
      return;
    }
    setError("");
    setReading(true);
    try {
      const images = await Promise.all(
        incoming.map(
          (file) =>
            new Promise<PendingImage>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () =>
                resolve({
                  id: newRequestId() || String(Math.random()),
                  filename: file.name.slice(0, 200) || "Screenshot.png",
                  media_type: file.type,
                  size: file.size,
                  data: String(reader.result).split(",")[1],
                });
              reader.onerror = () =>
                reject(
                  Error(
                    "Could not read screenshot. Try selecting the file again.",
                  ),
                );
              reader.readAsDataURL(file);
            }),
        ),
      );
      setDraft((d) => (d ? { ...d, images: [...d.images, ...images] } : d));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setReading(false);
    }
  };
  const save = async () => {
    if (!draft || saving || reading) return;
    setSaving(true);
    setError("");
    try {
      const { id, screenshots, images, ...values } = draft;
      const report = await api(id ? `/reports/${id}` : "/reports", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify({
          ...values,
          keep_images: screenshots.map((i) => i.id),
          images: images.map((i) => ({ filename: i.filename, data: i.data })),
        }),
      });
      setReports((current) => [
        report,
        ...current.filter((r) => r.id !== report.id),
      ]);
      setDraft(null);
      setQuery("");
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const remove = async (report: Report) => {
    setDeleting(report.id);
    setError("");
    try {
      await api(`/reports/${report.id}?version=${report.version}`, {
        method: "DELETE",
      });
      setReports((current) => current.filter((r) => r.id !== report.id));
      setConfirmDelete(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDeleting(null);
    }
  };
  const start = (report?: Report) => {
    if (report) {
      const {
        created_at: _created,
        updated_at: _updated,
        ...editable
      } = report;
      setDraft({ ...editable, images: [] });
    } else setDraft(blank());
    setError("");
    setConfirmDelete(null);
    panel.current?.scrollTo(0, 0);
  };
  const shown = reports.filter((r) =>
    `${r.title} ${r.kind} ${r.steps} ${r.error} ${r.notes}`
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <>
      <button
        ref={button}
        className={`tool-button ${open ? "active" : ""}`}
        aria-label="Bug reports"
        {...shortcutAttributes('reports')}
        title="Bug reports · Shift+B"
        aria-expanded={open}
        aria-controls="bug-reports-panel"
        onClick={() => setOpen(!open)}
      >
        <Bug size={18} />
        <span>Bug reports</span>
      </button>
      {open &&
        createPortal(
          <div
            ref={panel}
            id="bug-reports-panel"
            className="bug-reports-popover"
            role="dialog"
            aria-label="Bug reports"
            style={{
              left: position.left,
              top: position.top,
              maxHeight: `calc(100dvh - ${position.top + 12}px)`,
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                close();
              }
              e.stopPropagation();
            }}
            onPaste={(e) => {
              if (!draft) return;
              const images = Array.from(e.clipboardData.items)
                .filter((i) => i.kind === "file" && i.type.startsWith("image/"))
                .map((i) => i.getAsFile())
                .filter((f): f is File => !!f);
              if (images.length) {
                e.preventDefault();
                void addImages(images);
              }
            }}
          >
            <header>
              <strong>
                <Bug size={17} /> Bug reports
              </strong>
              <button
                className="icon-button"
                aria-label="Close bug reports"
                onClick={close}
              >
                <X size={17} />
              </button>
            </header>
            <p className="reports-scope">
              Shared with everyone on this server · Bugs and feature requests
            </p>
            {error && (
              <p className="reports-error" role="alert">
                {error}
              </p>
            )}
            {draft ? (
              <>
                <div className="report-editor-heading">
                  <button
                    className="text-button"
                    disabled={saving || reading}
                    onClick={() => {
                      setDraft(null);
                      setError("");
                    }}
                  >
                    <ChevronLeft size={14} /> Discard draft
                  </button>
                  <strong>{draft.id ? "Edit report" : "New report"}</strong>
                </div>
                <form
                  className={`report-form ${dragging ? "dragging" : ""}`}
                  onSubmit={(e) => {
                    e.preventDefault();
                    void save();
                  }}
                  onDragOver={(e) => {
                    if (e.dataTransfer.types.includes("Files")) {
                      e.preventDefault();
                      setDragging(true);
                    }
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node))
                      setDragging(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    void addImages(Array.from(e.dataTransfer.files));
                  }}
                >
                  <fieldset disabled={saving || reading}>
                    <div className="report-field-row">
                      <label>
                        Report type
                        <select
                          aria-label="Report type"
                          value={draft.kind}
                          onChange={(e) =>
                            patch({ kind: e.target.value as Draft["kind"] })
                          }
                        >
                          <option value="bug">Bug</option>
                          <option value="feature">Feature request</option>
                        </select>
                      </label>
                      <label>
                        Date
                        <input
                          type="date"
                          aria-label="Date"
                          required
                          value={draft.date}
                          onChange={(e) => patch({ date: e.target.value })}
                        />
                      </label>
                    </div>
                    <label>
                      Title
                      <input
                        required
                        aria-label="Title"
                        autoFocus
                        maxLength={160}
                        value={draft.title}
                        onChange={(e) => patch({ title: e.target.value })}
                        placeholder="Brief description"
                      />
                    </label>
                    <label>
                      Steps to reproduce
                      <textarea
                        aria-label="Steps to reproduce"
                        maxLength={20000}
                        rows={3}
                        value={draft.steps}
                        onChange={(e) => patch({ steps: e.target.value })}
                      />
                    </label>
                    <label>
                      Error message
                      <textarea
                        aria-label="Error message"
                        maxLength={20000}
                        rows={3}
                        value={draft.error}
                        onChange={(e) => patch({ error: e.target.value })}
                      />
                    </label>
                    <label>
                      Additional information
                      <textarea
                        aria-label="Additional information"
                        maxLength={20000}
                        rows={3}
                        value={draft.notes}
                        onChange={(e) => patch({ notes: e.target.value })}
                      />
                    </label>
                    <label>
                      Browser / device information
                      <textarea
                        aria-label="Browser / device information"
                        maxLength={8000}
                        rows={4}
                        value={draft.environment}
                        onChange={(e) => patch({ environment: e.target.value })}
                      />
                    </label>
                    <small>
                      Browser-reported information is filled automatically for
                      new reports and can be edited. Browsers may limit
                      OS/version details.
                    </small>
                    <div className="report-screenshots">
                      <strong>Screenshots</strong>
                      <button
                        type="button"
                        className="report-dropzone"
                        onClick={() => files.current?.click()}
                      >
                        <ImagePlus size={19} />
                        <span>
                          Drop images, paste an image, or choose files
                        </span>
                        <small>PNG, JPEG, WebP · 8 images / 5 MB total</small>
                      </button>
                      <input
                        ref={files}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        multiple
                        hidden
                        aria-label="Choose screenshot files"
                        onChange={(e) => {
                          void addImages(Array.from(e.target.files || []));
                          e.target.value = "";
                        }}
                      />
                      <div className="report-image-list">
                        {[...draft.screenshots, ...draft.images].map(
                          (image) => (
                            <div className="report-image" key={image.id}>
                              <img
                                src={
                                  "data" in image
                                    ? `data:${image.media_type};base64,${image.data}`
                                    : imageUrl(draft.id!, image.id)
                                }
                                alt={image.filename}
                              />
                              <span>{image.filename}</span>
                              <button
                                type="button"
                                className="icon-button"
                                aria-label={`Remove screenshot ${image.filename}`}
                                onClick={() =>
                                  patch({
                                    screenshots: draft.screenshots.filter(
                                      (i) => i.id !== image.id,
                                    ),
                                    images: draft.images.filter(
                                      (i) => i.id !== image.id,
                                    ),
                                  })
                                }
                              >
                                <X size={13} />
                              </button>
                            </div>
                          ),
                        )}
                      </div>
                    </div>
                  </fieldset>
                  <div className="report-save-row">
                    <button
                      className="button primary"
                      type="submit"
                      disabled={saving || reading || !draft.title.trim()}
                    >
                      <Save size={14} />
                      {saving
                        ? "Saving…"
                        : reading
                          ? "Reading images…"
                          : "Save report"}
                    </button>
                    <small>
                      Closing this menu keeps the draft until you save or
                      discard it.
                    </small>
                  </div>
                </form>
              </>
            ) : (
              <>
                <div className="report-list-actions">
                  <button className="button secondary" onClick={() => start()}>
                    <Plus size={14} /> New report
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Refresh reports"
                    onClick={() => void refresh()}
                    disabled={loading}
                  >
                    <RefreshCw size={15} className={loading ? "spin" : ""} />
                  </button>
                </div>
                <input
                  className="report-search"
                  aria-label="Search reports"
                  placeholder="Search reports"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <div className="report-list">
                  {shown.map((report) => (
                    <details className="report-record" key={report.id}>
                      <summary>
                        <span className={`report-kind ${report.kind}`}>
                          {report.kind === "bug" ? "Bug" : "Feature"}
                        </span>
                        <strong>{report.title}</strong>
                        <time>{report.date}</time>
                      </summary>
                      <div className="report-record-body">
                        {[
                          ["Steps to reproduce", report.steps],
                          ["Error message", report.error],
                          ["Additional information", report.notes],
                          ["Browser / device information", report.environment],
                        ].map(
                          ([label, text]) =>
                            text && (
                              <div className="report-text" key={label}>
                                <strong>{label}</strong>
                                <p>{text}</p>
                              </div>
                            ),
                        )}
                        {report.screenshots.length > 0 && (
                          <div className="report-image-list">
                            {report.screenshots.map((image) => (
                              <a
                                className="report-image"
                                key={image.id}
                                href={imageUrl(report.id, image.id)}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <img
                                  src={imageUrl(report.id, image.id)}
                                  alt={image.filename}
                                />
                                <span>{image.filename}</span>
                              </a>
                            ))}
                          </div>
                        )}
                        <small>
                          Created {new Date(report.created_at).toLocaleString()}{" "}
                          · Updated{" "}
                          {new Date(report.updated_at).toLocaleString()}
                        </small>
                        <div className="report-record-actions">
                          <button
                            className="text-button"
                            onClick={() => start(report)}
                          >
                            <Pencil size={13} /> Edit
                          </button>
                          {confirmDelete === report.id ? (
                            <>
                              <span>Delete this report and screenshots?</span>
                              <button
                                className="text-button report-delete"
                                disabled={!!deleting}
                                onClick={() => void remove(report)}
                              >
                                {deleting ? "Deleting…" : "Confirm delete"}
                              </button>
                              <button
                                className="text-button"
                                onClick={() => setConfirmDelete(null)}
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <button
                              className="text-button report-delete"
                              onClick={() => setConfirmDelete(report.id)}
                            >
                              <Trash2 size={13} /> Delete
                            </button>
                          )}
                        </div>
                      </div>
                    </details>
                  ))}
                </div>
                {!shown.length && (
                  <p className="reports-empty">
                    {loading
                      ? "Loading reports…"
                      : query
                        ? "No matching reports."
                        : "No reports yet."}
                  </p>
                )}
              </>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
