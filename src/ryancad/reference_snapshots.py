"""Operation-owned geometry and frames; picked objects are construction aids, not links."""
from __future__ import annotations

import base64
import copy
import io
import zlib
from functools import lru_cache

from .errors import CadError


def encode_shape(shape):
    if shape is None:
        return None
    from OCP.BRepTools import BRepTools
    from OCP.TopTools import TopTools_FormatVersion
    stream = io.BytesIO()
    BRepTools.Write_s(shape.wrapped, stream, False, False, TopTools_FormatVersion.TopTools_FormatVersion_VERSION_3)
    return base64.b64encode(zlib.compress(stream.getvalue())).decode("ascii")


@lru_cache(maxsize=128)
def decode_shape(text):
    if text is None:
        return None
    from OCP.BRep import BRep_Builder
    from OCP.BRepTools import BRepTools
    from OCP.TopoDS import TopoDS_Shape
    from build123d import Shape
    try:
        inflater = zlib.decompressobj()
        data = inflater.decompress(base64.b64decode(text, validate=True), 32_000_001)
        if len(data) > 32_000_000 or not inflater.eof:
            raise ValueError("Snapshot exceeds the supported size")
        native = TopoDS_Shape()
        BRepTools.Read_s(native, io.BytesIO(data), BRep_Builder())
        if native.IsNull():
            raise ValueError("Empty snapshot")
        return Shape.cast(native)
    except Exception as exc:
        raise CadError("invalid_reference_snapshot", "An operation's saved reference geometry could not be read.") from exc


def capture_context(feature, context):
    refs = {}
    for key, (source, matrix, ref) in context["refs"].items():
        local = ref.get("component") == feature.owner and not ref.get("sketch") and not ref.get("world")
        selection = {**ref, "component": feature.owner, "occurrence": None, "sketch": None}
        refs[key] = {"local": local, "shape": None if local else encode_shape(source),
                     "matrix": matrix.tolist(), "selection": selection}
    return {"version": 1, "inverse": context["inverse"].tolist(), "refs": refs,
            "profile": encode_shape(context["profile"])}


def restore_context(snapshot, shape):
    import numpy as np
    return {"inverse": np.asarray(snapshot["inverse"], dtype=float), "profile": decode_shape(snapshot.get("profile")),
            "refs": {key: (shape if item["local"] else decode_shape(item.get("shape")),
                           np.asarray(item["matrix"], dtype=float), item["selection"])
                     for key, item in snapshot["refs"].items()}}


def detach_references(document, evaluation):
    for identifier, snapshot in evaluation.get("reference_snapshots", {}).items():
        feature = document.features.get(identifier)
        if not feature:
            continue
        feature.options["reference_snapshot"] = copy.deepcopy(snapshot)
        if feature.type == "operation":
            # The executor still uses the local path selectors and their order.
            feature.references = {key: copy.deepcopy(value) for key, value in feature.references.items()
                                  if key in {"path_reference", "path_references"} and value}
            for key, value in list(feature.references.items()):
                entries = value if isinstance(value, list) else [value]
                feature.references[key] = [{**r, "component": feature.owner, "occurrence": None, "sketch": None}
                                           for r in entries] if isinstance(value, list) else {**value, "component": feature.owner, "occurrence": None, "sketch": None}
        else:
            feature.references = {}
    document.fits.clear()
