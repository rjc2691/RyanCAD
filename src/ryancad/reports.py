"""Server-wide feedback, independent of CAD documents and browser workspaces."""
from __future__ import annotations

import base64
from datetime import date, datetime, timezone
import os
from pathlib import Path
import tempfile
from threading import RLock
from typing import Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, ValidationError
import yaml

from .errors import CadError

MAX_IMAGE_BYTES = 4_000_000
MAX_TOTAL_BYTES = 5_000_000
MAX_IMAGES = 8


class _ReportDumper(yaml.SafeDumper):
    pass


def _text(dumper, value):
    return dumper.represent_scalar("tag:yaml.org,2002:str", value, style="|" if "\n" in value else None)


_ReportDumper.add_representer(str, _text)


class Screenshot(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(pattern=r"^[a-f0-9]{32}$")
    filename: str
    media_type: Literal["image/png", "image/jpeg", "image/webp"]
    size: int


class ImageUpload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    filename: str = Field(min_length=1, max_length=200)
    data: str = Field(max_length=5_333_336)


class ReportInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["bug", "feature"] = "bug"
    title: str = Field(min_length=1, max_length=160)
    date: date
    steps: str = Field(default="", max_length=20000)
    error: str = Field(default="", max_length=20000)
    notes: str = Field(default="", max_length=20000)
    environment: str = Field(default="", max_length=8000)
    version: int | None = None
    keep_images: list[str] = Field(default_factory=list, max_length=MAX_IMAGES)
    images: list[ImageUpload] = Field(default_factory=list, max_length=MAX_IMAGES)


class Report(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str = Field(pattern=r"^[a-f0-9]{32}$")
    kind: Literal["bug", "feature"]
    title: str
    date: date
    steps: str = ""
    error: str = ""
    notes: str = ""
    environment: str = ""
    created_at: str
    updated_at: str
    version: int
    screenshots: list[Screenshot] = Field(default_factory=list)


def image_bytes(upload: ImageUpload):
    try:
        data = base64.b64decode(upload.data, validate=True)
    except ValueError:
        raise CadError("invalid_screenshot", "Screenshot data is not valid base64.") from None
    if not data or len(data) > MAX_IMAGE_BYTES:
        raise CadError("screenshot_limit", "Each screenshot must be no larger than 4 MB.")
    if data.startswith(b"\x89PNG\r\n\x1a\n") and len(data) >= 24 and data[12:16] == b"IHDR":
        media = "image/png"
    elif data.startswith(b"\xff\xd8\xff") and data.endswith(b"\xff\xd9"):
        media = "image/jpeg"
    elif data.startswith(b"RIFF") and len(data) >= 16 and data[8:12] == b"WEBP":
        media = "image/webp"
    else:
        raise CadError("invalid_screenshot", "Screenshots must be PNG, JPEG or WebP images.")
    return data, media


class ReportStore:
    def __init__(self, directory: Path):
        self.directory = directory
        self.manifest = directory / "reports.yaml"
        self.lock = RLock()

    def _read(self) -> list[Report]:
        if not self.manifest.exists():
            return []
        try:
            raw = yaml.safe_load(self.manifest.read_text("utf-8"))
            if not isinstance(raw, dict) or raw.get("version") != 1 or not isinstance(raw.get("reports"), list):
                raise ValueError
            reports = [Report.model_validate(r) for r in raw["reports"]]
            if len({r.id for r in reports}) != len(reports):
                raise ValueError
            return reports
        except (OSError, ValueError, yaml.YAMLError, ValidationError):
            raise CadError("reports_unreadable", "The shared reports file could not be read. It has not been overwritten.") from None

    def _write(self, reports: list[Report]):
        self.directory.mkdir(parents=True, exist_ok=True)
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=self.directory, suffix=".tmp", delete=False) as file:
                temporary = Path(file.name)
                yaml.dump({"version": 1, "reports": [r.model_dump(mode="json") for r in reports]}, file, Dumper=_ReportDumper, sort_keys=False, allow_unicode=True)
                file.flush()
                os.fsync(file.fileno())
            os.replace(temporary, self.manifest)
        finally:
            if temporary:
                temporary.unlink(missing_ok=True)

    def list(self):
        with self.lock:
            return [r.model_dump(mode="json") for r in sorted(self._read(), key=lambda r: r.updated_at, reverse=True)]

    def save(self, values: ReportInput, identifier: str | None = None):
        if not values.title.strip():
            raise CadError("invalid_report", "Give the report a brief title.")
        decoded = [image_bytes(image) for image in values.images]
        with self.lock:
            reports = self._read()
            previous = next((r for r in reports if r.id == identifier), None)
            if identifier and not previous:
                raise CadError("report_missing", "This report was deleted. Refresh the list.")
            if previous and values.version != previous.version:
                raise CadError("stale_revision", "Someone changed this report. Reopen it before saving; your draft is still available.")
            old = {image.id: image for image in previous.screenshots} if previous else {}
            if len(set(values.keep_images)) != len(values.keep_images) or any(i not in old for i in values.keep_images):
                raise CadError("invalid_screenshot", "An attached screenshot is no longer available.")
            kept = [old[i] for i in values.keep_images]
            if len(kept) + len(decoded) > MAX_IMAGES or sum(i.size for i in kept) + sum(len(data) for data, _ in decoded) > MAX_TOTAL_BYTES:
                raise CadError("screenshot_limit", "Use at most 8 screenshots, totaling no more than 5 MB per report.")
            now = datetime.now(timezone.utc).isoformat()
            identifier = previous.id if previous else uuid4().hex
            written = []
            images = []
            try:
                for upload, (data, media) in zip(values.images, decoded):
                    image = Screenshot(id=uuid4().hex, filename=upload.filename, media_type=media, size=len(data))
                    path = self.directory / "screenshots" / identifier / image.id
                    path.parent.mkdir(parents=True, exist_ok=True)
                    path.write_bytes(data)
                    written.append(path)
                    images.append(image)
                report = Report(id=identifier, **values.model_dump(exclude={"version", "keep_images", "images", "title"}), title=values.title.strip(),
                                version=previous.version + 1 if previous else 1, created_at=previous.created_at if previous else now,
                                updated_at=now, screenshots=kept + images)
                self._write([r for r in reports if r.id != identifier] + [report])
            except Exception as error:
                for path in written:
                    try:
                        path.unlink(missing_ok=True)
                    except OSError:
                        pass
                if isinstance(error, OSError):
                    raise CadError("reports_write_failed", "Could not save the report. Check server disk space and folder permissions; your draft has been retained.") from error
                raise
            self._remove_images(identifier, [image for image in old.values() if image.id not in values.keep_images])
            return report.model_dump(mode="json")

    def _remove_images(self, identifier, images):
        for image in images:
            try:
                (self.directory / "screenshots" / identifier / image.id).unlink(missing_ok=True)
            except OSError:
                pass  # A committed report edit must not fail because cleanup failed.

    def delete(self, identifier: str, version: int):
        with self.lock:
            reports = self._read()
            report = next((r for r in reports if r.id == identifier), None)
            if not report:
                raise CadError("report_missing", "This report was already deleted.")
            if report.version != version:
                raise CadError("stale_revision", "Someone changed this report. Refresh before deleting it.")
            try:
                self._write([r for r in reports if r.id != identifier])
            except OSError as error:
                raise CadError("reports_write_failed", "Could not delete the report. Check server disk space and folder permissions.") from error
            self._remove_images(identifier, report.screenshots)

    def image(self, identifier, image_id):
        with self.lock:
            report = next((r for r in self._read() if r.id == identifier), None)
            image = next((i for i in report.screenshots if i.id == image_id), None) if report else None
            if not image:
                raise CadError("report_missing", "This screenshot is no longer available.")
            path = self.directory / "screenshots" / report.id / image.id
            if not path.is_file():
                raise CadError("report_missing", "The screenshot file is missing.")
            return path, image.media_type
