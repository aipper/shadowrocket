# 模块编写规范

本规范由 `npm run validate` 自动检查，不通过的模块无法进入 CI。新增模块时可直接复制 [TEMPLATE.sgmodule](TEMPLATE.sgmodule) 修改。

## 文件位置与命名

- 位置：`modules/`，允许子目录
- 扩展名：`.sgmodule`
- 命名：小写 kebab-case，例如 `ad-remover.sgmodule`、`weibo-clean.sgmodule`
- 编码：UTF-8 无 BOM，LF 换行，文件末尾保留换行

## 文件头指令

文件第一行必须是 `#!name`：

| 指令         | 必填 | 说明                                         |
| ------------ | ---- | -------------------------------------------- |
| `#!name`     | 是   | 模块名称，Shadowrocket 列表里显示            |
| `#!desc`     | 建议 | 一句话说明作用                               |
| `#!system`   | 建议 | 固定为 `ios`                                 |
| `#!author`   | 建议 | 作者或维护者                                 |
| `#!homepage` | 否   | 项目或原仓库地址                             |
| `#!icon`     | 否   | 图标 URL                                     |
| `#!category` | 否   | 分类，用于 README 索引分组，默认为「未分类」 |
| `#!date`     | 否   | 更新日期 `YYYY-MM-DD`                        |
| `#!version`  | 否   | 版本号                                       |

未知的 `#!` 指令会被 Shadowrocket 忽略，校验器会给警告；来源信息请用普通注释，见下文「第三方来源」。

## 支持的段落

| 段落                    | 校验要点                                                                                                                                |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `[Script]`              | 类型必须是 `http-request` / `http-response` / `cron` / `event` / `dns` / `rule` / `generic`；必须带 `script-path=`；http 类型需合法正则 |
| `[MITM]`                | 必须声明 `hostname`，支持 `%APPEND%`；hostname 不能带协议与路径                                                                         |
| `[Rule]`                | 规则类型与取值合法，`IP-CIDR` / `IP-CIDR6` 校验 CIDR                                                                                    |
| `[URL Rewrite]`         | 「匹配正则 + 目标」，目标为 URL 或 `- reject`                                                                                           |
| `[Header Rewrite]`      | 动作为 `header-add` / `header-del` / `header-replace` / `header-merge`                                                                  |
| `[Map Local]`           | 本地路径以 `/` 开头或为 URL                                                                                                             |
| `[Body Rewrite]`        | 「匹配正则 + 替换内容」                                                                                                                 |
| `[Host]`                | `域名 = IP`                                                                                                                             |
| `[General]` / `[Panel]` | `key = value`                                                                                                                           |

其他段落名会报错，避免拼写错误导致整段被静默忽略。

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

聚合或改写第三方内容时，必须同时满足：

1. 模块内保留原作者署名，并加一行来源注释：

```text
#!author = 原作者
# 来源：https://github.com/original/repo/blob/main/xxx.sgmodule（MIT）
```

2. 在 [SOURCES.md](SOURCES.md) 中登记原地址、作者与许可证

校验器在既没有 `#!author` 也没有 `# 来源：` 注释时会给出警告。

## 本地校验

```bash
npm run validate                      # 全量校验
node scripts/validate.mjs modules/x.sgmodule   # 只校验指定文件
node scripts/validate.mjs --strict    # 警告也视为失败
```

错误必须修复，警告建议修复。提交时 lint-staged 会自动校验改动过的模块与规则文件。
