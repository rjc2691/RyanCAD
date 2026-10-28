"""Native validation of grouped operation references (all distances in mm)."""
from .errors import CadError

PATH_TOLERANCE = 1e-6


def connected_path(edges):
    """Order one unbranched chain/loop independently of selection order."""
    from build123d import Wire
    if not edges:
        raise CadError("missing_path", "Select one or more connected path edges.")
    if len(edges) == 1:
        return edges[0]
    nodes, links, adjacency = [], [], []
    def node(point):
        for index, existing in enumerate(nodes):
            if (point-existing).length <= PATH_TOLERANCE:
                return index
        nodes.append(point); adjacency.append([])
        return len(nodes)-1
    for index, edge in enumerate(edges):
        if edge.length <= PATH_TOLERANCE:
            raise CadError("invalid_path", "A selected path edge is too short.")
        a, b = node(edge.position_at(0)), node(edge.position_at(1))
        links.append((a,b)); adjacency[a].append(index); adjacency[b].append(index)
    if any(len(items)>2 for items in adjacency):
        raise CadError("branched_path", "The selected edges branch. Remove the extra branch with Shift-click.")
    ends = [i for i, items in enumerate(adjacency) if len(items)==1]
    if len(ends) not in (0,2):
        raise CadError("disconnected_path", "The selected edges must form one connected chain or closed loop.")
    start = min(ends, key=lambda i: ((nodes[i]-nodes[links[0][0]]).length, i)) if ends else links[0][0]
    used, ordered, current = set(), [], start
    while len(used)<len(edges):
        available = [i for i in adjacency[current] if i not in used]
        if not available:
            raise CadError("disconnected_path", "The selected edges contain a gap or a separate loop. Shift-click to remove it.")
        index=available[0]; a,b=links[index]
        ordered.append(edges[index] if current==a else edges[index].reversed())
        used.add(index); current=b if current==a else a
    try:
        wire=Wire(ordered, sequenced=True)
        if len(wire.edges())!=len(edges) or not wire.is_valid:
            raise ValueError("The edges could not be joined within tolerance.")
        return wire
    except Exception as exc:
        raise CadError("disconnected_path", "The selected edges could not form a continuous native path.", reason=str(exc)[:300]) from exc


def parallel_regions(regions):
    """Keep genuine planar faces, holes, orientation and relative offsets."""
    if not regions:
        raise CadError("missing_profile", "Select planar faces or closed planar sketches.")
    for face in regions:
        if face.geom_type.name != "PLANE":
            raise CadError("nonplanar_profile", "Every selected tool profile must be planar.")
    normal=regions[0].normal_at().normalized()
    if any(abs(normal.dot(face.normal_at().normalized())) < 1-1e-8 for face in regions[1:]):
        raise CadError("nonparallel_profiles", "Tool profiles must lie on coplanar or parallel planes. Shift-click to remove an incompatible profile.")
    return regions


def trim_path_distance(path, distance):
    """Keep exact native arc length from the ordered path start, never a chord."""
    from build123d import PositionMode, Wire
    if not 1e-5 < distance <= path.length + PATH_TOLERANCE:
        raise CadError("invalid_extent", "Sweep distance must be positive and no greater than the selected path length.", path_length=path.length)
    if distance >= path.length - PATH_TOLERANCE: return path
    ordered=path.order_edges() if isinstance(path,Wire) else [path]
    kept=[];remaining=distance
    for edge in ordered:
        if remaining<=PATH_TOLERANCE: break
        if remaining>=edge.length-PATH_TOLERANCE: kept.append(edge);remaining-=edge.length
        else:
            kept.append(edge.trim(0.,edge.position_at(remaining,PositionMode.LENGTH)));break
    return Wire(kept,sequenced=True) if len(kept)>1 else kept[0]


def reverse_path(path):
    """Reverse a single edge or an ordered wire without losing its topology."""
    from build123d import Wire
    return Wire([edge.reversed() for edge in reversed(path.order_edges())],sequenced=True) if isinstance(path,Wire) else path.reversed()
