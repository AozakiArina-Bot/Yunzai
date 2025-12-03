import Renderer from "../../../lib/renderer/Renderer.js"
import path from "node:path"
import { chromium } from "playwright"
import cfg from "../../../lib/config/config.js"

export default class Playwright extends Renderer {
  constructor (config = {}) {
    super({
      id: "playwright",
      type: "image",
      render: "screenshot"
    })
    this.browser = false
    this.context = false
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
    logger.info("playwright Chromium 启动中...")
    this.browser = await chromium.launch(this.config).catch(err => {
      logger.error("playwright Chromium 启动失败", err)
      return false
    })
    if (!this.browser) return false
    this.context = await this.browser.newContext({ deviceScaleFactor: this.deviceScaleFactor })
    logger.info("playwright Chromium 启动成功")
    this.browser.on("disconnected", () => {
      this.browser = false
      this.context = false
    })
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
    const savePath = this.dealTpl(name, data)
    if (!savePath) return false
    const filePath = path.resolve(savePath)
    const url = `file://${filePath.replace(/\\/g, "/")}`
    let page
    try {
      page = await context.newPage()
      const viewport = data.viewport || {}
      const width = Math.ceil(viewport.width || 1920)
      const height = Math.ceil(viewport.height || 1080)
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
      const clipFullPage = await body.boundingBox()
      if (!clipFullPage) {
        logger.error(`[图片生成][playwright][${name}] 获取截图区域失败`)
        return false
      }
      const buffer = await body.screenshot({
        type,
        quality: type === "png" ? undefined : quality,
        omitBackground,
        path: data.path || undefined
      })
      if (!buffer) {
        logger.error(`[图片生成][playwright][${name}] 图片生成为空`)
        return false
      }
      return buffer
    } catch (err) {
      logger.error(`[图片生成][playwright][${name}] 图片生成失败`, err)
      return false
    } finally {
      if (page) {
        page.close().catch(e => logger.error(e))
      }
    }
  }
}