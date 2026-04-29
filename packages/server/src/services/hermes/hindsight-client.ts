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
