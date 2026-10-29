import { useEffect, useRef, useState } from "react";
import { Copy, Check } from "lucide-react";
import { api, currentDesignId } from "./api";
export default function MCPSetup() {
  const [setup, setSetup] = useState<any>(null),
    [error, setError] = useState(""),
    [copied, setCopied] = useState(""),
    [retry, setRetry] = useState(0);
  const text = useRef<HTMLTextAreaElement>(null),
    design = currentDesignId();
  useEffect(() => {
    let cancelled = false;
    setError("");
    setSetup(null);
    setCopied("");
    api("/agents/setup")
      .then((data) => {
        if (!cancelled) setSetup(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [design, retry]);
  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw Error();
      await navigator.clipboard.writeText(setup.config);
      setCopied("Copied");
    } catch {
      const area = text.current;
      if (!area) return;
      area.focus();
      area.select();
      let copied=false;
      try {copied=document.execCommand("copy");} catch {}
      setCopied(copied ? "Copied" : "Select and copy the configuration below.");
    }
  };
  return (
    <section className="mcp-setup" aria-label="Codex MCP setup">
      <header>
        <strong>Connect Codex</strong>
        {setup && (
          <button
            className="button secondary small"
            onClick={() => void copy()}
          >
            {copied === "Copied" ? <Check size={14} /> : <Copy size={14} />}Copy
            Codex config
          </button>
        )}
      </header>
      <p>
        Run Codex on the computer hosting RyanCAD. Keep RyanCAD running while
        the agent is connected.
      </p>
      {error ? (
        <div role="alert">
          {error}
          <button className="text-button" onClick={() => setRetry(retry + 1)}>
            Retry setup
          </button>
        </div>
      ) : !setup ? (
        <p role="status">Loading configuration…</p>
      ) : (
        <>
          <ol>
            <li>
              Open <code>{setup.config_path}</code> in your Codex settings.
            </li>
            <li>
              Paste the block below. Replace an existing{" "}
              <code>[mcp_servers.ryancad]</code> block if present.
            </li>
            <li>
              Reconnect or restart the Codex MCP client, then ask it to inspect
              this design.
            </li>
          </ol>
          <p>
            Codex uses <strong>TOML</strong>, rather than YAML. This block
            targets <strong>{setup.design_name}</strong>; copy it again to
            connect a different design.
          </p>
          <textarea
            ref={text}
            readOnly
            spellCheck={false}
            aria-label="Codex MCP configuration"
            value={setup.config}
          />
          <span role="status">{copied}</span>
          {!setup.connection_ready && (
            <p className="mcp-setup-warning">
              The connection file is missing. Start RyanCAD with its normal
              launcher before connecting.
            </p>
          )}
          <small>
            The connector reads the current token from the local connection
            file. No token is embedded here. These paths belong to the server
            computer; a Codex client on another machine needs a connector
            installed there or an SSH setup.
          </small>
          <a
            className="text-button"
            href="https://developers.openai.com/codex/mcp/"
            target="_blank"
            rel="noreferrer"
          >
            Official Codex MCP documentation ↗
          </a>
        </>
      )}
    </section>
  );
}
