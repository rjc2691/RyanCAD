"""Actual-kernel fixture check; run with the project's Python environment."""
import os
from pathlib import Path
import time

os.environ.setdefault("XDG_CACHE_HOME", str(Path(".cache").resolve()))

from ryancad.geometry import Evaluator
from ryancad.model import Actor, Document
from ryancad.public_workspace import seed_document
from ryancad.parameters import evaluate

engine = Evaluator()
for name in ("plate", "mold"):
    document = seed_document(name)
    started = time.perf_counter()
    result = engine.evaluate(document.model_dump(mode="json"))
    print(name, "seconds", round(time.perf_counter() - started, 3), "parameters", len(evaluate(document)))
    for identifier, output in result["components"].items():
        print(document.components[identifier].name, output["status"], output["volume"], output.get("triangles"))
