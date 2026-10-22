from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class SourcePayload(BaseModel):
    docId: str
    title: str
    version: str
    docDate: str | None = None
    locator: str | None = None
    snippet: str = Field(min_length=1, max_length=900)


class ChatTurn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=6000)
    sources: list[SourcePayload] | None = Field(default=None, max_length=10)


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    sessionId: str = Field(min_length=1, max_length=100)
    message: str = Field(min_length=1, max_length=6000)
    lang: Literal["es", "en", "qu"] = "es"
    history: list[ChatTurn] = Field(default_factory=list, max_length=6)
    attachments: list[dict] | None = None


class EmailIngestRequest(BaseModel):
    # Mensaje RFC 822 completo (.eml) en base64, tal como lo entrega el Email Trigger de n8n en formato RAW.
    raw: str = Field(min_length=1, max_length=30_000_000)


class HealthResponse(BaseModel):
    status: Literal["ok"]
    documents: int
    chunks: int
