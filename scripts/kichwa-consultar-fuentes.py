"""Busca términos en las extracciones locales de los PDF, conservando página y contexto.

python scripts/kichwa-consultar-fuentes.py kawsay pukllay
No traduce ni entrena modelos. Los PDF y extracciones completas permanecen locales.
"""
import argparse
import json
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / 'docs/rag/kichwa-fuentes-locales'


def normalize(text):
    return ''.join(c for c in unicodedata.normalize('NFD', text.casefold()) if unicodedata.category(c) != 'Mn')


def search(terms, limit):
    found = []
    for file in sorted(BASE.glob('diccionario-*.json')):
        source = json.loads(file.read_text(encoding='utf-8'))
        for term in terms:
            count = 0
            for page in source['pages']:
                lines = page['text'].splitlines()
                for index, line in enumerate(lines):
                    if normalize(term) not in normalize(line):
                        continue
                    found.append({'term': term, 'document': source['file'], 'pdfPage': page['pdfPage'],
                                  'excerpt': '\n'.join(lines[max(0, index - 1):index + 4]),
                                  'matchType': 'substring_not_semantic_equivalence'})
                    count += 1
                    if count >= limit:
                        break
                if count >= limit:
                    break
    return found


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('terms', nargs='+')
    parser.add_argument('--limit', type=int, default=4, help='Máximo de coincidencias por término y documento')
    args = parser.parse_args()
    if not any(BASE.glob('diccionario-*.json')):
        parser.error('No hay extracciones locales de los PDF; no se fabrican resultados.')
    if args.limit < 1:
        parser.error('--limit debe ser positivo')
    print(json.dumps(search(args.terms, args.limit), ensure_ascii=False, indent=2))
