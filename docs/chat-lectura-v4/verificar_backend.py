"""Verifica eventos de generate sin credenciales, red, modelo ni base de datos."""
import ast
import asyncio
import re
from pathlib import Path
from types import SimpleNamespace

source = ast.parse(Path("api/app/graph.py").read_text(encoding="utf-8"))
node = next(n for n in source.body if isinstance(n, ast.AsyncFunctionDef) and n.name == "generate")
events = []
hit = SimpleNamespace(texto="Título\n\n1. Punto literal.\n\n2. Otro punto.", title="Documento", seccion="Prueba", version="v1", periodo="", doc_id="doc", chunk_id="chunk")
scope = {
    "State": dict, "get_stream_writer": lambda: events.append, "client": None,
    "_t": lambda lang, es, en: en if lang == "en" else es,
    "_say": lambda text: events.append({"type": "token", "text": text}),
    "_source": lambda h: {"docId": h.doc_id}, "_with_wellbeing": lambda sources, state: sources,
    "_quote": lambda text: text, "MARK": re.compile(r"\s?\[F\d+\]"), "re": re,
    "settings": SimpleNamespace(anthropic_model="fake"), "SYSTEM": "test",
    "filters": SimpleNamespace(unsupported_facts=lambda *_: []),
}
exec(compile(ast.Module(body=[node], type_ignores=[]), "<generate-test>", "exec"), scope)

class FakeStream:
    async def __aenter__(self):
        return self
    async def __aexit__(self, *_):
        pass
    @property
    def text_stream(self):
        async def parts():
            yield "### Pasos\n\n1. Punto con fuente. [F1]"
        return parts()
    async def get_final_message(self):
        return SimpleNamespace(usage=SimpleNamespace(input_tokens=12, output_tokens=8))

async def check():
    state = {"lang": "es", "hits": [hit], "question": "Consulta", "history": []}
    await scope["generate"](state)
    assert {"type": "answer_mode", "mode": "extractive"} in events
    assert events.index({"type": "status", "label": "Mostrando fragmento del documento"}) < next(i for i, e in enumerate(events) if e["type"] == "token")
    assert "".join(e["text"] for e in events if e["type"] == "token") == hit.texto.split("\n\n", 1)[1]
    events.clear()
    scope["client"] = SimpleNamespace(messages=SimpleNamespace(stream=lambda **_: FakeStream()))
    await scope["generate"](state)
    assert events[0] == {"type": "status", "label": "Redactando respuesta"}
    assert not any(e["type"] == "answer_mode" for e in events)
    assert "[F1]" not in "".join(e["text"] for e in events if e["type"] == "token")
    assert any(e["type"] == "sources" for e in events)
    print("OK: etapas reales diferenciadas; extractivo conserva el texto; redacción y citas verificadas con cliente simulado.")

asyncio.run(check())
