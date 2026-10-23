"""Reproducible local engine timings, including durable acknowledgments."""
from __future__ import annotations

import json
from pathlib import Path
import platform
import statistics
import time
from uuid import uuid4

from ryancad.model import Command
from ryancad.service import CadService


def wait(service, submitted):
    if submitted.get("status") == "complete":
        return submitted["result"]
    deadline = time.monotonic() + 90
    while time.monotonic() < deadline:
        job = service.jobs[submitted["job_id"]]
        if job["status"] == "complete":
            return job["result"]
        if job["status"] in {"cancelled", "failed"}:
            raise RuntimeError(job["error"])
        time.sleep(.002)
    raise TimeoutError("CAD benchmark job timed out")


def command(service, name, args=None):
    start = time.perf_counter()
    wait(service, service.submit("command", command=Command(name=name, args=args or {}, expected_revision=service.document.revision)))
    return (time.perf_counter() - start) * 1000


def distribution(samples):
    return {"samples": len(samples), "median_ms": round(statistics.median(samples), 3),
            "p95_ms": round(sorted(samples)[max(0, int(len(samples) * .95) - 1)], 3),
            "maximum_ms": round(max(samples), 3)}


def main():
    directory = Path(".cache/benchmarks") / uuid4().hex
    service = CadService(directory)
    try:
        cold = command(service, "recipe.load", {"recipe": "mold"})
        root = next(p for p in service.document.parameters.values() if p.name == "Concrete casting diameter")
        geometry, metadata, state = [], [], []
        for index in range(20):
            geometry.append(command(service, "parameter.set", {"id": root.id, "value": 44 + (index + 1) * .1}))
        for index in range(20):
            metadata.append(command(service, "document.rename", {"name": f"Benchmark mold {index}"}))
            start = time.perf_counter()
            service.state()
            state.append((time.perf_counter() - start) * 1000)
        start = time.perf_counter()
        export = wait(service, service.submit("export", expected_revision=service.document.revision))
        export_ms = (time.perf_counter() - start) * 1000
        final = service.state()
        report = {"platform": platform.platform(), "processor": platform.processor(), "python": platform.python_version(),
                  "fixture": {"name": "Four-part mold tooling", "features": len(service.document.features),
                              "parameters": len(service.document.parameters), "instances": final["summary"]["instances"],
                              "triangles": sum(c.get("triangles", 0) for c in final["geometry"].values())},
                  "cold_worker_start_and_first_durable_design_ms": round(cold, 3),
                  "root_edit_including_geometry_and_durable_commit": distribution(geometry),
                  "cached_geometry_metadata_edit_and_durable_commit": distribution(metadata),
                  "state_query": distribution(state), "stl_batch_ms": round(export_ms, 3),
                  "exported_files": len(export["files"]),
                  "conditions": "Local Windows host, .cache project on workspace filesystem, worker persistent, no competing benchmark. Not a GPU/UI or competing-CAD benchmark."}
        target = Path("artifacts/benchmark.json")
        target.parent.mkdir(exist_ok=True)
        target.write_text(json.dumps(report, indent=2), "utf-8")
        print(json.dumps(report, indent=2))
    finally:
        service.close()


if __name__ == "__main__":
    main()
