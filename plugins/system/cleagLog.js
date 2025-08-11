import fs from "node:fs"
import path from "node:path"
import moment from "moment"

export class clearLogs extends plugin {
  constructor () {
    super({
      name: "清理日志文件",
      dsc: "每天自动清理7天前的日志文件",
      event: "message",
      priority: 5,
      task: {
        name: "清理日志文件",
        cron: "0 0 0 * * *", // 每天0点执行
        fnc: () => this.clearLogs()
      },
      rule: [
        {
          reg: "^[#/]*清理日志$",
          fnc: "clearLogs"
        }
      ]
    })
  }

  async clearLogs () {
    const logsDir = "logs"
    try {
      const sevenDaysAgo = moment().subtract(8, "days").format("YYYY-MM-DD")
      const files = await fs.promises.readdir(logsDir)
      for (const file of files) {
        if (file === "error.log") continue
        if (file.startsWith("command.")) {
          const dateMatch = file.match(/command\.(\d{4}-\d{2}-\d{2})\.log/)
          if (dateMatch) {
            const fileDate = dateMatch[1]
            if (fileDate < sevenDaysAgo) {
              const filePath = path.join(logsDir, file)
              await fs.promises.unlink(filePath)
              logger.info(`[清理日志] 已删除过期日志: ${file}`)
            }
          }
        }
      }
      logger.info("[清理日志] 清理完成")
    } catch (err) {
      logger.error(`[清理日志] 清理失败: ${err}`)
    }
  }
}