"""Bounded fabrication file adapters. Native intent retains all imported data."""
import io
import math
import struct
import xml.etree.ElementTree as ET

from .errors import CadError


def stl_options(data: bytes):
    triangles = []
    if len(data) >= 84 and 84 + struct.unpack_from('<I', data, 80)[0] * 50 == len(data):
        count = struct.unpack_from('<I', data, 80)[0]
        if count > 5000:
            raise CadError('mesh_limit', 'Import at most 5,000 triangles; simplify the STL first.')
        for i in range(count):
            values = struct.unpack_from('<12fH', data, 84 + 50*i)
            triangles.append([list(values[3:6]), list(values[6:9]), list(values[9:12])])
    else:
        try:
            vertices = [list(map(float, line.split()[1:])) for line in data.decode('ascii').splitlines() if line.split() and line.split()[0]=='vertex']
        except (ValueError, UnicodeError):
            raise CadError('invalid_stl', 'Choose a binary or ASCII STL file.') from None
        if not vertices or len(vertices) % 3:
            raise CadError('invalid_stl', 'STL triangles need three vertices each.')
        triangles = [vertices[i:i+3] for i in range(0, len(vertices), 3)]
    if not 1 <= len(triangles) <= 5000:
        raise CadError('mesh_limit', 'Import 1–5,000 triangles; simplify larger STLs first.')
    if any(len(p) != 3 or any(not math.isfinite(v) or abs(v)>10000 for v in p) for t in triangles for p in t):
        raise CadError('invalid_stl', 'STL coordinates must be finite and within 10,000 mm.')
    return {'triangles': triangles, 'source_format': 'stl', 'units': 'mm'}


def mesh_solid(options):
    import numpy as np
    from build123d import Face, Wire, Shell, Solid
    from .geometry import validate_mesh
    triangles = options.get('triangles', [])
    if not 1 <= len(triangles) <= 5000:
        raise CadError('mesh_limit', 'Import 1–5,000 triangles.')
    vertices = np.asarray(triangles, dtype=float)
    if vertices.shape != (len(triangles), 3, 3) or not np.isfinite(vertices).all() or abs(vertices).max()>10000:
        raise CadError('invalid_stl', 'Invalid STL triangle coordinates.')
    flat = vertices.reshape((-1, 3))
    indices = np.arange(len(flat)).reshape((-1, 3))
    # Accept a consistently inside-out mesh by reversing its whole orientation.
    volume = np.einsum('ij,ij->i', vertices[:,0], np.cross(vertices[:,1], vertices[:,2])).sum()/6
    if volume < 0:
        vertices = vertices[:, ::-1, :].copy()
        flat = vertices.reshape((-1, 3))
    report = validate_mesh(flat, indices)
    if not report['valid']:
        raise CadError('invalid_stl', 'STL must be closed, consistently wound and free of self-intersections.', validation=report)
    try:
        solid = Solid(Shell([Face(Wire.make_polygon(t.tolist(), close=True)) for t in vertices]))
        if not solid.is_valid or solid.volume <= 0:
            raise ValueError()
        return solid
    except Exception:
        raise CadError('invalid_stl', 'STL must describe one connected solid; import separate parts separately.') from None


def svg_entities(data: bytes):
    import svgelements as svg
    if b'\x00' in data or b'<!DOCTYPE' in data.upper() or b'<!ENTITY' in data.upper():
        raise CadError('invalid_svg', 'SVG document types and entities are unsupported.')
    try:
        root = ET.fromstring(data)
        if root.tag.split('}')[-1] != 'svg':
            raise ValueError()
        for node in root.iter():
            tag = node.tag.split('}')[-1]
            if tag in {'text', 'image', 'use', 'script', 'foreignObject', 'clipPath', 'mask', 'filter', 'pattern', 'marker'}:
                raise CadError('unsupported_svg', 'Convert text and reusable symbols to paths; raster images and scripts are unsupported.')
            if any(k.split('}')[-1] in {'href', 'clip-path', 'mask', 'filter'} for k in node.attrib):
                raise CadError('unsupported_svg', 'External SVG references are unsupported.')
        drawing = svg.SVG.parse(io.BytesIO(data), reify=True, ppi=96)
        entities = []
        def line(a, b):
            a, b = (complex(p)*25.4/96 for p in (a,b))
            if abs(a-b)<1e-8: return
            entities.append(dict(id=f'e{len(entities)+1}', type='line', x1=a.real, y1=-a.imag, x2=b.real, y2=-b.imag))
            if len(entities)>200: raise CadError('sketch_limit', 'SVG exceeds 200 sketch entities. Simplify or split it first.')
        for element in drawing.elements():
            if not isinstance(element, svg.Shape): continue
            if isinstance(element, svg.Circle) and abs(float(element.rx)-float(element.ry))<1e-8:
                entities.append(dict(id=f'e{len(entities)+1}', type='circle', x=float(element.cx)*25.4/96, y=-float(element.cy)*25.4/96, radius=float(element.rx)*25.4/96))
                if len(entities)>200: raise CadError('sketch_limit', 'SVG exceeds 200 sketch entities.')
                continue
            for segment in svg.Path(element):
                if isinstance(segment, svg.Move): continue
                if isinstance(segment, (svg.Line, svg.Close)):
                    line(segment.start, segment.end)
                else:
                    def flatten(a, b, depth=0):
                        start, end = complex(float(segment.point(a).x),float(segment.point(a).y)), complex(float(segment.point(b).x),float(segment.point(b).y))
                        error = max(abs(complex(float(segment.point(a+(b-a)*t).x),float(segment.point(a+(b-a)*t).y))-(start+(end-start)*t)) for t in (.25,.5,.75))*25.4/96
                        if error<=.05: line(start,end)
                        elif depth<16:
                            flatten(a,(a+b)/2,depth+1); flatten((a+b)/2,b,depth+1)
                        else: raise CadError('svg_complexity', 'SVG curve is too complex to approximate.')
                    flatten(0,1)
        if not 1<=len(entities)<=200: raise CadError('sketch_limit', 'SVG must contain 1–200 supported sketch entities.')
        return entities
    except CadError: raise
    except Exception:
        raise CadError('invalid_svg', 'The SVG could not be read as fabrication geometry.') from None


def sketch_svg(name, entities):
    nodes, points = [], []
    for e in entities:
        if e.get('construction') or e['type']=='point': continue
        if e['type']=='line':
            a,b=e['start'],e['end']; points.extend([a,b])
            nodes.append(ET.Element('path', d=f'M {a[0]} {a[1]} L {b[0]} {b[1]}'))
        else:
            x,y=e['center']; r=e['radius']; points.extend([(x-r,y-r),(x+r,y+r)])
            if e['type']=='circle': nodes.append(ET.Element('circle',cx=str(x),cy=str(y),r=str(r)))
            else:
                a,b=e['start_angle'],e['end_angle']
                start=(x+r*math.cos(a),y+r*math.sin(a)); end=(x+r*math.cos(b),y+r*math.sin(b))
                nodes.append(ET.Element('path',d=f'M {start[0]} {start[1]} A {r} {r} 0 {int(abs(b-a)>math.pi)} {int(b>a)} {end[0]} {end[1]}'))
    if not points: raise CadError('empty_sketch', 'Select a sketch with non-construction lines or curves.')
    x0,x1=min(p[0] for p in points),max(p[0] for p in points); y0,y1=min(p[1] for p in points),max(p[1] for p in points)
    w,h=max(x1-x0,.001),max(y1-y0,.001)
    root=ET.Element('svg',xmlns='http://www.w3.org/2000/svg',width=f'{w}mm',height=f'{h}mm',viewBox=f'{x0} {-y1} {w} {h}')
    ET.SubElement(root,'title').text=name
    group=ET.SubElement(root,'g',transform='scale(1,-1)',fill='none',stroke='black',attrib={'stroke-width':'0.1'})
    group.extend(nodes)
    return ET.tostring(root,encoding='utf-8',xml_declaration=True)

