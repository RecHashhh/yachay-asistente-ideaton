FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN groupadd --system app && useradd --system --gid app --home-dir /app app

COPY api/requirements.txt /app/requirements.txt
RUN python -m pip install --upgrade pip && python -m pip install -r /app/requirements.txt

COPY --chown=app:app api/app /app/app
COPY --chown=app:app api/sql /app/sql
COPY --chown=app:app api/alembic.ini /app/alembic.ini
COPY --chown=app:app api/migrations /app/migrations
# Caché del modelo de embeddings (fastembed) y archivos subidos desde el Portal: el usuario de la app debe poder escribir.
RUN mkdir -p /app/.cache /app/uploads && chown app:app /app/.cache /app/uploads
COPY --chown=app:app Mapas/app /app/Mapas/app
COPY --chown=app:app Mapas/migrations /app/Mapas/migrations
COPY --chown=app:app Mapas/alembic.ini /app/Mapas/alembic.ini

USER app
EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
