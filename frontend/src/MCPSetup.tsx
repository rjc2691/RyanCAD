import { useEffect, useRef, useState } from "react";
import { Copy, Check } from "lucide-react";
import { api, currentDesignId } from "./api";
export default function MCPSetup() {
  const [setup, setSetup] = useState<any>(null),
    [error, setError] = useState(""),
    [copied, setCopied] = useState(""),
    [retry, setRetry] = useState(0);
  const [harness,setHarness]=useState("Codex");
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
      <header><strong>Connect an agent</strong></header>
      <div className="agent-harness-tabs" role="tablist" aria-label="Agent app">{["Codex","Claude Desktop","Cursor","Other"].map(name=><button key={name} role="tab" aria-selected={harness===name} aria-controls="agent-harness-instructions" id={`harness-${name.replaceAll(' ','-')}`} onClick={()=>setHarness(name)}>{name}</button>)}</div>
      <div role="tabpanel" id="agent-harness-instructions" aria-labelledby={`harness-${harness.replaceAll(' ','-')}`}>
      {harness!=="Codex"?<p>Setup instructions for {harness} are coming soon. RyanCAD supports MCP through its local stdio connector.</p>:<>
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
          <p>The connector finds open browser designs automatically and stays connected to the chosen design. If several designs are open, the agent can list them and ask which one to use.</p>
          <div className="mcp-config-block">
          <button className="button secondary small mcp-config-copy" onClick={()=>void copy()}>{copied==="Copied"?<Check size={14}/>:<Copy size={14}/>}Copy</button>
          <textarea
            rows={12}
            ref={text}
            readOnly
            spellCheck={false}
            aria-label="Codex MCP configuration"
            value={setup.config}
          />
          </div>
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
      </>}
      </div>
    </section>
  );
}
