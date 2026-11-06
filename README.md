# Shadowrocket 工具集

面向 [Shadowrocket](https://apps.apple.com/app/shadowrocket/id932747118) 的模块（`.sgmodule`）、脚本（`*.js`）、规则集（`*.list`）与配置（`*.conf`）合集。内容包含原创条目与整理自第三方的条目，第三方内容保留原作者署名与许可证。

## 目录结构

| 目录       | 内容                                                           |
| ---------- | -------------------------------------------------------------- |
| `modules/` | Shadowrocket 模块，可直接导入                                  |
| `scripts/` | 模块引用的 JS 脚本（`scripts/lib/` 与 `*.mjs` 为仓库自身工具） |
| `rules/`   | 规则集，每行 `TYPE,VALUE[,POLICY]`                             |
| `configs/` | 完整或半完整配置                                               |
| `docs/`    | 编写规范、来源清单与模块模板                                   |

## 使用

### 导入模块

1. 打开 Shadowrocket → 配置 → 模块 → 右上角 `+`
2. 粘贴下方索引中的 raw 或 jsDelivr 地址
3. 保存后返回首页，按模块需要开启 MITM

带参数的模块（如 NodeSeek 签到）导入后，在模块详情里点「编辑参数」配置；首次使用按对应说明临时开启 Cookie 捕获。

需要 MITM 的模块：设置 → 证书 → 生成并安装证书，再在系统「证书信任设置」中信任该证书，同时打开 Shadowrocket 的「MITM」开关。

### 导入规则集

配置 → 规则 → 右上角 `+`，或把 `.list` 内容粘贴到本地规则文件。`rules/` 下的文件均为纯规则列表，不带策略时使用当前配置的默认策略。

### 导入配置

下载 `configs/` 下的 `.conf`，在 Shadowrocket 中通过「配置文件 → 添加 → 从文件导入」加载，再按需替换节点信息。

> raw 与 jsDelivr 内容一致：raw 更新更快，jsDelivr 在国内网络下通常更稳定。

## 模块索引

<!-- modules:start -->

共 **1** 个模块。

### 自动签到

| 模块                                              | 说明                                                   | 作者   | 导入地址                                                                                                                                                                                                 |
| ------------------------------------------------- | ------------------------------------------------------ | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [NodeSeek 签到](docs/modules/nodeseek-checkin.md) | 自动签到领取鸡腿，支持 Cookie 捕获、固定奖励与鸡腿统计 | aipper | [raw](https://raw.githubusercontent.com/aipper/shadowrocket/main/modules/nodeseek-checkin.sgmodule) · [jsDelivr](https://cdn.jsdelivr.net/gh/aipper/shadowrocket@main/modules/nodeseek-checkin.sgmodule) |

<!-- modules:end -->

## 开发

```bash
npm ci
npm run validate   # 校验模块 / 脚本 / 规则 / 配置
npm run index      # 重新生成上方的模块索引
npm run lint       # Prettier 格式检查
```

提交时会由 husky + lint-staged 自动执行校验与格式化；CI 会再跑一遍，并检查 README 索引是否最新。完整规范见 [docs/MODULE-SPEC.md](docs/MODULE-SPEC.md)，新模块可从 [docs/TEMPLATE.sgmodule](docs/TEMPLATE.sgmodule) 复制。

## 来源与许可

- 原创内容采用 [MIT](LICENSE)
- 第三方内容的作者、原地址与许可证记录在 [docs/SOURCES.md](docs/SOURCES.md)
- 若内容侵犯了你的权益，请开 issue，会尽快处理

## 免责声明

本项目仅供学习研究与个人自用，请遵守当地法律法规与各服务的使用条款。使用本仓库内容产生的一切后果由使用者自行承担。
