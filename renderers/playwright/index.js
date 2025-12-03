import Playwright from "./lib/playwright.js"

/**
 * @param config 本地 config.yaml 的配置内容
 * @returns renderer 渲染器对象
 * @returns renderer.id 渲染器ID，对应 renderer 中选择的 id
 * @returns renderer.type 渲染类型，暂时支持 image
 * @returns renderer.render 渲染入口
 */
export default function (config) {
  return new Playwright(config)
}
