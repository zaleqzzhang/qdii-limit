import type { FundRecord } from "@/lib/types"

const SNAPSHOT_KEY = "qdii:snapshot:v1"

export type FundSnapshotEntry = {
  code: string
  name: string
  subscribeStatus: string
  maxSubscribeAmount: number | null
}

export type FundSnapshot = {
  snapshotAt: string
  funds: Record<string, FundSnapshotEntry>
}

function getUpstashConfig() {
  // 兼容两种命名：Upstash 控制台（UPSTASH_REDIS_REST_*）与 Vercel Marketplace 集成（KV_REST_API_*）
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN

  if (!url || !token) {
    throw new Error(
      "未配置 Upstash 环境变量（UPSTASH_REDIS_REST_URL / KV_REST_API_URL）",
    )
  }

  return { url: url.replace(/\/+$/, ""), token }
}

function buildSnapshot(funds: FundRecord[]): FundSnapshot {
  const entries: Record<string, FundSnapshotEntry> = {}

  for (const fund of funds) {
    entries[fund.code] = {
      code: fund.code,
      name: fund.name,
      subscribeStatus: fund.subscribeStatus,
      maxSubscribeAmount: fund.maxSubscribeAmount,
    }
  }

  return {
    snapshotAt: new Date().toISOString(),
    funds: entries,
  }
}

export async function readSnapshot(): Promise<FundSnapshot | null> {
  const { url, token } = getUpstashConfig()

  const response = await fetch(`${url}/get/${SNAPSHOT_KEY}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  })

  if (!response.ok) {
    throw new Error(`Upstash 读取快照失败：${response.status}`)
  }

  const body = (await response.json()) as { result: string | null }

  if (body.result == null) return null

  try {
    const parsed = JSON.parse(body.result) as FundSnapshot
    if (!parsed || typeof parsed !== "object" || parsed.funds == null) return null
    return parsed
  } catch {
    // 快照内容损坏时按无快照处理，下次运行会重建基线
    return null
  }
}

export async function writeSnapshot(funds: FundRecord[]): Promise<void> {
  const { url, token } = getUpstashConfig()

  const response = await fetch(`${url}/set/${SNAPSHOT_KEY}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "text/plain",
    },
    body: JSON.stringify(buildSnapshot(funds)),
    signal: AbortSignal.timeout(10_000),
  })

  if (!response.ok) {
    throw new Error(`Upstash 写入快照失败：${response.status}`)
  }
}
