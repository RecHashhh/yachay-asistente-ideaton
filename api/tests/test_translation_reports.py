from contextlib import contextmanager
from unittest.mock import patch
from fastapi.testclient import TestClient
import pytest
from app import main
from types import SimpleNamespace

PAYLOAD = {'messageId': 'm1', 'lang': 'qu', 'question': 'Pregunta de prueba',
           'answer': 'Respuesta de prueba', 'fragment': 'Frase de prueba', 'correction': ''}


def submit(payload, *, fail=False):
    calls = []
    class Connection:
        def execute(self, sql, values):
            if fail:
                raise RuntimeError('database unavailable')
            calls.append((sql, values))

    @contextmanager
    def transaction():
        yield Connection()

    with patch.object(main, 'conn', transaction):
        response = TestClient(main.app).post('/translation-reports', json=payload)
    return response, calls


def test_report_persists_pending_without_approval():
    response, calls = submit(PAYLOAD)
    assert response.status_code == 201
    assert response.json()['status'] == 'pending_review'
    assert response.json()['id'] == calls[0][1][0]
    assert calls[0][0].startswith('INSERT INTO translation_reports')
    assert calls[0][1][-1] == 'pending_review'
    assert calls[0][1][-2] == ''


@pytest.mark.parametrize('changes', [{'fragment': '   '}, {'lang': 'es'}, {'answer': ''},
    {'correction': 'x' * 6001}, {'status': 'approved'}])
def test_invalid_or_self_approved_report_is_rejected(changes):
    response, calls = submit({**PAYLOAD, **changes})
    assert response.status_code == 422
    assert not calls


def test_storage_failure_is_not_reported_as_success():
    response, calls = submit(PAYLOAD, fail=True)
    assert response.status_code == 503
    assert response.json()['detail'] == 'translation_report_unavailable'
    assert not calls


def test_canonical_chat_preserves_kichwa_language():
    seen = []
    async def run(question, lang, history, session_id):
        seen.append(lang)
        yield {'type': 'token', 'text': 'Prueba sintética'}
    with patch.object(main.filters, 'allow', return_value=True), patch.object(main.graph, 'run', run):
        response = TestClient(main.app).post('/chat', json={'sessionId': 'test', 'message': 'Consulta', 'lang': 'qu'})
    assert response.status_code == 200
    assert seen == ['qu']


@pytest.mark.asyncio
@pytest.mark.parametrize('lang, label', [('qu', 'kichwa ecuatoriano'), ('es', 'español')])
async def test_canonical_generator_receives_language_and_language_support(monkeypatch, lang, label):
    from app import graph
    captured = {}
    class Messages:
        def stream(self, **kwargs):
            captured.update(kwargs)
            raise RuntimeError('stop-before-model')
    monkeypatch.setattr(graph, 'client', SimpleNamespace(messages=Messages()))
    monkeypatch.setattr(graph, 'get_stream_writer', lambda: lambda event: None)
    hit = SimpleNamespace(title='Documento sintético', seccion='Prueba', version='test', periodo=None, texto='Cabecera\n\nContenido sintético')
    with pytest.raises(RuntimeError, match='stop-before-model'):
        await graph.generate({'lang': lang, 'question': 'Pregunta sintética', 'hits': [hit]})
    assert f'IDIOMA: {label}' in captured['messages'][-1]['content']
    assert ('KICHWA LANGUAGE SUPPORT' in captured['system']) == (lang == 'qu')
    if lang == 'qu':
        assert 'concise Spanish' in captured['system']


@pytest.mark.asyncio
async def test_experimental_greeting_uses_model_only_for_kichwa(monkeypatch):
    from app import graph
    events = []
    async def create(**kwargs):
        assert 'Answer in Ecuadorian Kichwa' in kwargs['system']
        return SimpleNamespace(content=[SimpleNamespace(text='Saludo sintético')], usage=SimpleNamespace(input_tokens=1, output_tokens=1))
    monkeypatch.setattr(graph, 'client', SimpleNamespace(messages=SimpleNamespace(create=create)))
    monkeypatch.setattr(graph, 'get_stream_writer', lambda: events.append)
    result = await graph.smalltalk({'lang': 'qu', 'question': 'Imanalla', 'triage': 'saludo'})
    assert result['kind'] == 'saludo'
    assert any(event['type'] == 'token' for event in events)
