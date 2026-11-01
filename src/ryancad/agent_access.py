"""Server-wide agent switch and short-lived discovery of open browser designs."""
from __future__ import annotations

import json
import threading
import time

from .errors import CadError
from .storage import atomic_text


class AgentAccess:
    def __init__(self, workspaces, port):
        self.workspaces, self.port = workspaces, port
        self.path = workspaces.root / "agent-access.json"
        self.lock = threading.RLock()
        self.enabled = json.loads(self.path.read_text("utf-8")).get("enabled", True) if self.path.is_file() else True
        self.browsers = {}

    def status(self):
        return {"enabled": self.enabled, "listening": self.enabled, "port": self.port,
                "transport": "stdio connector → HTTP", "discovery": "open browser designs"}

    def set_enabled(self, enabled):
        if not isinstance(enabled, bool):
            raise CadError("invalid_control", "Choose enabled or disabled.")
        with self.lock, self.workspaces.lock:
            atomic_text(self.path, json.dumps({"enabled": enabled}) + "\n")
            self.enabled = enabled
            if not enabled:
                # Revoke queued/in-progress work too; disabling HTTP alone would
                # otherwise allow already-submitted jobs to commit afterwards.
                for current in self.workspaces.services.values():
                    with current.state_lock:
                        for identifier, agent in current.agents.items():
                            if not agent["revoked"]:
                                current.agent_control(identifier, "revoke")
                            agent.update(connected=False, disconnect_reason="MCP server disabled")
            return self.status()

    def require_enabled(self):
        if not self.enabled:
            raise CadError("mcp_disabled", "The user disabled the MCP server. Enable it in External agents before connecting.")

    def presence(self, owner, workspace, design, tab):
        if not isinstance(tab, str) or not 1 <= len(tab) <= 100:
            raise CadError("invalid_browser", "A browser tab identifier is required.")
        info = self.workspaces.describe(workspace)
        match = next((d for d in info["designs"] if d["id"] == design and not d["deleted"]), None)
        if not match:
            raise CadError("missing_design", "Open a design before connecting an agent.")
        with self.lock:
            cutoff=time.monotonic()-90
            self.browsers={key:value for key,value in self.browsers.items() if value['seen']>cutoff}
            self.browsers[(owner, tab)] = {"workspace": workspace, "design": design,
                "workspace_name": info["name"], "design_name": match["name"], "seen": time.monotonic()}

    def targets(self):
        with self.lock:
            cutoff = time.monotonic() - 90
            self.browsers = {key: value for key, value in self.browsers.items()
                             if value["seen"] > cutoff and self.workspaces.exists(value["workspace"])}
            unique = {}
            for value in self.browsers.values():
                unique[(value["workspace"], value["design"])] = {key: val for key, val in value.items() if key != "seen"}
            return list(unique.values())
