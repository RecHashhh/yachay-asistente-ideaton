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


class HealthResponse(BaseModel):
    status: Literal["ok"]
    documents: int
    chunks: int


class TranslationReportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    messageId: str = Field(min_length=1, max_length=100)
    lang: Literal['qu'] = 'qu'
    question: str = Field(default='', max_length=6000)
    answer: str = Field(min_length=1, max_length=16000)
    fragment: str = Field(min_length=1, max_length=2000)
    correction: str = Field(default='', max_length=6000)


class TranslationReportResponse(BaseModel):
    id: str
    status: Literal['pending_review'] = 'pending_review'
