"""Verificación de lectura contra corpus/base locales. No llama al modelo ni registra consultas.

Desde api: .venv/Scripts/python.exe tests/verify_guides_live.py
"""
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import graph, procedures
from app.config import settings
from app.db import open_pool, pool


async def check():
    open_pool()
    try:
        seeds = json.loads((settings.rag_dir / 'tramites.json').read_text(encoding='utf-8'))
        catalog = procedures._all()
        assert {p['id'] for p in catalog} == {p['id'] for p in seeds}, 'Una guía no tiene evidencia disponible'
        by_id = {p['id']: p for p in catalog}
        checks = 0
        for seed in seeds:
            p = by_id[seed['id']]
            for lang in ('es', 'en'):
                question = seed[f'triggers_{lang}'][0]
                state = await graph.route({'question': question, 'lang': lang, 'history': []})
                assert state['route'] == 'procedure' and state['proc']['id'] == p['id'], f'Ruta incorrecta: {p["id"]}/{lang}'
                payload, sources, ids = graph.procedure_payload(p, lang)
                assert payload['steps'] and payload['source'] and sources and p['doc_id'] in ids
                assert payload['revision'] == procedures.card(p, 'es')[0]['revision']
                followup = 'What documents do I need?' if lang == 'en' else '¿Y los documentos?'
                state = await graph.route({'question': followup, 'lang': lang, 'history': [{'role': 'user', 'content': question}]})
                assert state['route'] == 'procedure' and state['proc']['id'] == p['id']
                checks += 2
        print(f'OK: {len(catalog)} guías activas con evidencia, fuentes y revisiones; {checks} comprobaciones de rutas y seguimiento ES/EN. Solo lectura, sin modelo.')
    finally:
        pool.close()


asyncio.run(check())
