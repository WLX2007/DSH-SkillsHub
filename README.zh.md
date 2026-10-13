# @wulongxi/dsh-skills-hub

**Skills Hub（技能中心）** 是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）的一个插件，在 Web GUI 中添加一个原生面板，用于发现、安装和管理 Agent Skills。

一个面板提供三项能力：

- **市场** —— 搜索在线技能库（默认源 [skillhub.cn](https://skillhub.cn)，另有 skills.sh 与任意公开 GitHub 仓库），预览技能的完整文档，并在决定安装前查看其文件清单。
- **我的技能** —— 按来源分组浏览运行时加载的全部技能；启用/停用技能、编辑其 `SKILL.md`、或将其删除（删除移入 `.trash`，不直接丢失）。
- **创建** —— 把新技能写入用户级或项目级技能根，frontmatter 处理由面板代劳。

面板读取官方技能根（`<项目>/.dsh/skills`、`<项目>/.agents/skills`、`~/.dsh/skills`、`~/.agents/skills`，加上配置的 `customSkillDirs`），并与宿主技能注册表合并——面板显示的技能就是模型实际收到的技能。

| | |
|---|---|
| 状态 | 市场搜索与预览：**已可用**。技能安装：**已可用**（M3）。 |
| 要求 | DSH `>= 0.2.0-rc.2` |
| 许可证 | [BSD-3-Clause](LICENSE) |
| 语言 | 简体中文、English（跟随 GUI 语言设置） |

---

## 安装

### 从本地检出（link 安装）

```sh
dsh plugin --profile <profile> add link:<本仓库路径>
```

重启 DSH 服务后，侧边栏出现**技能中心**入口；选中即在中央栏打开面板。

### 从 npm 安装（发布后）

```sh
dsh plugin --profile <profile> add @wulongxi/dsh-skills-hub
```

## 使用

### 市场页

输入关键词回车即搜索。搜索框左侧的来源选择器决定本次搜索询问哪个注册站；选择作用于下一次搜索，因此列表永远与产生它的查询一致。

- **skillhub.cn**（默认）—— 国内 Skill 商店，19 万+ 技能，直连无需加速节点。该站点明确邀请 Agent 集成：发布面向 Agent 的集成文档（`install/skillhub.md`）、robots.txt 全开放、读路径全程无鉴权。结果带中文描述、下载量与图标。
- **skills.sh** —— Agent Skills 注册中心的搜索接口。该来源只服务一页；面板如实说明，而不是提供一个只会返回空结果的"加载更多"按钮。
- **GitHub 仓库** —— 仓库也可以直接浏览：输入 `owner/repo`（完整 URL、`.git` 后缀均可），面板通过 GitHub API 枚举其中每一个技能目录。

长结果列表滚动到底自动加载下一页，并保留显式的「加载更多」按钮作为键盘/点击目标。点技能名打开详情弹窗，正文由 shell 自己的 markdown 渲染器呈现——与在会话中读到的排版完全一致——并列出文件清单与总大小。

**许可证如实标注，绝不粉饰。** 每条结果都声明其许可证：声明了的直接显示（MIT、GPL-3.0 等）；未声明的显示*未声明许可证*。抽样目录中过半条目未声明，而这是用户决定是否把技能复制到磁盘前必须知道的事实。

### 从市场安装

详情弹窗里就是安装入口。安装动作出现在**正文读完之后**，许可证行与文件清单和按钮同屏。安装确认两次：先选目标位置（用户级 `~/.dsh/skills` 全局生效，或当前项目的 `.dsh/skills`），再弹确认框——在做出决定的时刻重述许可证状态。

安装过程以"失败不留痕"为设计目标：

- **先暂存后改名。** 文件先落在目标旁的暂存目录，全部到齐并通过限额后才整目录改名就位。失败或取消的安装不改变磁盘原状——不会留下半个技能被模型加载。
- **同名即报错。** 已存在同名技能绝不静默覆盖（面板应答 409；更新已装技能是 M4 的事）。
- **处处有界。** 单文件 2 MB、总量 16 MB、最多 200 个文件，且清单里每个路径都要先通过严格的相对路径文法校验才会被写盘。
- **provenance 随技能走。** 安装目录内的 `.skills-hub.json` 记录市场 id、来源、安装时的许可证与时间戳——M4 的更新检查就从它读回。

### 我的技能页

技能按来源分组（项目、用户、插件提供方、运行时注册）。有文件支撑的技能可以启用/停用——开关会改写其 frontmatter 中的 `disable-model-invocation`——可以编辑、删除。运行时由插件注册的技能磁盘上没有文件；面板按组说明一次，而不是在每一行上重复，其启用状态保存在面板自己的配置中。

### 预览

每条技能都能预览，包括磁盘上没有 `SKILL.md` 的内置与运行时注册技能——host 对它们回退到运行时技能注册表，弹窗如实标注来源（「来自文件」/「来自技能注册表」）。frontmatter 字段以定义列表呈现在正文上方，绝不混入 markdown：开头那行 `---` 在 GFM 里是主题分隔线，会把 YAML 变成标题和零散散文。

## 配置

插件配置（profile patch）：

| 字段 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` | 总开关；`false` 时不挂载任何路由。 |
| `githubProxies` | `string[]` | 内置降级链 | GitHub raw 内容的加速前缀，按序尝试；包含 `""` 表示先试直连。 |
| `customSkillDirs` | `string[]` | `[]` | 额外扫描的技能根目录。 |
| `dshHome` | `string` | `$DSH_HOME` 或 `~/.dsh` | 覆盖用户配置根。 |

## 安全模型

- **全部路由位于共享 loopback 围栏之后**（套接字地址 + `Host` 头 + 浏览器同源标记）。未配对的局域网客户端在触碰任何技能文件之前即收到 `403 forbidden: loopback-only`。装载 `dsh-remote-web-ui` 时，有效的已配对设备 cookie 是额外放行路径；未配对与已撤销设备仍收到 403。
- **客户端提交的 `path` 只是身份声明。** 触碰任何文件之前，host 重新扫描并要求同名技能解析到完全相同的路径。因此消失的项目技能不可能被重定向到同名的用户级技能上，这些路由也无法被用来读写任意路径。
- **浏览器从不发送 URL。** 市场请求只携带 host 签发的不透明技能 id；仓库、ref、目录与文件路径一律由 host 侧重建，且 id 文法逐段校验，路径逃逸在到达任何 fetch 之前即被拒绝。
- **远程抓取只发生在 host 半区**，位于信任围栏之后。未认证 GitHub API 允许 60 次/小时，因此只有"发现"（列目录）碰它，并缓存 30 分钟；文件正文经加速节点链从 `raw.githubusercontent.com` 读取，不占用该预算。skillhub.cn 直连。
- **注册站图标走代理而非直链。** 图标 URL 由 host 侧按显式策略抓取（仅 https、域名白名单、图片类型、256 KB 上限）并转为 data URL 回传，浏览器从不加载第三方源：无 referrer 泄漏、无逐次渲染的追踪请求。
- **安装只从 id 重建一切。** 安装路由只收不透明技能 id 与面板正在显示的工作区；文件清单来自技能自身的详情清单（绝非客户端提交），落盘目录由 host 侧推导，清单中每个路径在拼接到暂存根之前先过校验。因此安装能写到的只有技能根下的技能目录。
- 写操作有上限（正文 64 KB）、符号链接技能拒绝删除/编辑（两者都会越出其技能根）、删除移入 `.trash` 而非直接抹除。

## 架构

本包是双半区 DSH 插件：

- **host 半区**（`lib/index.js`，运行于 DSH 服务进程）—— 服务 `/api/skills-hub/*` 路由族，独占网络访问、文件 I/O 与信任围栏。
- **client 半区**（`lib/client.js`，运行于 Web GUI）—— 经 shell 的官方槽位（`sidebar.panellist` 与 keyed `main` 槽）注册侧边栏入口与中央栏页面，行盒、高亮与面板切换全部归 shell 所有，与官方插件页、定时任务页完全一致。

客户端只构建在宿主冻结的浏览器模块表之上（`react`、`@deepseek-ai/cordis`、`@deepseek-ai/dsh-client-ui-*`）；每个控件都是官方共享原语（`Button`、`Switch`、`Input`、`Menu`、`Modal`、`MarkdownText` 等）——不手搓任何控件。注册失败只记录日志并降级面板，绝不拖垮 GUI 启动。

## 开发

```sh
pnpm install
pnpm typecheck        # tsc --noEmit
pnpm build            # tsc -b tsconfig.build.json && tsdown
```

测试套件（`node tests/<file>.mjs` 运行）：

| 套件 | 范围 |
| --- | --- |
| `m0-smoke.mjs` | 按 host 的方式加载两个 bundle；断言 loader 合约、注入 require 的使用与路由注册。 |
| `m1-host.mjs` | 在真实临时技能目录树上驱动路由族：扫描分级、写路由身份校验、符号链接保护、围栏拒绝。 |
| `market.mjs` | 市场层 fake transport 零网络：聚合、去重、id 文法（含路径逃逸尝试）、来源合约、安装器的暂存/路径安全/provenance。 |
| `ui-structure.mjs` | UI 守卫：只用官方原语、卡片 anatomy、滚动高度链——每条都有负向控制。 |
| `theme-tokens.mjs` | 校验引用的每个 CSS 自定义属性都存在于发行主题中——未定义的 token 会让 `var()` 静默丢弃整条声明。 |
| `market-live*.mjs`、`icon-live.mjs`、`install-live.mjs`、`tools/scroll-selftest.mjs` | 手动的真网络 / 真浏览器冒烟；不进自动门禁。 |

## 目录结构

```
src/
  index.ts                host 入口：插件合约、配置、mount-once 防重
  routes.ts               /api/skills-hub/* 处理器
  access.ts, loopback.ts,
  pair-access.ts          信任围栏（loopback + 已配对设备 cookie）
  http.ts                 限长 body 读取、JSON 写出
  core/                   多根技能扫描、frontmatter 解析/改写、
                          插件提供技能的开关存储
  market/                 市场源注册：抓取限额、TTL 缓存、加速链、
                          skill-id 编解码、来源适配器
  client/                 browser 半区：字典、槽位注册、面板
tests/                    自动化套件（见「开发」）
docs/                     设计文档（中文）
```

## 路线图

| 里程碑 | 范围 | 状态 |
| --- | --- | --- |
| M0 | 插件骨架、侧边栏入口、构建管线 | ✅ 已交付 |
| M1 | 本地管理：浏览 / 启停 / 编辑 / 创建 / 删除 / 预览 | ✅ 已交付 |
| M2 | 市场：多源搜索、详情预览、分页、图标 | ✅ 已交付 |
| M3 | 安装引擎：校验、限额、原子写入、provenance | ✅ 已交付 |
| M4 | 生命周期：来源记录、更新检查、本地修改检测 | 规划中 |
| M5 | 自定义注册清单、离线导入、加速节点设置界面 | 规划中 |

## 许可证

[BSD-3-Clause](LICENSE) © WLX2007
