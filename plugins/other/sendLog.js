/**
 * @file 日志查看器
 * @author 饺子
 * @version 1.0
 * @date 2025-05-09
 * @copyright Jiaozi © 2024-2025
 * @license MIT
 */

/**
 * MIT License
 * 
 * Copyright (c) 2025 Jiaozi
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */


import fs from "node:fs/promises"
import lodash from "lodash"
import moment from "moment"
import { segment } from "oicq"
import puppeteer from "puppeteer"

export class sendLog extends plugin {
    constructor() {
        super({
            name: "发送日志",
            dsc: "发送最近100条运行日志",
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

        this.lineNum = 100
        this.maxNum = 1000
        this.logFile = `logs/command.${moment().format("YYYY-MM-DD")}.log`
        this.errFile = "logs/error.log"
        this.browser = null
    }

    async sendLog() {
        let lineNum = this.e.msg.match(/\d+/g)
        if (lineNum) {
            this.lineNum = lineNum[0]
        } else {
            this.keyWord = this.e.msg.replace(/#|运行|错误|日志|\d/g, "")
        }

        let logFile = this.logFile
        let type = "运行"
        if (this.e.msg.includes("错误")) {
            logFile = this.errFile
            type = "错误"
        }

        if (this.keyWord) type = this.keyWord

        const logEntries = await this.getLogEntries(logFile)

        if (lodash.isEmpty(logEntries)) {
            return this.reply(`暂无相关日志：${type}`)
        }

        const imageBuffer = await this.renderLogsAsImage(logEntries, type)
        
        if (imageBuffer) {
            return this.reply(segment.image(imageBuffer))
        } else {
            return this.reply(await Bot.makeForwardArray([`最近${logEntries.length}条${type}日志`, logEntries.join("\n\n")]))
        }
    }

    async getLogEntries(logFile) {
        let logContent = await fs.readFile(logFile, "utf8").catch(() => "")
        const lines = logContent.split("\n")
        const entries = []
        let currentEntry = []

        for (const line of lines) {
            // Check if line starts with timestamp pattern [HH:mm:ss.SSS]
            if (line.match(/^\[\d{2}:\d{2}:\d{2}\.\d{3}\]/)) {
                if (currentEntry.length > 0) {
                    entries.push(currentEntry.join("\n"))
                    currentEntry = []
                }
            }
            if (line.trim()) {
                currentEntry.push(line)
            }
        }

        // Push the last entry
        if (currentEntry.length > 0) {
            entries.push(currentEntry.join("\n"))
        }

        // Filter by keyword if specified
        if (this.keyWord) {
            return entries.filter(entry => entry.includes(this.keyWord)).slice(0, this.maxNum)
        }

        return entries.slice(-this.lineNum).reverse()
    }

    async initBrowser() {
        if (this.browser) return this.browser
        
        try {
            this.browser = await puppeteer.launch({
                headless: "new",
                args: [
                    "--disable-gpu",
                    "--disable-setuid-sandbox",
                    "--no-sandbox",
                    "--no-zygote"
                ]
            })
            return this.browser
        } catch (err) {
            logger.error("Failed to launch puppeteer:", err)
            return null
        }
    }

    async renderLogsAsImage(logEntries, title) {
        const browser = await this.initBrowser()
        if (!browser) return null

        try {
            const page = await browser.newPage()
            
            // Generate HTML for the logs with two-column layout
            const logHtml = logEntries.map(entry => {
                // Extract timestamp and log level
                const timestampMatch = entry.match(/^\[(\d{2}:\d{2}:\d{2}\.\d{3})\]/)
                const timestamp = timestampMatch ? timestampMatch[1] : ""
                
                const levelMatch = entry.match(/\[(\w+)\]/)
                let level = levelMatch ? levelMatch[1] : "INFO"
                let levelColor = "#1890ff" // Default blue for INFO
                
                if (level === "ERRO") {
                    level = "ERROR"
                    levelColor = "#ff4d4f" // Red for ERROR
                } else if (level === "WARN") {
                    levelColor = "#faad14" // Orange for WARN
                } else if (level === "DEBUG") {
                    levelColor = "#666" // Gray for DEBUG
                }
                
                // Clean up the log content
                let content = entry
                  .replace(/\x1b\[[0-9;]*m/g, "") // Remove ANSI color codes
                  .replace(/^\[\d{2}:\d{2}:\d{2}\.\d{3}\]/, "") // Remove timestamp
                  .replace(/\[(\w+)\]/, "") // Remove log level
                  .trim()

                // 过滤IP和端口
                content = content.replace(/(?:http[s]?:\/\/)?(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?/g, '[不许偷看噢~]');
                content = content.replace(/::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})(?::\d+)?/g, '[不许偷看噢~]');

                // Format JSON-like content and [] content
                content = content
                  .replace(/{/g, '<span class="json-brace">{</span>')
                  .replace(/}/g, '<span class="json-brace">}</span>')
                  .replace(/\[([^\]]+)\]/g, '<span class="bracket-content">[$1]</span>')
                  .replace(/"([^"]+)":/g, '<span class="json-key">"$1"</span>:')
                  .replace(/: ("[^"]+")/g, ': <span class="json-string">$1</span>')
                  .replace(/: (\d+)/g, ': <span class="json-number">$1</span>')
                  .replace(/: (undefined|null)/g, ': <span class="json-null">$1</span>')
                  .replace(/(\s{4,})/g, '<span class="json-indent">$1</span>')
                
                return `
                  <div class="log-entry">
                    <div class="log-meta">
                      <div class="log-level" style="background-color: ${levelColor}">${level}</div>
                      <div class="log-timestamp">${timestamp}</div>
                    </div>
                    <div class="log-content">
                      <pre>${content}</pre>
                    </div>
                  </div>
                `
            }).join("")

            await page.setContent(`
              <!DOCTYPE html>
              <html>
              <head>
                <meta charset="UTF-8">
                <style>
                  * {
                    box-sizing: border-box;
                    margin: 0;
                    padding: 0;
                  }
                  body {
                    font-family: 'Segoe UI', 'Helvetica Neue', Arial, sans-serif;
                    background-color: #f5f7fa;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                    padding: 15px;
                  }
                  .log-wrapper {
                    width: 100%;
                    max-width: 900px;
                    padding: 15px;
                  }
                  .log-container {
                    background-color: white;
                    border-radius: 16px;
                    padding: 25px;
                    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
                    width: 100%;
                  }
                  .log-header {
                    color: #1890ff;
                    font-size: 24px;
                    font-weight: bold;
                    margin-bottom: 15px;
                    padding-bottom: 15px;
                    border-bottom: 2px solid rgba(24, 144, 255, 0.2);
                    text-align: center;
                  }
                  .log-subheader {
                    color: #666;
                    font-size: 14px;
                    text-align: center;
                    margin-bottom: 20px;
                  }
                  .log-entry {
                    display: flex;
                    margin: 12px 0;
                    background: white;
                    border-radius: 12px;
                    overflow: hidden;
                    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
                    border-left: 4px solid #eee;
                    transition: all 0.2s ease;
                  }
                  .log-entry:hover {
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
                    transform: translateY(-1px);
                  }
                  .log-meta {
                    min-width: 150px;
                    padding: 12px;
                    display: flex;
                    flex-direction: row;
                    align-items: center;
                    background-color: #fafafa;
                    border-right: 1px solid #eee;
                    gap: 8px;
                  }
                  .log-timestamp {
                    color: #666;
                    font-size: 11px;
                    font-family: 'Consolas', monospace;
                  }
                  .log-level {
                    min-width: 60px;
                    padding: 4px 8px;
                    color: white;
                    font-weight: 600;
                    font-size: 12px;
                    text-align: center;
                    border-radius: 4px;
                    font-family: 'Consolas', monospace;
                    text-shadow: 0 1px 1px rgba(0,0,0,0.1);
                  }
                  .log-content {
                    flex: 1;
                    padding: 12px 15px;
                    color: #333;
                    font-size: 13px;
                    line-height: 1.5;
                    overflow-x: auto;
                  }
                  .log-content pre {
                    margin: 0;
                    white-space: pre-wrap;
                    font-family: 'Consolas', 'Monaco', monospace;
                  }
                  .json-key {
                    color: #92278f;
                  }
                  .json-string {
                    color: #3ab54a;
                  }
                  .json-number {
                    color: #25aae2;
                  }
                  .json-brace, .json-bracket {
                    color: #333;
                    font-weight: bold;
                  }
                  .json-null {
                    color: #666;
                  }
                  .json-indent {
                    display: inline-block;
                  }
                  .bracket-content {
                    color: #1890ff;
                    font-weight: bold;
                  }
                </style>
              </head>
              <body>
                <div class="log-wrapper">
                  <div class="log-container">
                    <div class="log-header">日志查看器 ☉ 最近${logEntries.length}条</div>
                    <div class="log-subheader">${title}日志 · ${moment().format("YYYY-MM-DD HH:mm:ss")}</div>
                    <div class="log-list">${logHtml}</div>
                  </div>
                </div>
              </body>
              </html>
            `)

            await page.evaluateHandle('document.fonts.ready')

            // 设置视口大小
            await page.setViewport({
                width: 930, // 900 + 15px padding * 2
                height: 1080,
                deviceScaleFactor: 2
            })

            // 获取容器元素
            const container = await page.$('.log-container')
            const boundingBox = await container.boundingBox()

            // 计算截图区域（包括15px留白）
            const clipArea = {
                x: Math.max(0, boundingBox.x - 15),
                y: Math.max(0, boundingBox.y - 15),
                width: boundingBox.width + 30,
                height: boundingBox.height + 30
            }

            // 截图整个容器（自动滚动）
            const imageBuffer = await page.screenshot({
                type: 'jpeg',
                quality: 90,
                clip: clipArea,
                captureBeyondViewport: true
            })

            await page.close()
            return imageBuffer

        } catch (err) {
            logger.error("Failed to render logs as image:", err)
            return null
        }
    }

    async destroy() {
        if (this.browser) {
            await this.browser.close().catch(err => logger.error(err))
            this.browser = null
        }
    }
}