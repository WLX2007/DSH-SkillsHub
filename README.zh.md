# @wulongxi/dsh-skills-hub

DeepSeek Harness (DSH) **技能中心** —— 一个原生 Web GUI 面板，用于浏览和搜索
**网络上的**技能库、把技能安装到用户/项目根，并管理或创建本地技能。

> 状态：**M1（本地管理）**。侧边栏入口、原生中栏面板、host 路由族、信任围栏与构建管线均已
> 完成并通过验证。本地技能可以浏览、启停、创建、编辑与删除。市场检索与安装引擎在 M2-M4 交付
> （见 `docs/` 下的开发方案）。

## 功能

| 页签 | 作用 | 状态 |
| --- | --- | --- |
| 市场 | 搜索网络技能库、预览 `SKILL.md`、安装到用户或项目根 | 搜索与详情**已完成**；安装 M3 |
| 我的技能 | 按来源浏览已加载技能、启用/停用、编辑、删除 | **已完成** |
| 创建 | 把新技能写入用户或项目根 | **已完成** |

面板读取官方技能根（`<项目>/.dsh/skills`、`<项目>/.agents/skills`、`~/.dsh/skills`、
`~/.agents/skills`，加上配置的 `customSkillDirs`），再与宿主技能注册表合并，
因此面板显示的技能就是模型实际收到的那个。

## 技能市场

「市场」页搜索网络上的技能库。三个来源，**skillhub.cn 为默认源**：

- **skillhub.cn** —— 国内 Skill 商店，19 万+ 技能，直连无需加速节点。该站点主动邀请
  Agent 集成（发布 `install/skillhub.md` 供 Agent 读取、robots.txt 全开放、读路径全程
  无鉴权）。带中文描述、下载量与评分。
- **skills.sh** —— Agent Skills 注册中心的搜索接口。
- **GitHub 仓库直连** —— 输入 `owner/repo`（完整 URL、`.git` 后缀均可），枚举其中全部技能目录。

搜索结果与本地技能同一套卡片样式；点技能名打开详情，正文用 shell 自己的 markdown 渲染器
呈现，并列出该技能包含的全部文件。**每个结果都标注许可证**——声明了就显示（如 MIT、
GPL-3.0），未声明则显示"未声明许可证"：抽样中过半技能未声明，这是用户决定是否安装前
必须知道的事实。来源失效时页面降级而非空白。

**网络策略**（都来自实测约束，详见 `docs/技能市场插件开发方案.md` M2 一节）：

- 未认证 GitHub API 只有 **60 次/小时**，所以只有"发现"（列目录）才碰 API，且缓存 30 分钟；
  正文一律读 raw.githubusercontent.com（不限次）。skillhub.cn 完全不走 GitHub。
- GitHub 正文经加速节点链获取（直连优先，失败逐个降级）；skillhub.cn 直连。
- 客户端只回传 host 发的**不透明技能 id**，URL、仓库、路径一律由 host 从 id 重建；
  id 文法在解码时逐段校验，路径逃逸在到达任何 fetch 之前被拒绝。

## 路由

| 路由 | 方法 | 说明 |
| --- | --- | --- |
| `api/skills-hub/list` | GET | 按来源分级的本地技能列表 |
| `api/skills-hub/read` | GET | 单个技能的可编辑字段与正文 |
| `api/skills-hub/preview` | GET | 技能预览（文件优先，回退技能注册表） |
| `api/skills-hub/market/search` | GET | 市场检索（多源聚合去重） |
| `api/skills-hub/market/detail` | GET | 一个市场技能的可读详情 |
| `api/skills-hub/market/list-repo` | GET | 枚举一个仓库下的全部技能 |
| `api/skills-hub/market/sources` | GET | 市场来源清单 |
| `api/skills-hub/set-enabled` | POST | 启用/停用（改写 `disable-model-invocation`） |
| `api/skills-hub/set-provider-enabled` | POST | 面板本地开关插件提供的技能 |
| `api/skills-hub/create` | POST | 在用户或项目根创建技能 |
| `api/skills-hub/update` | POST | 原地改写已有技能 |
| `api/skills-hub/delete` | POST | 移入 `.trash` |
| `api/skills-hub/health` | GET | 健康检查与能力探测 |

## 技能预览

点卡片上的技能名（或「预览」）打开预览弹窗。正文用 shell 自己的 markdown 渲染器
（官方 `MarkdownText`）呈现，因此在会话里和在这里看到的排版、代码块与复制按钮完全一致；
不可信 HTML 被禁用，链接协议走白名单——技能正文来自网络下载仓库时这一点很重要。

**每一条技能都能预览**，包括系统内置与运行时注册的：它们没有可打开的 SKILL.md，host 改用
技能注册表读取正文。弹窗会如实标注来源（「来自文件」/「来自技能注册表」），不会假装存在一个磁盘路径。

frontmatter 字段（技能名 / 描述 / 适用场景 / 可调用性）单独以定义列表呈现，**不混进 markdown**：
开头那行 `---` 在 GFM 里是主题分隔线，会把上面的 YAML 字段变成标题、整块渲染成零散散文。


## 安全模型

- 全部路由都在共享 loopback 围栏之后（套接字地址 + Host 头 + 浏览器同源标记）。未配对的
  局域网客户端在触碰任何技能文件之前即收到 `403 forbidden: loopback-only`。装了
  `dsh-remote-web-ui` 时，有效的已配对设备 cookie 是额外放行路径；未配对与已撤销设备仍 403。
- **客户端提交的 `path` 只是身份声明。** 执行修改前，最新一次重扫必须把同名技能解析到完全相同
  的路径。因此项目技能消失后，同名操作不会落到用户级技能上；这些路由也无法被用来读写任意路径。
- `update` 会原样保留当前启用状态，编辑不会静默把已停用的技能重新启用。
- 符号链接技能可列出、可启停，但拒绝删除与编辑——两者都会越出它所在的技能根。
- 技能正文上限 64 KB；删除是把文件移入 `.trash` 而不是直接抹掉。

## 设计要点

- **原生面板，不做 DOM 接管。** 插件往 shell 自己的侧边栏面板列表
  （`sidebar.panellist`）贡献一行、往布局的 keyed `main` 槽贡献页面。行盒、标签、
  高亮、折叠轨道与面板切换全部归 shell——与官方插件页、定时任务页完全一致。
- **条件注册。** 两个座位都经 `ctx.slots.inject`，只在拥有该座位的 shell 条目声明
  之后才触发，因此加载顺序无关紧要；不支持这些座位的 shell 只是让面板不出现，不会
  导致启动失败。
- **失败降级，绝不抛出。** 注册问题只记录日志；web shell 在插件 apply 抛错时会整体
  启动失败，外部插件不能把 GUI 拖垮。
- **网络访问只在 host 半区。** 所有远程抓取都在 host 半区、位于 loopback 信任围栏
  之后；浏览器半区只发送身份（id/名称），从不发送 URL 或文件清单。

## 安装

```sh
dsh plugin --profile <名称> add link:E:\Code\DSH-SkillsHub
```

`cordis.patch.yml` 这类 bundle 行变化需要**重启 DSH 服务**才生效。重启后侧边栏出现
**技能中心**一行。

## 构建

工具链用运行时自带的 Node/pnpm；`dsh` 不在 `PATH` 上。

```sh
node <dsh-runtime>/dependencies/node/bin/node.exe <dsh-runtime>/dependencies/pnpm/bin/pnpm.mjs install
node node_modules/typescript/bin/tsc --noEmit          # 类型检查
node node_modules/tsdown/dist/run.mjs                  # 构建 lib/index.js + lib/client.js
node node_modules/typescript/bin/tsc -b tsconfig.build.json   # 产出 lib/types
node tests/m0-smoke.mjs                                # bundle 合约冒烟测试
node tests/m1-host.mjs                                 # 针对真实临时技能目录的 host 逻辑测试
node tests/theme-tokens.mjs                            # 主题 token 守卫
```

`tests/theme-tokens.mjs` 的存在理由：CSS 自定义属性未定义时 `var()` 解析为空，整条声明被
**静默丢弃**——主题 token 写错是看不见的样式 bug，而不是报错。该守卫从应用打包的 `app.asar`
中提取真实的 token 名，本包引用了未定义的 token 就失败。

## 目录

```
src/index.ts              host 半区：路由族 + mountOnce 防重
src/routes.ts             /api/skills-hub/* 处理器
src/core/frontmatter.ts   零依赖 SKILL.md frontmatter 解析/改写
src/core/collect.ts       多根扫描 + rank 决出 + 注册表合并 + 写操作
src/core/provider-toggles.ts  插件提供技能的面板本地开关存储
src/access.ts             信任围栏（loopback + 已配对设备 cookie）
src/loopback.ts           套接字 / Host / 同源检查
src/pair-access.ts        已配对设备放行路径
src/http.ts               限长 body 读取、JSON 写出、identity 编码 fetch init
src/client/index.ts       browser 半区：字典注册 + 面板装配
src/client/native-panel.tsx  两个槽位注册
src/client/skill-filter.ts   纯函数查询/工作区过滤
src/client/panel/         controller、面板壳、四个页签、CSS Modules
tests/m0-smoke.mjs        按 host 的方式加载两个 bundle 并断言合约
tests/m1-host.mjs         在临时目录树上驱动真实路由
tests/theme-tokens.mjs    主题 token 守卫（asar 基准 + 负向控制）
```

## License

BSD-3-Clause。
