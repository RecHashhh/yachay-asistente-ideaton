from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ChatTurn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=6000)


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    sessionId: str = Field(min_length=1, max_length=100)
    message: str = Field(min_length=1, max_length=6000)
    lang: Literal["es", "en", "qu"] = "es"
    history: list[ChatTurn] = Field(default_factory=list, max_length=6)
    attachments: list[dict] | None = None


class SourcePayload(BaseModel):
    docId: str
    title: str
    version: str
    docDate: str | None = None
    locator: str | None = None
    snippet: str


class HealthResponse(BaseModel):
    status: Literal["ok"]
    documents: int
    chunks: int
