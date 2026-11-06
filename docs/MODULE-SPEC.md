# 模块编写规范

本规范由 `npm run validate` 自动检查，不通过的模块无法进入 CI。新增模块时可直接复制 [TEMPLATE.sgmodule](TEMPLATE.sgmodule) 修改。

## 文件位置与命名

- 位置：`modules/`，允许子目录
- 扩展名：`.sgmodule`
- 命名：小写 kebab-case，例如 `ad-remover.sgmodule`、`weibo-clean.sgmodule`
- 编码：UTF-8 无 BOM，LF 换行，文件末尾保留换行
- 说明文档：可在 `docs/modules/<同名>.md` 放使用说明，README 索引会自动链接

## 文件头指令

文件第一行必须是 `#!name`：

| 指令               | 必填 | 说明                                         |
| ------------------ | ---- | -------------------------------------------- |
| `#!name`           | 是   | 模块名称，Shadowrocket 列表里显示            |
| `#!desc`           | 建议 | 一句话说明作用                               |
| `#!system`         | 建议 | 固定为 `ios`                                 |
| `#!author`         | 建议 | 作者或维护者                                 |
| `#!homepage`       | 否   | 项目或原仓库地址                             |
| `#!icon`           | 否   | 图标 URL                                     |
| `#!category`       | 否   | 分类，用于 README 索引分组，默认为「未分类」 |
| `#!date`           | 否   | 更新日期 `YYYY-MM-DD`                        |
| `#!version`        | 否   | 版本号                                       |
| `#!update`         | 否   | 更新日期，部分模块习惯用这个字段             |
| `#!arguments`      | 否   | 模块参数声明，见下文                         |
| `#!arguments-desc` | 否   | 模块参数说明，建议用 `\n\n` 分段             |
| `#!requirement`    | 否   | 版本要求，Shadowrocket 不解析，仅记录        |

未知的 `#!` 指令会被 Shadowrocket 忽略，校验器会给警告；来源信息请用普通注释，见下文「第三方来源」。

## 模块参数

Shadowrocket 支持 Surge 风格的参数表：

```text
#!arguments=签到小时:0, 签到分钟:1, 固定奖励:false
#!arguments-desc=签到小时: 24 小时制\n固定奖励: true=固定奖励
```

- 名称与默认值用 `:`（也兼容 `=`）分隔，多个参数用逗号分隔
- 正文中用 `{{{名称}}}` 引用，Shadowrocket 在应用模块前替换
- 参数按名称大小写敏感匹配
- 校验器会警告「使用了未声明的占位符」

## 支持的段落

| 段落                    | 校验要点                                                                             |
| ----------------------- | ------------------------------------------------------------------------------------ |
| `[Script]`              | 两种写法都支持，见下文；必须带 `script-path=`                                        |
| `[MITM]`                | 必须声明 `hostname`，支持 `%APPEND%`、`%INSERT%` 与参数占位符                        |
| `[Rule]`                | 规则类型与取值合法，`IP-CIDR` / `IP-CIDR6` 校验 CIDR，支持 `AND` / `OR` / `NOT` 嵌套 |
| `[URL Rewrite]`         | 「匹配正则 + 目标」，目标为 URL 或 `- reject`                                        |
| `[Header Rewrite]`      | 动作为 `header-add` / `header-del` / `header-replace` / `header-merge`               |
| `[Map Local]`           | 「匹配正则 + 路径或 `data`/`status-code` 等参数」                                    |
| `[Body Rewrite]`        | 「匹配正则 + 替换内容」；`http-response-jq` / `http-request-jq` 为 jq 写法           |
| `[Host]`                | `域名 = IP`                                                                          |
| `[General]` / `[Panel]` | `key = value`                                                                        |

其他段落名会报错，避免拼写错误导致整段被静默忽略。

### Script 两种写法

经典写法：

```text
[Script]
http-response ^https?:\/\/example\.com\/api script-path=https://.../script.js, requires-body=true, tag=示例
```

命名写法（支持 `type=`、`cronexp=`、`event-name=`、`enable=`）：

```text
[Script]
示例脚本 = type=http-response, pattern=^https?:\/\/example\.com\/api, script-path=https://.../script.js, requires-body=true
示例定时 = type=cron, cronexp="0 1 * * *", script-path=https://.../script.js, timeout=30
```

## script-path

- 必须是 **绝对 https URL**，Shadowrocket 不解析相对路径
- 推荐使用本仓库地址，便于校验与更新：

```text
https://raw.githubusercontent.com/aipper/shadowrocket/main/scripts/example.js
https://cdn.jsdelivr.net/gh/aipper/shadowrocket@main/scripts/example.js
```

- 指向本仓库的 `script-path` 必须对应真实存在的文件，否则校验失败
- 允许引用外部脚本，但同一模块内应注明上游来源

## 第三方来源

整理或改写第三方内容时必须同时满足：

1. 模块内保留原作者署名，并加一行来源注释：

```text
#!author = 原作者
# 来源：https://github.com/original/repo/blob/main/xxx.sgmodule（MIT）
```

2. 在 [SOURCES.md](SOURCES.md) 中登记原地址、作者与许可证

若上游**没有许可证**，不要复制其代码或模块原文：只参考接口与思路，自行实现，并在来源中注明「独立实现」。

校验器在既没有 `#!author` 也没有 `# 来源：` 注释时会给出警告。

## 本地校验

```bash
npm run validate                      # 全量校验
node scripts/validate.mjs modules/x.sgmodule   # 只校验指定文件
node scripts/validate.mjs --strict    # 警告也视为失败
npm test                              # 模块脚本单元测试
```

错误必须修复，警告建议修复。提交时 lint-staged 会自动校验改动过的模块与规则文件。
