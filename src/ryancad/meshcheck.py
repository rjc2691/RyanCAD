"""Bounded-memory BVH and separating-axis checks for STL triangle intersections.

Welded vertex-adjacent pairs are excluded: touching along a valid triangulation's
shared boundary is expected. This checks nonadjacent triangles independently of
OCCT's validity check; it is a numerical check, not an exact-arithmetic proof.
"""
from __future__ import annotations

import numpy as np


def intersecting_triangles(vertices, faces, welded, tolerance=1e-7):
    triangles = vertices[faces]
    low, high = triangles.min(axis=1), triangles.max(axis=1)
    centers = (low + high) / 2
    nodes = []

    def build(indices):
        index = len(nodes)
        node = {"low": low[indices].min(axis=0), "high": high[indices].max(axis=0)}
        nodes.append(node)
        if len(indices) <= 12:
            node["triangles"] = indices
        else:
            axis = np.ptp(centers[indices], axis=0).argmax()
            ordered = indices[np.argsort(centers[indices, axis], kind="stable")]
            middle = len(ordered) // 2
            node["children"] = (build(ordered[:middle]), build(ordered[middle:]))
        return index

    if not len(faces):
        return {"intersections": 0, "tested_pairs": 0, "first_pair": None}
    build(np.arange(len(faces)))
    stack, tested = [(0, 0)], 0
    while stack:
        ai, bi = stack.pop()
        a, b = nodes[ai], nodes[bi]
        if np.any(a["high"] < b["low"] - tolerance) or np.any(b["high"] < a["low"] - tolerance):
            continue
        ac, bc = a.get("children"), b.get("children")
        if ai == bi and ac:
            stack.extend([(ac[0], ac[0]), (ac[0], ac[1]), (ac[1], ac[1])])
            continue
        if ac or bc:
            if ac and (not bc or np.prod(a["high"] - a["low"] + tolerance) >= np.prod(b["high"] - b["low"] + tolerance)):
                stack.extend((child, bi) for child in ac)
            else:
                stack.extend((ai, child) for child in bc)
            continue
        x, y = np.meshgrid(a["triangles"], b["triangles"], indexing="ij")
        x, y = x.ravel(), y.ravel()
        mask = (x < y) if ai == bi else (x != y)
        mask &= np.all(high[x] >= low[y] - tolerance, axis=1) & np.all(high[y] >= low[x] - tolerance, axis=1)
        mask &= ~np.any(welded[x, :, None] == welded[y, None, :], axis=(1, 2))
        x, y = x[mask], y[mask]
        if not len(x):
            continue
        first, second = triangles[x], triangles[y]
        e1 = np.roll(first, -1, axis=1) - first
        e2 = np.roll(second, -1, axis=1) - second
        n1, n2 = np.cross(e1[:, 0], e1[:, 1]), np.cross(e2[:, 0], e2[:, 1])
        # Face normals, edge cross-products and coplanar in-plane axes.
        axes = np.concatenate((n1[:, None], n2[:, None],
                               np.cross(e1[:, :, None], e2[:, None, :]).reshape(-1, 9, 3),
                               np.cross(n1[:, None], e1), np.cross(n2[:, None], e2)), axis=1)
        norms = np.linalg.norm(axes, axis=2)
        p = np.einsum("pvc,pac->pav", first, axes)
        q = np.einsum("pvc,pac->pav", second, axes)
        separated = ((p.max(axis=2) < q.min(axis=2) - tolerance * norms) |
                     (q.max(axis=2) < p.min(axis=2) - tolerance * norms)) & (norms > 1e-14)
        collision = ~np.any(separated, axis=1)
        tested += len(x)
        if np.any(collision):
            at = np.flatnonzero(collision)[0]
            return {"intersections": 1, "tested_pairs": tested, "first_pair": [int(x[at]), int(y[at])], "stopped_at_first": True}
    return {"intersections": 0, "tested_pairs": tested, "first_pair": None, "stopped_at_first": False}
