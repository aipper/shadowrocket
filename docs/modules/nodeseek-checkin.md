# NodeSeek 签到

自动完成 NodeSeek 每日签到，支持 Cookie 捕获、固定奖励切换与鸡腿统计。

## 功能

- 每天定时调用 `https://www.nodeseek.com/api/attendance` 签到
- 首次使用通过 MITM 捕获登录请求头（Cookie、`refract-key`、`refract-sign` 等）并本地保存
- 通知结果：签到成功 / 今日已签到 / Cookie 失效 / 被风控 / 网络错误
- 本地统计累计签到天数、累计鸡腿与日均

## 参数

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `签到小时` | `0` | 24 小时制，0–23 |
| `签到分钟` | `1` | 0–59 |
| `固定奖励` | `false` | `true` 固定奖励，`false` 随机鸡腿 |
| `显示总数` | `false` | `true` 时通知附带当前鸡腿总数 |
| `Cookie捕获` | `false` | 仅在配置 Cookie 时临时开启 |

## 首次配置

1. 导入模块，打开模块详情 →「编辑参数」
2. 把 `Cookie捕获` 设为 `true`
3. 确认已开启 MITM 并信任证书，然后用浏览器 / App 打开 NodeSeek 个人页
4. 收到「Cookie 已捕获」通知后，把 `Cookie捕获` 改回 `false`
5. 之后的每日签到由 cron 自动触发，也可以进入模块详情手动执行脚本

> 建议把 NodeSeek 相关流量保持在代理链路上，否则 MITM 捕获不会触发。

## 注意

- 保存的是完整登录 Cookie，属于敏感信息，只存在本机 Shadowrocket 的持久化存储中；重置或迁移设备后需重新捕获
- Cookie 失效时通知会提示，重新执行第 2–4 步即可
- 频率过高或短时间多设备签到可能触发 403 风控，保持每天一次即可
- 签到接口与参数可能随站点更新变化，失效时先看脚本日志再调整

## 来源

接口用法与思路参考 [iab0x00/ProxyRules](https://github.com/iab0x00/ProxyRules) 的 NodeSeek 模块。上游仓库未声明许可证，本仓库中的模块与脚本为独立实现，未复制上游代码。
