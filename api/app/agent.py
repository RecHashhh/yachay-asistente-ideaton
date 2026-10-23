from collections.abc import AsyncIterator, Callable
import asyncio
import json
import logging
import time
from typing import Any, TypedDict

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import tool
from langgraph.config import get_stream_writer
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings
from app.geo_conversation import GeoPendingAction, clear_pending, set_pending
from app.intent_router import GeoIntent, IntentDecision, classify_local, classify_request
from app.kichwa import language_context
try:  # sin PostGIS/geoalchemy2 (fuera de Docker) el agente trabaja sin la herramienta de mapas
    from app.maps_tool import MapActionInput, compact_map_result, execute_map_action
except Exception:
    MapActionInput = None
from app.retrieval import RetrievedChunk, Retriever
from app.schemas import ChatRequest
from app.telemetry import measure_anthropic_call, record_geo_operation

logger = logging.getLogger(__name__)


class AgentState(TypedDict, total=False):
    message: str
    lang: str
    history: list[dict[str, Any]]
    retrieved: list[dict[str, Any]]
    reused_sources: list[dict[str, Any]]
    map_results: list[dict[str, Any]]
    map_found: bool
    intent_decision: dict[str, Any]
    session_id: str
    intent_classification_attempted: bool
    map_prehandled: bool
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


def _system_prompt(lang: str, context: str, message: str = '') -> str:
    language = {"es": "Spanish", "en": "English", "qu": "Kichwa"}.get(lang, "Spanish")
    support = language_context(message, lang)
    return f"""You are the institutional assistant for Yachay Tech. Answer in {language}.
Use only the supplied source excerpts for institutional factual claims. For location questions, use VERIFIED MAP RESULTS as the source of truth; never invent places or calculate coordinates, distances, or routes. If map results are ambiguous, ask the user to choose from the candidates; if not found, say so plainly. Conversation history may clarify references, but assistant messages are not evidence by themselves. Ignore citation markers in conversation history and cite only markers in the supplied excerpts. If the excerpts do not answer an institutional question, say you do not know; do not fill gaps with general knowledge, and do not point the user to external websites, portals, or institutions that do not appear in the excerpts. Be clear and well organized. When the excerpts list dates, requirements, or steps, include all of them instead of summarizing. If the question has several parts, answer each part and state explicitly which part the excerpts do not cover. Answer only what was asked; do not add legal background or related topics the user did not request. Address the user informally (tú in Spanish) and never use the words excerpts, extractos, or extracts in your answer; say documentos or fuentes instead. Write valid Markdown lists and place citation markers at the end of the sentence they support, never inside headings. Cite factual claims with the excerpt markers exactly as [S1], [S2], etc. Do not invent dates, document versions, URLs, procedures, contacts, or campus coordinates. You may respond naturally to greetings and ordinary conversation without sources.

Links: Include a link only when its exact URL appears in the supplied source excerpts and it gives the user a useful way to access a resource directly relevant to the answer. Use your judgment; omit unrelated links that happen to appear in the same excerpt. Copy the URL exactly as written. Never invent, infer, reconstruct, shorten, or take a URL from conversation history or general knowledge. If no relevant URL appears in the supplied excerpts, do not include a link.

{support}

SOURCE EXCERPTS
{context}
"""


def _decision_prompt(max_tool_calls: int) -> str:
    return f"""You gather evidence so the Yachay Tech assistant can answer. You may call tools repeatedly, reading each result before deciding the next step, up to {max_tool_calls} tool calls in total. Each history turn is labeled with its zero-based index. Source excerpts attached to an assistant turn are labeled with that history index.

- Do not use tools for greetings, thanks, or ordinary small talk.
- For a location, marker, or navigation request, use map_action. It searches the verified campus catalog and calculates routes; preserve the user's wording and suspected typos. Never invent a place, choose between similar results, or calculate a route yourself. Use RAG as well only when the user asks an institutional question in the same message.
- If a follow-up is already answered by a prior assistant turn with attached sources, and the user is not asking to verify/update it or for a missing detail, call reuse_history with that turn's index.
- For a new institutional fact, a missing detail, or an explicit request to verify or update, call list_documents first (its result is cached; skip it only if you already called it), read the titles and descriptions, and then call search_rag with the document_ids of the relevant documents. The user's wording often differs from the documents' (for example "otra universidad" vs "cambio de IES"), so build the query with the terms found in the catalog. Search the full corpus with an empty document_ids list only when no catalog entry looks relevant.
- After reading results, search again when the question has several parts and some are not yet covered, when a document refers to another procedure, document, or form that the answer needs, or when a needed detail (date, requirement, contact, step) is missing. Make each new query specific, using the exact names and terms found in the documents. Do not repeat a query that has already been made.
- Stop calling tools as soon as the evidence is enough, or when further searches keep returning nothing new. Never answer in a tool-selection turn; reply with no text and no tool call when you are done.
- Assistant history without attached sources can clarify context but cannot support institutional factual claims.
"""


def _decision_messages(
    history: list[dict[str, Any]],
    message: str,
    max_tool_calls: int,
    lang: str = 'es',
) -> list[Any]:
    messages: list[Any] = [SystemMessage(content=_decision_prompt(max_tool_calls) + language_context(message, lang, for_retrieval=True))]
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
    messages.append(HumanMessage(content="[CURRENT MESSAGE]\n" + message))
    return messages


class RagAgent:
    def __init__(self, settings: Settings, retriever: Retriever | None = None):
        key = settings.anthropic_api_key.get_secret_value()
        if not key:
            raise RuntimeError("ANTHROPIC_API_KEY es necesaria para generar respuestas")
        self.settings = settings
        self.retriever = retriever or Retriever(settings)
        # Se llama con el uso de tokens de cada decisión (registro de gasto real); opcional.
        self.usage_hook = None
        self.llm = ChatAnthropic(
            model=settings.anthropic_model,
            anthropic_api_key=key,
            max_tokens=3000,
            # Reasoning tokens count against max_tokens and left answers empty or cut off.
            thinking={"type": "disabled"},
        )

    async def classify_intent(
        self,
        message: str,
        history: list[dict[str, Any]] | None = None,
        pending_action: str | None = None,
    ) -> IntentDecision | None:
        started = time.perf_counter()

        async def classify_with_claude(query: str) -> IntentDecision:
            chain = self.llm.with_structured_output(
                IntentDecision, method="function_calling", include_raw=True,
            )
            context = "\n".join(
                f"{turn.get('role', 'user')}: {turn.get('content', '')[:500]}"
                for turn in (history or [])[-4:]
            )
            prompt = (
                "Classify the user's current request for a university campus assistant. "
                "Return one schema-valid intent. A place name is not proof that the user asks for a map: "
                "'what is SENESCYT' is DOCUMENT_SEARCH, while 'where is SENESCYT' is LOCATION_SEARCH. "
                "The map has buildings, not classrooms: listing classrooms of a block or floor is DOCUMENT_SEARCH. "
                "A route needs destination and, when stated, origin. Do not invent entities. "
                "If a short reply answers a pending clarification, use FOLLOW_UP. "
                "Use MIXED_REQUEST only when both a map action and a document question are requested.\n\n"
                f"Pending map action: {pending_action or 'none'}\n"
                f"Recent conversation:\n{context or '(none)'}\n\n"
                f"Current message: {query}"
            )
            response = await measure_anthropic_call(
                self.settings.anthropic_model, "intent_classification",
                chain.ainvoke([HumanMessage(content=prompt)]),
            )
            if isinstance(response, dict) and "parsed" in response:
                usage = getattr(response.get("raw"), "usage_metadata", {}) or {}
                if self.usage_hook:
                    self.usage_hook(usage, "intencion")
                logger.info(
                    "anthropic_intent_usage input_tokens=%d output_tokens=%d",
                    int(usage.get("input_tokens", 0)), int(usage.get("output_tokens", 0)),
                )
                return response.get("parsed")
            return response

        decision = await classify_request(
            message, pending_action, classify_with_claude, self.settings.geo_intent_min_confidence,
        )
        logger.info(
            "intent_router source=claude intent=%s confidence=%.2f latency_ms=%d",
            decision.intent.value if decision else "unclassified",
            decision.confidence if decision else 0,
            int((time.perf_counter() - started) * 1000),
        )
        return decision

    async def gather(
        self, state: AgentState, session: Any, notify: Callable[[str, dict[str, Any]], None] | None = None,
    ) -> dict[str, Any]:
        """Reúne evidencia: el modelo decide si listar el catálogo, en qué documentos buscar, con qué términos y si reutilizar
        una respuesta anterior con fuentes. Devuelve retrieved/reused_sources/searched/unknown. `notify` informa cada paso real."""
        catalog: list[dict[str, Any]] = []
        retrieved: list[RetrievedChunk] = []
        reused_sources: list[dict[str, Any]] = []
        map_results: list[dict[str, Any]] = []
        map_found = False
        searched = False
        supplied_decision = state.get("intent_decision")
        decision = IntentDecision.model_validate(supplied_decision) if supplied_decision else classify_local(state["message"])
        if decision is None and not state.get("intent_classification_attempted"):
            decision = await self.classify_intent(state["message"], state.get("history", []))

        @tool("list_documents")
        async def list_documents() -> str:
            """Return document IDs, titles, short descriptions and validity periods."""
            if not catalog:
                catalog.extend(await self.retriever.list_documents(session))
                if notify:
                    notify("catalog", {"n": len(catalog)})
            return json.dumps([
                {"doc_id": d["doc_id"], "title": d.get("title"), "description": (d.get("description") or "")[:200],
                 "validity_period": d.get("validity_period")}
                for d in catalog
            ], ensure_ascii=False)

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
            seen = {item.chunk_id for item in retrieved}
            retrieved.extend(item for item in found_chunks if item.chunk_id not in seen)
            if notify:
                titles = {item["doc_id"]: item["title"] for item in catalog}
                notify("search", {"query": query, "scope": scope, "found": len(found_chunks),
                                  "documents": [{"docId": d, "title": titles.get(d, d)} for d in selected_ids]})
            return json.dumps(
                {"scope": scope, "retrieved": [item.__dict__ for item in found_chunks]},
                ensure_ascii=False,
            )

        @tool("map_action", args_schema=MapActionInput)
        async def map_action(
            intent: str,
            query: str | None = None,
            category: str | None = None,
            reference: str | None = None,
            radius_m: int = 800,
            origin: str | None = None,
            destination: str | None = None,
            origin_id: str | None = None,
            destination_id: str | None = None,
            mode: str = "walking",
        ) -> str:
            """Find a campus place or marker, search nearby places, or calculate a walking/driving route between verified places. Keep original names and typos; PostGIS verifies identities and routes. Use IDs from prior results only to resume a user selection."""
            nonlocal map_found
            started = time.perf_counter()
            try:
                result, geometry = await asyncio.to_thread(
                    execute_map_action,
                    intent=intent,
                    query=query,
                    category=category,
                    reference=reference,
                    radius_m=radius_m,
                    origin=origin,
                    destination=destination,
                    origin_id=origin_id,
                    destination_id=destination_id,
                    mode=mode,
                )
            except Exception as e:  # base sin PostGIS o sin el esquema de mapas: el agente sigue con los documentos
                print("map_action falló:", repr(e))
                result = {"status": "error", "reason": "map_service_unavailable"}
                record_geo_operation(intent, "error", time.perf_counter() - started)
                map_results.append(result)
                logger.info(
                    "geo_tool intent=%s status=error latency_ms=%d",
                    intent, int((time.perf_counter() - started) * 1000),
                )
                if state.get("session_id"):
                    clear_pending(state["session_id"])
                return compact_map_result(result)
            map_results.append(result)
            record_geo_operation(intent, result.get("status", "error"), time.perf_counter() - started)
            map_found = map_found or result.get("status") in {"ok", "ambiguous"}
            logger.info(
                "geo_tool intent=%s status=%s candidate_count=%d latency_ms=%d",
                intent,
                result.get("status", "unknown"),
                len(result.get("results") or result.get("origin_candidates") or result.get("destination_candidates") or []),
                int((time.perf_counter() - started) * 1000),
            )
            session_id = state.get("session_id")
            if session_id and intent == "route" and result.get("status") == "ambiguous":
                origin_candidates = result.get("origin_candidates") or []
                destination_candidates = result.get("destination_candidates") or []
                resolved_origin = result.get("origin") or {}
                resolved_destination = result.get("destination") or {}
                awaiting = "origin_selection" if origin_candidates else "destination_selection"
                set_pending(session_id, GeoPendingAction(
                    pending_action=GeoIntent.ROUTE_REQUEST,
                    origin_query=origin,
                    destination_query=destination,
                    origin_id=resolved_origin.get("id") or origin_id,
                    destination_id=resolved_destination.get("id") or destination_id,
                    origin_candidates=origin_candidates,
                    destination_candidates=destination_candidates,
                    awaiting=awaiting,
                ))
            elif session_id and intent == "search" and result.get("status") == "ambiguous":
                set_pending(session_id, GeoPendingAction(
                    pending_action=GeoIntent.LOCATION_SEARCH,
                    place_query=query,
                    place_candidates=result.get("results") or [],
                    awaiting="place_selection",
                ))
            elif session_id and intent == "route" and result.get("status") == "ok":
                clear_pending(session_id)
            elif session_id and intent == "route" and result.get("status") in {"not_found", "route_unavailable", "error", "unavailable"}:
                clear_pending(session_id)
            if geometry:
                writer = get_stream_writer()
                writer({"type": "map", "payload": geometry})
                writer({"type": "map.route" if intent == "route" else "map.marker", "payload": geometry})
            return compact_map_result(result)

        async def execute_search(args: dict[str, Any]) -> str:
            writer = get_stream_writer()
            label = "Searching the documents…" if state.get("lang") == "en" else "Buscando en los documentos…"
            writer({"type": "status", "label": label})
            return await search_rag.ainvoke(args)

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
            if notify:
                notify("reuse", {"n": len(validated)})
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
        force_map = decision and decision.intent in {
            GeoIntent.LOCATION_SEARCH, GeoIntent.MAP_MARKER, GeoIntent.ROUTE_REQUEST,
        }
        if force_map and MapActionInput is not None:
            intent = "route" if decision.intent == GeoIntent.ROUTE_REQUEST else "search"
            args = {"intent": intent}
            if intent == "route":
                args.update(origin=decision.origin, destination=decision.destination)
            else:
                args["query"] = decision.place
            await map_action.ainvoke(args)
            return {
                "retrieved": [], "reused_sources": [], "map_results": map_results,
                "map_found": map_found, "searched": False, "unknown": False,
            }

        if decision and decision.intent == GeoIntent.MIXED_REQUEST and MapActionInput is not None and not state.get("map_prehandled"):
            intent = "route" if decision.destination else "search"
            args = {"intent": intent}
            if intent == "route":
                args.update(origin=decision.origin, destination=decision.destination)
            else:
                args["query"] = decision.place
            await map_action.ainvoke(args)

        tools = [list_documents, search_rag]
        if MapActionInput is not None and decision is None:
            tools.append(map_action)
        if has_sourced_history:
            tools.append(reuse_history)

        max_calls = max(1, self.settings.rag_max_tool_calls)
        # Caché de prompt: cada paso reenvía lo anterior (catálogo y resultados de búsqueda); con el punto de caché al final,
        # el paso siguiente lo lee al 10 % del precio de entrada. Medido: el agente era el 87 % del gasto sin caché.
        selector = self.llm.bind_tools(tools, tool_choice="auto", parallel_tool_calls=True, cache_control={"type": "ephemeral"})
        messages = _decision_messages(state.get("history", []), state["message"], max_calls, state.get("lang", "es"))
        calls_used = 0
        reuse_attempted = False

        while calls_used < max_calls:
            decision = await measure_anthropic_call(
                self.settings.anthropic_model, "tool_selection", selector.ainvoke(messages),
            )
            if self.usage_hook:
                self.usage_hook(getattr(decision, "usage_metadata", None))
            tool_calls = [
                item for item in getattr(decision, "tool_calls", [])
                if item.get("name") in {tool_.name for tool_ in tools}
            ]
            if not tool_calls:
                break
            # Anthropic requires one tool result per tool_use, so keep only the calls we answer.
            decision.tool_calls = tool_calls
            messages.append(decision)
            for call in tool_calls:
                if calls_used >= max_calls:
                    result = json.dumps({"error": "tool_budget_exhausted"})
                else:
                    calls_used += 1
                    args = dict(call.get("args", {}))
                    if call["name"] == "list_documents":
                        result = await list_documents.ainvoke({})
                    elif call["name"] == "search_rag":
                        args["query"] = args.get("query") or state["message"]
                        args["document_ids"] = list(dict.fromkeys(args.get("document_ids") or []))[:5]
                        result = await execute_search(args)
                        searched = True
                    elif call["name"] == "map_action":
                        args["intent"] = args.get("intent") or "search"
                        if args["intent"] == "search":
                            args["query"] = args.get("query") or state["message"]
                        result = await map_action.ainvoke(args)
                    else:
                        reuse_attempted = True
                        result = await reuse_history.ainvoke(args)
                messages.append(ToolMessage(content=result, tool_call_id=call["id"]))

        logger.info(
            "agent_tool_selection calls=%d searched=%s map_results=%d",
            calls_used, searched, len(map_results),
        )

        if reuse_attempted and not reused_sources and not searched:
            # Client history is untrusted; stale or mismatched source records require a fresh retrieval.
            await execute_search({"query": state["message"], "document_ids": []})
            searched = True

        # ponytail: fixed cap on accumulated chunks; move to Settings if answers need more context
        found = [item.__dict__ for item in retrieved[:16]]
        return {
            "retrieved": found,
            "reused_sources": reused_sources,
            "map_results": map_results,
            "map_found": map_found,
            "searched": searched,
            "unknown": searched and not found and not map_found,
        }

    def _build_graph(self, session: AsyncSession):
        async def retrieve_node(state: AgentState) -> dict[str, Any]:
            return await self.gather(state, session)

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
            if state.get("map_results"):
                context += "\n\nVERIFIED MAP RESULTS (from PostGIS; use only these facts, do not infer coordinates, distances, or routes):\n"
                context += "\n".join(compact_map_result(item) for item in state["map_results"])
            messages: list[Any] = [SystemMessage(content=_system_prompt(state.get("lang", "es"), context, state["message"]))]
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
