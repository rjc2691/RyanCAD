import base64
from concurrent.futures import ThreadPoolExecutor

from fastapi.testclient import TestClient
import pytest
import yaml

from ryancad.api import create_app
from ryancad.errors import CadError
from ryancad.reports import ReportInput, ReportStore

PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jB4kAAAAASUVORK5CYII=')
def values(**changes):
    return ReportInput.model_validate({'title':'Viewport issue', 'date':'2026-10-28', 'steps':'Click a face.\nPress T.', 'images':[{'filename':'Screenshot.png','data':base64.b64encode(PNG).decode()}], **changes})


def test_report_storage_crud_screenshots_and_restart(tmp_path):
    store=ReportStore(tmp_path/'feedback')
    report=store.save(values())
    image=report['screenshots'][0]
    path,media=store.image(report['id'],image['id'])
    assert path.read_bytes()==PNG and media=='image/png'
    assert yaml.safe_load(store.manifest.read_text())['reports'][0]['steps']=='Click a face.\nPress T.'
    assert 'steps: |' in store.manifest.read_text()
    restarted=ReportStore(store.directory)
    assert restarted.list()==[report]
    updated=restarted.save(values(title='A feature request',kind='feature',version=1,images=[],keep_images=[image['id']]),report['id'])
    assert updated['version']==2 and updated['created_at']==report['created_at'] and updated['kind']=='feature'
    assert updated['screenshots']==report['screenshots']
    with pytest.raises(CadError,match='Someone changed'):restarted.delete(report['id'],1)
    assert path.exists()
    updated=restarted.save(values(version=2,images=[],keep_images=[]),report['id'])
    assert not path.exists() and not updated['screenshots']
    restarted.delete(report['id'],3)
    assert restarted.list()==[]


def test_concurrent_create_and_stale_edit_are_not_lost(tmp_path):
    store=ReportStore(tmp_path)
    with ThreadPoolExecutor(max_workers=4) as pool:
        reports=list(pool.map(lambda i:store.save(values(title=f'Bug {i}',images=[])),range(12)))
    assert len(store.list())==12
    original=reports[0]
    store.save(values(version=1,title='First editor',images=[]),original['id'])
    with pytest.raises(CadError,match='Someone changed'):store.save(values(version=1,title='Second editor',images=[]),original['id'])
    assert next(r for r in store.list() if r['id']==original['id'])['title']=='First editor'


@pytest.mark.parametrize('changes',[
    {'title':'   '},
    {'images':[{'filename':'bad.png','data':'bad base64!'}]},
    {'images':[{'filename':'fake.png','data':base64.b64encode(b'<svg/>').decode()}]},
    {'keep_images':['../outside']},
])
def test_invalid_report_has_no_persisted_side_effects(tmp_path,changes):
    store=ReportStore(tmp_path)
    with pytest.raises(CadError):store.save(values(**changes))
    assert not store.manifest.exists()


def test_corrupt_yaml_is_preserved_and_failed_commit_cleans_new_images(tmp_path,monkeypatch):
    store=ReportStore(tmp_path)
    report=store.save(values())
    original=store.manifest.read_bytes()
    oldfiles=list((tmp_path/'screenshots').rglob('*'))
    def fail(_):raise OSError('Disk full')
    monkeypatch.setattr(store,'_write',fail)
    with pytest.raises(CadError,match='Could not save'):store.save(values(version=1),report['id'])
    assert store.manifest.read_bytes()==original
    assert list((tmp_path/'screenshots').rglob('*'))==oldfiles
    store.manifest.write_text('broken: [')
    with pytest.raises(CadError,match='not been overwritten'):store.list()
    assert store.manifest.read_text()=='broken: ['


def test_attachment_limits_do_not_change_an_existing_report(tmp_path):
    store=ReportStore(tmp_path)
    report=store.save(values())
    original=store.manifest.read_bytes()
    large=PNG+b'x'*3_000_000
    upload={'filename':'large.png','data':base64.b64encode(large).decode()}
    with pytest.raises(CadError,match='5 MB'):store.save(values(version=1,images=[upload,upload]),report['id'])
    with pytest.raises(CadError):store.save(values(version=1,images=[],keep_images=[report['screenshots'][0]['id']]*2),report['id'])
    assert store.manifest.read_bytes()==original


def test_reports_api_is_shared_between_workspaces_without_cad_mutations(tmp_path):
    app=create_app(tmp_path/'project','test',testing=True)
    with TestClient(app) as first:
        second=TestClient(app)
        first.get('/');second.get('/')
        before=first.get('/api/state').json()['document']
        assert first.cookies.get('ryancad_workspace_8790')!=second.cookies.get('ryancad_workspace_8790')
        created=first.post('/api/reports',json=values().model_dump(mode='json'))
        assert created.status_code==200,created.text
        report=created.json();rid=report['id'];image=report['screenshots'][0]
        shared=second.get('/api/reports',headers={'X-RyanCAD-Design':'no-such-design'})
        assert shared.json()['reports']==[report]
        response=second.get(f"/api/reports/{rid}/images/{image['id']}")
        assert response.content==PNG and response.headers['content-type']=='image/png'
        assert response.headers['x-content-type-options']=='nosniff'
        assert second.get('/api/reports/'+rid).json()==report
        update=values(version=1,title='Edited by second browser',images=[],keep_images=[image['id']]).model_dump(mode='json')
        assert second.put('/api/reports/'+rid,json=update).status_code==200
        assert first.put('/api/reports/'+rid,json=update).status_code==409
        assert first.delete('/api/reports/'+rid+'?version=1').status_code==409
        assert first.get('/api/state').json()['document']==before
        assert second.delete('/api/reports/'+rid+'?version=2').status_code==200
        assert first.get('/api/reports').json()=={'reports':[]}
        assert first.get(f'/api/reports/{rid}/images/../../outside').status_code!=200
        assert first.get('/api/reports/'+rid).status_code==400
