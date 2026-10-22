"""Exporta las propuestas de preguntas; no las incorpora al diccionario de la interfaz."""
import csv
import json
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1] / 'docs/kichwa-alki-2026-10-22'
questions = json.loads((root / 'consultas-es.json').read_text(encoding='utf-8'))['items']
samples = json.loads((root / 'muestras.json').read_text(encoding='utf-8'))['items']
target = root / 'consultas-revision.csv'
if target.exists() and '--replace-review' not in sys.argv:
    target = root / 'consultas-propuestas.csv'
elif target.exists():
    with target.open(encoding='utf-8-sig', newline='') as old:
        if any(any(row.get(field, '').strip() for field in ['kichwa_revisado', 'revisado_por', 'fecha']) or row.get('aprobada', '').strip().lower() in ['si', 'sí', 'yes', '1', 'true'] for row in csv.DictReader(old, delimiter=';')):
            raise SystemExit('Hay revisión humana en el archivo: no se reemplaza. Usa la exportación normal a consultas-propuestas.csv.')
with target.open('w', encoding='utf-8-sig', newline='') as stream:
    writer = csv.writer(stream, delimiter=';')
    writer.writerow(['clave', 'es', 'propuesta_alki', 'kichwa_revisado', 'estado', 'alertas', 'revisado_por', 'fecha', 'aprobada'])
    for question in questions:
        sample = next((s for s in samples if s['key'] == question['key'] and s['es'] == question['es']), None)
        writer.writerow([question['key'], question['es'], sample['qu'] if sample else '', '', 'pendiente_revision_humana' if sample else 'pendiente_traducir', ','.join(sample.get('flags', [])) if sample else '', '', '', 'no'])
print(f'{len(questions)} preguntas exportadas para revisión en {target.name}. No cambia el chat.')
