"""Importa exclusivamente traducciones de interfaz revisadas; no llama servicios externos.

python scripts/kichwa-aprobar.py --check
python scripts/kichwa-aprobar.py --input docs/kichwa-alki-2026-10-22/revision.csv
"""
import argparse
import csv
import json
import re
import subprocess
from collections import Counter
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def validate(rows, current):
    approved = {}
    seen = set()
    for row in rows:
        key = row.get('clave', '')
        if key in seen:
            raise ValueError(f'Clave duplicada: {key}')
        seen.add(key)
        if row.get('aprobada', '').strip().lower() not in {'si', 'sí', 'yes', 'true', '1'}:
            continue
        if key not in current or row.get('es') != current[key]:
            raise ValueError(f'{key}: el texto español cambió; requiere nueva revisión')
        translated = row.get('kichwa_revisado', '').strip()
        if not translated or not row.get('revisado_por', '').strip():
            raise ValueError(f'{key}: falta traducción revisada o responsable')
        try:
            date.fromisoformat(row.get('fecha', ''))
        except ValueError as exc:
            raise ValueError(f'{key}: fecha de revisión inválida (AAAA-MM-DD)') from exc
        variables = lambda s: Counter(re.findall(r'\{(\w+)\}', s))
        if variables(current[key]) != variables(translated):
            raise ValueError(f'{key}: variables ausentes, añadidas o repetidas')
        approved[key] = translated
    return approved


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--input', type=Path, default=ROOT / 'docs/kichwa-alki-2026-10-22/revision.csv')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    current = json.loads(subprocess.check_output(['node', str(ROOT / 'scripts/kichwa-preparar.cjs'), '--current'], cwd=ROOT).decode('utf-8'))
    with args.input.open(encoding='utf-8-sig', newline='') as source:
        approved = validate(csv.DictReader(source, delimiter=';'), current)
    if not approved or args.check:
        print(f'{len(approved)} traducciones aprobadas válidas. No se modificó la interfaz.')
        return
    target = ROOT / 'web/src/lib/kichwa.approved.json'
    # Reemplazo completo del catálogo revisado: no usar un CSV parcial para actualizarlo.
    temporary = target.with_suffix('.json.tmp')
    temporary.write_text(json.dumps(approved, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(target)
    print(f'{len(approved)} traducciones revisadas importadas. Ejecuta npm --prefix web run build.')


if __name__ == '__main__':
    main()
