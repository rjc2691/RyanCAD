import { useEffect, useRef, useState } from "react";
import { Upload, Download, ChevronDown } from "lucide-react";
import { Modal } from "./Forms";
import {
  ApiError,
  currentDesignId,
  designHeaders,
  designUrl,
  waitJob,
} from "./api";
import type { State } from "./types";

export default function FileActions({
  state,
  disabled,
  onNative,
  onSTL,
  onImported,
  onError,
  onBusy,
}: {
  state: State | null;
  disabled: boolean;
  onNative: () => void;
  onSTL: () => void;
  onImported: () => Promise<unknown>;
  onError: (error: any) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [menu, setMenu] = useState<"import" | "export" | null>(null);
  const [svgExport, setSvgExport] = useState(false),
    [chosen, setChosen] = useState<string[]>([]),
    [working, setWorking] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null),
    root = useRef<HTMLDivElement>(null);
  const [kind, setKind] = useState("stl");
  const transfer = (value: boolean) => {
    setWorking(value);
    onBusy(value);
  };
  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setMenu(null);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  useEffect(() => {
    if (disabled) setMenu(null);
  }, [disabled]);
  const sketches = Object.values(state?.document.features || {}).filter(
    (f) => f.type === "sketch" && !f.suppressed,
  );
  const pick = (type: string) => {
    setKind(type);
    setMenu(null);
    if (fileRef.current) {
      fileRef.current.accept = "." + type;
      fileRef.current.click();
    }
  };
  return (
    <div
      className="file-actions"
      ref={root}
      onKeyDown={(e) => {
        if (e.key === "Escape") setMenu(null);
      }}
    >
      <div className="file-action-anchor">
        <button
          className="button import-button"
          aria-label="Import"
          title="Import"
          aria-expanded={menu === "import"}
          disabled={disabled || working}
          onClick={() => setMenu(menu === "import" ? null : "import")}
        >
          <Upload size={15} />
          <span>Import</span>
          <ChevronDown size={12} />
        </button>
        {menu === "import" && (
          <div
            className="file-action-menu"
            role="menu"
            aria-label="Import formats"
          >
            <button
              role="menuitem"
              onClick={() => {
                setMenu(null);
                onNative();
              }}
            >
              RyanCAD design <small>.rycad.zip / YAML</small>
            </button>
            <button role="menuitem" onClick={() => pick("stl")}>
              STL object{" "}
              <small>Faceted solid · mm · up to 5,000 triangles</small>
            </button>
            <button role="menuitem" onClick={() => pick("svg")}>
              SVG sketch <small>World XY · curved paths approximated</small>
            </button>
          </div>
        )}
      </div>
      <div className="file-action-anchor">
        <button
          className="button export-button"
          aria-label="Export"
          title="Export"
          aria-expanded={menu === "export"}
          disabled={disabled || working}
          onClick={() => setMenu(menu === "export" ? null : "export")}
        >
          <Download size={15} />
          <span>Export</span>
          <ChevronDown size={12} />
        </button>
        {menu === "export" && (
          <div
            className="file-action-menu"
            role="menu"
            aria-label="Export formats"
          >
            <button
              role="menuitem"
              disabled={!state?.summary.instances}
              onClick={() => {
                setMenu(null);
                onSTL();
              }}
            >
              STL components <small>Choose components</small>
            </button>
            <button
              role="menuitem"
              disabled={!sketches.length}
              onClick={() => {
                setMenu(null);
                setChosen([]);
                setSvgExport(true);
              }}
            >
              SVG sketches <small>Choose sketches</small>
            </button>
            <a
              role="menuitem"
              href={designUrl("/api/native")}
              download
              onClick={() => setMenu(null)}
            >
              RyanCAD design <small>Editable native snapshot</small>
            </a>
          </div>
        )}
      </div>
      <input
        hidden
        ref={fileRef}
        type="file"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file || !state) return;
          const design = currentDesignId();
          transfer(true);
          try {
            const response = await fetch(
              designUrl(
                `/api/import-geometry/${kind}?name=${encodeURIComponent(file.name.replace(/\.[^.]+$/, ""))}&revision=${state.document.revision}`,
              ),
              {
                method: "POST",
                headers: designHeaders(),
                body: await file.arrayBuffer(),
              },
            );
            const result = await response.json();
            if (!response.ok) throw new ApiError(result.error);
            await waitJob(result, undefined, 120, design || undefined);
            await onImported();
          } catch (error) {
            onError(error);
          } finally {
            transfer(false);
            e.target.value = "";
          }
        }}
      />
      {svgExport && state && (
        <Modal
          title="Export SVG"
          onClose={() => {
            if (!working) setSvgExport(false);
          }}
        >
          <p className="dialog-copy">
            Each selected sketch exports in its own plane coordinates, in
            millimeters. Multiple sketches download as a ZIP.
          </p>
          <div className="export-selection-list">
            {sketches.map((f) => (
              <label key={f.id} className="group-member">
                <input
                  type="checkbox"
                  checked={chosen.includes(f.id)}
                  onChange={(e) =>
                    setChosen(
                      e.target.checked
                        ? [...chosen, f.id]
                        : chosen.filter((id) => id !== f.id),
                    )
                  }
                />
                <span>{f.name}</span>
              </label>
            ))}
          </div>
          <footer>
            <button
              className="button secondary"
              disabled={working}
              onClick={() => setSvgExport(false)}
            >
              Cancel
            </button>
            <button
              className="button primary"
              disabled={!chosen.length || working}
              onClick={async () => {
                transfer(true);
                try {
                  const response = await fetch("/api/export-svg", {
                    method: "POST",
                    headers: {
                      ...designHeaders(),
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                      expected_revision: state.document.revision,
                      sketches: chosen,
                    }),
                  });
                  if (!response.ok)
                    throw new ApiError((await response.json()).error);
                  const url = URL.createObjectURL(await response.blob()),
                    a = document.createElement("a");
                  a.href = url;
                  a.download =
                    chosen.length === 1 ? "sketch.svg" : "sketches.zip";
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                  setSvgExport(false);
                } catch (error) {
                  onError(error);
                } finally {
                  transfer(false);
                }
              }}
            >
              {working ? "Exporting…" : "Export SVG"}
            </button>
          </footer>
        </Modal>
      )}
    </div>
  );
}
