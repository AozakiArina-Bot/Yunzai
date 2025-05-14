let Common, Version
try {
  Common = (await import("#miao")).Common
  Version = (await import("#miao")).Version
} catch {}

export class version extends plugin {
  constructor () {
    super({
      name: "版本",
      dsc: "版本",
      event: "message",
      priority: 50,
      rule: [
        {
          reg: "^#版本$",
          fnc: "version"
        }
      ]
    })
  }

  async version (e) {
    let { changelogs, currentVersion } = Version.readLogFile("root")
    return await Common.render("help/version-info", {
      currentVersion,
      changelogs,
      name: "Yunzai",
      elem: "cryo",
      pluginName: false,
      pluginVersion: false
    }, { e, scale: 1.2 })
  }
}
