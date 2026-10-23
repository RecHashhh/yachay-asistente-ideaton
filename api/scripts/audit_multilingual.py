"""Live response audit. Raw institutional text stays in a Git-ignored local file."""
import json
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CASES = {
    'es': [('greeting', 'Hola'), ('location', 'Dónde queda la biblioteca'),
           ('procedure', 'Cómo hago un cambio de carrera'),
           ('residences', 'Qué normas deben cumplir los estudiantes en las residencias universitarias'),
           ('academic', 'Cómo justifico una inasistencia a clases'),
           ('ambiguous', 'Necesito ayuda con una solicitud'),
           ('out_of_domain', 'Dame una receta de pizza'),
           ('unsupported', 'Cuál es el precio de la piscina del campus'),
           ('future_period', 'Cómo cambio de carrera en 2035')],
    'en': [('greeting', 'Hello'), ('location', 'Where is the library?'),
           ('procedure', 'How do I change my major?'),
           ('residences', 'What rules must students follow in university residences?'),
           ('academic', 'How do I justify an absence from class?'),
           ('ambiguous', 'I need help with an application'),
           ('out_of_domain', 'Give me a pizza recipe'),
           ('unsupported', 'What is the price of the campus swimming pool?'),
           ('future_period', 'How do I change my major in 2035?')],
    # Draft test inputs, not linguistically approved reference translations.
    'qu': [('greeting', 'Imanalla'), ('location', 'Maypi biblioteca tiyan?'),
           ('procedure', 'Imashina carrera cambiota rurani?'),
           ('residences', 'Residencias universitarias ukupi ima kamachikkuna tiyan?'),
           ('academic', 'Imashina clasesman mana rishkata justificani?'),
           ('ambiguous', 'Shuk solicitudwan yanapayta munani'),
           ('out_of_domain', 'Pizza rurankapak imashina rurana?'),
           ('unsupported', 'Campus piscinapi yaykunkapak mashna kullki kan?'),
           ('future_period', 'Imashina carrera cambiota rurani 2035 watapi?')],
}


def request_events(opener, lang, question, history=None):
    request = urllib.request.Request('http://127.0.0.1:8000/chat',
        data=json.dumps({'sessionId': 'verif-audit-' + uuid.uuid4().hex[:16], 'message': question,
                         'lang': lang, 'history': history or []}).encode(),
        headers={'Content-Type': 'application/json'})
    with opener.open(request, timeout=90) as response:
        return [json.loads(line[5:]) for line in response.read().decode().splitlines() if line.startswith('data:')]


if __name__ == '__main__':
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    raw, summary = [], []
    for lang, cases in CASES.items():
        for case, question in cases:
            started = time.monotonic()
            try:
                events = request_events(opener, lang, question)
                text = ''.join(e.get('text', '') for e in events if e.get('type') == 'token')
                types = [e.get('type') for e in events]
                sources = [s for e in events if e.get('type') == 'sources' for s in e.get('items', [])]
                warnings = []
                if 'error' in types or 'done' not in types: warnings.append('incomplete_or_error')
                if case == 'location' and not ({'map', 'tool'} & set(types)): warnings.append('missing_location_action')
                if case == 'procedure' and 'procedure' not in types: warnings.append('missing_structured_procedure')
                if not text.strip() and not ({'procedure', 'unknown', 'clarify', 'map', 'tool'} & set(types)): warnings.append('empty_answer')
                row = {'lang': lang, 'case': case, 'events': list(dict.fromkeys(types)),
                       'sourceCount': len(sources), 'characters': len(text),
                       'seconds': round(time.monotonic() - started, 2), 'warnings': warnings,
                       'contentReview': 'pending_manual_review'}
                raw.append({'lang': lang, 'case': case, 'question': question, 'text': text, 'events': events})
            except Exception as error:
                row = {'lang': lang, 'case': case, 'warnings': [type(error).__name__], 'contentReview': 'not_available'}
            summary.append(row)
            print(json.dumps(row, ensure_ascii=True), flush=True)
            # Save incrementally, including if later requests fail.
            local = ROOT / 'api/app/data/auditoria-multilingue.local.json'
            local.write_text(json.dumps(raw, ensure_ascii=False, indent=2), encoding='utf-8')
            public = ROOT / 'docs/kichwa-alki-2026-10-22/auditoria-multilingue.json'
            public.write_text(json.dumps({'scope': 'Live API behavior; does not certify Kichwa grammar. Raw institutional answers remain local and Git-ignored.',
                                          'results': summary}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
