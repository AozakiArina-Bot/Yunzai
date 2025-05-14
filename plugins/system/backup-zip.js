import common from "../../lib/common/common.js"
import path from "path"
import fs, { createWriteStream } from "node:fs"
import archiver from "archiver"
import decompress from "decompress"

const bfPath = path.join(process.cwd(), "/resources/bf/")
const zipPath = path.join(process.cwd(), "/resources/backup-zip/")
const pluginsPath = path.join(process.cwd(), "/plugins/")

export class backupManager extends plugin {
  constructor (e) {
    super({
      name: "[备份管理][备份|还原|压缩]",
      dsc: "备份管理",
      event: "message",
      priority: 10,
      rule: [
        {
          reg: "^#?(配置文件)?备份$",
          fnc: "backup"
        },
        {
          reg: "^#?(配置文件)?还原$",
          fnc: "restore"
        },
        {
          reg: "^#?(配置文件)?压缩备份$",
          fnc: "zipBackup"
        }
      ]
    })
  }

  // 备份功能
  async backup (e) {
    if (!e.isMaster) {
      e.reply("哒咩，你可不是老娘的master\n(*/ω＼*)")
      return false
    }
    let ok = []
    let err = []
    let srcPath
    let destPath
    let plugins = fs.readdirSync(pluginsPath)
    this.reply(`开始备份插件配置文件，请稍后...\n备份路径：${bfPath}`)
    try {
      copyFiles("./config/config", bfPath + "config/config")
      copyFiles("./data", bfPath + "data")
      ok.push("config")
      ok.push("data")
    } catch (error) {
      err.push("本体配置文件")
    }

    for (let p of plugins) {
      try {
        if (p == "example") {
          srcPath = p
        } else {
          srcPath = `${p}/config`
        }
        if (!fs.existsSync(pluginsPath + srcPath)) {
          continue
        }
        destPath = bfPath + srcPath
        copyFiles(`./plugins/${srcPath}/`, destPath)
        if (p == "xiaoyao-cvs-plugin") {
          srcPath = `${p}/data`
          destPath = bfPath + srcPath
          copyFiles(`./plugins/${srcPath}/`, destPath)
        }
        if (p == "miao-plugin") {
          srcPath = `${p}/resources/help`
          destPath = bfPath + srcPath
          copyFiles(`./plugins/${srcPath}/`, destPath)
        }
        ok.push(p)
      } catch (error) {
        err.push(p)
      }
    }
    let msg = `共备份${ok.length + err.length}个插件配置文件，\n成功${ok.length}个\n${ok.toString().replace(/,/g, "，\n")}\n\n失败${err.length}个\n${err.toString().replace(/,/g, "，\n")}`

    // 自动进行压缩
    if (!fs.existsSync(zipPath)) {
      fs.mkdirSync(zipPath, { recursive: true })
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
    const zipFile = path.join(zipPath, `backup-${timestamp}.zip`)

    try {
      await this.createZip(bfPath, zipFile)
      msg += `\n\n备份文件已压缩完成:\n${zipFile}`
    } catch (err) {
      msg += `\n\n压缩失败:\n${err.message}`
    }

    this.reply(msg)
  }

  async restore (e) {
    if (!e.isMaster) {
      e.reply("哒咩，你可不是老娘的master\n(*/ω＼*)")
      return false
    }

    this.reply("开始还原，请稍后...")

    // 获取最新的zip备份文件
    const zipFiles = fs.readdirSync(zipPath).filter(file => file.endsWith(".zip"))
    if (zipFiles.length === 0) {
      this.reply("未找到备份文件")
      return false
    }

    // 按文件名排序(因为包含时间戳),取最新的
    const latestZip = zipFiles.sort().pop()
    const zipFilePath = path.join(zipPath, latestZip)

    try {
      // 清空旧的备份文件
      if (fs.existsSync(bfPath)) {
        fs.rmSync(bfPath, { recursive: true, force: true })
      }
      fs.mkdirSync(bfPath, { recursive: true })

      // 解压缩
      await this.extractZip(zipFilePath, bfPath)

      // 执行还原
      let ok = []
      let err = []
      let bfs = fs.readdirSync(bfPath)

      for (let b of bfs) {
        try {
          if (b == "data" || b == "config") {
            copyFiles(bfPath + b, `./${b}`)
          } else {
            copyFiles(bfPath + b, pluginsPath + b)
          }
          ok.push(b)
        } catch (error) {
          err.push(b)
        }
      }

      let msg = `已还原最新备份[${latestZip}]\n共还原${ok.length + err.length}个插件配置文件\n成功${ok.length}个\n${ok.toString().replace(/,/g, "，\n")}`
      if (err.length > 0) {
        msg += `\n\n失败${err.length}个\n${err.toString().replace(/,/g, "，\n")}`
      }
      msg += "\n\n还原完成，请手动重启Bot以应用新配置"
      this.reply(msg)
    } catch (err) {
      this.reply(`还原失败:\n${err.message}`)
      return false
    }
  }

  // 修改解压缩方法
  extractZip (zipPath, destPath) {
    return decompress(zipPath, destPath)
  }

  // 压缩备份功能
  async zipBackup (e) {
    if (!e.isMaster) {
      e.reply("哒咩，你可不是老娘的master\n(*/ω＼*)")
      return false
    }

    if (!fs.existsSync(zipPath)) {
      fs.mkdirSync(zipPath, { recursive: true })
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
    const zipFile = path.join(zipPath, `backup-${timestamp}.zip`)

    this.reply("开始压缩备份文件，请稍后...")

    try {
      await this.createZip(bfPath, zipFile)
      this.reply(`备份文件已压缩完成:\n${zipFile}`)
      return true
    } catch (err) {
      this.reply(`压缩失败:\n${err.message}`)
      return false
    }
  }

  createZip (srcPath, zipFile) {
    return new Promise((resolve, reject) => {
      const output = createWriteStream(zipFile)
      const archive = archiver("zip", {
        zlib: { level: 9 }
      })

      output.on("close", () => {
        resolve()
      })

      archive.on("error", (err) => {
        reject(err)
      })

      archive.pipe(output)
      archive.directory(srcPath, false)
      archive.finalize()
    })
  }
}

function copyFiles (src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true })
  fs.readdir(src, { withFileTypes: true }, (err, files) => {
    if (err) {
      console.log(err)
      return
    }
    files.forEach(function (srcFile) {
      if (srcFile.isDirectory()) {
        // 检查是否为需要排除的目录
        if (srcFile.name === "defSet" || srcFile.name === "default_config" || srcFile.name === "system") {
          return
        }
        const destFile1 = path.resolve(dest, srcFile.name)
        const srcFile1 = path.resolve(src, srcFile.name)
        if (!fs.existsSync(destFile1)) {
          fs.mkdirSync(destFile1, (err) => {
            console.log(err)
          })
        }
        copyFiles(srcFile1, destFile1)
      } else {
        if (srcFile.name != "备份.js") {
          const srcFileDir = path.resolve(src, srcFile.name)
          const destFile = path.resolve(dest, srcFile.name)
          fs.promises.copyFile(srcFileDir, destFile)
        }
      }
    })
  })
}