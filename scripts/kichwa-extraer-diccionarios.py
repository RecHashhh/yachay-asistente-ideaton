"""Extrae PDF aportados localmente; no sube los originales ni su texto completo."""
import argparse
import hashlib
import json
from pathlib import Path
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('pdf', nargs='+', type=Path)
args = parser.parse_args()
out = ROOT / 'docs/rag/kichwa-fuentes-locales'
out.mkdir(parents=True, exist_ok=True)
for index, file in enumerate(args.pdf, 1):
    target = out / f'diccionario-{index}.json'
    fingerprint = hashlib.sha256(file.read_bytes()).hexdigest()
    existing = json.loads(target.read_text(encoding='utf-8')) if target.exists() else {}
    if existing.get('sha256') == fingerprint:
        print(f'{file.name}: extracción conservada', flush=True)
        continue
    reader = PdfReader(str(file))
    pages = existing.get('pages') if existing.get('file') == file.name and len(existing.get('pages', [])) == len(reader.pages) else None
    if pages is None:
        pages = []
        for page_number, page in enumerate(reader.pages, 1):
            pages.append({'pdfPage': page_number, 'text': page.extract_text() or ''})
            if page_number % 20 == 0:
                print(f'{file.name}: {page_number}/{len(reader.pages)} páginas', flush=True)
    metadata = reader.metadata
    data = {'file': file.name, 'sha256': fingerprint,
            'metadata': {'title': metadata.title, 'author': metadata.author} if metadata else {},
            'pages': pages}
    target.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'{file.name}: {len(pages)} páginas guardadas localmente', flush=True)
