import lodash from "lodash"
import moment from "moment"
import fs from "node:fs/promises"
import cfg from "../../lib/config/config.js"
import puppeteer from "../../lib/puppeteer/puppeteer.js"

const _path = process.cwd() + "/resources/html"

const LOG_LEVELS_TO_PROCESS = ["MARK", "ERRO"] // 想处理什么日志等级，在这里加，比如 ["MARK", "ERRO", "WARN"]

export class sendLog extends plugin {
  constructor () {
    super({
      name: "发送日志",
      dsc: "发送最近50条运行日志",
      event: "message",
      priority: -Infinity,
      rule: [
        {
          reg: "^#(运行|错误)*日志[0-9]*(.*)",
          fnc: "sendLog",
          permission: "master"
        }
      ]
    })
    this.lineNum = cfg.bot.line
    this.maxNum = cfg.bot.length
    this.logFile = `logs/command.${moment().format("YYYY-MM-DD")}.log`
    this.errFile = "logs/error.log"
  }

  async sendLog () {
    let lineNum = this.e.msg.match(/\d+/g)
    if (lineNum) {
      this.lineNum = lineNum[0]
    }

    let logFile = this.logFile
    let type = "运行"
    if (this.e.msg.includes("错误")) {
      logFile = this.errFile
      type = "错误"
    }

    const log = await this.getLog(logFile)
    let filteredLog = []

    for (let i = 0; i < log.length; i++) {
      const line = log[i]
      const match = line.match(/\[(\w+)\]/)
      const level = match ? match[1] : ""

      if (LOG_LEVELS_TO_PROCESS.includes(level)) {
        let fullLog = [line]
        if (level === "ERRO") { // 只有遇到 ERRO 才继续合并堆栈
          i++
          while (i < log.length) {
            const nextLine = log[i]
            const nextMatch = nextLine.match(/\[(\w+)\]/)
            const nextLevel = nextMatch ? nextMatch[1] : ""

            if (LOG_LEVELS_TO_PROCESS.includes(nextLevel)) {
              i-- // 回退一行，下次循环处理
              break
            }
            fullLog.push(nextLine)
            i++
          }
        }
        filteredLog.push(fullLog.join("\n"))
      }
    }

    if (lodash.isEmpty(filteredLog)) { return this.reply(`暂无相关日志：${type}`) }

    filteredLog = filteredLog.slice(0, this.lineNum)

    const formattedLogs = filteredLog.map(line => {
      const timeMatch = line.match(/\[([\d:\.]+)\]/)
      const levelMatch = line.match(/\[(MARK|ERRO)\]/)

      if (line.includes("[ERRO]")) {
        const lines = line.split("\n")
        const firstLine = lines[0].replace(/\[[\d:\.]+\]\[ERRO\]/, "").trim()
        const firstBracket = firstLine.match(/\[(.*?)\]/)
        const messageContent = firstBracket && /\d/.test(firstBracket[1]) ? firstLine : firstLine.replace(/\[.*?\]/, "")
        const otherLines = lines.slice(1).join("\n")
        return {
          time: timeMatch ? timeMatch[1] : "",
          level: "ERRO",
          message: messageContent + (otherLines ? "\n" + otherLines : "")
        }
      } else {
        const messageContent = line.replace(/\[[\d:\.]+\]\[(MARK|ERRO)\]/, "").trim()
        const firstBracket = messageContent.match(/\[(.*?)\]/)
        return {
          time: timeMatch ? timeMatch[1] : "",
          level: levelMatch ? levelMatch[1] : "",
          message: firstBracket && /\d/.test(firstBracket[1]) ? messageContent : messageContent.replace(/\[.*?\]/, "")
        }
      }
    })

    let logs = JSON.stringify(formattedLogs, null, 2)
    let html = {
      tplFile: `${_path}/log.html`,
      logs,
      ResPath: process.cwd().replace(/\\/g, "/") + "/resources/font/",
      quality: 100
    }

    let img = await puppeteer.screenshot("log", html)
    if (img) await this.e.reply(img)
    return true
  }

  async getLog (logFile) {
    let log = await fs.readFile(logFile, "utf8")
    log = log.split("\n")

    const mergedLogs = []
    let buffer = []

    for (let i = 0; i < log.length; i++) {
      const line = log[i].replace(/\x1b[[0-9;]*m/g, "") // 保留去除颜色代码的处理
      if (line.match(/\[(ERRO|MARK)\]/)) {
        if (buffer.length > 0) mergedLogs.push(buffer.join("\n"))
        buffer = [line]
      } else {
        buffer.push(line)
      }
    }
    if (buffer.length > 0) mergedLogs.push(buffer.join("\n"))

    return mergedLogs.reverse()
  }
}
