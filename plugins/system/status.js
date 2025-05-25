import moment from "moment"
import PluginsLoader from "../../lib/plugins/loader.js"
import puppeteer from "../../lib/puppeteer/puppeteer.js"

const _path = process.cwd() + "/resources/html"

export class status extends plugin {
  constructor () {
    super({
      name: "状态统计",
      dsc: "#状态",
      event: "message",
      rule: [
        {
          reg: "^#(消息)?(状态|统计)$",
          fnc: "status"
        }
      ]
    })
  }

  async status () {
    const systemInfo = {
      系统信息: {
        运行时间: Bot.getTimeDiff(),
        内存使用: `${(process.memoryUsage().rss / 1024 / 1024).toFixed(2)}MB`,
        系统版本: `${process.platform} ${process.arch} Node.js ${process.version}`
      }
    }

    const accountOnlineTime = this.botTimeArray()
    let messageStats = {}
    if (!this.e.isMaster) {
      messageStats = await this.getCount({
        用户: this.e.user_id,
        群: this.e.group_id
      })
    } else {
      messageStats = await this.count()
    }

    const result = {
      ...systemInfo,
      账号在线时长: accountOnlineTime,
      ...messageStats
    }

    let html = {
      tplFile: `${_path}/status.html`,
      ResPath: process.cwd().replace(/\\/g, "/") + "/resources/font/",
      quality: 100,
      msg: JSON.stringify(result, null, 2)
    }

    let img = await puppeteer.screenshot("status", html)
    if (img) await this.e.reply(img)
  }

  botTimeArray () {
    let result = []
    for (const i of Bot.uin) {
      if (Bot[i]?.stat?.start_time) {
        result.push({ time: Bot.getTimeDiff(Bot[i].stat.start_time * 1000), id: i })
      }
    }
    return result
  }

  pluginTime () {
    let msg = "插件加载用时"
    for (const i in PluginsLoader.load_time) { msg += `\n${Bot.getTimeDiff(0, PluginsLoader.load_time[i])} ${i}` }
    return msg
  }

  count () {
    const cmd = {
      msg: this.e.msg.replace(/^#(状态|统计)/, "").trim().split(" ")
    }
    let key = ""
    for (const i of cmd.msg) {
      if (key) {
        cmd[key] = i
        key = ""
      } else {
        key = i
      }
    }
    return this.getCount(cmd)
  }

  async getCount (cmd) {
    const date = []
    if (cmd["日期"]) {
      cmd["日期"] = cmd["日期"].replace(/[^\d]/g, "")
      switch (cmd["日期"].length) {
        case 8:
          date.push([
            cmd["日期"].slice(0, 4),
            cmd["日期"].slice(4, 6),
            cmd["日期"].slice(6, 8)
          ])
          break
        case 4:
          date.push([
            moment().format("YYYY"),
            cmd["日期"].slice(0, 2),
            cmd["日期"].slice(2, 4)
          ])
          break
        case 2:
          date.push([
            moment().format("YYYY"),
            moment().format("MM"),
            cmd["日期"]
          ])
          break
        default:
          this.reply(`日期格式错误：${cmd["日期"]}`)
          return {}
      }
    } else {
      const d = moment()
      for (let i = 0; i < 3; i++) {
        date.push(d.format("YYYY MM DD").split(" "))
        d.add(-86400000)
      }
      date.push(
        [d.format("YYYY"), d.format("MM")],
        [d.format("YYYY")],
        ["total"]
      )
    }

    let msg = "消息统计"
    if (cmd["消息"]) {
      msg = `${cmd["消息"]} ${msg}`
    } else {
      cmd["消息"] = "msg"
    }

    const array = []
    if (cmd["机器人"]) { array.push({ text: "机器人", key: "bot", id: cmd["机器人"] }) }
    if (cmd["用户"]) { array.push({ text: "用户", key: "user", id: cmd["用户"] }) }
    if (cmd["群"]) { array.push({ text: "群", key: "group", id: cmd["群"] }) }
    if (!array.length) {
      array.push(
        { text: msg, key: "total" },
        { type: "keys", text: "用户量", key: "user:*" },
        { type: "keys", text: "群量", key: "group:*" }
      )
      if (this.e.self_id) { array.push({ text: "机器人", key: "bot", id: this.e.self_id }) }
      if (this.e.user_id) { array.push({ text: "用户", key: "user", id: this.e.user_id }) }
      if (this.e.group_id) { array.push({ text: "群", key: "group", id: this.e.group_id }) }
    }

    const result = {}
    for (const i of array) {
      const keyName = i.id ? `${i.text} ${i.id}` : `${i.text}`
      result[keyName] = []
      for (let d of date) {
        let key
        if (i.key === "total") {
          key = `:${cmd["消息"]}:${i.key}:${d.join(":")}`
        } else if (i.type === "keys") {
          key = `:${cmd["消息"]}:${i.key}:${d.join(":")}`
        } else {
          key = `:${cmd["消息"]}:${i.key}:${i.id || "*"}:${d.join(":")}`
        }

        d = d.join("-")
        if (d == "total") { d = "总计" }
        const ret = await this.redis(i.type, key)
        result[keyName].push({ date: d, receive: ret.receive, send: ret.send })
      }
    }

    return result
  }

  async redis (type, key) {
    const ret = {}
    for (const i of ["receive", "send"]) {
      const k = `Yz:count:${i}${key}`
      if (type == "keys") {
        ret[i] = await this.redisKeysLength(k) || 0
      } else {
        ret[i] = await redis.get(k) || 0
      }
    }
    return ret
  }

  async redisKeysLength (MATCH) {
    let cursor = 0; let length = 0
    do {
      const reply = await redis.scan(cursor, { MATCH, COUNT: 10000 })
      cursor = reply.cursor
      length += reply.keys.length
    } while (cursor != 0)
    return length
  }
}