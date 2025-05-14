import setLog from "./log.js"
import cfg from "./config.js"
import redisInit from "./redis.js"

/** 设置标题 */
process.title = `Yunzai v${cfg.package.version} © 2025 - 2026 Aozaki Arina`

/** 设置时区 */
process.env.TZ = "Asia/Shanghai"

for (const i of ["SIGHUP", "SIGTERM"]) { process.on(i, (signal, code) => process.exit(code)) }

/** 日志设置 */
setLog()

/** 捕获未处理的错误 */
for (const i of ["uncaughtException", "unhandledRejection"]) {
  process.on(i, e => {
    try {
      Bot.makeLog("error", e, i)
    } catch (err) {
      console.error(i, e, err)
      process.exit()
    }
  })
}

logger.mark("----^_^----")
logger.mark(logger.yellow(`Yunzai v${cfg.package.version} 启动中...`))
logger.mark(logger.cyan("https://gitee.com/HanaHimeUnica/Yunzai"))

let stack
export default async function init () {
  if (stack !== undefined) return
  stack = ""

  const redis = await redisInit()
  const exit = process.exit
  process.exit = async code => {
    stack = Error().stack
    if (redis.process) {
      await Bot.sleep(5000, redis.save())
      redis.process.kill()
    }
    exit(code)
  }

  /** 退出事件 */
  process.on("exit", code => {
    Bot.makeLog("mark", logger.magenta(`Yunzai 已停止运行，本次运行时长：${Bot.getTimeDiff()} (${code})`), "exit")
    Bot.makeLog("trace", (stack || Error().stack), "exit")
  })
}