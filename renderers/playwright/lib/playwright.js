import Renderer from "../../../lib/renderer/Renderer.js"
import path from "node:path"
import { chromium } from "playwright"
import cfg from "../../../lib/config/config.js"
import moment from "moment"

export default class Playwright extends Renderer {
  constructor (config = {}) {
    super({
      id: "playwright",
      type: "image",
      render: "screenshot"
    })
    this.browser = false
    this.context = false
    this.lock = false
    this.shoting = []
    this.restartNum = 100
    this.renderNum = 0
    this.deviceScaleFactor = Number(config.deviceScaleFactor || cfg?.bot?.puppeteer_deviceScaleFactor || 1) || 1
    this.config = {
      headless: true,
      ...config
    }
  }

  async browserInit () {
    if (this.context) return this.context
    if (this.browser) {
      this.context = await this.browser.newContext({ deviceScaleFactor: this.deviceScaleFactor })
      return this.context
    }
    if (this.lock) return false
    this.lock = true
    logger.info("playwright Chromium 启动中...")
    this.browser = await chromium.launch(this.config).catch(err => {
      logger.error("playwright Chromium 启动失败", err)
      return false
    })
    this.lock = false
    if (!this.browser) {
      logger.error("playwright Chromium 启动失败")
      return false
    }
    this.context = await this.browser.newContext({ deviceScaleFactor: this.deviceScaleFactor })
    logger.info("playwright Chromium 启动成功")
    this.browser.on("disconnected", () => this.restart(true))
    return this.context
  }

  /**
   * 使用 Playwright 截图
   * @param name 模板名称
   * @param data 模板参数
   * @returns Buffer | false
   */
  async screenshot (name, data = {}) {
    const context = await this.browserInit()
    if (!context) return false

    const pageHeight = data.multiPageHeight || 4000

    const savePath = this.dealTpl(name, data)
    if (!savePath) return false

    const filePath = path.resolve(savePath)
    const url = `file://${filePath.replace(/\\/g, "/")}`
    const htmlFileName = `${name}/${path.basename(savePath)}`

    let buff = ""
    const start = Date.now()

    const ret = []
    this.shoting.push(name)

    let overtime
    const timeout = cfg?.bot?.puppeteer_timeout || 0
    if (timeout > 0) {
      overtime = setTimeout(() => {
        if (this.shoting.length) {
          logger.error(`[图片生成][${htmlFileName}] 截图超时，当前等待队列：${this.shoting.join(",")}`)
          this.restart(true)
          this.shoting.length = 0
        }
      }, timeout)
    }

    let page
    try {
      page = await context.newPage()
      const viewport = data.viewport || {}
      const width = Math.ceil(viewport.width || 1920)
      const height = Math.ceil(viewport.height || pageHeight)
      await page.setViewportSize({
        width: width * this.deviceScaleFactor,
        height: height * this.deviceScaleFactor
      })
      await page.addInitScript(dpr => {
        try {
          Object.defineProperty(window, "devicePixelRatio", { get: () => dpr })
        } catch {}
      }, this.deviceScaleFactor)

      await page.goto(url, {
        waitUntil: "networkidle",
        timeout: (data.pageGotoParams && data.pageGotoParams.timeout) || 120000
      })

      const body = (await page.$("#container")) || (await page.$("body"))
      if (!body) {
        logger.error(`[图片生成][playwright][${name}] 页面中未找到可截图元素`)
        return false
      }

      const type = data.imgType || "png"
      const omitBackground = data.omitBackground || false
      const quality = typeof data.quality === "number" ? data.quality : 100

      const boundingBox = await body.boundingBox()
      if (!boundingBox) {
        logger.error(`[图片生成][playwright][${name}] 获取截图区域失败`)
        return false
      }

      const randData = {
        type,
        omitBackground,
        quality,
        path: data.path || undefined
      }

      let num = 1
      if (data.multiPage) {
        num = Math.round(boundingBox.height / pageHeight) || 1
      }

      if (randData.type === "png") delete randData.quality

      if (!data.multiPage) {
        buff = await body.screenshot(randData)
        if (!Buffer.isBuffer(buff)) buff = Buffer.from(buff)

        this.renderNum++
        const kb = (buff.length / 1024).toFixed(2) + "KB"
        const todayCount = await this.saveScreenshotCount(1)
        logger.mark(
          `[playwright][图片生成][${logger.green(htmlFileName)}][${this.renderNum}次] ${kb} ${logger.green(
            `${Date.now() - start}ms`
          )}] [当日:${todayCount}]`
        )
        ret.push(buff)
      } else {
        if (num > 1) {
          await page.setViewportSize({
            width: Math.ceil(boundingBox.width) * this.deviceScaleFactor,
            height: (pageHeight + 100) * this.deviceScaleFactor
          })
        }

        for (let i = 1; i <= num; i++) {
          if (i !== 1 && i === num) {
            await page.setViewportSize({
              width: Math.ceil(boundingBox.width) * this.deviceScaleFactor,
              height: (parseInt(boundingBox.height) - pageHeight * (num - 1)) * this.deviceScaleFactor
            })
          }

          if (i !== 1 && i <= num) {
            await page.evaluate(ph => window.scrollBy(0, ph), pageHeight)
          }

          buff = await page.screenshot(randData)
          if (!Buffer.isBuffer(buff)) buff = Buffer.from(buff)

          this.renderNum++
          const kb = (buff.length / 1024).toFixed(2) + "KB"
          logger.mark(`[图片生成][${logger.green(htmlFileName)}][${i}/${num}] ${kb}`)
          ret.push(buff)
        }

        const todayCount = await this.saveScreenshotCount(ret.length)
        if (num > 1) {
          logger.mark(`[图片生成][${logger.green(htmlFileName)}] 处理完成 [当日:${todayCount}]`)
        }
      }

      return data.multiPage ? ret : ret[0]
    } catch (err) {
      logger.error(`[图片生成][${htmlFileName}] 图片生成失败`, err)
      this.restart(true)
      if (overtime) clearTimeout(overtime)
      return false
    } finally {
      if (overtime) clearTimeout(overtime)
      this.shoting.pop()
      if (page) {
        page.close().catch(e => logger.error(e))
      }
    }
  }

  restart (force = false) {
    if (!this.browser?.close || this.lock) return
    if (!force) {
      if (this.renderNum % this.restartNum !== 0 || this.shoting.length > 0) return
    }
    logger.info(`playwright Chromium ${force ? "强制" : ""}关闭重启...`)
    this.stop(this.browser)
    this.browser = false
    this.context = false
    return this.browserInit()
  }

  async stop (browser) {
    try {
      await browser.close()
    } catch (err) {
      logger.error("playwright Chromium 关闭错误", err)
    }
  }

  async saveScreenshotCount (incrementBy = 1) {
    try {
      const mmdd = this.getNowDateMMDD()
      const ymd = this.getNowDateYMD()
      const keys = [
        `Yz:count:screenshot:day:${mmdd}`,
        `Yz:count:screenshot:day:${ymd}`
      ]
      const amount = Number(incrementBy) || 1
      if (typeof redis.incrBy === "function") {
        const results = await Promise.all(keys.map(k => redis.incrBy(k, amount)))
        return results[0]
      } else {
        for (const k of keys) {
          for (let i = 0; i < amount; i++) {
            await redis.incr(k)
          }
        }
        return await redis.get(`Yz:count:screenshot:day:${mmdd}`)
      }
    } catch (err) {
      logger.error("截图计数保存失败", err)
      return undefined
    }
  }

  getNowDateMMDD () {
    return moment().format("MMDD")
  }

  getNowDateYMD () {
    return moment().format("YYYY:MM:DD")
  }
}