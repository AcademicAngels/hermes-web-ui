# Hindsight Long-Term Memory Design

## Context

Hermes Web UI currently exposes memory through editable files:

- `MEMORY.md` for general notes.
- `USER.md` for user profile memory.
- `SOUL.md` for agent identity/personality instructions.

That model is useful for explicit, human-editable memory, but it is not enough for long-term, learnable, searchable agent memory. The target system should let Hermes and future agents retain facts, recall relevant memories before a response, and reflect over accumulated experience.

hermes-agent already includes a complete Hindsight plugin (`plugins/memory/hindsight/__init__.py`, 1372 lines) that supports cloud, local_embedded, and local_external modes with retain/recall/reflect tools and automatic prefetch/sync. This design leverages the existing plugin rather than building a new adapter layer.

The selected vector database for personal deployment is PostgreSQL with `pgvector`.

## Goals

- Enable Hindsight as the semantic long-term memory backend for Hermes.
- Reuse hermes-agent's existing Hindsight plugin for runtime retain/recall/reflect.
- Add a thin BFF proxy in Web UI for memory browsing, search, and manual operations.
- Add Docker Compose services for Hindsight and PostgreSQL + pgvector.
- Add Web UI pages for memory status, search, manual retain, and configuration.
- Support flexible embedding providers (local LM Studio, Z.ai/智谱, custom OpenAI-compatible).
- Keep existing Markdown memory files as explicit, user-editable memory.

## Non-Goals

- Replacing `MEMORY.md`, `USER.md`, or `SOUL.md`.
- Building a custom vector database abstraction.
- Building a new Memory Adapter layer — the agent plugin handles runtime operations.
- Training or fine-tuning models.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Integration strategy | Reuse agent plugin | hermes-agent's Hindsight plugin already handles retain/recall/reflect with auto-prefetch and sync. No need to duplicate. |
| Deployment mode | local_external | Docker Compose adds Hindsight + PostgreSQL containers. Agent connects via `HINDSIGHT_MODE=local_external`. |
| Web UI access path | BFF direct to Hindsight | BFF proxies Hindsight REST API. Consistent with existing architecture (frontend → BFF → external service). |
| Tool conflict | Auto-switch | When Hindsight is enabled, automatically disable built-in memory tool via `hermes tools disable memory`. Reverse on disable. |
| Embedding provider | Configurable | Support LM Studio (local), Z.ai/智谱 (cloud), and custom OpenAI-compatible endpoints via environment variables. |

## Architecture

```text
┌──────────────┐                ┌──────────────┐
│ hermes-agent │──local_external──▶│  hindsight   │
│              │                │  (port 8888)  │
└──────────────┘                └──────┬───────┘
       ▲                               │
       │                               ▼
┌──────────────┐                ┌──────────────┐
│ hermes-webui │──BFF direct────▶│  hindsight   │
│  (port 6060) │                │  (same 8888) │
└──────────────┘                └──────┬───────┘
       ▲                               │
       │                               ▼
┌──────────────┐                ┌──────────────┐
│ hermes-proxy │                │  postgres    │
│ (caddy:18960)│                │  (pgvector)  │
└──────────────┘                └──────────────┘
```

Two data paths:
1. **Runtime path**: hermes-agent plugin handles auto-retain (post_llm_call) and auto-recall (pre_llm_call) plus explicit hindsight_retain/recall/reflect tools.
2. **Management path**: Web UI BFF calls Hindsight REST API directly for browsing, searching, manual retain, and status display.

## Deployment

### Docker Compose Services

| Container | Image | Port Mapping | Persistent Volume |
|-----------|-------|-------------|-------------------|
| hermes-agent | nousresearch/hermes-agent | (internal only) | /home/hermes_data → /home/agent/.hermes |
| hermes-webui | hermes-web-ui-nodepty | 16060:6060 | /home/hermes_data → /home/agent/.hermes |
| hermes-proxy | caddy:2-alpine | 18960:80 | caddy_data, caddy_config |
| hindsight | ghcr.io/vectorize-io/hindsight:latest | 18888:8888, 19999:9999 | (stateless, data in postgres) |
| hindsight-postgres | pgvector/pgvector:pg18 | 15432:5432 | /home/hermes_data/hindsight-postgres → /var/lib/postgresql/18/docker |

All persistent data under `/home/hermes_data/` for unified backup.

### Environment Variables

hermes-agent container:
- `HINDSIGHT_MODE=local_external`
- `HINDSIGHT_API_URL=http://hindsight:8888`

hermes-webui container:
- `HINDSIGHT_URL=http://hindsight:8888` (BFF uses this)

hindsight container:
- `HINDSIGHT_API_DATABASE_URL=postgresql://hindsight_user:${HINDSIGHT_DB_PASSWORD}@hindsight-postgres:5432/hindsight_db`
- `HINDSIGHT_API_LLM_API_KEY` — LLM provider API key for reflect operations

### Embedding Provider Configuration

Hindsight container environment variables for embedding:

**Local LM Studio:**
```
HINDSIGHT_API_EMBEDDING_PROVIDER=openai_compatible
HINDSIGHT_API_EMBEDDING_BASE_URL=http://host.docker.internal:1234/v1
HINDSIGHT_API_EMBEDDING_MODEL=text-embedding-nomic-embed-text-v1.5
```

**Z.ai / 智谱 embedding-3:**
```
HINDSIGHT_API_EMBEDDING_PROVIDER=openai_compatible
HINDSIGHT_API_EMBEDDING_BASE_URL=https://open.bigmodel.cn/api/paas/v4
HINDSIGHT_API_EMBEDDING_API_KEY=your-zhipu-api-key
HINDSIGHT_API_EMBEDDING_MODEL=embedding-3
```

**Custom OpenAI-compatible:**
```
HINDSIGHT_API_EMBEDDING_PROVIDER=openai_compatible
HINDSIGHT_API_EMBEDDING_BASE_URL=https://your-endpoint/v1
HINDSIGHT_API_EMBEDDING_API_KEY=your-key
HINDSIGHT_API_EMBEDDING_MODEL=your-model
```

LLM provider for reflect operations reuses the agent's existing provider configuration (e.g., mimo-v2.5 via custom provider).

## Tool Conflict Resolution

hermes-agent has a built-in memory tool that saves to local Markdown files. When both the built-in tool and Hindsight tools are active, the LLM may prefer the built-in one (see [Hindsight Hermes integration docs](https://hindsight.vectorize.io/sdks/integrations/hermes)).

**Auto-switch strategy:**
- When Hindsight is enabled via Settings UI → execute `hermes tools disable memory` to disable the built-in memory tool.
- When Hindsight is disabled via Settings UI → execute `hermes tools enable memory` to restore the built-in tool.
- The file-based memory (MEMORY.md/USER.md/SOUL.md) remains accessible in the "File Memory" tab regardless — these are system prompt injections, not tool-dependent.

This is handled in the Settings controller when the Hindsight enable/disable toggle is changed.

## Backend BFF Layer

### New Files

- `packages/server/src/services/hermes/hindsight-client.ts` — Hindsight REST API client
- `packages/server/src/controllers/hermes/hindsight.ts` — Request handlers
- `packages/server/src/routes/hermes/hindsight.ts` — Route definitions

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/hermes/hindsight/health` | Check Hindsight service status |
| GET | `/api/hermes/hindsight/banks` | List all memory banks |
| GET | `/api/hermes/hindsight/stats` | Memory statistics (counts, bank info) |
| POST | `/api/hermes/hindsight/retain` | Manually store a memory |
| POST | `/api/hermes/hindsight/recall` | Semantic search / recall |
| POST | `/api/hermes/hindsight/reflect` | Synthesized reasoning over memories |

### hindsight-client.ts

- Wraps `fetch` calls to Hindsight REST API
- Reads `HINDSIGHT_URL` from server config (default `http://hindsight:8888`)
- 30s timeout
- Unified error wrapping

### Route Registration

Register `hindsightRoutes` in `packages/server/src/routes/index.ts` in the protected routes section, before `proxyRoutes`.

## Frontend UI

### MemoryView.vue Restructure

Convert existing MemoryView from three-panel layout to tabbed layout:

- **Tab 1: "File Memory"** — Preserves existing MEMORY.md/USER.md/SOUL.md editors unchanged.
- **Tab 2: "Semantic Memory"** — New Hindsight functionality panel.

### Tab 2 "Semantic Memory" Layout

1. **Status bar** (top): Hindsight connection status (online/offline), current bank, total memory count.
2. **Search area**: Input field + "Recall" and "Reflect" buttons, results list below.
3. **Manual retain area**: Content input + context tags + "Retain" button.
4. **Bank list**: All memory banks with statistics.

### New Components

- `components/hermes/memory/HindsightPanel.vue` — Semantic memory main panel
- `components/hermes/memory/MemorySearch.vue` — Search/recall component
- `components/hermes/memory/MemoryRetain.vue` — Manual memory addition
- `components/hermes/memory/MemoryStats.vue` — Status dashboard

### Settings Page Extension (MemorySettings.vue)

Add Hindsight configuration section below existing memory settings:

- Hindsight enable/disable toggle (triggers auto tool switch)
- Hindsight URL input
- Embedding provider selector (LM Studio / Z.ai / Custom)
- Embedding Base URL and API Key inputs
- Connection test button

### Frontend API Module

New file: `packages/client/src/api/hermes/hindsight.ts`

### Store

Extend existing `stores/hermes/settings.ts` with Hindsight configuration state. No new store file.

### i18n

Add `hindsight` namespace keys to all 8 locale files (en, zh, de, es, fr, ja, ko, pt).

## Existing Markdown Memory

The current file-based memory remains fully functional:

- `SOUL.md` stays as explicit agent identity and behavior guidance.
- `USER.md` stays as editable user profile memory.
- `MEMORY.md` stays as editable notes.

These are injected into the system prompt as frozen snapshots at conversation start. They are independent of the Hindsight tool toggle.

## Error Handling

- Hindsight unavailable: Web UI runs normally. "Semantic Memory" tab shows offline status with reconnect hint. "File Memory" tab unaffected.
- retain/recall/reflect timeout (30s): Return timeout error, frontend shows toast notification.
- BFF cannot connect to Hindsight: health endpoint returns `{ available: false, error: "..." }`, frontend displays status accordingly.
- Agent side: hermes-agent's Hindsight plugin has built-in degradation logic. No additional handling needed.

## Testing

### Unit Tests

- hindsight-client request/response mapping, timeout handling, error wrapping.
- Settings controller tool toggle logic (enable/disable memory tool).

### Integration Tests

- Mock Hindsight API to verify retain/recall/reflect BFF flows.
- Settings persistence for Hindsight URL and enablement flags.

### Manual Verification

- Start Docker Compose with all 5 services.
- Verify Hindsight health check passes.
- Retain a test memory via UI.
- Recall that memory from a related query.
- Confirm Hermes responds normally when Hindsight is stopped.

## Phased Delivery

### Phase 1: Service and Configuration

- Add Docker Compose services for Hindsight and PostgreSQL + pgvector.
- Add `HINDSIGHT_URL` server configuration.
- Add health check endpoint.
- Configure hermes-agent with `local_external` mode.

### Phase 2: BFF API + Settings UI + Status Dashboard

- Add hindsight-client, controller, and routes.
- Add retain/recall/reflect API endpoints.
- Extend MemorySettings.vue with Hindsight configuration.
- Add tool auto-switch logic.
- Add MemoryStats component for status dashboard.

### Phase 3: Search/Recall + Manual Retain UI

- Restructure MemoryView.vue to tabbed layout.
- Add HindsightPanel, MemorySearch, MemoryRetain components.
- Add frontend API module and store extensions.
- Add i18n keys to all locales.

### Phase 4: Polish and Testing

- Complete i18n for all 8 locales.
- Add unit and integration tests.
- Manual end-to-end verification.
- Documentation updates.
