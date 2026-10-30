import pytest
from ryancad.errors import CadError
from ryancad.service import CadService


def test_presence_expires_crashed_sessions_and_retains_authorship(tmp_path):
    service = CadService(tmp_path / "presence.rycad")
    try:
        stale = service.register_agent("Codex")
        live = service.register_agent("Codex")
        service.agent_last_seen[stale.id] -= 91
        agents = {a["actor"]["id"]: a for a in service.state()["agents"]}
        assert not agents[stale.id]["connected"]
        assert agents[stale.id]["disconnect_reason"] == "Connection timed out"
        assert agents[live.id]["connected"]
        with pytest.raises(CadError):
            service._permission(stale)
        assert agents[stale.id]["actor"]["name"] == "Codex"
        service.heartbeat_agent(stale.id)
        service._permission(stale)
        service.disconnect_agent(stale.id)
        with pytest.raises(CadError):
            service.heartbeat_agent(stale.id)
    finally:
        service.close()


def test_heartbeat_does_not_resume_paused_or_revoked_agent(tmp_path):
    service = CadService(tmp_path / "controls.rycad")
    try:
        actor = service.register_agent("Codex")
        service.agent_control(actor.id, "pause")
        service.heartbeat_agent(actor.id)
        with pytest.raises(CadError) as error:
            service._permission(actor)
        assert error.value.code == "agent_paused"
        service.agent_control(actor.id, "revoke")
        with pytest.raises(CadError):
            service.heartbeat_agent(actor.id)
    finally:
        service.close()
