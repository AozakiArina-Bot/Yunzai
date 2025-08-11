/* eslint-disable quotes */
module.exports = {
/** 配置 ESLint 的环境 */
  env: {
    es2021: true, // 启用 ES2021 的全局变量和语法
    node: true // 启用 Node.js 的全局变量和语法
  },

  /** 继承共享配置 */
  extends: ["standard"], // 使用 "standard" 风格的 ESLint 规则

  /** 解析器选项 */
  parserOptions: {
    ecmaVersion: "latest", // 使用最新的 ECMAScript 版本
    sourceType: "module" // 代码是 ES 模块（使用 import/export）
  },

  /** 全局变量配置 */
  globals: {
    Bot: true, // Bot 是全局变量，可以直接使用
    redis: true, // redis 是全局变量
    logger: true, // logger 是全局变量
    plugin: true, // plugin 是全局变量
    Renderer: true, // Renderer 是全局变量
    segment: true // segment 是全局变量
  },

  /** 自定义规则 */
  rules: {
    eqeqeq: ["off"], // 禁用 "必须使用 === 和 !==" 的规则
    "prefer-const": ["off"], // 禁用 "建议使用 const 而不是 let" 的规则
    "arrow-body-style": "off", // 禁用 "箭头函数体的简写形式" 的规则
    camelcase: "off", // 禁用 "变量名必须是驼峰式" 的规则
    "eol-last": "off", // 禁用 "文件末尾必须有空行" 的规则
    eofline: "off", // 禁用 "文件末尾必须有空行" 的规则（与 eol-last 类似）
    "no-trailing-whitespace": "off", // 禁用 "行尾不能有空格" 的规则
    quotes: ["error", "double"], // 强制使用双引号，否则报错
    "new-cap": "off", // 禁用 "构造函数首字母必须大写" 的规则
    "no-sequences": "off", // 禁用 "禁止使用逗号操作符" 的规则
    "no-unused-expressions": "off", // 禁用 "禁止未使用的表达式" 的规则
    "no-labels": "off", // 禁用 "禁止使用标签语句" 的规则
    "no-return-assign": "off", // 禁用 "禁止在 return 语句中使用赋值操作" 的规则
    "no-useless-escape": "off", // 禁用 "禁止不必要的转义字符" 的规则
    "no-unused-vars": "off", // 禁用 "禁止未使用的变量" 的规则
    "array-callback-return": "off", // 禁用 "数组方法的回调函数必须返回值" 的规则
    "no-var": "off", // 禁用 "禁止使用 var，推荐使用 let 或 const" 的规则
    "no-eval": "off", // 禁用 "禁止使用 eval" 的规则
    "no-empty": "off", // 禁用 "禁止空代码块" 的规则
    "no-dupe-keys": "off", // 禁用 "禁止对象字面量中出现重复的键" 的规则
    "multiline-ternary": "off", // 禁用 "禁止多行三元表达式" 的规则
    "no-useless-constructor": "off", // 禁用 "禁止无用的构造函数" 的规则
    "no-proto": "off", // 禁用 "禁止使用 __proto__" 的规则
    "no-unsafe-finally": "off", // 禁用 "禁止在 finally 中使用 return、throw、break 或 continue" 的规则
    "no-cond-assign": "off", // 禁用 "禁止在条件语句中使用赋值操作" 的规则
    "brace-style": "off", // 禁用 "强制大括号风格" 的规则
    "no-fallthrough": "off", // 禁用 "禁止在 switch 语句中使用 fall-through" 的规则
    "no-control-regex": "off", // 禁用 "禁止使用控制字符" 的规则
    "no-use-before-define": "off", // 禁用 "禁止在变量定义之前使用它们" 的规则
    "no-mixed-operators": "off", // 禁用 "禁止混合使用不同的运算符" 的规则
    "no-unsafe-finally": "off", // 禁用 "禁止在 finally 中使用 return、throw、break 或 continue" 的规则
    "no-undef": "off" // 禁用 "禁止使用未定义的变量" 的规则
  }
}