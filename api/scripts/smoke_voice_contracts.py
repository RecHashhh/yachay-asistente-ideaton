"""Local live API checks; no microphone, pronunciation or translation-quality claims."""
import json
import time
import urllib.request
import uuid
from pathlib import Path

BASE = 'http://127.0.0.1:8000'
QUESTIONS = {
    'es': ['Dónde queda la biblioteca', 'Cómo hago un cambio de carrera'],
    'en': ['Where is the library?', 'How do I change my major?'],
    'qu': ['Maypi biblioteca tiyan?', 'Imashina carrera cambiota rurani?'],
}

if __name__ == '__main__':
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    for attempt in range(10):
        try:
            health = json.load(opener.open(BASE + '/health', timeout=5))
            if health.get('status') == 'ok':
                break
        except Exception:
            if attempt == 9:
                raise
            time.sleep(1)
    results = []
    for lang, questions in QUESTIONS.items():
        for i, question in enumerate(questions):
            request = urllib.request.Request(BASE + '/chat',
                data=json.dumps({'sessionId': 'voice-audit-' + uuid.uuid4().hex[:12],
                                 'message': question, 'lang': lang, 'history': []}).encode(),
                headers={'Content-Type': 'application/json'})
            started = time.monotonic()
            lines = opener.open(request, timeout=90).read().decode().splitlines()
            events = [json.loads(line[5:].strip()) for line in lines if line.startswith('data:')]
            types = [event.get('type') for event in events]
            passed = ('map' in types or 'tool' in types) if i == 0 else 'procedure' in types
            result = {'lang': lang, 'question': question, 'case': 'location' if i == 0 else 'procedure',
                      'structuredAction': passed, 'error': 'error' in types,
                      'seconds': round(time.monotonic() - started, 2)}
            results.append(result)
            print(json.dumps(result, ensure_ascii=True), flush=True)
    output = Path(__file__).resolve().parents[2] / 'docs/kichwa-alki-2026-10-22/auditoria-voz-api.json'
    output.write_text(json.dumps({'scope': 'Live local API with synthetic institutional questions; Kichwa examples include institutional Spanish loanwords. Does not validate natural speech or linguistic correctness.',
                                  'results': results}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    assert all(row['structuredAction'] and not row['error'] for row in results), 'Some voice actions are missing'
