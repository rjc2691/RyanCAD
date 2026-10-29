import math
import struct
import time
import xml.etree.ElementTree as ET

import pytest
from fastapi.testclient import TestClient
from ryancad.api import create_app
from ryancad.file_formats import stl_options, mesh_solid, svg_entities, sketch_svg
from ryancad.errors import CadError

SVG=b'<svg xmlns="http://www.w3.org/2000/svg" width="20mm" height="10mm" viewBox="0 0 20 10"><g transform="translate(2 1)"><rect width="8" height="5"/><circle cx="13" cy="4" r="2"/></g></svg>'

def test_svg_units_transforms_and_curves():
    entities=svg_entities(SVG)
    assert len(entities)==5
    assert entities[0]['x1']==pytest.approx(2)
    circle=next(e for e in entities if e['type']=='circle')
    assert circle['radius']==pytest.approx(2)
    assert circle['x']==pytest.approx(15)
    assert circle['y']==pytest.approx(-5)
    curve=svg_entities(b'<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0 C10 0 10 10 20 10"/></svg>')
    assert len(curve)>1

def test_stl_roundtrip_and_invalid_mesh(tmp_path):
    from build123d import Box, export_stl
    path=tmp_path/'cube.stl';export_stl(Box(10,10,10),str(path))
    options=stl_options(path.read_bytes())
    assert mesh_solid(options).volume==pytest.approx(1000)
    options['triangles'].pop()
    with pytest.raises(CadError):mesh_solid(options)
    with pytest.raises(CadError):stl_options(b'not an stl')

@pytest.mark.parametrize('data',[b'<!DOCTYPE svg><svg/>',b'<svg><image href="http://example.com/a.png"/></svg>',b'<svg><text>Text</text></svg>'])
def test_unsupported_svg_is_explicit(data):
    with pytest.raises(CadError):svg_entities(data)

def wait(client,response):
    response.raise_for_status();job=response.json()
    for _ in range(1000):
        if job['status'] in {'complete','failed'}:break
        time.sleep(.02);job=client.get('/api/jobs/'+job['job_id'] if 'job_id' in job else '/api/jobs/'+job['id']).json()
    assert job['status']=='complete',job
    return job['result']

def test_svg_api_import_export_and_native_geometry(tmp_path):
    from build123d import Box, export_stl
    app=create_app(tmp_path/'project','test',testing=True)
    with TestClient(app) as client:
        client.get('/')
        result=wait(client,client.post('/api/import-geometry/svg?revision=0&name=Laser',content=SVG))
        state=client.get('/api/state').json();fid=result['feature_id']
        assert state['document']['features'][fid]['owner']=='root'
        exported=client.post('/api/export-svg',json={'expected_revision':1,'sketches':[fid]})
        assert exported.status_code==200,exported.text
        root=ET.fromstring(exported.content)
        assert root.attrib['width'].endswith('mm')
        assert len(svg_entities(exported.content))==5
        assert client.post('/api/export-svg',json={'expected_revision':0,'sketches':[fid]}).status_code==409
        path=tmp_path/'cube.stl';export_stl(Box(10,10,10),str(path))
        imported=wait(client,client.post('/api/import-geometry/stl?revision=1&name=Cube',content=path.read_bytes()))
        state=client.get('/api/state').json()
        assert state['geometry'][imported['component_id']]['volume']==pytest.approx(1000)
        assert state['document']['features'][imported['feature_id']]['options']['source_format']=='stl'
