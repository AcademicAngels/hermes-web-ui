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
