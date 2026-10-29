import { useEffect, useRef, useState } from "react";
import { UserRound, Settings, LogIn, UserPlus, Activity } from "lucide-react";
import { Modal } from "./Forms";
export default function AccountMenu({ onAgents }: { onAgents: () => void }) {
  const [open, setOpen] = useState(false),
    [panel, setPanel] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  return (
    <div className="account-menu" ref={root}>
      <button
        className="avatar"
        aria-label="Account menu"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Account menu"
        onClick={() => setOpen(!open)}
      >
        R
      </button>
      {open && (
        <div className="account-dropdown" role="menu" aria-label="Account">
          <header>
            <strong>Ryan</strong>
            <span>Personal workspace</span>
            <small>Account preview · Not signed in</small>
          </header>
          {[
            [UserRound, "Profile"],
            [Settings, "Account settings"],
            [LogIn, "Sign in"],
            [UserPlus, "Create account"],
          ].map(([Icon, label]) => {
            const Glyph = Icon as typeof UserRound;
            return (
              <button
                key={String(label)}
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  setPanel(String(label));
                }}
              >
                <Glyph size={16} />
                {String(label)}
                <small>Preview</small>
              </button>
            );
          })}
          <button
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onAgents();
            }}
          >
            <Activity size={16} />
            External agents
          </button>
        </div>
      )}
      {panel && (
        <Modal
          title={panel}
          eyebrow="ACCOUNT PREVIEW"
          onClose={() => setPanel(null)}
        >
          <p className="dialog-copy">
            Account UI preview. Authentication is not connected; no credentials
            are collected or sent.
          </p>
          <label className="field">
            <span>Name</span>
            <input disabled value="Ryan" readOnly />
          </label>
          <label className="field">
            <span>Email</span>
            <input disabled value="ryan@example.com" readOnly />
          </label>
          {(panel === "Sign in" || panel === "Create account") && (
            <label className="field">
              <span>Password</span>
              <input
                disabled
                type="password"
                placeholder="Unavailable in preview"
              />
            </label>
          )}
          <footer>
            <button className="button secondary" onClick={() => setPanel(null)}>
              Close
            </button>
            <button className="button primary" disabled>
              {panel === "Sign in"
                ? "Sign in"
                : panel === "Create account"
                  ? "Create account"
                  : "Save changes"}
            </button>
          </footer>
        </Modal>
      )}
    </div>
  );
}
