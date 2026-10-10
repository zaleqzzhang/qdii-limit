import { formatAmount, formatDateTime } from "@/lib/fund-format"
import type { FundSnapshot } from "@/lib/snapshot-store"
import type { FundRecord } from "@/lib/types"

export type FundChangeKind =
  | "reopened"
  | "suspended"
  | "limit-raise"
  | "limit-cut"
  | "limit-change"
  | "new"

export type FundChange = {
  code: string
  name: string
  kinds: FundChangeKind[]
  fromStatus?: string
  toStatus?: string
  fromLimit?: number | null
  toLimit?: number | null
}

const CHANGE_GROUPS: { kind: FundChangeKind; title: string }[] = [
  { kind: "reopened", title: "🔓 恢复申购" },
  { kind: "suspended", title: "⛔ 暂停申购" },
  { kind: "limit-cut", title: "📉 限额收紧" },
  { kind: "limit-raise", title: "📈 限额放宽" },
  { kind: "limit-change", title: "🔁 限额变化" },
  { kind: "new", title: "🆕 新增基金" },
]

const MAX_ENTRIES_PER_GROUP = 10

export function diffFunds(previous: FundSnapshot | null, current: FundRecord[]): FundChange[] {
  if (previous == null) return []

  const changes: FundChange[] = []

  for (const fund of current) {
    const before = previous.funds[fund.code]

    if (before == null) {
      changes.push({
        code: fund.code,
        name: fund.name,
        kinds: ["new"],
        toStatus: fund.subscribeStatus,
        toLimit: fund.maxSubscribeAmount,
      })
      continue
    }

    if (before.subscribeStatus !== fund.subscribeStatus) {
      // 状态变化时不再单独报告限额变化（暂停/恢复常伴随限额归零或放开）
      changes.push({
        code: fund.code,
        name: fund.name,
        kinds: [fund.subscribeStatus === "开放申购" ? "reopened" : "suspended"],
        fromStatus: before.subscribeStatus,
        toStatus: fund.subscribeStatus,
        fromLimit: before.maxSubscribeAmount,
        toLimit: fund.maxSubscribeAmount,
      })
      continue
    }

    if (before.maxSubscribeAmount !== fund.maxSubscribeAmount) {
      const from = before.maxSubscribeAmount
      const to = fund.maxSubscribeAmount

      let kind: FundChangeKind = "limit-change"
      if (from != null && to != null) {
        kind = to > from ? "limit-raise" : "limit-cut"
      }

      changes.push({
        code: fund.code,
        name: fund.name,
        kinds: [kind],
        fromStatus: before.subscribeStatus,
        toStatus: fund.subscribeStatus,
        fromLimit: from,
        toLimit: to,
      })
    }
  }

  return changes
}

function formatChangeLine(change: FundChange): string {
  const label = `${change.code} ${change.name}`

  if (change.kinds.includes("new")) {
    return `- ${label}：新入榜，${change.toStatus ?? "未知状态"}，限额 ${formatAmount(change.toLimit ?? null)}`
  }

  if (change.kinds.includes("reopened") || change.kinds.includes("suspended")) {
    const statusPart = `${change.fromStatus ?? "未知"} → ${change.toStatus ?? "未知"}`
    const limitPart =
      change.fromLimit != null || change.toLimit != null
        ? `，限额 ${formatAmount(change.fromLimit ?? null)} → ${formatAmount(change.toLimit ?? null)}`
        : ""

    return `- ${label}：${statusPart}${limitPart}`
  }

  return `- ${label}：限额 ${formatAmount(change.fromLimit ?? null)} → ${formatAmount(change.toLimit ?? null)}`
}

export function renderChangeMessage(
  changes: FundChange[],
  now: string,
  siteUrl?: string,
): { title: string; content: string } {
  const sections: string[] = []

  for (const group of CHANGE_GROUPS) {
    const groupChanges = changes.filter((change) => change.kinds.includes(group.kind))
    if (groupChanges.length === 0) continue

    const lines = groupChanges.slice(0, MAX_ENTRIES_PER_GROUP).map(formatChangeLine)
    const rest = groupChanges.length - lines.length
    if (rest > 0) {
      lines.push(`- …及其余 ${rest} 只`)
    }

    sections.push(`**${group.title}（${groupChanges.length}）**\n${lines.join("\n")}`)
  }

  const footerLines = [`数据：东方财富 · ${changes.length} 只基金有变化`]
  if (siteUrl) {
    footerLines.push(`完整数据：${siteUrl}`)
  }

  return {
    title: `QDII 观察：${changes.length} 只基金有变化`,
    content: [
      `**QDII 变化摘要**（${formatDateTime(now)}）`,
      "",
      sections.join("\n\n"),
      "",
      footerLines.join("\n"),
    ].join("\n"),
  }
}

export function renderStartupMessage(
  funds: FundRecord[],
  now: string,
): { title: string; content: string } {
  const openFunds = funds.filter(
    (fund) => fund.subscribeStatus === "开放申购" && fund.maxSubscribeAmount != null,
  )
  const tightest = [...openFunds]
    .sort((a, b) => (a.maxSubscribeAmount ?? 0) - (b.maxSubscribeAmount ?? 0))
    .slice(0, 5)
  const tightestLines = tightest.map(
    (fund) => `- ${fund.name}（${fund.code}）：${formatAmount(fund.maxSubscribeAmount)}`,
  )

  return {
    title: "QDII 监控已启动",
    content: [
      `**QDII 监控已启动**（${formatDateTime(now)}）`,
      "",
      `已建立基线快照，开始监控 ${funds.length} 只 QDII 基金（当前开放申购 ${openFunds.length} 只）。`,
      "",
      "**当前限额最紧的开放申购基金（TOP5）**",
      ...tightestLines,
      "",
      "之后每天 09:10 检查一次，出现申购状态或限额变化时才会推送。",
    ].join("\n"),
  }
}
