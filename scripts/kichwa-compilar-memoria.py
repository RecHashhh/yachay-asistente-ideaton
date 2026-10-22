"""Compila un índice local de entradas con página; no exporta datos de entrenamiento.

python scripts/kichwa-compilar-memoria.py --source docs/rag/kichwa-fuentes-locales/diccionario-2.json
"""
import argparse
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
HEAD = re.compile(r'^([^\[\]\n]{1,70}?)\s*\[[^\]]+\]\s*(.*)$')


def compile_entries(source):
    entries = []
    active = None
    for page in source['pages']:
        for line in page['text'].splitlines():
            match = HEAD.match(line.strip())
            if match:
                if active and active['gloss'].strip():
                    entries.append(active)
                active = {'term': match[1].strip(), 'gloss': match[2].strip(),
                          'document': source['file'], 'pdfPage': page['pdfPage']}
            elif active and not re.fullmatch(r'[\d\W_]+|[A-ZÁÉÍÓÚÑ ]{2,}', line.strip()):
                active['gloss'] += ' ' + line.strip()
            if active:
                active['gloss'] = active['gloss'][:650]
    if active and active['gloss'].strip():
        entries.append(active)
    return entries


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, default=ROOT / 'api/app/data/kichwa.local.json')
    args = parser.parse_args()
    source = json.loads(args.source.read_text(encoding='utf-8'))
    entries = compile_entries(source)
    if not entries:
        parser.error('No se detectaron entradas; requiere revisar la extracción, sin fabricar un índice')
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps({'schemaVersion': 1, 'sourceSha256': source.get('sha256'),
                                      'automaticExtraction': True, 'humanReviewed': False,
                                      'entries': entries}, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'{len(entries)} entradas locales con referencia de página. No constituyen traducciones de frases revisadas.')
