import { NextRequest } from "next/server"

import { fetchEastmoneyFunds } from "@/lib/eastmoney"
import { diffFunds, renderChangeMessage, renderStartupMessage } from "@/lib/notify-diff"
import { sendPushPlus, type PushPlusResult } from "@/lib/pushplus"
import { readSnapshot, writeSnapshot, type FundSnapshot } from "@/lib/snapshot-store"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
// 东方财富全量数据从 Vercel 美国机房拉取可能超过 60s，与平台默认上限对齐
export const maxDuration = 300

// 东方财富返回残缺数据时（如 QDII 清单骤减），跳过检查避免误报大批“新增基金”
const MIN_QDII_FUNDS = 100

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    return Response.json({ ok: false, error: "未配置 CRON_SECRET" }, { status: 500 })
  }

  if (request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return Response.json({ ok: false, error: "未授权" }, { status: 401 })
  }

  const dry = request.nextUrl.searchParams.get("dry") === "1"
  const checkedAt = new Date().toISOString()

  try {
    const { overseasFunds } = await fetchEastmoneyFunds()

    if (overseasFunds.length < MIN_QDII_FUNDS) {
      return Response.json(
        {
          ok: false,
          error: `东方财富数据异常：QDII 基金仅 ${overseasFunds.length} 只，跳过本次检查`,
        },
        { status: 502 },
      )
    }

    let snapshot: FundSnapshot | null
    try {
      snapshot = await readSnapshot()
    } catch (error) {
      return Response.json(
        { ok: false, error: error instanceof Error ? error.message : "快照读取失败" },
        { status: 500 },
      )
    }

    // 首次运行：建立基线并发送启动确认（无论推送成败都写快照，避免反复重发启动消息）
    if (snapshot == null) {
      const message = renderStartupMessage(overseasFunds, checkedAt)

      if (dry) {
        return Response.json({
          ok: true,
          firstRun: true,
          dry,
          fundCount: overseasFunds.length,
          pushed: false,
          message,
          pushResult: { ok: false, msg: "dry 模式，未发送" } satisfies PushPlusResult,
        })
      }

      await writeSnapshot(overseasFunds)

      const pushResult = await sendPushPlus(message)

      return Response.json(
        {
          ok: pushResult.ok,
          firstRun: true,
          dry,
          fundCount: overseasFunds.length,
          pushed: pushResult.ok,
          message,
          pushResult,
        },
        { status: pushResult.ok ? 200 : 502 },
      )
    }

    const changes = diffFunds(snapshot, overseasFunds)

    if (changes.length === 0) {
      return Response.json({
        ok: true,
        firstRun: false,
        dry,
        changes: 0,
        pushed: false,
        fundCount: overseasFunds.length,
      })
    }

    const message = renderChangeMessage(changes, checkedAt, request.nextUrl.origin)

    if (dry) {
      return Response.json({
        ok: true,
        firstRun: false,
        dry,
        changes: changes.length,
        pushed: false,
        fundCount: overseasFunds.length,
        message,
        pushResult: { ok: false, msg: "dry 模式，未发送" } satisfies PushPlusResult,
      })
    }

    const pushResult = await sendPushPlus(message)

    // 推送成功才更新快照；失败保留旧快照，下次运行自动重新检出并重试
    if (pushResult.ok) {
      await writeSnapshot(overseasFunds)
    }

    return Response.json(
      {
        ok: pushResult.ok,
        firstRun: false,
        dry,
        changes: changes.length,
        pushed: pushResult.ok,
        fundCount: overseasFunds.length,
        message,
        pushResult,
      },
      { status: pushResult.ok ? 200 : 502 },
    )
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "未知错误" },
      { status: 502 },
    )
  }
}
