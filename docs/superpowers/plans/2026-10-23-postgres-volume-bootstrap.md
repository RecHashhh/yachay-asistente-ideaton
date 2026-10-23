# PostgreSQL existing-volume bootstrap implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Docker Compose start the unified application database even when its persistent PostgreSQL volume was initialized with a different database name, while preserving all existing databases and data.

**Architecture:** Make the DB healthcheck test server availability against the built-in administrative `postgres` database, then run a one-shot idempotent bootstrap container that connects administratively and creates the configured `POSTGRES_DB` only when missing. Make `seed` wait for bootstrap completion; retain existing migration and import behavior.

**Tech Stack:** Docker Compose, PostgreSQL, Python, psycopg, pytest.

**Spec:** `docs/superpowers/specs/2026-10-23-mapas-multiparada-y-bootstrap-postgres-design.md`

## Global Constraints

- Never delete/recreate the PostgreSQL volume or any existing database.
- Create only the configured target database when it is absent.
- The bootstrap must be idempotent and use safe SQL identifier quoting.
- `seed` must not start until the target database exists.
- Existing migrations, OSM imports, and RAG seed behavior stay unchanged.

## Review Focus

- The target DB name may include a non-default but valid identifier and must be safely quoted.
- A second bootstrap run must leave an existing target database and its contents unchanged.
- A missing administrative connection or lack of CREATEDB must fail clearly without dropping or altering any DB.
- Health must not be green solely because the PostgreSQL server responds while the application DB is absent.
- The service dependency graph must not deadlock by making bootstrap depend on the app database healthcheck.

---

### Task 1: Idempotent database bootstrap module

**Files:**
- Create: `api/app/bootstrap_db.py`
- Test: `api/tests/test_bootstrap_db.py`

**Interfaces:**
- Produces: `ensure_database(admin_connection: psycopg.Connection, database_name: str) -> bool`, returning whether the DB was created; CLI connects with keyword parameters read from `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST`, and `POSTGRES_PORT`, using `postgres` as the administrative database and `POSTGRES_DB` as the target. Keyword connection parameters avoid hand-built URL/password escaping.

- [ ] **Step 1: Write failing unit tests**

Add `test_ensure_database_creates_missing_database`, `test_ensure_database_is_idempotent_when_target_exists`, `test_ensure_database_quotes_target_identifier`, and `test_ensure_database_surfaces_create_permission_errors`. Assert no `DROP`, rename, or target-database mutation statements are issued.

- [ ] **Step 2: Run tests and confirm expected failures**

Run: `cd api && PYTHONPATH=.:.. pytest tests/test_bootstrap_db.py -q`
Expected: fails because `app.bootstrap_db` does not exist; it must not fail from missing Python dependencies.

- [ ] **Step 3: Implement the minimal bootstrap**

Use `psycopg.connect(..., dbname="postgres", autocommit=True)` with separate keyword parameters, inspect `pg_database` with a parameterized value, and create only if absent using `psycopg.sql.Identifier`. Log whether the database was created or already present; let failures exit non-zero with the database name and actionable error.

- [ ] **Step 4: Run bootstrap tests**

Run: `cd api && PYTHONPATH=.:.. pytest tests/test_bootstrap_db.py -q`
Expected: all tests pass.

### Task 2: Compose ordering and correct readiness check

**Files:**
- Modify: `docker-compose.yml`
- Create: `api/tests/test_compose_database_bootstrap.py`

- [ ] **Step 1: Write a failing Compose dependency contract test**

Add `test_compose_bootstraps_target_database_before_seed`, which invokes `docker compose config --format json`, parses the output with the Python standard library, and asserts the DB healthcheck targets `postgres`, `db-bootstrap` waits for healthy `db`, and `seed` waits for `db-bootstrap` to complete successfully. Skip only if the Docker Compose executable is unavailable.

- [ ] **Step 2: Confirm the test fails on current Compose**

Run: `cd api && PYTHONPATH=.:.. pytest tests/test_compose_database_bootstrap.py -q`
Expected: failure identifies the missing bootstrap service and old dependency/readiness contract.

- [ ] **Step 3: Implement safe service ordering**

Set DB healthcheck to `pg_isready` against administrative `postgres`. Add `db-bootstrap` using the API image and separate connection environment parameters (`POSTGRES_USER`, `POSTGRES_PASSWORD`, host `db`, port `5432`, administrative DB `postgres`, and target `POSTGRES_DB`). Make it wait for healthy DB and make `seed` wait for successful bootstrap. Do not change volume names or add cleanup operations.

- [ ] **Step 4: Validate Compose and unit suite**

Run `docker compose config` and `cd api && PYTHONPATH=.:.. pytest tests/test_bootstrap_db.py tests/test_compose_database_bootstrap.py -q`.
Expected: Compose renders successfully; bootstrap tests pass.

### Task 3: Verify recovery on existing data without destructive reset

- [ ] **Step 1: Run full API tests and inspect the Compose changes**

Run: `cd api && PYTHONPATH=.:.. pytest -q`; review the diff to confirm no volume deletion, `down -v`, `dropdb`, database rename, or overwrite was introduced.

- [ ] **Step 2: Verify both volume states when Docker is available**

With a fresh test volume and with a disposable test volume initialized using a different DB name, run Compose and verify the configured database appears, the original database still exists, and both have their expected contents. Do not use the user's real volume for the disposable-volume scenario.

- [ ] **Step 3: Document the user launch command**

Provide `docker compose up --build` from the repository root, with `docker compose logs -f db db-bootstrap seed api` for diagnosis and `http://localhost:8000/health` for readiness. Explain that this repair preserves the volume.

