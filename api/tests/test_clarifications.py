"""Ambiguous requests ask a question; concrete queries keep their own subject."""
import pytest
from app import graph, procedures, rules


@pytest.mark.parametrize('lang,question', [
    ('es', 'Necesito ayuda con una solicitud'), ('es', 'Quisiera información sobre un trámite'),
    ('es', 'Hola Yachi, necesito ayuda por favor con un trámite'),
    ('es', 'Tengo una duda'), ('es', 'No sé por dónde empezar'),
    ('en', 'I need help with an application'), ('en', 'Could you please help me with a request?'),
    ('en', 'I have a question'), ('en', 'I do not know where to start'),
])
def test_generic_request_has_actionable_options(lang, question):
    answer = rules.clarify(question, lang)
    assert answer and len(answer['options']) == 4
    assert answer['question'] == ('Which procedure do you need?' if lang == 'en' else '¿Qué trámite necesitas hacer?')


@pytest.mark.parametrize('lang,question,topic', [
    ('es', 'Necesito ayuda con las residencias universitarias', 'residencias'),
    ('es', 'Quisiera información sobre los laboratorios', 'laboratorios'),
    ('es', 'Ayúdame con la matrícula por favor', 'matrícula'),
    ('en', 'Please help me with student housing', 'housing'),
    ('en', 'I need information about the laboratories', 'labs'),
])
def test_topic_only_requests_keep_the_topic(lang, question, topic):
    answer = rules.clarify(question, lang)
    assert answer and topic in answer['question']


@pytest.mark.parametrize('question', [
    'Qué normas hay en las residencias', 'Dónde quedan las residencias',
    'Cómo solicito una residencia', 'Cuándo son las matrículas de 2035',
    'Necesito ayuda con una solicitud de beca', 'Quiero solicitar un certificado académico',
    'What are the housing rules?', 'Where are the laboratories?',
    'I need help with a job application', 'How do I submit an application?',
    'What documents do I need?', '¿Y los documentos?', 'de la', 'the',
])
def test_concrete_or_unrelated_query_is_not_replaced(question):
    assert rules.clarify(question, 'es') is None
    assert rules.clarify(question, 'en') is None


@pytest.mark.asyncio
async def test_route_clarifies_without_searching_or_looking_up_places(monkeypatch):
    monkeypatch.setattr(procedures, 'resolve', lambda *args: None)
    def unexpected(*args, **kwargs):
        raise AssertionError('An ambiguous request must not perform a place lookup')
    monkeypatch.setattr(rules, 'room_lookup', unexpected)
    monkeypatch.setattr(rules, 'place_lookup', unexpected)
    state = await graph.route({'question': 'Necesito ayuda con una solicitud', 'lang': 'es', 'history': []})
    assert state['route'] == 'clarify'


@pytest.mark.asyncio
async def test_existing_procedure_followup_has_priority(monkeypatch):
    procedure = {'id': 'synthetic-guide'}
    monkeypatch.setattr(procedures, 'resolve', lambda *args: procedure)
    state = await graph.route({'question': '¿Y los documentos?', 'lang': 'es',
                               'history': [{'role': 'user', 'content': 'Cambio de carrera'}]})
    assert state['route'] == 'procedure' and state['proc'] == procedure
