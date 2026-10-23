"""Generate portable native references and actual-kernel STL batches."""
from pathlib import Path
import shutil
import time
from uuid import uuid4

from ryancad.model import Actor, Command
from ryancad.service import CadService


def wait(service, submission):
    while True:
        job = service.jobs[submission["job_id"]]
        if job["status"] == "complete":
            return job["result"]
        if job["status"] in {"failed", "cancelled"}:
            raise RuntimeError(job["error"])
        time.sleep(.02)


def main():
    root = Path(__file__).resolve().parents[1]
    output = root / "examples"
    output.mkdir(exist_ok=True)
    for recipe, filename in [("mold", "mold-tooling"), ("plate", "plate-and-pins")]:
        service = CadService(root / ".cache" / "example-builds" / uuid4().hex)
        try:
            actor = Actor(id="reference-library", name="RyanCAD reference library", kind="system")
            wait(service, service.submit("command", actor, command=Command(name="recipe.load", args={"recipe": recipe}, expected_revision=0)))
            service.store.portable_snapshot(output / f"{filename}.rycad.zip")
            exported = wait(service, service.submit("export", expected_revision=service.document.revision))
            source = service.store.directory / "exports" / exported["export_id"]
            destination = output / "stl" / filename
            destination.mkdir(parents=True, exist_ok=True)
            for file in source.iterdir():
                shutil.copy2(file, destination / file.name)
            print(filename, len(exported["files"]), "validated STL files and editable native snapshot")
        finally:
            service.close()


if __name__ == "__main__":
    main()
