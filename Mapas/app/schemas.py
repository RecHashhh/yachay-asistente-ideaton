from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class ResolveRequest(BaseModel):
    intent: Literal["find_place", "route"]
    place: str | None = Field(default=None, description="Nombre del lugar para find_place")
    origin: str | None = Field(default=None, description="Nombre del origen para route")
    destination: str | None = Field(default=None, description="Nombre del destino para route")
    mode: Literal["walking", "driving"] = "walking"
    limit: int = Field(default=5, ge=1, le=20)
