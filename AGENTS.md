# Repository Guidelines

## Assistant Responses

- Start every response with the exact phrase `Equipo Agente Yachay`.

## Git Attribution

- Never attribute commits to the assistant or add the assistant as a co-author.
- Do not add `Co-authored-by` trailers for the assistant. When committing, retain the repository's configured human author identity; do not change Git identity to the assistant.
- Pushes must not add or alter commit authorship.

## Project Structure

`web/` contains the React 19 and TypeScript frontend built with Vite. Application code lives in `web/src/`: reusable UI in `components/`, page-level views in `views/`, and API, mock, campus, and language helpers in `lib/`. Static files and the embeddable chat widget are in `web/public/`. `rag/` holds corpus source data, prepared Markdown documents, generated chunks, and the Python preparation script. `docs/` contains project documentation.

## Build and Development

Run frontend commands from `web/`:

- `npm install` installs dependencies.
- `npm run dev` starts the local Vite server (normally at `http://localhost:5180`).
- `npm run typecheck` checks TypeScript without emitting files.
- `npm run build` type-checks and creates the production bundle in `web/dist/`.
- `npm run preview` serves the built bundle locally.

To prepare and validate the corpus, follow the current prerequisites and `--check` command in `rag/README.md`; its conversion tools may require `uvx` packages.

## Code Style and Naming

Use the existing TypeScript and React patterns. Keep components in `.tsx` files, utilities and data helpers in `.ts`, and use descriptive `PascalCase` names for React components (for example, `CampusMap.tsx`) and `camelCase` for functions and variables. Match the surrounding two-space indentation and quote/style choices. Keep user-facing text in the existing localization module where practical. There is no configured formatter or linter, so preserve nearby formatting.

## Testing and Validation

No automated test suite is currently configured. For frontend changes, run `npm run typecheck` and `npm run build` from `web/`. For corpus changes, use the preparation script's `--check` validation as documented in `rag/README.md`. Manually verify affected chat, admin, or widget behavior in the development server when relevant.

## Commits and Pull Requests

The available Git history contains a single project-import commit, so no established commit format can be inferred. Use concise, imperative commit subjects that describe the change (for example, `Add bilingual admin empty state`). Pull requests should explain the user-visible change, list validation commands and results, link related issues when available, and include screenshots for visual changes.

## Configuration and Data

Keep credentials and local environment files out of commits. The frontend uses the mock service when `VITE_API_URL` is unset; mock responses are examples and must not be represented as official university information. Treat `rag/corpus/` and generated `rag/chunks.jsonl` as source data: preserve document meaning and metadata when editing or regenerating them.
