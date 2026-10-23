import numpy as np
import pytest

from ryancad.geometry import validate_mesh
from ryancad.meshcheck import intersecting_triangles


def check_pair(first, second):
    points = np.asarray(first + second, dtype=float)
    return intersecting_triangles(points, np.array([[0, 1, 2], [3, 4, 5]]), np.array([[0, 1, 2], [3, 4, 5]]))


def test_triangle_crossing_coplanar_overlap_and_disjoint_cases():
    first = [[0, 0, 0], [2, 0, 0], [0, 2, 0]]
    assert check_pair(first, [[.5, .5, -1], [.5, .5, 1], [1, 1, 1]])["intersections"] == 1
    assert check_pair(first, [[.5, .5, 0], [1, .5, 0], [.5, 1, 0]])["intersections"] == 1
    assert check_pair(first, [[0, 0, 1], [2, 0, 1], [0, 2, 1]])["intersections"] == 0
    assert check_pair(first, [[2, 2, 0], [3, 2, 0], [2, 3, 0]])["intersections"] == 0


def test_closed_interpenetrating_solids_fail_despite_manifold_individual_shells():
    from build123d import Box
    a, af = Box(10, 10, 10).tessellate(.03)
    b, bf = Box(10, 10, 10).translate((3, 4, 2)).tessellate(.03)
    vertices = np.asarray([[v.X, v.Y, v.Z] for v in a + b])
    faces = np.concatenate((np.asarray(af), np.asarray(bf) + len(a)))
    report = validate_mesh(vertices, faces)
    assert not report["valid"] and report["self_intersection"]["intersections"]
    assert report["boundary_edges"] == report["nonmanifold_edges"] == 0


def test_cavity_shells_and_shared_triangulation_boundaries_are_allowed():
    from build123d import Box
    shape = Box(20, 20, 20).cut(Box(10, 10, 10))
    vertices, faces = shape.tessellate(.03)
    report = validate_mesh(np.asarray([[v.X, v.Y, v.Z] for v in vertices]), np.asarray(faces))
    assert report["valid"] and report["signed_volume_mm3"] == pytest.approx(7000)
