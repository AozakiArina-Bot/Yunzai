import fs from "fs"
import yaml from "yaml"
import path from "path"
import crypto from "crypto"
import axios from "axios"
import jsQR from "jsqr"
import Jimp from "jimp"
import qs from "qs"

const _path = process.cwd().replace(/\\/g, "/")

class MihoyoQRLogin {
  /**
   * 初始化登录器
   * @param {string} cookie - 完整的米哈游cookie字符串
   * @param {object} [options] - 配置选项
   * @param {string} [options.device_id="d9951154-6eea-35e8-9e46-20c53f440ac7"] - 设备ID
   */
  constructor (cookie, options = {}) {
    this.cookie = this._parseCookie(cookie)
    this.raw_cookie = cookie
    if (!this.cookie.stuid || !this.cookie.stoken) {
      throw new Error("Cookie中必须包含stuid和stoken字段")
    }
    // 设置配置
    this.config = {
      salt: "6s25p5ox5y14umn1p61aqyyvbvvl3lrt",
      device_id: options.device_id || "d9951154-6eea-35e8-9e46-20c53f440ac7",
      headers: {
        "x-rpc-app_version": "2.67.1",
        "x-rpc-client_type": "5",
        "x-rpc-device_id":
          options.device_id || "d9951154-6eea-35e8-9e46-20c53f440ac7",
        "user-agent":
          "Mozilla/5.0 (Linux; Android 12; LIO-AN00 Build/TKQ1.220829.002; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/103.0.5060.129 Mobile Safari/537.36 miHoYoBBS/2.67.1",
        "x-rpc-app_id": "bll8iq97cem8",
        Referer: "https://app.mihoyo.com",
        Cookie: this.raw_cookie
      }
    }
  }

  /**
   * 解析cookie字符串为对象
   * @private
   */
  _parseCookie (cookieStr) {
    return cookieStr.split(";").reduce((cookies, item) => {
      const [key, value] = item.trim().split("=")
      cookies[key] = value
      return cookies
    }, {})
  }

  /**
   * 生成DS签名
   * @private
   */
  _generateDS () {
    const t = Math.floor(Date.now() / 1000)
    const r = Math.floor(Math.random() * 100000 + 100001)
    const m = `salt=${this.config.salt}&t=${t}&r=${r}`
    const hash = crypto.createHash("md5").update(m).digest("hex")
    return `${t},${r},${hash}`
  }

  /**
   * 获取game_token
   * @async
   */
  async _getGameToken () {
    const url = "https://api-takumi.mihoyo.com/auth/api/getGameToken"
    try {
      const headers = {
        ...this.config.headers,
        DS: this._generateDS()
      }
      const { data } = await axios.get(url, {
        params: {
          mid: this.cookie.mid,
          stoken: this.cookie.stoken
        },
        headers,
        paramsSerializer: (params) => qs.stringify(params)
      })
      if (data.message === "OK") {
        return data.data.game_token
      }
    } catch (error) {
      logger.error("获取gameToken失败", error.message)
    }
    return null
  }

  /**
   * 识别二维码图片并解析参数
   * @param {string|Buffer} imagePath - 二维码图片路径或Buffer数据
   * @async
   * @returns {object|null} 包含ticket, app_id和app_name的对象
   */
  async _parseQRCode (imagePath) {
    try {
      const image = await Jimp.read(imagePath)
      const { data, width, height } = image.bitmap
      const code = jsQR(new Uint8ClampedArray(data), width, height)
      if (!code?.data) return null
      const url = new URL(code.data)
      const params = new URLSearchParams(url.search)
      return {
        ticket: params.get("ticket"),
        app_id: params.get("app_id"),
        app_name: decodeURIComponent(params.get("app_name") || "")
      }
    } catch (error) {
      logger.error("识别登录二维码失败:", error.message)
      return null
    }
  }

  /**
   * 创建扫描会话
   * @private
   * @async
   */
  async _createScanSession () {
    const headers = {
      ...this.config.headers,
      DS: this._generateDS()
    }
    try {
      const response = await axios.post(
        "https://api-sdk.mihoyo.com/hk4e_cn/combo/panda/qrcode/scan",
        {},
        {
          headers
        }
      )
      return axios.create({
        baseURL: "https://api-sdk.mihoyo.com",
        headers: {
          ...headers,
          Cookie: response.headers["set-cookie"]?.join(";") || this.raw_cookie
        }
      })
    } catch (error) {
      logger.error("创建二维码登录连接失败", error.message)
      return null
    }
  }

  /**
   * 执行二维码登录流程
   * @param {string|Buffer} qrImage - 二维码图片路径或Buffer数据
   * @async
   */
  async login (qrImage) {
    const qrData = await this._parseQRCode(qrImage)
    if (!qrData || !qrData.ticket) {
      throw new Error("未识别到有效的二维码数据")
    }
    const { ticket, app_id, app_name } = qrData
    if (!app_id) {
      throw new Error("无法从二维码中获取app_id")
    }
    const session = await this._createScanSession()
    if (!session) throw new Error("二维码登录连接失败")
    try {
      const { data: scanData } = await session.post(
        "/hk4e_cn/combo/panda/qrcode/scan",
        {
          app_id,
          device: this.config.device_id,
          ticket
        }
      )
      if (scanData.retcode !== 0) {
        throw new Error(`${scanData.message} (${scanData.retcode})`)
      }
    } catch (error) {
      throw new Error("二维码登录请求失败: " + error.message)
    }
    const gameToken = await this._getGameToken()
    if (!gameToken) throw new Error("获取gameToken失败")
    try {
      const { data: confirmData } = await session.post(
        "/hk4e_cn/combo/panda/qrcode/confirm",
        {
          app_id: parseInt(app_id),
          device: this.config.device_id,
          payload: {
            proto: "Account",
            raw: JSON.stringify({
              uid: this.cookie.stuid,
              token: gameToken
            })
          },
          ticket
        }
      )
      if (confirmData.retcode !== 0) {
        throw new Error(`${confirmData.message} (${confirmData.retcode})`)
      }
      return {
        success: true,
        uid: this.cookie.stuid,
        game_token: gameToken,
        game: app_name || "未知游戏"
      }
    } catch (error) {
      throw new Error("确认登录失败: " + error.message)
    }
  }
}

export class MihoyoQRLogins extends plugin {
  constructor () {
    super({
      name: "米哈游游戏登录",
      event: "message",
      priority: Number.MIN_SAFE_INTEGER,
      rule: [
        {
          reg: /^#?(原神|星铁|绝区零|崩三)?确认(扫码)?(游戏)?(扫码)?登录$/,
          fnc: "QRLogin"
        }
      ]
    })
  }

  async QRLogin (e) {
    let game = "gs"
    if (e.msg.includes("*") || e.msg.includes("星铁")) {
      game = "sr"
    } else if (e.msg.includes("%") || e.msg.includes("绝区零")) {
      game = "zzz"
    } else if (e.msg.includes("!") || e.msg.includes("崩三")) {
      game = "bh3"
    }
    const uid = await e.runtime.MysInfo.getUid({
      ...this.e,
      game
    })
    if (!uid) return
    try {
      const filePath = path.join(
        _path,
        "plugins",
        "xiaoyao-cvs-plugin",
        "data",
        "yaml",
        `${e.user_id}.yaml`
      )
      if (!fs.existsSync(filePath)) {
        e.reply("请发送【#扫码登录】完成登录后进行快捷登录游戏", true)
        return
      }
      const url = await this.getimageUrl(e)
      if (!url)
      { return await e.reply(
        "请同时发送登录二维码或引用别人的二维码消息",
        true
      ) }
      const fileContent = fs.readFileSync(filePath, "utf8")
      const accounts = yaml.parse(fileContent)
      let account = accounts[uid]
      if (!account) {
        if (Object.keys(accounts).length === 0)
        { return await e.reply(
            `未找到UID ${uid} 对应的账号信息，请发送【#扫码登录】完成登录后进行快捷登录游戏`,
            true
        ) }
        await e.reply(
          `未找到UID ${uid} 对应的账号信息，将随机选择一个米哈游账号进行完成登录操作...如若该账号不是目标请发送【#刷新ck】...`,
          true
        )
        account = accounts[0]
      }
      const cookie = `stuid=${account.stuid}; stoken=${account.stoken}; ltoken=${account.ltoken}; mid=${account.mid}`
      const qrLogin = new MihoyoQRLogin(cookie)
      const response = await fetch(url)
      const arrayBuffer = await response.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      qrLogin
        .login(buffer)
        .then(async (result) => {
          await e.reply(
            `登录成功！\n当前登录米游社UID: ${result.uid}\n登录应用: ${result.game}`,
            true
          )
        })
        .catch(async (error) => {
          await e.reply(`扫码登录游戏失败: ${error.message}`, true)
          logger.error("扫码登录游戏失败:", error.message)
        })
    } catch (err) {
      logger.error("扫码登录游戏失败", err)
      await e.reply("获取登录出错，请稍后再试", true)
    }
  }

  async getimageUrl (e) {
    let imageUrl = e.img?.[0]
    if (!imageUrl) {
      if (e.bot?.adapter?.id !== "QQ") return null
      const response = await e.getReply()
      const msgObj = JSON.parse(JSON.stringify(response))
      const imageMessage = msgObj.message.find((item) => item.type === "image")
      if (imageMessage) {
        imageUrl = imageMessage.url
      }
    }
    return imageUrl || null
  }
}
