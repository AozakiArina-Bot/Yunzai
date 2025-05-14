import log4js from "log4js"
import { Chalk } from "chalk"
import cfg from "./config.js"
import fs from "node:fs"

/**
* 设置日志样式
*/
export default function setLog () {
  if (!fs.existsSync("logs"))
  { fs.mkdirSync("logs") }

  /** 调整error日志等级 */
  // log4js.levels.levels[5].level = Number.MAX_VALUE
  // log4js.levels.levels.sort((a, b) => a.level - b.level)

  log4js.configure({
    appenders: {
      console: {
        type: "console",
        layout: {
          type: "pattern",
          pattern: "%[[%d{hh:mm:ss.SSS}]%]%m"
        }
      },
      command: {
        type: "dateFile", // 可以是console,dateFile,file,Logstash等
        filename: "logs/command", // 将会按照filename和pattern拼接文件名
        pattern: "yyyy-MM-dd.log",
        numBackups: 15,
        alwaysIncludePattern: true,
        layout: {
          type: "pattern",
          pattern: "%[[%d{hh:mm:ss.SSS}]%]%m"
        }
      },
      error: {
        type: "file",
        filename: "logs/error.log",
        alwaysIncludePattern: true,
        layout: {
          type: "pattern",
          pattern: "%[[%d{hh:mm:ss.SSS}]%]%m"
        }
      }
    },
    categories: {
      default: { appenders: ["console"], level: cfg.bot.log_level },
      command: { appenders: ["console", "command"], level: "warn" },
      error: { appenders: ["console", "command", "error"], level: "error" }
    }
  })

  /** 全局变量 logger */
  const chalk = new Chalk({ level: 3 })
  chalk.logger = {
    defaultLogger: log4js.getLogger("message"),
    commandLogger: log4js.getLogger("command"),
    errorLogger: log4js.getLogger("error"),
    trace (...args) { return this.defaultLogger.trace(chalk.bgGray.white("[TRAC]"), chalk.gray(...args)) },
    debug (...args) { return this.defaultLogger.debug(chalk.bgGreen.black("[DEBG]"), chalk.green(...args)) },
    info (...args) { return this.defaultLogger.info(chalk.bgBlue.white("[INFO]"), chalk.white(...args)) },
    warn (...args) { return this.commandLogger.warn(chalk.bgYellow.black("[WARN]"), chalk.yellow(...args)) },
    error (...args) { return this.errorLogger.error(chalk.bgRed.white("[ERRO]"), chalk.red(...args)) },
    fatal (...args) { return this.errorLogger.fatal(chalk.bgMagenta.white("[FATL]"), chalk.magenta(...args)) },
    mark (...args) { return this.commandLogger.mark(chalk.bgCyan.black("[MARK]"), chalk.white(...args)) }
  }
  const defid = chalk.blue(`[${cfg.bot.log_align || "Yunzai"}]`)
  for (const i in chalk.logger) {
    if (typeof chalk.logger[i] == "function") { chalk[i] = (...args) => chalk.logger[i](defid, ...args) }
  }
  global.logger = chalk
}