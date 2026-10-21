"""Prueba opcional con PostgreSQL configurado: solo tablas temporales, sin datos de la aplicación.

Desde api: .venv/Scripts/python.exe tests/verify_postgres.py
"""
import sys
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import psycopg
from app import main
from app.config import settings


with psycopg.connect(settings.database_url) as connection:
    # El search_path de PostgreSQL resuelve estas tablas antes que las persistentes.
    connection.execute('CREATE TEMP TABLE control_cases (LIKE public.control_cases INCLUDING ALL)')
    connection.execute("ALTER TABLE pg_temp.control_cases ADD CONSTRAINT test_failure CHECK (q <> 'FALLO_SINTETICO')")
    connection.commit()

    @contextmanager
    def isolated():
        with connection.transaction():
            yield connection

    with patch.object(main, 'conn', isolated), patch.object(main, 'audit'):
        first = main.ControlImport(cases=[main.ImportedCase(id='T1', q='Ejemplo', lang='es', expect='no_se')])
        assert main.replace_cases(first, 'test@example.invalid')['total'] == 1
        assert connection.execute('SELECT q FROM pg_temp.control_cases').fetchone()[0] == 'Ejemplo'
        connection.commit()
        failed = main.ControlImport(cases=[
            main.ImportedCase(id='T2', q='Otro ejemplo', lang='es', expect='no_se'),
            main.ImportedCase(id='T3', q='FALLO_SINTETICO', lang='en', expect='no_se'),
        ])
        try:
            main.replace_cases(failed, 'test@example.invalid')
            raise AssertionError('Debió fallar el reemplazo')
        except psycopg.errors.CheckViolation:
            pass
        assert connection.execute('SELECT id FROM pg_temp.control_cases').fetchall() == [('T1',)]
        print('OK: importación guardada y rollback completo ante fallo intermedio, sobre tabla temporal de PostgreSQL.')
