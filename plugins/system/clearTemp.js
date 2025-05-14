import fs from "node:fs"
import path from "node:path"
import { Restart } from "../other/restart.js"

export class clearTemp extends plugin {
  constructor () {
    super({
      name: "清理临时文件",
      dsc: "每月自动清理temp文件夹",
      event: "message",
      priority: 5,
      task: {
        name: "清理临时文件",
        cron: "0 0 1 * *",
        fnc: () => this.clearTemp()
      }
    })
  }

  async clearTemp () {
    const tempDir = "temp"
    try {
      const files = await fs.readdir(tempDir)
      for (const file of files) {
        const filePath = path.join(tempDir, file)
        await fs.rm(filePath, { recursive: true, force: true })
      }
      logger.info("[清理临时文件] 清理完成")
      // 清理完成后重启
      const e = {
        reply: msg => Bot.sendMasterMsg(msg),
        isMaster: true
      }
      const restart = new Restart(e)
      await restart.restart()
    } catch (err) {
      logger.error(`[清理临时文件] 清理失败: ${err}`)
    }
  }
}