from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator


def uid(prefix: str) -> str:
    return f"{prefix}_{uuid4().hex[:12]}"


def now() -> str:
    return datetime.now(timezone.utc).isoformat()


class Model(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False, validate_assignment=True)


class Actor(Model):
    id: str = "local-human"
    name: str = "You"
    kind: Literal["human", "agent", "system"] = "human"
    identity_source: str = "local_session"


class Tolerance(Model):
    minus: float = Field(default=0, ge=0)
    plus: float = Field(default=0, ge=0)


class Parameter(Model):
    id: str
    name: str
    owner: str = "root"
    kind: Literal["length", "angle", "count", "ratio"] = "length"
    expression: str
    category: str = "Dimensions"
    description: str = ""
    favorite: bool = False
    tolerance: Tolerance | None = None
    created_by: str = "local-human"
    modified_by: str = "local-human"


class Feature(Model):
    id: str
    owner: str
    name: str
    type: str
    parameters: dict[str, str] = Field(default_factory=dict)
    references: dict[str, Any] = Field(default_factory=dict)
    options: dict[str, Any] = Field(default_factory=dict)
    suppressed: bool = False
    created_by: str = "local-human"
    modified_by: str = "local-human"
    created_at: str = Field(default_factory=now)


class Component(Model):
    id: str
    name: str
    kind: Literal["assembly", "solid", "planar"] = "solid"
    feature_ids: list[str] = Field(default_factory=list)
    color: str = "#9eafc5"
    description: str = ""
    created_by: str = "local-human"
    modified_by: str = "local-human"
    source_definition: str | None = None
    stock_thickness: str | None = None
    stock_preview: bool = False


class Instance(Model):
    id: str
    name: str
    definition: str
    parent: str = "root"
    placement: dict[str, str] = Field(default_factory=dict)
    visible: bool = True
    suppressed: bool = False
    created_by: str = "local-human"
    pattern_mode: Literal["linear", "circular"] | None = None
    pattern_axis: Literal["X", "Y", "Z"] = "X"
    pattern: dict[str, str] = Field(default_factory=dict)
    omitted_indices: list[int] = Field(default_factory=list)


class Fit(Model):
    id: str
    name: str
    pin_parameter: str
    socket_parameter: str
    convention: Literal["diametral", "radial"] = "diametral"


class Document(Model):
    schema_version: str = "0.2"
    id: str = Field(default_factory=lambda: uid("doc"))
    name: str = "Untitled design"
    revision: int = 0
    display_units: Literal["mm", "in"] = "mm"
    created_at: str = Field(default_factory=now)
    modified_at: str = Field(default_factory=now)
    parameters: dict[str, Parameter] = Field(default_factory=dict)
    components: dict[str, Component] = Field(default_factory=lambda: {
        "root": Component(id="root", name="Design", kind="assembly")
    })
    instances: dict[str, Instance] = Field(default_factory=dict)
    features: dict[str, Feature] = Field(default_factory=dict)
    feature_order: list[str] = Field(default_factory=list)
    fits: dict[str, Fit] = Field(default_factory=dict)
    notes: str = ""
    actors: dict[str, Actor] = Field(default_factory=lambda: {"local-human": Actor()})

    @field_validator("schema_version")
    @classmethod
    def supported_version(cls, value):
        if value != "0.2":
            raise ValueError(f"Unsupported native schema {value!r}; expected 0.2")
        return value


class Command(Model):
    name: str
    args: dict[str, Any] = Field(default_factory=dict)
    expected_revision: int = Field(ge=0)
    request_id: str = Field(default_factory=lambda: uid("req"), min_length=1, max_length=160)
    group_id: str | None = None


class ExportRequest(Model):
    expected_revision: int = Field(ge=0)
    instance_ids: list[str] | None = None
    frame: Literal["part", "assembly"] = "part"
    tolerance: float = Field(default=.03, ge=.001, le=1)
    angular: float = Field(default=.1, ge=.01, le=.5)


class Action(Model):
    id: str = Field(default_factory=lambda: uid("act"))
    revision: int
    timestamp: str = Field(default_factory=now)
    actor: Actor
    command: str
    description: str
    affected: list[str] = Field(default_factory=list)
    group_id: str | None = None
    duration_ms: float = 0
    status: str = "committed"
    steps: list[dict[str, Any]] = Field(default_factory=list)
