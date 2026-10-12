# GitHub 加速约定

本工作区所有 GitHub 克隆/下载一律走加速节点（用户指令，2026-10-12）。

## 用法

    git clone --depth 1 https://gh-proxy.com/https://github.com/<owner>/<repo>.git <dir>

raw 文件：

    https://gh-proxy.com/https://raw.githubusercontent.com/<owner>/<repo>/<ref>/<path>

## 实测可用节点（2026-10-12，raw 路径单次探测）

| 节点 | 结果 | 耗时 |
| --- | --- | --- |
| gh-proxy.com | OK | 701 ms |
| ghproxy.icu | OK | 1269 ms |
| ghfast.top | OK | 1941 ms |
| github.tbap.top | OK | 2774 ms |
| gh.dpik.top | OK | 2809 ms |
| gh.inkchills.cn | OK | 2835 ms |
| ghproxy.net | 超时 | >15s |
| github.geekery.cn | 404 | - |

节点清单来源：github.akams.cn 前端硬编码数组（80+ 条）。

## 注意

- dsh-web 仓库默认分支是 `dev`，不是 `main`。
- 加速节点会失效，失败时按上表顺序降级重试。
