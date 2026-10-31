import time

import pytest
from fastapi.testclient import TestClient

from ryancad.api import create_app


@pytest.fixture
def client(tmp_path):
    app = create_app(tmp_path / "project.rycad", "test-capability", testing=True)
    with TestClient(app) as current:
        current.get("/")  # Same-origin human session cookie.
        yield current


def wait(client, response):
    response.raise_for_status()
    data = response.json()
    if data.get("status") == "complete":
        return data
    until = time.monotonic() + 60
    while time.monotonic() < until:
        job = client.get("/api/jobs/" + data["job_id"]).json()
        if job["status"] in {"complete", "failed", "cancelled"}:
            return job
        time.sleep(.02)
    raise AssertionError("API job timed out")


def test_local_origin_and_session_boundaries(client):
    assert client.get("/api/health").status_code == 200
    assert client.get("/api/state", headers={"Origin": "https://unrelated.example"}).status_code == 403
    assert client.get("/api/state", headers={"Host": "untrusted.example"}).status_code == 403
    assert client.get("/api/state", headers={"Cookie": "ryancad_session_8790=wrong"}).status_code == 401


def test_bearer_agent_cannot_omit_identity_or_operate_human_controls(client):
    bearer = {"Authorization": "Bearer test-capability"}
    command = {"name": "document.rename", "args": {"name": "External action"}, "expected_revision": 0}
    assert client.post("/api/commands", json=command, headers=bearer).json()["error"]["code"] == "agent_session_required"
    actor = client.post("/api/agents", json={"name": "API agent"}, headers=bearer).json()
    agent_headers = {**bearer, "X-RyanCAD-Actor": actor["id"]}
    assert client.post(f"/api/agents/{actor['id']}/resume", headers=agent_headers).json()["error"]["code"] == "human_control_required"
    completed = wait(client, client.post("/api/commands", json=command, headers=agent_headers))
    assert completed["status"] == "complete"
    state = client.get("/api/state").json()
    assert state["document"]["name"] == "External action"
    assert state["actions"][0]["actor"]["id"] == actor["id"]


def test_agent_heartbeat_and_disconnect_routes(client):
    bearer = {"Authorization": "Bearer test-capability"}
    actor = client.post("/api/agents", json={"name": "Presence test"}, headers=bearer).json()
    headers = {**bearer, "X-RyanCAD-Actor": actor["id"]}
    assert client.post("/api/agents/heartbeat", headers=headers).json() == {"ok": True}
    assert client.post("/api/agents/heartbeat").json()["error"]["code"] == "agent_session_required"
    assert client.post("/api/agents/disconnect", headers=headers).json() == {"ok": True}
    assert client.get("/api/state").json()["agents"][0]["connected"] is False
    assert client.post("/api/agents/heartbeat", headers=headers).json()["error"]["code"] == "agent_revoked"


def test_preview_and_stale_commit_are_distinct_from_saved_edits(client):
    state = client.get("/api/state").json()
    base = state["document"]["revision"]
    preview = wait(client, client.post("/api/previews", json={"name": "document.rename", "args": {"name": "Candidate"}, "expected_revision": base}))
    assert preview["status"] == "complete"
    token = preview["result"]["preview_token"]
    assert client.get("/api/state").json()["document"]["revision"] == base
    actual = wait(client, client.post("/api/commands", json={"name": "document.rename", "args": {"name": "Human change"}, "expected_revision": base}))
    assert actual["status"] == "complete"
    stale = wait(client, client.post(f"/api/previews/{token}/commit"))
    assert stale["error"]["code"] == "stale_revision"
    assert client.get("/api/state").json()["document"]["name"] == "Human change"


def test_unified_operation_preview_commits_exact_candidate_and_exposes_schema(client):
    assert "operation_schema" in client.get("/api/capabilities").json()
    preview=wait(client,client.post("/api/previews",json={"name":"operation.create","expected_revision":0,"args":{"name":"Preview part","profile":"rectangle","values":{"width":20,"height":10,"distance":5}}}))
    assert preview["status"]=="complete"
    candidate=preview["result"]
    assert candidate["occurrences"] and candidate["feature_values"]["width"]==20
    assert client.get("/api/state").json()["document"]["revision"]==0
    saved=wait(client,client.post(f"/api/previews/{candidate['preview_token']}/commit"))
    assert saved["status"]=="complete" and saved["result"]["saved"]
    state=client.get("/api/state").json()
    assert state["document"]["revision"]==1 and len(state["document"]["features"])==1
    assert saved["result"]["feature_id"]==candidate["changes"]["feature_id"]
    assert state["geometry"][saved["result"]["component_id"]]["volume"]==pytest.approx(1000)


def test_corner_section_and_target_extent_survive_native_preview_commit(client):
    first=wait(client,client.post("/api/commands",json={"name":"operation.create","expected_revision":0,"args":{"profile":"rectangle","values":{"width":20,"height":20,"distance":10}}}))["result"]
    state=client.get("/api/state").json();g=state["geometry"][first["component_id"]]
    edge=next(e for e in g["edges"] if abs(e["tangent"][2])>.99)
    ref={"component":first["component_id"],"occurrence":first["instance_id"],"edge":edge["signature"],"anchor":"start"}
    preview=wait(client,client.post("/api/previews",json={"name":"operation.create","expected_revision":1,"args":{"target":first["component_id"],"target_occurrence":first["instance_id"],"profile":"chamfer","path_reference":ref,"travel_target":{**ref,"anchor":"mid"},"values":{"amount":2}}}))["result"]
    assert preview["operation_display"]["finish_section"]["area"]==pytest.approx(2)
    assert preview["operation_display"]["tool_profile"]["temporary"]
    assert preview["operation_display"]["tool_profile"]["loops"]==preview["operation_display"]["finish_section"]["loops"]
    assert preview["operation_display"]["travel"]["distance"]==pytest.approx(5)
    assert client.get("/api/state").json()["document"]["revision"]==1
    wait(client,client.post(f"/api/previews/{preview['preview_token']}/commit"))
    assert client.get("/api/state").json()["geometry"][first["component_id"]]["volume"]==pytest.approx(3990)


def test_movement_native_preview_projection_commit_undo_and_no_geometry_feature(client):
    first = wait(client, client.post("/api/commands", json={"name":"operation.create", "expected_revision":0,
        "args":{"profile":"rectangle", "values":{"width":12,"height":10,"distance":8}}}))["result"]
    second = wait(client, client.post("/api/commands", json={"name":"component.duplicate", "expected_revision":1,
        "args":{"id":first["component_id"],"placement":{"x":40,"y":20,"z":10}}}))["result"]
    before = client.get("/api/state").json()
    a, b = [next(o["id"] for o in before["occurrences"] if o["source_id"]==item["instance_id"] and not o["library"]) for item in (first,second)]
    candidate = wait(client, client.post("/api/previews", json={"name":"instance.move", "expected_revision":2, "args":{
        "id":first["instance_id"], "occurrence":a, "method":"projected", "origin":{"occurrence":a,"point":[0,0,0]},
        "target":{"occurrence":b,"point":[0,0,0]},"direction":{"occurrence":b,"start":[0,0,0],"end":[2,0,0]}}}))["result"]
    assert candidate["changes"]["movement"]["displacement"] == pytest.approx([40,0,0])
    assert candidate["changes"]["movement"]["remaining_gap"] == pytest.approx(500**.5)
    assert client.get("/api/state").json()["document"] == before["document"]
    assert next(o for o in candidate["occurrences"] if o["id"]==a)["matrix"][0][3] == 40
    saved = wait(client, client.post(f"/api/previews/{candidate['preview_token']}/commit"))
    assert saved["status"] == "complete" and saved["result"]["saved"]
    after = client.get("/api/state").json()
    assert len(after["document"]["features"]) == 1
    assert after["geometry"][first["component_id"]]["geometry_key"] == before["geometry"][first["component_id"]]["geometry_key"]
    assert next(o for o in after["occurrences"] if o["id"]==b)["matrix"][1][3] == 20
    wait(client, client.post("/api/commands", json={"name":"history.undo", "expected_revision":3, "args":{}}))
    assert next(o for o in client.get("/api/state").json()["occurrences"] if o["id"]==a)["matrix"][0][3] == 0


def test_unified_reference_and_live_axis_rotation_survive_native_regeneration(client):
    first=wait(client,client.post("/api/commands",json={"name":"operation.create","expected_revision":0,"args":{"profile":"rectangle","values":{"width":12,"height":10,"distance":8}}}))["result"]
    second=wait(client,client.post("/api/commands",json={"name":"component.duplicate","expected_revision":1,"args":{"id":first["component_id"],"placement":{"x":40,"y":20,"z":10}}}))["result"]
    rows=client.get("/api/state").json()["occurrences"]
    a,b=[next(o["id"] for o in rows if o["source_id"]==item["instance_id"] and not o["library"]) for item in (first,second)]
    candidate=wait(client,client.post("/api/previews",json={"name":"instance.move","expected_revision":2,"args":{"id":first["instance_id"],"occurrence":a,"method":"reference","target":{"occurrence":b,"point":[0,0,0]},"direction":{"occurrence":b,"start":[0,0,0],"end":[1,0,0]},"values":{"distance":6}}}))["result"]
    assert candidate["changes"]["movement"]["displacement"] == pytest.approx([6,0,0])
    assert client.get("/api/state").json()["document"]["revision"] == 2
    wait(client,client.post(f"/api/previews/{candidate['preview_token']}/commit"))
    rotated=wait(client,client.post("/api/previews",json={"name":"instance.move","expected_revision":3,"args":{"id":first["instance_id"],"occurrence":a,"method":"rotate","direction":{"occurrence":b,"start":[0,0,0],"end":[0,0,1]},"values":{"angle":"90 deg"}}}))["result"]
    assert next(o for o in rotated["occurrences"] if o["id"]==a)["matrix"][0][3] == pytest.approx(60)
    assert next(o for o in rotated["occurrences"] if o["id"]==a)["matrix"][1][3] == pytest.approx(-14)
    wait(client,client.post(f"/api/previews/{rotated['preview_token']}/commit"))
    state=client.get("/api/state").json()
    angle=state["document"]["instances"][first["instance_id"]]["placement"]["rotation_angle"]
    wait(client,client.post("/api/commands",json={"name":"parameter.set","expected_revision":4,"args":{"id":angle,"value":"180 deg"}}))
    final=client.get("/api/state").json()
    assert next(o for o in final["occurrences"] if o["id"]==a)["matrix"][0][3] == pytest.approx(74)
    assert next(o for o in final["occurrences"] if o["id"]==a)["matrix"][1][3] == pytest.approx(40)
    assert len(final["document"]["features"])==1
    assert client.get("/api/native").status_code==200
    global_preview=wait(client,client.post("/api/previews",json={"name":"instance.move","expected_revision":5,"args":{"id":first["instance_id"],"occurrence":a,"method":"reference","direction":{"axis":"Y"},"values":{"distance":3}}}))["result"]
    assert global_preview["changes"]["movement"]["displacement"]==pytest.approx([0,3,0])
    assert client.get("/api/state").json()["document"]["revision"]==5


def test_disconnected_unified_preview_has_explicit_component_ownership(client):
    first=wait(client,client.post("/api/commands",json={"name":"operation.create","expected_revision":0,"args":{"profile":"rectangle","values":{"width":20,"height":10,"distance":5}}}))["result"]
    candidate=wait(client,client.post("/api/previews",json={"name":"operation.create","expected_revision":1,"args":{"target":first["component_id"],"target_occurrence":first["instance_id"],"profile":"rectangle","result":"add","values":{"origin_x":100,"width":10,"height":10,"distance":5}}}))["result"]
    assert candidate["changes"]["ownership_change"]["reason"]=="disconnected_addition"
    assert len([o for o in candidate["occurrences"] if o["kind"]!="assembly" and not o.get("library")])==2
    assert len([c for c in client.get("/api/state").json()["document"]["components"].values() if c["kind"]!="assembly"])==1
    saved=wait(client,client.post(f"/api/previews/{candidate['preview_token']}/commit"))
    assert saved["status"]=="complete"
    state=client.get("/api/state").json()
    assert len([o for o in state["occurrences"] if o["kind"]!="assembly" and not o.get("library")])==2
    assert state["geometry"][first["component_id"]]["volume"]==pytest.approx(1000)


def test_export_and_native_input_validation_are_actionable(client):
    assert client.post("/api/export", json={"expected_revision":0,"tolerance":-1}).status_code == 422
    assert client.post("/api/import", content=b'PKbroken').json()["error"]["code"] == "invalid_archive"
    assert client.post("/api/import", content=b'name: [unterminated').json()["error"]["code"] == "invalid_document"
    job = wait(client, client.post("/api/export", json={"expected_revision":0,"instance_ids":[]}))
    assert job["error"]["code"] == "invalid_selection"


def test_auto_preview_resolves_once_before_commit_and_never_flips_on_regeneration(client):
    first=wait(client,client.post("/api/commands",json={"name":"operation.create","expected_revision":0,"args":{"values":{"width":40,"height":30,"distance":6}}}))["result"]
    state=client.get("/api/state").json();face=next(f for f in state["geometry"][first["component_id"]]["faces"] if f["normal"][2]>.99)
    ref={"component":first["component_id"],"occurrence":first["instance_id"],"face":face["signature"]}
    job=wait(client,client.post("/api/previews",json={"name":"operation.create","expected_revision":1,"args":{"target":first["component_id"],"target_occurrence":first["instance_id"],"profile":"face","result":"auto","origin":"reference","reference":ref,"profile_reference":ref,"plane":"face","values":{"distance":-2}}}))
    assert job["status"]=="complete",job
    candidate=job["result"];assert candidate["operation_decision"]["mode"]=="cut"
    assert client.get("/api/state").json()["document"]["revision"]==1
    saved=wait(client,client.post(f"/api/previews/{candidate['preview_token']}/commit"));assert saved["status"]=="complete"
    state=client.get("/api/state").json();feature=state["document"]["features"][candidate["changes"]["feature_id"]]
    assert feature["options"]["result"]=="cut" and feature["options"]["auto_selection"]["mode"]=="cut"
    changed=wait(client,client.post("/api/commands",json={"name":"parameter.set","expected_revision":2,"args":{"id":feature["parameters"]["distance"],"value":2}}))
    assert changed["status"]=="failed" and changed["error"]["code"]=="no_effect"
    assert client.get("/api/state").json()["document"]["revision"]==2


def test_auto_disconnected_add_becomes_component_but_auto_split_cut_does_not(client):
    first=wait(client,client.post("/api/commands",json={"name":"operation.create","expected_revision":0,"args":{"values":{"width":40,"height":30,"distance":6}}}))["result"]
    preview=wait(client,client.post("/api/previews",json={"name":"operation.create","expected_revision":1,"args":{"target":first["component_id"],"profile":"circle","result":"auto","values":{"origin_x":100,"diameter":5,"distance":4}}}))
    assert preview["status"]=="complete",preview
    assert preview["result"]["changes"]["ownership_change"]["reason"]=="disconnected_addition"
    split=wait(client,client.post("/api/previews",json={"name":"operation.create","expected_revision":1,"args":{"target":first["component_id"],"profile":"rectangle","result":"auto","values":{"width":4,"height":30,"distance":6}}}))
    assert split["status"]=="failed" and split["error"]["code"]=="separate_components_required"
    assert split["error"]["details"]["auto_decision"]["mode"]=="cut"
    assert len([o for o in client.get("/api/state").json()["occurrences"] if o["kind"]!="assembly" and not o.get("library")])==1


def test_two_local_projects_do_not_overwrite_each_others_browser_cookie(tmp_path):
    app_a = create_app(tmp_path / "first", "first-token", port=8792, testing=True)
    app_b = create_app(tmp_path / "second", "second-token", port=8793, testing=True)
    with TestClient(app_a) as first, TestClient(app_b) as second:
        first.get("/")
        second.get("/")
        first.cookies.update(second.cookies)
        second.cookies.update(first.cookies)
        assert first.get("/api/state").status_code == 200
        assert second.get("/api/state").status_code == 200


def test_sketch_preview_solves_without_saving_and_rejects_invalid_or_stale_drafts(client):
    import math
    args={"name":"Preview sketch","owner":"root","plane":"XY",
          "entities":[{"id":"l","type":"line","x1":0,"y1":0,"x2":10,"y2":0,"fixed":False}],
          "constraints":[{"type":"distance","a":"l.start","b":"l.end","value":18}]}
    before=client.get('/api/state').json()['document']
    result=wait(client,client.post('/api/sketch-preview',json={'name':'sketch.create','args':args,'expected_revision':0}))
    assert result['status']=='complete'
    line=result['result']['sketch']['entities'][0]
    assert math.dist(line['start'],line['end'])==pytest.approx(18)
    assert client.get('/api/state').json()['document']==before
    args['constraints'][0]['value']=-1
    invalid=wait(client,client.post('/api/sketch-preview',json={'name':'sketch.create','args':args,'expected_revision':0}))
    assert invalid['status']=='failed' and invalid['error']['code']=='invalid_dimension'
    stale=wait(client,client.post('/api/sketch-preview',json={'name':'sketch.create','args':args,'expected_revision':1}))
    assert stale['status']=='failed' and stale['error']['code']=='stale_revision'
    assert client.get('/api/state').json()['document']==before


def test_sketch_preview_edit_keeps_existing_revision_and_resolves_parameter(client):
    import math
    param=wait(client,client.post('/api/commands',json={'name':'parameter.create','expected_revision':0,'args':{'name':'Length','value':14}}))
    assert param['status']=='complete'
    line={'id':'l','type':'line','x1':0,'y1':0,'x2':10,'y2':0,'fixed':False}
    create=wait(client,client.post('/api/commands',json={'name':'sketch.create','expected_revision':1,'args':{'owner':'root','entities':[line]}}))
    assert create['status']=='complete'
    fid=create['result']['feature_id']
    before=client.get('/api/state').json()['document']
    args={'feature_id':fid,'entities':[line],'constraints':[{'type':'distance','a':'l.start','b':'l.end','value':'Length'}]}
    result=wait(client,client.post('/api/sketch-preview',json={'name':'sketch.update','args':args,'expected_revision':2}))
    assert result['status']=='complete'
    report=result['result'];solved=report['sketch']['entities'][0]
    assert math.dist(solved['start'],solved['end'])==pytest.approx(14)
    assert report['constraint_values']==[14]
    assert client.get('/api/state').json()['document']==before


def test_no_effect_corner_preview_retains_profile_details_without_committing(client):
    first=wait(client,client.post("/api/commands",json={"name":"operation.create","expected_revision":0,"args":{"profile":"rectangle","values":{"width":20,"height":20,"distance":10}}}))["result"]
    before=client.get("/api/state").json();edge=next(e for e in before["geometry"][first["component_id"]]["edges"] if abs(e["tangent"][2])>.99)
    failed=wait(client,client.post("/api/previews",json={"name":"operation.create","expected_revision":1,"args":{"target":first["component_id"],"target_occurrence":first["instance_id"],"profile":"fillet","result":"add","path_reference":{"component":first["component_id"],"occurrence":first["instance_id"],"edge":edge["signature"]},"values":{"amount":2}}}))
    assert failed["status"] == "failed" and failed["error"]["code"] == "no_geometry_change"
    assert "Change Tool Effect to Remove Material" in failed["error"]["message"]
    assert failed["error"]["details"]["operation_display"]["tool_profile"]["loops"]
    assert client.get("/api/state").json()["document"]["revision"] == 1
