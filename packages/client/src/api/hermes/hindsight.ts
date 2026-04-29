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
    method: 'POST',
    body: JSON.stringify({ content, context, tags, bank_id: bankId }),
  })

export const recall = (query: string, options?: { bank_id?: string; types?: string[]; budget?: string; max_tokens?: number; tags?: string[] }) =>
  request<RecallResponse>('/api/hermes/hindsight/recall', {
    method: 'POST',
    body: JSON.stringify({ query, ...options }),
  })

export const reflect = (query: string, options?: { bank_id?: string; budget?: string; max_tokens?: number; tags?: string[] }) =>
  request<ReflectResponse>('/api/hermes/hindsight/reflect', {
    method: 'POST',
    body: JSON.stringify({ query, ...options }),
  })

export const toggleHindsight = (enabled: boolean) =>
  request('/api/hermes/hindsight/toggle', {
    method: 'POST',
    body: JSON.stringify({ enabled }),
  })
