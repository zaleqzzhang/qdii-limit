const PUSHPLUS_BATCH_SEND_URL = "https://www.pushplus.plus/batchSend"

// 各渠道的 option（渠道配置编码），与 channel 一一对应：
// wechat 无需 option；mail 需要个人中心「渠道设置 → 邮箱」创建的配置编码
function channelOption(channel: string): string {
  if (channel === "mail") return process.env.PUSHPLUS_MAIL_OPTION ?? ""
  return ""
}

function resolveChannels(): string[] {
  const channels = process.env.PUSHPLUS_CHANNELS?.split(",")
    .map((channel) => channel.trim())
    .filter(Boolean)

  return channels?.length ? channels : ["wechat"]
}

export type PushPlusChannelResult = {
  channel: string
  code?: number
  msg: string
}

export type PushPlusResult = {
  ok: boolean
  code?: number
  msg: string
  channels?: PushPlusChannelResult[]
}

export async function sendPushPlus(params: {
  title: string
  content: string
}): Promise<PushPlusResult> {
  const token = process.env.PUSHPLUS_TOKEN

  if (!token) {
    return { ok: false, msg: "未配置 PUSHPLUS_TOKEN" }
  }

  const channels = resolveChannels()
  // option 与 channel 一一对应，无需配置的渠道用空占位，如 "wechat,mail" → ",163"
  const option = channels.map(channelOption).join(",")

  try {
    const response = await fetch(PUSHPLUS_BATCH_SEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        title: params.title.slice(0, 100),
        content: params.content,
        template: "markdown",
        channel: channels.join(","),
        ...(option ? { option } : {}),
      }),
      signal: AbortSignal.timeout(15_000),
    })

    if (!response.ok) {
      return { ok: false, msg: `PushPlus 请求失败：${response.status}` }
    }

    const body = (await response.json()) as {
      code?: number
      msg?: string
      data?: { code?: number; message?: string; channel?: string }[]
    }

    if (body.code !== 200) {
      return { ok: false, code: body.code, msg: body.msg ?? "PushPlus 返回未知错误" }
    }

    // batchSend 为异步发送：code=200 仅代表服务端受理，各渠道受理结果在 data 中返回
    const channelResults: PushPlusChannelResult[] = (body.data ?? []).map((item) => ({
      channel: item.channel ?? "?",
      code: item.code,
      msg: item.message ?? "",
    }))
    const accepted = channelResults.filter((result) => result.code === 200)
    const failed = channelResults.filter((result) => result.code !== 200)

    if (channelResults.length > 0 && accepted.length === 0) {
      return {
        ok: false,
        code: body.code,
        msg: failed.map((result) => `${result.channel}：${result.msg}`).join("；"),
        channels: channelResults,
      }
    }

    return {
      ok: true,
      code: body.code,
      msg:
        failed.length > 0
          ? `部分渠道受理失败：${failed.map((result) => `${result.channel}：${result.msg}`).join("；")}`
          : `已受理 ${accepted.length || channels.length} 个渠道（${channels.join("、")}）`,
      channels: channelResults,
    }
  } catch (error) {
    return {
      ok: false,
      msg: error instanceof Error ? `PushPlus 发送异常：${error.message}` : "PushPlus 发送异常",
    }
  }
}
