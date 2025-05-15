import cfg from "../../lib/config/config.js"
import fs from "node:fs/promises"
import { Restart } from "./restart.js"
import puppeteer from "../../lib/puppeteer/puppeteer.js"

let uping = false

export class update extends plugin {
  typeName = "Yunzai"
  updateResults = [] // 添加数组存储更新结果
  errorResults = [] // 添加数组存储错误信息
  constructor () {
    super({
      name: "更新",
      dsc: "#更新 #强制更新",
      event: "message",
      priority: -Infinity,
      rule: [
        {
          reg: "^#更新日志",
          fnc: "updateLog"
        },
        {
          reg: "^#(安?静)?(强制)?更新",
          fnc: "update"
        },
        {
          reg: "^#全部(安?静)?(强制)?更新$",
          fnc: "updateAll",
          permission: "master"
        },
        {
          reg: "^#回退.*?\\d+$",
          fnc: "rollback",
          permission: "master"
        }
      ]
    })
  }

  get quiet () {
    return this.e.msg.includes("全部") || this.e.msg.includes("静")
  }

  exec (cmd, plugin, opts = {}) {
    if (plugin) opts.cwd = `plugins/${plugin}`
    return Bot.exec(cmd, opts)
  }

  init () {
    this.e = {
      isMaster: true,
      logFnc: "[自动更新]",
      msg: "#全部静更新",
      reply: (msg) => Bot.sendMasterMsg(msg)
    }
    if (cfg.bot.update_time) {
      this.autoUpdate()
    }
    if (cfg.bot.update_time) { this.autoUpdate() }

    this.task = []
    if (cfg.bot.update_cron) {
      for (const i of Array.isArray(cfg.bot.update_cron) ? cfg.bot.update_cron : [cfg.bot.update_cron]) {
        this.task.push({
          name: "定时更新",
          cron: i,
          fnc: this.updateAll.bind(this)
        })
      }
    }
  }

  autoUpdate () {
    setTimeout(() => this.updateAll().finally(this.autoUpdate.bind(this)), cfg.bot.update_time * 60000)
  }

  async update () {
    if (!this.e.isMaster) return false
    if (uping) {
      await this.reply("正在更新，请稍候再试")
      return false
    }
    /** 获取插件 */
    const plugin = await this.getPlugin()
    if (plugin === false) return false

    uping = true
    this.updateResults = []
    this.errorResults = []

    // 保存更新前的 commit ID
    const oldCommitId = await this.getCommitId(plugin)
    const result = await this.runUpdate(plugin)

    if (result) {
      // 先发送更新状态
      if (this.updateResults.length > 0) {
        await this.e.reply(this.updateResults[0])
      }

      // 再发送更新日志
      this.oldCommitId = oldCommitId
      const log = await this.getLog(plugin)
      if (log) await this.e.reply(log)
    } else if (this.errorResults.length > 0) {
      // 发送错误信息
      await this.e.reply(this.errorResults[0].error)
    }

    if (this.isPkgUp) await this.updatePackage()
    if (this.isUp) this.restart()
    uping = false
  }

  async getPlugin (plugin = this.e.msg.replace(/#(安?静)?(强制)?更新(日志)?/, "")) {
    if (!plugin) return ""
    for (const i of [plugin, `${plugin}-Plugin`, `${plugin}-plugin`]) {
      if (await Bot.fsStat(`plugins/${i}/.git`)) {
        this.typeName = i
        return i
      }
    }
    return false
  }

  async runUpdate (plugin = "") {
    let cm = "git pull"
    let type = "更新"
    if (!plugin) cm = `git checkout package.json && ${cm}`

    // 在执行强制更新前保存当前的 commit ID
    this.oldCommitId = await this.getCommitId(plugin)

    if (this.e.msg.includes("强制")) {
      type = "强制更新"
      cm = `git reset --hard ${await this.getRemoteBranch(true, plugin)} && git pull --rebase`
    }

    logger.mark(`${this.e.logFnc} 开始${type} ${this.typeName}`)
    if (!this.quiet) {
      await this.reply(`开始${type} ${this.typeName}`)
    }

    // 添加超时处理
    const execPromise = this.exec(cm, plugin)
    const timeoutPromise = new Promise((resolve) => {
      setTimeout(() => {
        resolve({ timeout: true })
      }, 15000) // 15秒超时
    })

    const ret = await Promise.race([execPromise, timeoutPromise])

    // 如果是超时，先检查实际的git操作结果
    if (ret.timeout) {
      const actualRet = await execPromise
      // 如果实际操作有错误，优先使用实际错误
      if (actualRet.error) {
        return await this.gitErr(plugin, actualRet.stdout, actualRet.error.message)
      }
      // 如果实际操作成功，就不当作超时处理
      ret.stdout = actualRet.stdout
      ret.error = null
    }

    if (ret.error) {
      logger.mark(`${this.e.logFnc} 更新失败 ${this.typeName}`)
      return await this.gitErr(plugin, ret.stdout, ret.error.message)
    }

    // 增强依赖更新检测
    const time = await this.getTime(plugin)
    if (/Already up|已经是最新/.test(ret.stdout)) {
      if (!this.quiet) {
        this.updateResults.push(`${this.typeName} 已是最新\n最后更新时间：${time}`)
      }
    } else {
      this.isUp = true
      if (/package(?:-lock)?\.json|pnpm-lock\.yaml/.test(ret.stdout)) {
        this.isPkgUp = true
      }
      this.updateResults.push(`${this.typeName} 更新成功\n更新时间：${time}`)
    }

    logger.mark(`${this.e.logFnc} 最后更新时间：${time}`)
    return true
  }

  async getCommitId (...args) {
    return (await this.exec("git rev-parse --short HEAD", ...args)).stdout
  }

  async getTime (...args) {
    return (await this.exec("git log -1 --pretty=%cd --date=format:\"%F %T\"", ...args)).stdout
  }

  async getBranch (...args) {
    return (await this.exec("git branch --show-current", ...args)).stdout
  }

  async getRemote (branch, ...args) {
    return (await this.exec(`git config branch.${branch}.remote`, ...args)).stdout
  }

  async getRemoteBranch (string, ...args) {
    const branch = await this.getBranch(...args)
    if (!branch && string) return ""
    const remote = await this.getRemote(branch, ...args)
    if (!remote && string) return ""
    return string ? `${remote}/${branch}` : { remote, branch }
  }

  async getRemoteUrl (branch, hide, ...args) {
    if (branch) {
      const url = (await this.exec(`git config remote.${branch}.url`, ...args)).stdout
      return hide ? url.replace(/\/\/([^@]+)@/, "//") : url
    }

    const ret = await this.exec("git config -l", ...args)
    const urls = {}
    for (const i of ret.stdout.match(/remote\..*?\.url=.+/g) || []) {
      const branch = i.replace(/remote\.(.*?)\.url=.+/g, "$1")
      const url = i.replace(/remote\..*?\.url=/g, "")
      urls[branch] = hide ? url.replace(/\/\/([^@]+)@/, "//") : url
    }
    return urls
  }

  gitErrUrl (error) {
    return error.match(/'(.+?)'/g)[0].replace(/'(.+?)'/, "$1")
  }

  async rollback () {
    if (!this.e.isMaster) return false
    if (uping) {
      await this.reply("正在更新，请稍候再试")
      return false
    }

    // 解析回退版本数
    const match = this.e.msg.match(/回退(.*?)(\d+)$/)
    if (!match) {
      await this.reply("格式错误，请使用 #回退插件名称数字 例如：#回退Yunzai3")
      return false
    }

    const plugin = await this.getPlugin(match[1])
    if (plugin === false && match[1]) {
      await this.reply("未找到该插件")
      return false
    }

    const steps = parseInt(match[2])
    if (steps <= 0 || steps > 50) {
      await this.reply("回退版本数必须在1-50之间")
      return false
    }

    uping = true
    this.updateResults = []
    this.errorResults = []

    // 获取当前commit用于记录
    const currentCommit = await this.getCommitId(plugin)

    // 先执行 fetch --unshallow 获取完整历史
    await this.exec("git fetch --unshallow origin", plugin)

    // 执行回退
    const cmd = `git reset --hard HEAD~${steps}`
    logger.mark(`${this.e.logFnc} 开始回退 ${this.typeName} ${steps}个版本`)
    if (!this.quiet) {
      await this.reply(`开始回退 ${this.typeName} ${steps}个版本`)
    }

    const ret = await this.exec(cmd, plugin)

    if (ret.error) {
      logger.mark(`${this.e.logFnc} 回退失败 ${this.typeName}`)
      this.errorResults.push({
        plugin: this.typeName,
        error: `${this.typeName} 回退失败\n${ret.error.message}`
      })
      await this.e.reply(this.errorResults[0].error)
      uping = false
      return false
    }

    // 获取回退后的日志
    const time = await this.getTime(plugin)
    const latestCommit = await this.exec("git log -1 --pretty=\"[%cd] %s\" --date=format:\"%F %T\"", plugin)
    this.updateResults.push(`${this.typeName} 已回退${steps}个版本\n当前版本时间：${time}\n当前最新记录：${latestCommit.stdout}`)
    await this.e.reply(this.updateResults[0])

    // 获取回退日志
    this.oldCommitId = currentCommit
    const log = await this.getLog(plugin)
    if (log) await this.e.reply(log)

    if (this.isPkgUp) await this.updatePackage()
    if (this.isUp) this.restart()
    uping = false
    return true
  }

  async gitErr (plugin, stdout, error) {
    let errorMsg
    if (/unable to access|无法访问/.test(error)) {
      errorMsg = `远程仓库连接错误：${this.gitErrUrl(error)}`
    } else if (/not found|未找到|does not (exist|appear)|不存在|Authentication failed|鉴权失败/.test(error)) {
      errorMsg = `远程仓库地址错误：${this.gitErrUrl(error)}`
    } else if (/be overwritten by merge|被合并操作覆盖/.test(error) || /Merge conflict|合并冲突/.test(stdout)) {
      errorMsg = `${error}\n${stdout}\n若修改过文件请手动更新，否则发送 #强制更新${plugin}`
    } else if (/divergent branches|偏离的分支/.test(error)) {
      const ret = await this.exec("git pull --rebase", plugin)
      if (!ret.error && /Successfully rebased|成功变基/.test(ret.stdout + ret.stderr)) {
        return true
      }
      errorMsg = `${error}\n${stdout}\n若修改过文件请手动更新，否则发送 #强制更新${plugin}`
    } else {
      errorMsg = `${error}\n${stdout}\n未知错误，可尝试发送 #强制更新${plugin}`
    }

    this.errorResults.push({
      plugin: this.typeName,
      error: errorMsg
    })
    return false
  }

  async updateAll () {
    if (uping) {
      await this.reply("正在更新，请稍候再试")
      return false
    }

    uping = true
    await this.reply("开始更新全部插件，请耐心等待...")
    this.updateResults = []
    this.errorResults = [] // 重置错误信息数组
    const allLogs = []

    const mainResult = await this.runUpdate()
    if (mainResult) {
      const mainLog = await this.getLog()
      if (mainLog) allLogs.push({ name: "Yunzai", log: mainLog })
    }

    for (let plugin of await fs.readdir("plugins")) {
      plugin = await this.getPlugin(plugin)
      if (plugin === false) continue

      const result = await this.runUpdate(plugin)
      if (result) {
        const pluginLog = await this.getLog(plugin)
        if (pluginLog) allLogs.push({ name: plugin, log: pluginLog })
      }
    }
    if (allLogs.length > 0) {
      const summaryNodes = [
        {
          user_id: "80000000",
          nickname: "更新日志汇总",
          message: `共更新了 ${allLogs.length} 个插件`
        }
      ]

      for (const item of allLogs) {
        // 这里不应该重新获取日志，而是直接使用已经保存的日志
        summaryNodes.push({
          user_id: "80000000",
          nickname: item.name + "更新日志",
          message: item.log
        })
      }
      const summaryForward = await Bot.makeForwardMsg(summaryNodes)
      await this.e.reply(summaryForward)
    }

    // 在所有更新完成后，如果有错误信息，添加到合并转发消息中
    if (this.errorResults.length > 0) {
      const errorNodes = [
        {
          user_id: "80000000",
          nickname: "更新错误汇总",
          message: `共有 ${this.errorResults.length} 个插件更新失败`
        }
      ]

      for (const error of this.errorResults) {
        errorNodes.push({
          user_id: "80000000",
          nickname: `${error.plugin} 更新失败`,
          message: error.error
        })
      }

      const errorForward = await Bot.makeForwardMsg(errorNodes)
      await this.e.reply(errorForward)
    }

    if (this.isPkgUp) await this.updatePackage()
    if (this.isUp) this.restart()
    uping = false
  }

  async updatePackage () {
    const cmd = "pnpm install"
    if (process.platform === "win32") {
      return this.reply(`检测到依赖更新，请 #关机 后执行 ${cmd}`)
    }
    await this.reply("开始更新依赖")
    return this.exec(cmd)
  }

  restart () {
    new Restart(this.e).restart()
  }

  async getLog (plugin = "") {
    let cm = await this.exec("git log -20 --pretty=\"%h||[%cd] %s\" --date=format:\"%F %T\"", plugin)
    if (cm.error) return this.reply(cm.error.message)
    const logAll = cm.stdout.split("\n")
    if (!logAll.length) return false

    let log = []
    if (this.e.msg.includes("强制")) {
      // 强制更新时获取最近的更新记录
      for (let str of logAll) {
        str = str.split("||")
        if (str[1].includes("Merge branch")) continue
        log.push(str[1])
      }
    } else {
      // 普通更新时使用 oldCommitId 作为截止点
      for (let str of logAll) {
        str = str.split("||")
        if (str[0] === this.oldCommitId) break
        if (str[1].includes("Merge branch")) continue
        log.push(str[1])
      }
    }

    if (log.length <= 0) return false

    const msg = [`${plugin || "Yunzai"} 更新日志，共${log.length}条`, log.join("\n\n")]
    const end = await this.getRemoteUrl((await this.getRemoteBranch(false, plugin)).remote, true, plugin)
    if (end) msg.push(end)
    return Bot.makeForwardArray(msg)
  }

  async getLogAsJson (plugin = "") {
    let cm = await this.exec("git log -20 --pretty=\"%h||[%cd] %s\" --date=format:\"%F %T\"", plugin)
    if (cm.error) return { error: cm.error.message }

    const logAll = cm.stdout.split("\n")
    if (!logAll.length) return { logs: [] }

    let logs = []
    for (let str of logAll) {
      str = str.split("||")
      if (str[0] === this.oldCommitId) break
      if (str[1].includes("Merge branch")) continue

      // 分离日期和内容
      const messageParts = str[1].match(/^\[(.*?)\] (.*)$/)
      if (messageParts) {
        // 获取更改的文件数量和行数
        const diffStat = await this.exec(`git diff --stat ${str[0]}`, plugin)
        console.log(diffStat.stdout) // 输出命令结果以进行调试
        const fileChanges = diffStat.stdout.match(/(\d+) files? changed/)
        const lineChanges = diffStat.stdout.match(/(\d+) insertions?\(\+\), (\d+) deletions?\(-\)/)

        logs.push({
          commitId: str[0],
          date: messageParts[1],
          content: messageParts[2],
          filesChanged: fileChanges ? parseInt(fileChanges[1]) : 0,
          linesAdded: lineChanges ? parseInt(lineChanges[1]) : 0,
          linesDeleted: lineChanges ? parseInt(lineChanges[2]) : 0
        })
      }
    }
    return {
      plugin: plugin || "Yunzai",
      totalLogs: logs.length,
      logs,
      remoteUrl: "" // 移除链接
    }
  }

  async updateLog () {
    const plugin = await this.getPlugin()
    if (plugin === false) return false
    const logData = JSON.stringify(await this.getLogAsJson(plugin), null, 2)

    const html = {
      tplFile: `${process.cwd()}/resources/html/version.html`,
      ResPath: process.cwd().replace(/\\/g, "/") + "/resources/font/",
      quality: 100,
      logData
    }

    // 使用 puppeteer 渲染图片
    let img = await puppeteer.screenshot("version", html)
    if (img) await this.e.reply(img)
  }
}
