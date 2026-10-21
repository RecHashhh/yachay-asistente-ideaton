from collections.abc import AsyncIterator
import json
from typing import Any, TypedDict

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.tools import tool
from langgraph.config import get_stream_writer
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.retrieval import RetrievedChunk, Retriever
from app.schemas import ChatRequest


class AgentState(TypedDict, total=False):
    message: str
    lang: str
    history: list[dict[str, str]]
    retrieved: list[dict[str, Any]]
    unknown: bool
    answer: str


class RagSearchInput(BaseModel):
    query: str = Field(description="La pregunta que debe responderse con el corpus universitario.")
    document_ids: list[str] = Field(
        default_factory=list,
        max_length=5,
        description="Hasta cinco doc_id relevantes del catálogo. Usa una lista vacía si ninguno parece pertinente.",
    )


def _as_chunk(item: dict[str, Any]) -> RetrievedChunk:
    return RetrievedChunk(**item)


def _message_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(part.get("text", "") for part in content if isinstance(part, dict))
    return ""


def _system_prompt(lang: str, context: str) -> str:
    language = {"es": "Spanish", "en": "English", "qu": "Kichwa"}.get(lang, "Spanish")
    return f"""You are the institutional assistant for Yachay Tech. Answer in {language}.
Use only the supplied university source excerpts for factual claims. If the excerpts do not answer the question, say you do not know; do not fill gaps with general knowledge. Be concise and clear. Cite factual claims with the excerpt markers exactly as [S1], [S2], etc. Do not invent dates, document versions, URLs, procedures, contacts, or campus coordinates.

SOURCE EXCERPTS
{context}
"""


def _selection_prompt() -> str:
    return """You select sources for the Yachay Tech institutional assistant.
Review the full document catalog and call search_rag exactly once.
Choose up to five document IDs whose title and description are relevant to the user's question.
If none of the descriptions is relevant, call search_rag with an empty document_ids list to search the full corpus.
Preserve the user's question in the query argument. Do not answer the user in this step."""


class RagAgent:
    def __init__(self, settings: Settings, retriever: Retriever | None = None):
        key = settings.anthropic_api_key.get_secret_value()
        if not key:
            raise RuntimeError("ANTHROPIC_API_KEY es necesaria para generar respuestas")
        self.settings = settings
        self.retriever = retriever or Retriever(settings)
        self.llm = ChatAnthropic(
            model=settings.anthropic_model,
            anthropic_api_key=key,
            max_tokens=700,
        )
    def _build_graph(self, session: AsyncSession):
        async def retrieve_node(state: AgentState) -> dict[str, Any]:
            @tool("list_documents")
            async def list_documents() -> str:
                """Return document IDs, titles, descriptions, types, validity periods, and source URLs."""
                catalog = await self.retriever.list_documents(session)
                return json.dumps(catalog, ensure_ascii=False)

            @tool("search_rag", args_schema=RagSearchInput)
            async def search_rag(query: str, document_ids: list[str] | None = None) -> str:
                """Search the hybrid RAG index within selected documents or across the whole corpus."""
                available_ids = {item["doc_id"] for item in catalog}
                selected_ids = list(dict.fromkeys(
                    doc_id for doc_id in (document_ids or []) if doc_id in available_ids
                ))[:5]
                if selected_ids:
                    found_chunks = await self.retriever.search(session, query, selected_ids)
                    scope = "focused"
                    if not found_chunks:
                        found_chunks = await self.retriever.search(session, query)
                        scope = "global_fallback"
                else:
                    found_chunks = await self.retriever.search(session, query)
                    scope = "global"
                return json.dumps(
                    {"scope": scope, "retrieved": [item.__dict__ for item in found_chunks]},
                    ensure_ascii=False,
                )

            catalog = json.loads(await list_documents.ainvoke({}))
            selector = self.llm.bind_tools(
                [search_rag],
                tool_choice="any",
                parallel_tool_calls=False,
            )
            decision = await selector.ainvoke(
                [
                    SystemMessage(content=_selection_prompt()),
                    HumanMessage(
                        content=(
                            f"Question: {state['message']}\n\n"
                            "DOCUMENT CATALOG (JSON)\n"
                            f"{json.dumps(catalog, ensure_ascii=False)}"
                        )
                    ),
                ]
            )
            tool_calls = getattr(decision, "tool_calls", [])
            search_call = next((call for call in tool_calls if call.get("name") == "search_rag"), None)
            if search_call is None:
                search_result = json.loads(
                    await search_rag.ainvoke({"query": state["message"], "document_ids": []})
                )
            else:
                args = dict(search_call.get("args", {}))
                args.setdefault("query", state["message"])
                args["document_ids"] = list(dict.fromkeys(args.get("document_ids") or []))[:5]
                search_result = json.loads(await search_rag.ainvoke(args))
            found = search_result["retrieved"]
            return {
                "retrieved": found,
                "unknown": not found,
            }

        async def answer_node(state: AgentState) -> dict[str, str]:
            writer = get_stream_writer()
            chunks = [_as_chunk(item) for item in state.get("retrieved", [])]
            context = "\n\n".join(
                f"[S{i}] Document: {item.title} | Section: {item.section or 'not specified'}\n{item.content}"
                for i, item in enumerate(chunks, start=1)
            )
            messages: list[Any] = [SystemMessage(content=_system_prompt(state.get("lang", "es"), context))]
            for turn in state.get("history", [])[-6:]:
                messages.append(HumanMessage(content=turn["content"]) if turn["role"] == "user" else AIMessage(content=turn["content"]))
            messages.append(HumanMessage(content=state["message"]))
            response_parts: list[str] = []
            async for response in self.llm.astream(messages):
                token = _message_text(response.content)
                if token:
                    response_parts.append(token)
                    writer({"type": "token", "text": token})
            return {"answer": "".join(response_parts)}

        async def unknown_node(state: AgentState) -> dict[str, str]:
            writer = get_stream_writer()
            writer({"type": "unknown", "item": {"reason": "sin_fuente"}})
            return {"answer": ""}

        def route_after_retrieval(state: AgentState) -> str:
            return "unknown" if state.get("unknown", True) else "answer"

        graph = StateGraph(AgentState)
        graph.add_node("retrieve", retrieve_node)
        graph.add_node("answer", answer_node)
        graph.add_node("unknown", unknown_node)
        graph.add_edge(START, "retrieve")
        graph.add_conditional_edges("retrieve", route_after_retrieval, {"answer": "answer", "unknown": "unknown"})
        graph.add_edge("answer", END)
        graph.add_edge("unknown", END)
        return graph.compile()

    async def stream(self, request: ChatRequest, session: AsyncSession) -> AsyncIterator[tuple[str, Any]]:
        initial: AgentState = {
            "message": request.message,
            "lang": request.lang,
            "history": [turn.model_dump() for turn in request.history],
        }
        graph = self._build_graph(session)
        async for mode, chunk in graph.astream(initial, stream_mode=["custom", "values"]):
            yield mode, chunk


def source_events(retrieved: list[dict[str, Any]], lang: str = "es") -> list[dict[str, Any]]:
    sources: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in retrieved:
        if item["doc_id"] in seen:
            continue
        seen.add(item["doc_id"])
        sources.append(
            {
                "docId": item["doc_id"],
                "title": item["title"],
                "version": item["validity_period"] or ("Not specified" if lang == "en" else "Sin período especificado"),
                # fecha_consulta no es fecha de emisión; omitimos docDate si la fuente no la da.
                "locator": item["section"] or None,
                "snippet": item["content"][:900],
            }
        )
    return sources
