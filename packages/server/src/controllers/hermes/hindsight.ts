import { config } from '../../config'
import { createHindsightClient } from '../../services/hermes/hindsight-client'
import { toggleMemoryTool } from '../../services/hermes/hermes-cli'

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
