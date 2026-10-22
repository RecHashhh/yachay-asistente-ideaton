import json

from app.kichwa import language_context, load_memory, lookup


def test_lexical_lookup_preserves_document_and_page():
    result = lookup('¿Qué significa KÁWSAY?', local_path='')
    assert result[0]['term'] == 'kawsay'
    assert 'vida' in result[0]['gloss']
    assert result[0]['pdfPage'] == 37
    assert result[0]['document']


def test_unknown_terms_do_not_invent_translations():
    assert lookup('zzzzzzzz', local_path='') == []
    assert lookup('kawsaymanta', local_path='') == []
    assert lookup('kawsay', local_path='', limit=0) == []


def test_optional_local_index_and_limits(tmp_path):
    file = tmp_path / 'dictionary.json'
    file.write_text(json.dumps({'schemaVersion': 1, 'entries': [
        {'term': 'terminoprueba', 'gloss': 'Definición de prueba', 'document': 'PDF de prueba', 'pdfPage': 8},
        {'term': 'invalid', 'gloss': '', 'document': 'PDF', 'pdfPage': -1},
    ]}), encoding='utf-8')
    result = lookup('terminoprueba', local_path=str(file), limit=1)
    assert len(result) == 1
    assert result[0]['pdfPage'] == 8
    assert lookup('invalid', local_path=str(file)) == []


def test_missing_and_broken_optional_index_fall_back(tmp_path):
    for name, content in [('missing.json', None), ('broken.json', '{bad'), ('schema.json', '{"schemaVersion": 0}')]:
        file = tmp_path / name
        if content is not None:
            file.write_text(content, encoding='utf-8')
        assert lookup('kawsay', local_path=str(file))[0]['term'] == 'kawsay'


def test_support_is_only_for_kichwa_and_not_institutional_evidence(monkeypatch):
    monkeypatch.delenv('KICHWA_MEMORY_PATH', raising=False)
    assert language_context('kawsay', 'es') == ''
    assert language_context('kawsay', 'en') == ''
    support = language_context('kawsay', 'qu')
    assert 'NOT INSTITUTIONAL EVIDENCE' in support
    assert 'Answer in Spanish' in support
    assert 'no human-approved conversational translations yet' in support
    assert 'kawsay' in support
    assert 'https://alki.ec/gramatica' in support
    assert load_memory()['humanApprovedConversationalPairs'] == 0
