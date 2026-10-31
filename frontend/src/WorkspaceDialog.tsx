import { useState } from "react";
import { Check, FolderOpen, Plus, RotateCcw, Trash2 } from "lucide-react";
import { Modal } from "./Forms";
import { api, setCurrentDesignId, waitJob } from "./api";

export type WorkspaceInfo = {
  name: string;
  active_design: string;
  workspace_code: string;
  designs: { id: string; name: string; deleted: boolean }[];
};

export default function WorkspaceDialog({
  workspace, activeDesign, canSwitch, onClose, reload, onError,
}: {
  workspace: WorkspaceInfo | null;
  activeDesign: string | null;
  canSwitch: boolean;
  onClose: () => void;
  reload: () => Promise<void>;
  onError: (error: any) => void;
}) {
  const [pending, setPending] = useState(false);
  const [name, setName] = useState("");
  const [rename, setRename] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [recovery, setRecovery] = useState("");
  const active = workspace?.designs.filter((design) => !design.deleted) || [];
  const deleted = workspace?.designs.filter((design) => design.deleted) || [];

  const action = async (run: () => Promise<void>, switching = false) => {
    if (switching && !canSwitch) {
      onError(new Error("Finish or cancel the current operation before changing designs or workspaces."));
      return;
    }
    setPending(true);
    try { await run(); } catch (error) { onError(error); }
    finally { setPending(false); }
  };
  const go = (id: string | null) => {
    setCurrentDesignId(id);
    window.location.reload();
  };
  const select = (id: string) => action(async () => {
    await api(`/workspace/designs/${id}/select`, { method: "POST" });
    go(id);
  }, true);

  return (
    <Modal title="Workspace designs" eyebrow="DESIGNS" onClose={onClose}>
      {!workspace ? <>
        <p className="dialog-copy">Workspace unavailable. Enter a recovery code to open an existing workspace, or create a new one.</p>
        <form className="workspace-create" onSubmit={(event) => {
          event.preventDefault();
          void action(async () => {
            await api("/workspace/recover", { method: "POST", body: JSON.stringify({ code: recovery }) });
            go(null);
          }, true);
        }}>
          <input aria-label="Workspace recovery code" placeholder="Workspace recovery code" value={recovery} onChange={(event) => setRecovery(event.target.value)} />
          <button className="button secondary" disabled={pending || !recovery.trim()}>Open workspace</button>
        </form>
        <button className="text-button" disabled={pending} onClick={() => void action(async () => {
          await api("/workspace/new", { method: "POST" });
          go(null);
        }, true)}>Create a new workspace</button>
      </> : <>
        <p className="dialog-copy">Choose a design to continue. Each design saves its own history automatically.</p>
        <div className="workspace-designs">
          {active.map((design) => <div className="workspace-design-row" key={design.id}>
            {rename === design.id ? <form className="workspace-rename" onSubmit={(event) => {
              event.preventDefault();
              void action(async () => {
                const submission = await api(`/workspace/designs/${design.id}/rename`, {
                  method: "POST", body: JSON.stringify({ name: renameValue.trim() }),
                });
                await waitJob(submission, undefined, 120, design.id);
                setRename(null);
                await reload();
              }, design.id === activeDesign);
            }}>
              <input autoFocus aria-label="Design name" maxLength={180} value={renameValue}
                onChange={(event) => setRenameValue(event.target.value)} />
              <button className="button secondary small" disabled={pending || !renameValue.trim()}>Save</button>
              <button type="button" className="text-button" onClick={() => setRename(null)}>Cancel</button>
            </form> : <>
              <button className="workspace-design-open" disabled={pending || design.id === activeDesign}
                onClick={() => void select(design.id)}>
                <FolderOpen size={16} /><span>{design.name}</span>
                {design.id === activeDesign && <small><Check size={12} /> Open</small>}
              </button>
              <button className="text-button" disabled={pending} onClick={() => { setRename(design.id); setRenameValue(design.name); }}>Rename</button>
              {deleteId === design.id ? <>
                <button className="text-button danger" disabled={pending} onClick={() => void action(async () => {
                  const result = await api(`/workspace/designs/${design.id}/delete`, { method: "POST" });
                  setDeleteId(null);
                  if (design.id === activeDesign) go(result.design_id);
                  else await reload();
                }, design.id === activeDesign)}>Confirm delete</button>
                <button className="text-button" onClick={() => setDeleteId(null)}>Cancel</button>
              </> : <button className="icon-button" title={active.length <= 1 ? "Create another design before deleting the last one" : "Delete design"} aria-label={`Delete ${design.name}`}
                disabled={pending || active.length <= 1} onClick={() => setDeleteId(design.id)}><Trash2 size={15} /></button>}
            </>}
          </div>)}
        </div>
        <form className="workspace-create" onSubmit={(event) => {
          event.preventDefault();
          void action(async () => {
            const result = await api("/workspace/designs", { method: "POST", body: JSON.stringify({ name }) });
            go(result.design_id);
          }, true);
        }}>
          <input aria-label="New design name" placeholder="New design name (optional)" maxLength={180} value={name}
            onChange={(event) => setName(event.target.value)} />
          <button className="button primary" disabled={pending}><Plus size={15} /> New design</button>
        </form>
        {deleted.length > 0 && <details className="workspace-details">
          <summary>Deleted designs ({deleted.length})</summary>
          {deleted.map((design) => <div className="workspace-deleted-row" key={design.id}>
            <span>{design.name}</span><button className="text-button" disabled={pending} onClick={() => void action(async () => {
              await api(`/workspace/designs/${design.id}/restore`, { method: "POST" });
              await reload();
            })}><RotateCcw size={13} /> Restore</button>
          </div>)}
        </details>}
      </>}
      <footer><button className="button secondary" onClick={onClose}>Close</button></footer>
    </Modal>
  );
}
