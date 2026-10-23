"""Presentation translations must retain source facts and never alter actions."""
import asyncio
from copy import deepcopy
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app import kichwa_presentation as kp


@pytest.fixture
def translation(monkeypatch):
    kp._cache.clear()
    monkeypatch.setattr(kp, '_gate', asyncio.Semaphore(1))
    monkeypatch.setattr(kp, 'settings', SimpleNamespace(anthropic_model='test', has_anthropic_key=True))
    monkeypatch.setattr(kp.usage, 'budget_ok', lambda: True)
    return SimpleNamespace(messages=SimpleNamespace(create=AsyncMock()))


def response(fields):
    return SimpleNamespace(content=[SimpleNamespace(text=json.dumps(fields))], usage=SimpleNamespace(input_tokens=12, output_tokens=8))


@pytest.mark.asyncio
async def test_valid_translation_is_cached_and_usage_recorded(translation, monkeypatch):
    record = []
    monkeypatch.setattr(kp.usage, 'record_anthropic', lambda *args: record.append(args))
    translation.messages.create.return_value = response({'text': '3 punchakuna; info@example.org https://example.org'})
    fields = {'text': '3 días; info@example.org https://example.org'}
    assert (await kp.translate_fields(fields, translation))['text'].startswith('3 puncha')
    assert await kp.translate_fields(fields, translation)
    assert translation.messages.create.await_count == 1
    assert record[0][0] == 'traduccion_presentacion_kichwa'


@pytest.mark.asyncio
@pytest.mark.parametrize('translated', [{'text': '4 punchakuna'}, {'other': '3 punchakuna'}, {'text': ''}, {'text': '3 días'}])
async def test_changed_facts_invalid_shape_and_untranslated_text_are_rejected(translation, translated):
    translation.messages.create.return_value = response(translated)
    assert await kp.translate_fields({'text': '3 días'}, translation) is None
    assert not kp._cache


@pytest.mark.asyncio
async def test_budget_and_switch_prevent_provider_call(translation, monkeypatch):
    monkeypatch.setattr(kp.usage, 'budget_ok', lambda: False)
    assert await kp.translate_fields({'text': 'Tres días'}, translation) is None
    monkeypatch.setattr(kp.usage, 'budget_ok', lambda: True)
    kp.settings.has_anthropic_key = False
    assert await kp.translate_fields({'text': 'Tres días'}, translation) is None
    translation.messages.create.assert_not_called()


@pytest.mark.asyncio
async def test_card_preserves_revision_sources_actions_and_original(translation):
    item = {'id': 'test', 'revision': 'rev', 'title': 'Ejemplo', 'summary': 'Resumen', 'office': 'Secretaría General',
            'source': {'docId': 'test', 'snippet': 'Cita original'}, 'documents': ['Formulario'],
            'steps': [{'title': 'Entregar', 'detail': 'Entregar en 3 días', 'placeId': 'secretaria'}],
            'deadlines': [{'title': 'Plazo', 'start': '2026-10-23', 'end': '2026-10-30'}],
            'links': [{'label': 'Sitio', 'url': 'https://example.org'}]}
    before = deepcopy(item)
    translation.messages.create.side_effect = lambda **kwargs: response({k: 'Kichwa ' + v for k, v in json.loads(kwargs['messages'][0]['content']).items()})
    card = await kp.procedure_card(item, translation)
    assert card['translationStatus'] == 'experimental'
    assert card['original'] == before and item == before
    for key in ('id', 'revision', 'source', 'office'):
        assert card[key] == before[key]
    assert card['steps'][0]['placeId'] == 'secretaria'
    assert card['links'][0]['url'] == item['links'][0]['url']
    assert card['deadlines'][0]['start'] == '2026-10-23'


@pytest.mark.asyncio
async def test_provider_failure_returns_original_card_and_text(translation):
    translation.messages.create.side_effect = RuntimeError('provider unavailable')
    item = {'title': 'Guía', 'documents': [], 'steps': []}
    assert await kp.procedure_card(item, translation) == {**item, 'translationStatus': 'unavailable'}
    assert (await kp.translated_text('Texto original', translation)).endswith('Español:\nTexto original')
