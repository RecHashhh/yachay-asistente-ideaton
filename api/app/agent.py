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
    history: list[dict[str, Any]]
    retrieved: list[dict[str, Any]]
    reused_sources: list[dict[str, Any]]
    searched: bool
    unknown: bool
    answer: str


class RagSearchInput(BaseModel):
    query: str = Field(description="La pregunta que debe responderse con el corpus universitario.")
    document_ids: list[str] = Field(
        default_factory=list,
        max_length=5,
        description="Hasta cinco doc_id relevantes del catálogo. Usa una lista vacía para buscar en todo el corpus.",
    )


class HistoryReuseInput(BaseModel):
    turn_index: int = Field(description="Índice base cero del turno del asistente que ya responde la pregunta.")


def _as_chunk(item: dict[str, Any]) -> RetrievedChunk:
    return RetrievedChunk(**item)


def _message_text(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "".join(part.get("text", "") for part in content if isinstance(part, dict))
    return ""


def _source_excerpt(source: dict[str, Any], marker: str) -> str:
    locator = source.get("locator") or "not specified"
    return (
        f"[{marker}] Document: {source.get('title', 'Unknown')} | "
        f"Version: {source.get('version', 'not specified')} | Section: {locator}\n"
        f"{source.get('snippet', '')}"
    )


def _system_prompt(lang: str, context: str) -> str:
    language = {"es": "Spanish", "en": "English", "qu": "Kichwa"}.get(lang, "Spanish")
    return f"""You are the institutional assistant for Yachay Tech. Answer in {language}.
Use only the supplied source excerpts for institutional factual claims. Conversation history may clarify references, but assistant messages are not evidence by themselves. Ignore citation markers in conversation history and cite only markers in the supplied excerpts. If the excerpts do not answer an institutional question, say you do not know; do not fill gaps with general knowledge. Be concise and clear. Cite factual claims with the excerpt markers exactly as [S1], [S2], etc. Do not invent dates, document versions, URLs, procedures, contacts, or campus coordinates. You may respond naturally to greetings and ordinary conversation without sources.

SOURCE EXCERPTS
{context}
"""


def _decision_prompt() -> str:
    return """You decide whether the Yachay Tech assistant needs a tool before answering.
Use the current message and the full recent conversation. Each history turn is labeled with its zero-based index. Source excerpts attached to an assistant turn are labeled with that history index.

- Do not use tools for greetings, thanks, or ordinary small talk.
- If a follow-up is already answered by a prior assistant turn with attached sources, and the user is not asking to verify/update it or for a missing detail, call reuse_history with that turn's index.
- For a new institutional fact, a missing detail, or an explicit request to verify or update, call search_rag. If the catalog would help narrow the search, call list_documents first; otherwise search the full corpus with an empty document_ids list.
- Call at most one tool at a time. If you call list_documents, use its result to decide whether to call search_rag or reuse_history. Never answer in a tool-selection turn.
- Assistant history without attached sources can clarify context but cannot support institutional factual claims.
"""


def _search_after_catalog_prompt() -> str:
    return """The document catalog is available. Select up to five relevant document IDs and call search_rag once for a new or unverified institutional fact. Use an empty document_ids list if none is relevant. If a source-backed prior assistant turn already answers the follow-up and no verification or missing detail was requested, call reuse_history with that turn's index instead. If no tool is needed, do not call one. Do not answer in this step."""


def _decision_messages(
    history: list[dict[str, Any]],
    message: str,
    catalog: list[dict[str, Any]] | None = None,
    after_catalog: bool = False,
) -> list[Any]:
    messages: list[Any] = [SystemMessage(content=_search_after_catalog_prompt() if after_catalog else _decision_prompt())]
    for index, turn in enumerate(history[-6:]):
        role = turn["role"]
        content = f"[HISTORY TURN {index} · {role}]\n{turn['content']}"
        if role == "assistant" and turn.get("sources"):
            excerpts = [
                _source_excerpt(source, f"H{index}-S{source_index}")
                for source_index, source in enumerate(turn["sources"], start=1)
            ]
            content += (
                f"\n\n[SOURCE RECORDS ATTACHED TO HISTORY TURN {index}; validate before reuse]\n"
                + "\n\n".join(excerpts)
            )
        messages.append(HumanMessage(content=content) if role == "user" else AIMessage(content=content))
    current_content = ""
    if catalog is not None:
        current_content += "[DOCUMENT CATALOG (JSON)]\n" + json.dumps(catalog, ensure_ascii=False) + "\n\n"
    current_content += "[CURRENT MESSAGE]\n" + message
    messages.append(HumanMessage(content=current_content))
    return messages


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
            catalog: list[dict[str, Any]] = []
            retrieved: list[RetrievedChunk] = []
            reused_sources: list[dict[str, Any]] = []
            searched = False

            @tool("list_documents")
            async def list_documents() -> str:
                """Return document IDs, titles, descriptions, validity periods, and source URLs."""
                catalog.extend(await self.retriever.list_documents(session))
                return json.dumps(catalog, ensure_ascii=False)

            @tool("search_rag", args_schema=RagSearchInput)
            async def search_rag(query: str, document_ids: list[str] | None = None) -> str:
                """Search the hybrid university RAG index, optionally within selected documents."""
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
                retrieved.extend(found_chunks)
                return json.dumps(
                    {"scope": scope, "retrieved": [item.__dict__ for item in found_chunks]},
                    ensure_ascii=False,
                )

            async def execute_search(args: dict[str, Any]) -> None:
                writer = get_stream_writer()
                label = "Searching the documents…" if state.get("lang") == "en" else "Buscando en los documentos…"
                writer({"type": "status", "label": label})
                await search_rag.ainvoke(args)

            @tool("reuse_history", args_schema=HistoryReuseInput)
            async def reuse_history(turn_index: int) -> str:
                """Reuse a prior source-backed assistant answer after validating its sources against the current index."""
                history = state.get("history", [])[-6:]
                if turn_index < 0 or turn_index >= len(history):
                    return json.dumps({"error": "history_turn_not_found"})
                turn = history[turn_index]
                if turn.get("role") != "assistant" or not turn.get("sources"):
                    return json.dumps({"error": "history_turn_has_no_sources"})
                validated = await self.retriever.validate_history_sources(
                    session,
                    turn["sources"],
                    state.get("lang", "es"),
                )
                reused_sources.extend(validated)
                return json.dumps(
                    {
                        "turn_index": turn_index,
                        "content": turn["content"],
                        "sources": validated,
                    },
                    ensure_ascii=False,
                )

            has_sourced_history = any(
                turn.get("role") == "assistant" and turn.get("sources")
                for turn in state.get("history", [])[-6:]
            )
            tools = [list_documents, search_rag]
            if has_sourced_history:
                tools.append(reuse_history)

            selector = self.llm.bind_tools(tools, tool_choice="auto", parallel_tool_calls=False)
            decision = await selector.ainvoke(_decision_messages(
                state.get("history", []), state["message"]
            ))
            tool_calls = getattr(decision, "tool_calls", [])
            call = next((item for item in tool_calls if item.get("name") in {"list_documents", "search_rag", "reuse_history"}), None)

            if call and call.get("name") == "list_documents":
                await list_documents.ainvoke({})
                follow_up_tools = [search_rag]
                if has_sourced_history:
                    follow_up_tools.append(reuse_history)
                follow_up_selector = self.llm.bind_tools(
                    follow_up_tools,
                    tool_choice="auto",
                    parallel_tool_calls=False,
                )
                decision = await follow_up_selector.ainvoke(_decision_messages(
                    state.get("history", []),
                    state["message"],
                    catalog=catalog,
                    after_catalog=True,
                ))
                tool_calls = getattr(decision, "tool_calls", [])
                call = next((item for item in tool_calls if item.get("name") in {"search_rag", "reuse_history"}), None)

            if call and call.get("name") == "search_rag":
                args = dict(call.get("args", {}))
                args["query"] = args.get("query") or state["message"]
                args["document_ids"] = list(dict.fromkeys(args.get("document_ids") or []))[:5]
                await execute_search(args)
                searched = True
            elif call and call.get("name") == "reuse_history":
                await reuse_history.ainvoke(dict(call.get("args", {})))
                if not reused_sources:
                    # Client history is untrusted; stale or mismatched source records require a fresh retrieval.
                    await execute_search({"query": state["message"], "document_ids": []})
                    searched = True

            found = [item.__dict__ for item in retrieved]
            return {
                "retrieved": found,
                "reused_sources": reused_sources,
                "searched": searched,
                "unknown": searched and not found,
            }

        async def answer_node(state: AgentState) -> dict[str, str]:
            writer = get_stream_writer()
            chunks = [_as_chunk(item) for item in state.get("retrieved", [])]
            context_parts = [
                f"[S{i}] Document: {item.title} | Section: {item.section or 'not specified'}\n{item.content}"
                for i, item in enumerate(chunks, start=1)
            ]
            if not chunks:
                context_parts.extend(
                    _source_excerpt(source, f"S{i}")
                    for i, source in enumerate(state.get("reused_sources", []), start=1)
                )
            context = "\n\n".join(context_parts)
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

        async def unknown_node(_state: AgentState) -> dict[str, str]:
            writer = get_stream_writer()
            writer({"type": "unknown", "item": {"reason": "sin_fuente"}})
            return {"answer": ""}

        def route_after_retrieval(state: AgentState) -> str:
            return "unknown" if state.get("unknown", False) else "answer"

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
            "history": [turn.model_dump(exclude_none=True) for turn in request.history],
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
