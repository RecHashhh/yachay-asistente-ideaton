# Corpus para RAG

Prepara los documentos del chatbot de Yachay Tech para indexarlos. **No** crea embeddings ni base vectorial.

## Regenerar

Desde la raíz del proyecto (los HTML enlazados necesitan tener su `.md`; ver paso 0):

```bash
# 0. Una vez: convertir HTML descargados a Markdown (script existente)
uvx --with beautifulsoup4 python -I docs/fuentes_chatbot/convertir_html_a_md.py

# 0b. Una vez: representatividad y mapa desde los materiales del reto
python3 docs/fuentes_chatbot/reto/generar_fuentes_reto.py

# 1. Generar corpus + chunks y verificar
uvx --with "markitdown[pdf]" --with pdfplumber python -I docs/rag/preparar_corpus.py --check
```

La primera ejecución tarda ~1.5 min; las siguientes usan `docs/rag/.cache/` (no versionar).

## Salida

| Archivo | Contenido |
|---|---|
| `fuentes.csv` | Inventario: qué documentos entran (`incluir`) y por qué se excluyen (`motivo`), con URL y período |
| `descripciones.csv` | Resumen breve por `doc_id`, usado para poblar `documents.description` al sincronizar la base RAG |
| `corpus/<doc_id>.md` | Un Markdown limpio por documento, con frontmatter YAML (título, tipo, url, fecha de consulta, período) |
| `chunks.jsonl` | Un chunk por línea: `chunk_id`, `doc_id`, `titulo_doc`, `tipo`, `seccion`, `url`, `periodo_vigencia`, `texto`, `tokens_aprox` |
| `datos/` | Excel originales (consulta exacta) y sus versiones Markdown semánticas para indexación |
| `revision.md` | Supuestos y documentos excluidos que conviene revisar |

`texto` empieza con `Documento: … | Sección: …` para que cada chunk se entienda solo.

## Cómo se prepara cada documento

- **Normas y textos corridos:** markitdown → limpieza (NFC, encabezados/pies repetidos, párrafos unidos) → encabezados por Título/Capítulo/Artículo.
- **PDFs con tablas partidas:** pdfplumber (texto fuera de tablas + tablas por posición), con columnas y filas de continuación fusionadas.
- **Calendarios gráficos:** tabla `fecha | evento` leída por coordenadas.
- **Representatividad y mapa:** `docs/fuentes_chatbot/reto/*.md`, generados desde el pdf/png del reto. En representatividad solo hay cargos y canales (sin nombres ni correos de estudiantes).
- **Excel (aulas y puntos importantes):** los originales se conservan sin cambios en `datos/`; sus tablas se convierten además a Markdown semántico y se incluyen en el corpus para recuperar aulas o sitios por contexto.
- **Matrices anuales de programas:** `docs/normativa_md/programa_*_tabla.md` (reconstruidas a mano).
- **Chunks:** por artículo/sección, entre ~120 y ~800 tokens aproximados (chars/4); los largos se parten con solape.

## Verificación (`--check`)

Todo documento incluido tiene corpus y chunks; ningún chunk vacío, no NFC ni mayor de ~1200 tokens; las páginas web tienen URL; ninguna tabla con más del 40% de celdas vacías.
