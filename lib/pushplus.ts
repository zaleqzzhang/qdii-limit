const PUSHPLUS_SEND_URL = "https://www.pushplus.plus/send"

export type PushPlusResult = {
  ok: boolean
  code?: number
  msg: string
}

export async function sendPushPlus(params: {
  title: string
  content: string
}): Promise<PushPlusResult> {
  const token = process.env.PUSHPLUS_TOKEN

  if (!token) {
    return { ok: false, msg: "未配置 PUSHPLUS_TOKEN" }
  }

  try {
    const response = await fetch(PUSHPLUS_SEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        title: params.title.slice(0, 100),
        content: params.content,
        template: "markdown",
      }),
      signal: AbortSignal.timeout(10_000),
    })

    if (!response.ok) {
      return { ok: false, msg: `PushPlus 请求失败：${response.status}` }
    }

    const body = (await response.json()) as { code?: number; msg?: string }

    if (body.code === 200) {
      return { ok: true, code: body.code, msg: body.msg ?? "请求成功" }
    }

    return { ok: false, code: body.code, msg: body.msg ?? "PushPlus 返回未知错误" }
  } catch (error) {
    return {
      ok: false,
      msg: error instanceof Error ? `PushPlus 发送异常：${error.message}` : "PushPlus 发送异常",
    }
  }
}
