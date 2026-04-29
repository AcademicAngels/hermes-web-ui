# Hindsight Long-Term Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Hindsight semantic long-term memory into Hermes Web UI via Docker Compose services, a BFF proxy layer, and frontend UI for browsing/searching/retaining memories.

**Architecture:** Docker Compose adds `hindsight` + `hindsight-postgres` containers. hermes-agent connects via its existing Hindsight plugin (`local_external` mode). Web UI BFF proxies Hindsight REST API for management operations. Frontend adds tabbed MemoryView with semantic memory panel and Settings configuration.

**Tech Stack:** Docker Compose, PostgreSQL 18 + pgvector, ghcr.io/vectorize-io/hindsight, Koa 2 (BFF), Vue 3 + Naive UI (frontend), TypeScript

## File Map

### New Files

| File | Responsibility |
|------|---------------|
| `packages/server/src/services/hermes/hindsight-client.ts` | HTTP client wrapping Hindsight REST API |
| `packages/server/src/controllers/hermes/hindsight.ts` | Request handlers for hindsight BFF endpoints |
| `packages/server/src/routes/hermes/hindsight.ts` | Route definitions for `/api/hermes/hindsight/*` |
| `packages/client/src/api/hermes/hindsight.ts` | Frontend API module for hindsight endpoints |
| `packages/client/src/components/hermes/memory/HindsightPanel.vue` | Semantic memory main panel (Tab 2) |
| `packages/client/src/components/hermes/memory/MemorySearch.vue` | Search/recall component |
| `packages/client/src/components/hermes/memory/MemoryRetain.vue` | Manual memory addition component |
| `packages/client/src/components/hermes/memory/MemoryStats.vue` | Status dashboard component |
| `tests/server/hindsight-client.test.ts` | Unit tests for hindsight client |

### Modified Files

| File | Change |
|------|--------|
| `docker-compose.yml` | Add `hindsight` and `hindsight-postgres` services |
| `packages/server/src/config.ts` | Add `hindsightUrl` config field |
| `packages/server/src/routes/index.ts` | Register `hindsightRoutes` before proxy |
| `packages/server/src/services/hermes/hermes-cli.ts` | Add `toggleMemoryTool` function |
| `packages/client/src/api/hermes/config.ts` | Extend `MemoryConfig` with hindsight fields |
| `packages/client/src/views/hermes/MemoryView.vue` | Restructure to tabbed layout |
| `packages/client/src/components/hermes/settings/MemorySettings.vue` | Add Hindsight config section |
| `packages/client/src/i18n/locales/*.ts` | Add hindsight i18n keys (all 8 locales) |

### Task 1: Docker Compose — Add Hindsight and PostgreSQL Services

**Files:**
- Modify: `docker-compose.yml`

- [ ] **Step 1: Add hindsight-postgres and hindsight services to docker-compose.yml**

After the existing `hermes-webui` service and before the `volumes:` section, add:

```yaml
  hindsight-postgres:
    image: pgvector/pgvector:pg${HINDSIGHT_DB_VERSION:-18}
    container_name: hindsight-postgres
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${HINDSIGHT_DB_USER:-hindsight_user}
      POSTGRES_PASSWORD: ${HINDSIGHT_DB_PASSWORD:-hindsight_pass}
      POSTGRES_DB: ${HINDSIGHT_DB_NAME:-hindsight_db}
    volumes:
      - ${HERMES_DATA_DIR:-./hermes_data}/hindsight-postgres:/var/lib/postgresql/data
    networks:
      - hindsight-net

  hindsight:
    image: ghcr.io/vectorize-io/hindsight:${HINDSIGHT_VERSION:-latest}
    container_name: hindsight-app
    restart: unless-stopped
    ports:
      - "${HINDSIGHT_PORT:-18888}:8888"
      - "${HINDSIGHT_UI_PORT:-19999}:9999"
    environment:
      - HINDSIGHT_API_DATABASE_URL=postgresql://${HINDSIGHT_DB_USER:-hindsight_user}:${HINDSIGHT_DB_PASSWORD:-hindsight_pass}@hindsight-postgres:5432/${HINDSIGHT_DB_NAME:-hindsight_db}
      - HINDSIGHT_API_LLM_API_KEY=${HINDSIGHT_LLM_API_KEY:-}
      - HINDSIGHT_API_EMBEDDING_PROVIDER=${HINDSIGHT_EMBEDDING_PROVIDER:-openai_compatible}
      - HINDSIGHT_API_EMBEDDING_BASE_URL=${HINDSIGHT_EMBEDDING_BASE_URL:-}
      - HINDSIGHT_API_EMBEDDING_API_KEY=${HINDSIGHT_EMBEDDING_API_KEY:-}
      - HINDSIGHT_API_EMBEDDING_MODEL=${HINDSIGHT_EMBEDDING_MODEL:-}
    depends_on:
      - hindsight-postgres
    networks:
      - hindsight-net
```

Add to `hermes-agent` environment section:
```yaml
      - HINDSIGHT_MODE=${HINDSIGHT_MODE:-}
      - HINDSIGHT_API_URL=${HINDSIGHT_API_URL:-http://hindsight:8888}
```

Add to `hermes-webui` environment section:
```yaml
      - HINDSIGHT_URL=${HINDSIGHT_URL:-http://hindsight:8888}
```

Add both `hermes-agent` and `hermes-webui` to `hindsight-net` network. Add at bottom:
```yaml
networks:
  hindsight-net:
    driver: bridge
```

- [ ] **Step 2: Verify docker-compose.yml is valid**

Run: `docker compose -f docker-compose.yml config --quiet`
Expected: No output (valid config)

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "feat(docker): add Hindsight and PostgreSQL services for semantic memory"
```

### Task 2: Server Config — Add Hindsight URL

**Files:**
- Modify: `packages/server/src/config.ts`

- [ ] **Step 1: Add hindsightUrl to server config**

In `packages/server/src/config.ts`, add after the `corsOrigins` line:

```typescript
  hindsightUrl: process.env.HINDSIGHT_URL || 'http://hindsight:8888',
```

Full file becomes:
```typescript
import { resolve } from 'path'
import { homedir } from 'os'

export const config = {
  port: parseInt(process.env.PORT || '8648', 10),
  upstream: process.env.UPSTREAM || 'http://127.0.0.1:8642',
  uploadDir: process.env.UPLOAD_DIR || resolve(homedir(), '.hermes-web-ui', 'upload'),
  dataDir: resolve(__dirname, '..', 'data'),
  corsOrigins: process.env.CORS_ORIGINS || '*',
  hindsightUrl: process.env.HINDSIGHT_URL || 'http://hindsight:8888',
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/server/src/config.ts
git commit -m "feat(config): add hindsightUrl server configuration"
```

### Task 3: Hindsight REST Client

**Files:**
- Create: `packages/server/src/services/hermes/hindsight-client.ts`
- Create: `tests/server/hindsight-client.test.ts`

- [ ] **Step 1: Write failing test for hindsight client**

Create `tests/server/hindsight-client.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

const { createHindsightClient } = await import(
  '../../packages/server/src/services/hermes/hindsight-client'
)

describe('HindsightClient', () => {
  let client: ReturnType<typeof createHindsightClient>

  beforeEach(() => {
    mockFetch.mockReset()
    client = createHindsightClient('http://localhost:8888')
  })

  describe('health', () => {
    it('returns available true when service responds 200', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ status: 'ok' }) })
      const result = await client.health()
      expect(result).toEqual({ available: true })
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8888/health',
        expect.objectContaining({ method: 'GET' }),
      )
    })

    it('returns available false when service is down', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'))
      const result = await client.health()
      expect(result.available).toBe(false)
      expect(result.error).toContain('ECONNREFUSED')
    })
  })

  describe('retain', () => {
    it('posts items to the retain endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, bank_id: 'default', items_count: 1 }),
      })
      const result = await client.retain({
        items: [{ content: 'test memory', context: 'unit test' }],
      })
      expect(result.success).toBe(true)
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:8888/v1/default/banks/default/memory/retain',
        expect.objectContaining({ method: 'POST' }),
      )
    })
  })

  describe('recall', () => {
    it('posts query to the recall endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          results: [{ id: '1', text: 'remembered', type: 'world', context: null, tags: [] }],
        }),
      })
      const result = await client.recall({ query: 'what do I know?' })
      expect(result.results).toHaveLength(1)
      expect(result.results[0].text).toBe('remembered')
    })
  })

  describe('reflect', () => {
    it('posts query to the reflect endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: 'synthesized answer' }),
      })
      const result = await client.reflect({ query: 'summarize' })
      expect(result.text).toBe('synthesized answer')
    })
  })

  describe('banks', () => {
    it('fetches bank list', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ banks: [{ bank_id: 'default' }] }),
      })
      const result = await client.banks()
      expect(result).toEqual([{ bank_id: 'default' }])
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/server/hindsight-client.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the hindsight client**

Create `packages/server/src/services/hermes/hindsight-client.ts`:

```typescript
import { logger } from '../logger'

const TIMEOUT_MS = 30_000

interface RetainItem {
  content: string
  context?: string
  tags?: string[]
  timestamp?: string
}

interface RetainRequest { items: RetainItem[]; bank_id?: string }
interface RetainResponse { success: boolean; bank_id: string; items_count: number }

interface RecallRequest {
  query: string; bank_id?: string
  types?: ('world' | 'experience' | 'observation')[]
  budget?: 'low' | 'mid' | 'high'
  max_tokens?: number; tags?: string[]
}

interface RecallResult {
  id: string; text: string; type: string
  context: string | null; tags: string[]
  occurred_start: string | null; occurred_end: string | null
}

interface RecallResponse { results: RecallResult[] }

interface ReflectRequest {
  query: string; bank_id?: string
  budget?: 'low' | 'mid' | 'high'
  max_tokens?: number; tags?: string[]
}

interface ReflectResponse {
  text: string
  usage?: { input_tokens: number; output_tokens: number; total_tokens: number }
}

interface BankInfo { bank_id: string; [key: string]: any }

export function createHindsightClient(baseUrl: string) {
  async function req<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${baseUrl.replace(/\/+$/, '')}${path}`
    const res = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`Hindsight ${res.status}: ${body}`)
    }
    return res.json() as Promise<T>
  }

  return {
    async health(): Promise<{ available: boolean; error?: string }> {
      try {
        await req('/health', { method: 'GET' })
        return { available: true }
      } catch (err: any) {
        logger.warn('Hindsight health check failed: %s', err.message)
        return { available: false, error: err.message }
      }
    },

    async banks(): Promise<BankInfo[]> {
      const res = await req<{ banks: BankInfo[] }>('/v1/default/banks', { method: 'GET' })
      return res.banks || []
    },

    async retain(r: RetainRequest): Promise<RetainResponse> {
      const bankId = r.bank_id || 'default'
      return req<RetainResponse>(
        `/v1/default/banks/${bankId}/memory/retain`,
        { method: 'POST', body: JSON.stringify({ items: r.items }) },
      )
    },

    async recall(r: RecallRequest): Promise<RecallResponse> {
      const bankId = r.bank_id || 'default'
      return req<RecallResponse>(
        `/v1/default/banks/${bankId}/memory/recall`,
        { method: 'POST', body: JSON.stringify({ query: r.query, types: r.types, budget: r.budget || 'mid', max_tokens: r.max_tokens || 4096, tags: r.tags }) },
      )
    },

    async reflect(r: ReflectRequest): Promise<ReflectResponse> {
      const bankId = r.bank_id || 'default'
      return req<ReflectResponse>(
        `/v1/default/banks/${bankId}/memory/reflect`,
        { method: 'POST', body: JSON.stringify({ query: r.query, budget: r.budget || 'low', max_tokens: r.max_tokens || 4096, tags: r.tags }) },
      )
    },
  }
}

export type HindsightClient = ReturnType<typeof createHindsightClient>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/server/hindsight-client.test.ts`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/services/hermes/hindsight-client.ts tests/server/hindsight-client.test.ts
git commit -m "feat(server): add Hindsight REST API client with tests"
```

### Task 4: Hindsight Controller and Routes

**Files:**
- Create: `packages/server/src/controllers/hermes/hindsight.ts`
- Create: `packages/server/src/routes/hermes/hindsight.ts`
- Modify: `packages/server/src/routes/index.ts`

- [ ] **Step 1: Create the controller**

Create `packages/server/src/controllers/hermes/hindsight.ts`:

```typescript
import { config } from '../../config'
import { createHindsightClient } from '../../services/hermes/hindsight-client'

const client = createHindsightClient(config.hindsightUrl)

export async function health(ctx: any) {
  ctx.body = await client.health()
}

export async function banks(ctx: any) {
  try {
    ctx.body = { banks: await client.banks() }
  } catch (err: any) {
    ctx.status = 502
    ctx.body = { error: err.message }
  }
}

export async function stats(ctx: any) {
  try {
    const [healthResult, bankList] = await Promise.all([
      client.health(),
      client.banks().catch(() => []),
    ])
    ctx.body = { available: healthResult.available, banks: bankList, total_banks: bankList.length }
  } catch (err: any) {
    ctx.status = 502
    ctx.body = { error: err.message }
  }
}

export async function retain(ctx: any) {
  const { content, context, tags, bank_id } = ctx.request.body as {
    content: string; context?: string; tags?: string[]; bank_id?: string
  }
  if (!content) { ctx.status = 400; ctx.body = { error: 'Missing content' }; return }
  try {
    ctx.body = await client.retain({ items: [{ content, context, tags }], bank_id })
  } catch (err: any) {
    ctx.status = 502; ctx.body = { error: err.message }
  }
}

export async function recall(ctx: any) {
  const { query, bank_id, types, budget, max_tokens, tags } = ctx.request.body as {
    query: string; bank_id?: string; types?: ('world' | 'experience' | 'observation')[]
    budget?: 'low' | 'mid' | 'high'; max_tokens?: number; tags?: string[]
  }
  if (!query) { ctx.status = 400; ctx.body = { error: 'Missing query' }; return }
  try {
    ctx.body = await client.recall({ query, bank_id, types, budget, max_tokens, tags })
  } catch (err: any) {
    ctx.status = 502; ctx.body = { error: err.message }
  }
}

export async function reflect(ctx: any) {
  const { query, bank_id, budget, max_tokens, tags } = ctx.request.body as {
    query: string; bank_id?: string; budget?: 'low' | 'mid' | 'high'
    max_tokens?: number; tags?: string[]
  }
  if (!query) { ctx.status = 400; ctx.body = { error: 'Missing query' }; return }
  try {
    ctx.body = await client.reflect({ query, bank_id, budget, max_tokens, tags })
  } catch (err: any) {
    ctx.status = 502; ctx.body = { error: err.message }
  }
}
```

- [ ] **Step 2: Create the route module**

Create `packages/server/src/routes/hermes/hindsight.ts`:

```typescript
import Router from '@koa/router'
import * as ctrl from '../../controllers/hermes/hindsight'

export const hindsightRoutes = new Router()

hindsightRoutes.get('/api/hermes/hindsight/health', ctrl.health)
hindsightRoutes.get('/api/hermes/hindsight/banks', ctrl.banks)
hindsightRoutes.get('/api/hermes/hindsight/stats', ctrl.stats)
hindsightRoutes.post('/api/hermes/hindsight/retain', ctrl.retain)
hindsightRoutes.post('/api/hermes/hindsight/recall', ctrl.recall)
hindsightRoutes.post('/api/hermes/hindsight/reflect', ctrl.reflect)
```

- [ ] **Step 3: Register routes in index.ts**

In `packages/server/src/routes/index.ts`, add import:
```typescript
import { hindsightRoutes } from './hermes/hindsight'
```

Add after `app.use(memoryRoutes.routes())` (line 51):
```typescript
  app.use(hindsightRoutes.routes())
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit -p packages/server/tsconfig.json`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/controllers/hermes/hindsight.ts packages/server/src/routes/hermes/hindsight.ts packages/server/src/routes/index.ts
git commit -m "feat(server): add Hindsight BFF controller and routes"
```

### Task 5: Tool Auto-Switch and Toggle Endpoint

**Files:**
- Modify: `packages/server/src/services/hermes/hermes-cli.ts`
- Modify: `packages/server/src/controllers/hermes/hindsight.ts`
- Modify: `packages/server/src/routes/hermes/hindsight.ts`

- [ ] **Step 1: Add toggleMemoryTool to hermes-cli.ts**

Append to `packages/server/src/services/hermes/hermes-cli.ts`, after the last exported function:

```typescript
export async function toggleMemoryTool(enable: boolean): Promise<string> {
  const action = enable ? 'enable' : 'disable'
  const { stdout } = await execFileAsync(hermesBin(), ['tools', action, 'memory'], {
    timeout: 10000,
  })
  return stdout.trim()
}
```

- [ ] **Step 2: Add toggleEnabled to controller**

Add import at top of `packages/server/src/controllers/hermes/hindsight.ts`:
```typescript
import { toggleMemoryTool } from '../../services/hermes/hermes-cli'
```

Add function:
```typescript
export async function toggleEnabled(ctx: any) {
  const { enabled } = ctx.request.body as { enabled: boolean }
  if (typeof enabled !== 'boolean') {
    ctx.status = 400; ctx.body = { error: 'Missing enabled boolean' }; return
  }
  try {
    await toggleMemoryTool(!enabled)
    ctx.body = { success: true, hindsight_enabled: enabled, memory_tool_enabled: !enabled }
  } catch (err: any) {
    ctx.status = 500; ctx.body = { error: err.message }
  }
}
```

- [ ] **Step 3: Add toggle route**

Add to `packages/server/src/routes/hermes/hindsight.ts`:
```typescript
hindsightRoutes.post('/api/hermes/hindsight/toggle', ctrl.toggleEnabled)
```

- [ ] **Step 4: Commit**

```bash
git add packages/server/src/services/hermes/hermes-cli.ts packages/server/src/controllers/hermes/hindsight.ts packages/server/src/routes/hermes/hindsight.ts
git commit -m "feat(server): add Hindsight toggle with auto memory tool switch"
```

### Task 6: Frontend API Module

**Files:**
- Create: `packages/client/src/api/hermes/hindsight.ts`
- Modify: `packages/client/src/api/hermes/config.ts`

- [ ] **Step 1: Create frontend hindsight API module**

Create `packages/client/src/api/hermes/hindsight.ts`:

```typescript
import { request } from '../client'

export interface HindsightHealth { available: boolean; error?: string }
export interface HindsightBank { bank_id: string; [key: string]: any }
export interface HindsightStats { available: boolean; banks: HindsightBank[]; total_banks: number }
export interface RecallResult {
  id: string; text: string; type: string; context: string | null
  tags: string[]; occurred_start: string | null; occurred_end: string | null
}
export interface RecallResponse { results: RecallResult[] }
export interface ReflectResponse { text: string; usage?: { input_tokens: number; output_tokens: number; total_tokens: number } }
export interface RetainResponse { success: boolean; bank_id: string; items_count: number }

export const fetchHealth = () => request<HindsightHealth>('/api/hermes/hindsight/health')
export const fetchStats = () => request<HindsightStats>('/api/hermes/hindsight/stats')
export const fetchBanks = async () => (await request<{ banks: HindsightBank[] }>('/api/hermes/hindsight/banks')).banks

export const retain = (content: string, context?: string, tags?: string[], bankId?: string) =>
  request<RetainResponse>('/api/hermes/hindsight/retain', {
    method: 'POST', body: JSON.stringify({ content, context, tags, bank_id: bankId }),
  })

export const recall = (query: string, options?: { bank_id?: string; types?: string[]; budget?: string; max_tokens?: number; tags?: string[] }) =>
  request<RecallResponse>('/api/hermes/hindsight/recall', {
    method: 'POST', body: JSON.stringify({ query, ...options }),
  })

export const reflect = (query: string, options?: { bank_id?: string; budget?: string; max_tokens?: number; tags?: string[] }) =>
  request<ReflectResponse>('/api/hermes/hindsight/reflect', {
    method: 'POST', body: JSON.stringify({ query, ...options }),
  })

export const toggleHindsight = (enabled: boolean) =>
  request('/api/hermes/hindsight/toggle', {
    method: 'POST', body: JSON.stringify({ enabled }),
  })
```

- [ ] **Step 2: Extend MemoryConfig in config.ts**

In `packages/client/src/api/hermes/config.ts`, replace the `MemoryConfig` interface:

```typescript
export interface MemoryConfig {
  memory_enabled?: boolean
  user_profile_enabled?: boolean
  memory_char_limit?: number
  user_char_limit?: number
  hindsight_enabled?: boolean
  hindsight_url?: string
  hindsight_embedding_provider?: string
  hindsight_embedding_base_url?: string
  hindsight_embedding_model?: string
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx vue-tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/api/hermes/hindsight.ts packages/client/src/api/hermes/config.ts
git commit -m "feat(client): add Hindsight frontend API module"
```

### Task 7: Settings UI — Hindsight Configuration

**Files:**
- Modify: `packages/client/src/components/hermes/settings/MemorySettings.vue`

- [ ] **Step 1: Add Hindsight settings section to MemorySettings.vue**

Add imports at top of `<script setup>`:
```typescript
import { NInput, NSelect } from 'naive-ui'
import { toggleHindsight, fetchHealth, type HindsightHealth } from '@/api/hermes/hindsight'

const hindsightHealth = ref<HindsightHealth | null>(null)
const testingConnection = ref(false)

async function handleHindsightToggle(enabled: boolean) {
  try {
    await toggleHindsight(enabled)
    await settingsStore.saveSection('memory', { hindsight_enabled: enabled })
    message.success(t('settings.saved'))
  } catch (err: any) {
    message.error(t('settings.saveFailed'))
  }
}

async function testConnection() {
  testingConnection.value = true
  try {
    hindsightHealth.value = await fetchHealth()
    if (hindsightHealth.value.available) {
      message.success(t('settings.hindsight.connectionOk'))
    } else {
      message.warning(t('settings.hindsight.connectionFailed'))
    }
  } catch {
    message.error(t('settings.hindsight.connectionFailed'))
  } finally {
    testingConnection.value = false
  }
}

const embeddingProviderOptions = [
  { label: 'LM Studio (Local)', value: 'lm_studio' },
  { label: 'Z.ai / 智谱', value: 'zai' },
  { label: t('common.custom'), value: 'custom' },
]
```

Add template section after the existing `</section>` closing tag, inside the component template:

```html
<section class="settings-section hindsight-section">
  <h4 class="section-subtitle">{{ t('settings.hindsight.title') }}</h4>
  <SettingRow :label="t('settings.hindsight.enabled')" :hint="t('settings.hindsight.enabledHint')">
    <NSwitch :value="settingsStore.memory.hindsight_enabled" @update:value="handleHindsightToggle" />
  </SettingRow>
  <SettingRow :label="t('settings.hindsight.embeddingProvider')" :hint="t('settings.hindsight.embeddingProviderHint')">
    <NSelect
      :value="settingsStore.memory.hindsight_embedding_provider"
      :options="embeddingProviderOptions"
      size="small" style="width: 200px"
      @update:value="v => save({ hindsight_embedding_provider: v })"
    />
  </SettingRow>
  <SettingRow :label="t('settings.hindsight.embeddingBaseUrl')" :hint="t('settings.hindsight.embeddingBaseUrlHint')">
    <NInput
      :value="settingsStore.memory.hindsight_embedding_base_url"
      size="small" style="width: 300px"
      placeholder="http://host.docker.internal:1234/v1"
      @update:value="v => save({ hindsight_embedding_base_url: v })"
    />
  </SettingRow>
  <SettingRow :label="t('settings.hindsight.embeddingModel')">
    <NInput
      :value="settingsStore.memory.hindsight_embedding_model"
      size="small" style="width: 300px"
      placeholder="text-embedding-nomic-embed-text-v1.5"
      @update:value="v => save({ hindsight_embedding_model: v })"
    />
  </SettingRow>
  <SettingRow :label="t('settings.hindsight.testConnection')">
    <NButton size="small" :loading="testingConnection" @click="testConnection">
      {{ t('settings.hindsight.test') }}
    </NButton>
    <span v-if="hindsightHealth" :class="hindsightHealth.available ? 'status-ok' : 'status-fail'" style="margin-left: 8px; font-size: 12px">
      {{ hindsightHealth.available ? '✓ Connected' : '✗ ' + (hindsightHealth.error || 'Unavailable') }}
    </span>
  </SettingRow>
</section>
```

Add to `<style scoped>`:
```scss
.section-subtitle {
  font-size: 14px;
  font-weight: 600;
  margin: 24px 0 8px;
  padding-top: 16px;
  border-top: 1px solid $border-color;
}
.status-ok { color: #22c55e; }
.status-fail { color: #ef4444; }
```

- [ ] **Step 2: Verify it renders**

Run dev server and navigate to Settings > Memory tab. Verify the Hindsight section appears below existing memory settings.

- [ ] **Step 3: Commit**

```bash
git add packages/client/src/components/hermes/settings/MemorySettings.vue
git commit -m "feat(settings): add Hindsight configuration UI with connection test"
```

### Task 8: MemoryView — Tabbed Layout Restructure

**Files:**
- Modify: `packages/client/src/views/hermes/MemoryView.vue`

- [ ] **Step 1: Add NTabs import and tab state**

In `packages/client/src/views/hermes/MemoryView.vue`, update the `<script setup>` imports:

```typescript
import { ref, onMounted, computed } from 'vue'
import { NButton, NTabs, NTabPane, useMessage } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import MarkdownRenderer from '@/components/hermes/chat/MarkdownRenderer.vue'
import HindsightPanel from '@/components/hermes/memory/HindsightPanel.vue'
import { fetchMemory, saveMemory, type MemoryData } from '@/api/hermes/skills'

const activeTab = ref('file')
```

- [ ] **Step 2: Wrap existing content in NTabs**

Replace the `<template>` section. Wrap the existing `.memory-sections` div inside a `<NTabPane>` for "File Memory", and add a second `<NTabPane>` for "Semantic Memory":

```html
<template>
  <div class="memory-view">
    <header class="page-header">
      <h2 class="header-title">{{ t('memory.title') }}</h2>
      <NButton v-if="activeTab === 'file'" size="small" quaternary @click="loadMemory">
        <template #icon>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        </template>
        {{ t('memory.refresh') }}
      </NButton>
    </header>

    <div class="memory-content">
      <NTabs v-model:value="activeTab" type="line" animated>
        <NTabPane name="file" :tab="t('memory.fileMemory')">
          <!-- existing memory-sections content unchanged -->
          <div v-if="loading && !data" class="memory-loading">{{ t('common.loading') }}</div>
          <div v-else class="memory-sections">
            <!-- ... all three existing memory-section divs stay exactly as they are ... -->
          </div>
        </NTabPane>
        <NTabPane name="semantic" :tab="t('memory.semanticMemory')">
          <HindsightPanel />
        </NTabPane>
      </NTabs>
    </div>
  </div>
</template>
```

The three existing `.memory-section` divs (My Notes, User Profile, Soul) remain unchanged inside the first tab pane.

- [ ] **Step 3: Verify both tabs render**

Run dev server, navigate to Memory page. Verify:
- "File Memory" tab shows existing 3-panel layout
- "Semantic Memory" tab shows HindsightPanel (will be empty placeholder until Task 9)

- [ ] **Step 4: Commit**

```bash
git add packages/client/src/views/hermes/MemoryView.vue
git commit -m "feat(memory): restructure MemoryView to tabbed layout"
```

### Task 9: Hindsight Frontend Components

**Files:**
- Create: `packages/client/src/components/hermes/memory/MemoryStats.vue`
- Create: `packages/client/src/components/hermes/memory/MemorySearch.vue`
- Create: `packages/client/src/components/hermes/memory/MemoryRetain.vue`
- Create: `packages/client/src/components/hermes/memory/HindsightPanel.vue`

- [ ] **Step 1: Create MemoryStats.vue**

Create `packages/client/src/components/hermes/memory/MemoryStats.vue`:

```vue
<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import type { HindsightStats } from '@/api/hermes/hindsight'

defineProps<{ stats: HindsightStats | null; loading: boolean }>()
const { t } = useI18n()
</script>

<template>
  <div class="memory-stats">
    <div class="stat-item">
      <span class="stat-label">{{ t('hindsight.status') }}</span>
      <span :class="['stat-value', stats?.available ? 'online' : 'offline']">
        {{ stats?.available ? t('hindsight.online') : t('hindsight.offline') }}
      </span>
    </div>
    <div class="stat-item">
      <span class="stat-label">{{ t('hindsight.banks') }}</span>
      <span class="stat-value">{{ stats?.total_banks ?? '-' }}</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;
.memory-stats { display: flex; gap: 24px; padding: 12px 16px; border-bottom: 1px solid $border-color; }
.stat-item { display: flex; align-items: center; gap: 8px; }
.stat-label { font-size: 12px; color: $text-muted; }
.stat-value { font-size: 13px; font-weight: 600; }
.online { color: #22c55e; }
.offline { color: #ef4444; }
</style>
```

- [ ] **Step 2: Create MemorySearch.vue**

Create `packages/client/src/components/hermes/memory/MemorySearch.vue`:

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { NInput, NButton, NEmpty, useMessage } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { recall, reflect, type RecallResult } from '@/api/hermes/hindsight'

const { t } = useI18n()
const message = useMessage()
const query = ref('')
const results = ref<RecallResult[]>([])
const reflectText = ref('')
const loading = ref(false)

async function handleRecall() {
  if (!query.value.trim()) return
  loading.value = true
  reflectText.value = ''
  try {
    const res = await recall(query.value)
    results.value = res.results
  } catch (err: any) {
    message.error(err.message)
  } finally {
    loading.value = false
  }
}

async function handleReflect() {
  if (!query.value.trim()) return
  loading.value = true
  results.value = []
  try {
    const res = await reflect(query.value)
    reflectText.value = res.text
  } catch (err: any) {
    message.error(err.message)
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="memory-search">
    <div class="search-bar">
      <NInput v-model:value="query" :placeholder="t('hindsight.searchPlaceholder')" size="small" clearable @keyup.enter="handleRecall" />
      <NButton size="small" :loading="loading" @click="handleRecall">{{ t('hindsight.recall') }}</NButton>
      <NButton size="small" :loading="loading" @click="handleReflect">{{ t('hindsight.reflect') }}</NButton>
    </div>
    <div class="search-results">
      <div v-if="reflectText" class="reflect-result">
        <p class="reflect-text">{{ reflectText }}</p>
      </div>
      <div v-else-if="results.length" class="recall-results">
        <div v-for="r in results" :key="r.id" class="result-item">
          <span class="result-type">{{ r.type }}</span>
          <p class="result-text">{{ r.text }}</p>
          <span v-if="r.context" class="result-context">{{ r.context }}</span>
        </div>
      </div>
      <NEmpty v-else-if="!loading" :description="t('hindsight.noResults')" />
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;
.memory-search { display: flex; flex-direction: column; gap: 12px; }
.search-bar { display: flex; gap: 8px; align-items: center; }
.search-results { flex: 1; overflow-y: auto; }
.result-item { padding: 10px 0; border-bottom: 1px solid $border-color; }
.result-type { font-size: 11px; color: $text-muted; text-transform: uppercase; }
.result-text { font-size: 13px; margin: 4px 0; }
.result-context { font-size: 11px; color: $text-secondary; }
.reflect-result { padding: 12px; background: $bg-secondary; border-radius: $radius-md; }
.reflect-text { font-size: 13px; line-height: 1.6; white-space: pre-wrap; }
</style>
```

- [ ] **Step 3: Create MemoryRetain.vue**

Create `packages/client/src/components/hermes/memory/MemoryRetain.vue`:

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { NInput, NButton, useMessage } from 'naive-ui'
import { useI18n } from 'vue-i18n'
import { retain } from '@/api/hermes/hindsight'

const { t } = useI18n()
const message = useMessage()
const content = ref('')
const context = ref('')
const saving = ref(false)

async function handleRetain() {
  if (!content.value.trim()) return
  saving.value = true
  try {
    await retain(content.value, context.value || undefined)
    message.success(t('hindsight.retained'))
    content.value = ''
    context.value = ''
  } catch (err: any) {
    message.error(err.message)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="memory-retain">
    <NInput v-model:value="content" type="textarea" :placeholder="t('hindsight.retainPlaceholder')" :rows="3" />
    <div class="retain-row">
      <NInput v-model:value="context" size="small" :placeholder="t('hindsight.contextPlaceholder')" style="flex: 1" />
      <NButton size="small" type="primary" :loading="saving" @click="handleRetain">{{ t('hindsight.retain') }}</NButton>
    </div>
  </div>
</template>

<style scoped lang="scss">
.memory-retain { display: flex; flex-direction: column; gap: 8px; }
.retain-row { display: flex; gap: 8px; align-items: center; }
</style>
```

- [ ] **Step 4: Create HindsightPanel.vue**

Create `packages/client/src/components/hermes/memory/HindsightPanel.vue`:

```vue
<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { fetchStats, type HindsightStats } from '@/api/hermes/hindsight'
import MemoryStats from './MemoryStats.vue'
import MemorySearch from './MemorySearch.vue'
import MemoryRetain from './MemoryRetain.vue'

const { t } = useI18n()
const stats = ref<HindsightStats | null>(null)
const loading = ref(false)

async function loadStats() {
  loading.value = true
  try { stats.value = await fetchStats() } catch { /* handled by stats component */ }
  finally { loading.value = false }
}

onMounted(loadStats)
</script>

<template>
  <div class="hindsight-panel">
    <MemoryStats :stats="stats" :loading="loading" />
    <div class="panel-body">
      <div class="panel-section">
        <h4 class="panel-subtitle">{{ t('hindsight.search') }}</h4>
        <MemorySearch />
      </div>
      <div class="panel-section">
        <h4 class="panel-subtitle">{{ t('hindsight.addMemory') }}</h4>
        <MemoryRetain />
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables' as *;
.hindsight-panel { display: flex; flex-direction: column; height: 100%; }
.panel-body { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 24px; }
.panel-subtitle { font-size: 13px; font-weight: 600; margin-bottom: 8px; color: $text-secondary; }
</style>
```

- [ ] **Step 5: Verify all components render**

Run dev server, navigate to Memory > Semantic Memory tab. Verify stats bar, search area, and retain area all render.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/components/hermes/memory/
git commit -m "feat(memory): add Hindsight semantic memory components"
```

### Task 10: i18n — Add Hindsight Translation Keys

**Files:**
- Modify: `packages/client/src/i18n/locales/en.ts`
- Modify: `packages/client/src/i18n/locales/zh.ts`
- Modify: all other 6 locale files

- [ ] **Step 1: Add English translations**

In `packages/client/src/i18n/locales/en.ts`, add to the `memory` section:

```typescript
  memory: {
    // ... existing keys ...
    fileMemory: 'File Memory',
    semanticMemory: 'Semantic Memory',
  },
```

Add a new `hindsight` section:

```typescript
  hindsight: {
    status: 'Status',
    online: 'Online',
    offline: 'Offline',
    banks: 'Banks',
    search: 'Search Memories',
    searchPlaceholder: 'What do you want to recall?',
    recall: 'Recall',
    reflect: 'Reflect',
    noResults: 'No memories found',
    addMemory: 'Add Memory',
    retainPlaceholder: 'Enter memory content...',
    contextPlaceholder: 'Context (optional)',
    retain: 'Retain',
    retained: 'Memory retained',
  },
```

Add to the `settings` section:

```typescript
  settings: {
    // ... existing ...
    hindsight: {
      title: 'Hindsight Semantic Memory',
      enabled: 'Enable Hindsight',
      enabledHint: 'When enabled, disables built-in memory tool to avoid conflicts',
      embeddingProvider: 'Embedding Provider',
      embeddingProviderHint: 'Provider for text embeddings',
      embeddingBaseUrl: 'Embedding Base URL',
      embeddingBaseUrlHint: 'OpenAI-compatible embedding endpoint',
      embeddingModel: 'Embedding Model',
      testConnection: 'Connection',
      test: 'Test',
      connectionOk: 'Hindsight connected',
      connectionFailed: 'Cannot connect to Hindsight',
    },
  },
```

- [ ] **Step 2: Add Chinese translations**

In `packages/client/src/i18n/locales/zh.ts`, add matching keys:

```typescript
  memory: {
    // ... existing ...
    fileMemory: '文件记忆',
    semanticMemory: '语义记忆',
  },
  hindsight: {
    status: '状态',
    online: '在线',
    offline: '离线',
    banks: '记忆库',
    search: '搜索记忆',
    searchPlaceholder: '你想回忆什么？',
    recall: '回忆',
    reflect: '推理',
    noResults: '未找到记忆',
    addMemory: '添加记忆',
    retainPlaceholder: '输入记忆内容...',
    contextPlaceholder: '上下文（可选）',
    retain: '存储',
    retained: '记忆已存储',
  },
  settings: {
    // ... existing ...
    hindsight: {
      title: 'Hindsight 语义记忆',
      enabled: '启用 Hindsight',
      enabledHint: '启用后将禁用内置记忆工具以避免冲突',
      embeddingProvider: 'Embedding 提供者',
      embeddingProviderHint: '文本嵌入提供者',
      embeddingBaseUrl: 'Embedding 地址',
      embeddingBaseUrlHint: 'OpenAI 兼容的 embedding 端点',
      embeddingModel: 'Embedding 模型',
      testConnection: '连接',
      test: '测试',
      connectionOk: 'Hindsight 已连接',
      connectionFailed: '无法连接 Hindsight',
    },
  },
```

- [ ] **Step 3: Add translations to remaining 6 locales**

For `de.ts`, `es.ts`, `fr.ts`, `ja.ts`, `ko.ts`, `pt.ts` — add the same `hindsight` section and `memory.fileMemory`/`memory.semanticMemory` keys. Use English as fallback for technical terms (Hindsight, Embedding) and translate UI labels.

- [ ] **Step 4: Verify no missing keys**

Run dev server, switch between languages, verify no missing translation warnings in console.

- [ ] **Step 5: Commit**

```bash
git add packages/client/src/i18n/locales/
git commit -m "feat(i18n): add Hindsight translation keys for all 8 locales"
```

### Task 11: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 2: Run TypeScript type check**

Run: `npx vue-tsc -b && npx tsc --noEmit -p packages/server/tsconfig.json`
Expected: No errors

- [ ] **Step 3: Build production bundle**

Run: `npm run build`
Expected: Build succeeds

- [ ] **Step 4: Manual end-to-end test**

Start Docker Compose with all services. Verify:
1. Hindsight health check returns available
2. Settings page shows Hindsight config section
3. Memory page has two tabs
4. Can retain a memory via UI
5. Can recall that memory
6. Hermes agent still works normally

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "fix: address issues found during final verification"
```