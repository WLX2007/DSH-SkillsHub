# AGENTS.md — @wulongxi/dsh-skills-hub

DSH Web GUI 的**技能中心**插件：侧边栏「技能中心」入口打开原生中栏面板，
提供网络技能市场（M2-M4）与本地技能管理（M1，已完成）。

本文件只写本包特有的、踩过坑的约定；不重复通用插件规则。

## 工具链：dsh / pnpm 都不在 PATH

用运行时自带的：

```
NODE=C:\Users\WLX\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe
PNPM=C:\Users\WLX\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\pnpm\bin\pnpm.mjs
```

`pnpm run <script>` 会因 `ERR_PNPM_IGNORED_BUILDS`（被忽略的构建脚本）
**以 exit 1 失败**，即使命令本身成功。绕过办法是直接调用二进制：

```powershell
& $NODE node_modules\typescript\bin\tsc --noEmit                  # 类型检查
& $NODE node_modules\tsdown\dist\run.mjs                          # 构建两个半区
& $NODE node_modules\typescript\bin\tsc -b tsconfig.build.json    # 产出 lib/types
& $NODE tests\m0-smoke.mjs ; & $NODE tests\m1-host.mjs ; & $NODE tests\theme-tokens.mjs
```

## 主题 token：先核验再使用（M0 真实事故）

**CSS 自定义属性未定义时，`var()` 解析为空、整条声明被静默丢弃，不报错。**
M0 曾用 `--dsw-alias-bg-primary` / `--dsw-alias-border-secondary` /
`--dsw-font-family-base` 三个**看起来合理但不存在**的名字，导致面板没有背景、边框与字体，
却毫无报错。

- 加任何新 token 前，先跑 `tests/theme-tokens.mjs`；它会从 **`app.asar`** 提取真实
  token 名（当前 432 个）并逐个校验本包引用（当前 17 个）。
- 该脚本带负向控制：把已核验的 token 改回虚构名，必须失败。
- 权威 token 清单与禁用名单见 `docs/技能市场插件开发方案.md` §7.3。

## 客户端 bundle 纯净门

浏览器 bundle 里 `@deepseek-ai/*` **只能 type-only import**。可外部化的只有宿主冻结模块表：
`react`、`react/jsx-runtime`、`react-dom`、`react-dom/client`、`@deepseek-ai/cordis`、
`@deepseek-ai/dsh-client-store`、`.../ui-slots`、`.../ui-primitives`、`.../ui-dockkit`。
`tsdown.config.ts` 的 `dsh-client-bundle-purity` 插件会在构建期直接报错，别绕过它。
跨插件协作走 cordis 服务或 slot。

## 路由与信任边界

- 客户端 API 路径**必须文档相对**（`api/skills-hub/list`，不带前导 `/`）。宿主用
  `<base href="./">` 提供 GUI，根绝对路径会在子路径部署下逃逸前缀导致 404。
- **客户端提交的 `path` 只是身份声明。** 写路由必须重新扫描并把同名技能解析到完全相同的路径，
  否则 409。这条规则的全部实现是 `src/routes.ts` 的 `resolveScannedSkill`，不要放宽。
- 符号链接技能拒绝 delete/update（会越出技能根）；`provider-file` 行的 path **不得**暴露为可写。
- 每个路由都要过 `guard()`（信任围栏 + 方法检查）。

## 生命周期

- host 半区用 `mountOnce('<包名>')` 防双源重复注册；bundle 行 id 属于 loader 全局空间，
  用独占 id（`skills-hub`，order 40），不要复用官方或 skill-explorer 的 id。
- 客户端注册失败只 `console.warn`，**绝不抛出**——web shell 在插件 apply 抛错时整体启动失败。
- 两个槽位注册都走 `ctx.slots.inject`，使加载顺序无关。

## 生效方式

- **纯 client 改动**：重新构建后刷新页面即可（宿主按包名从
  `/plugins/@wulongxi/dsh-skills-hub/client.js` 取 bundle）。
- **host 半区改动**：Node 会缓存 ES 模块，需要 DSH 服务重启才可靠生效。
  插件管理器的热挂载（`fiberPhase: active`）**不保证**重新 import 已改动的 host bundle。
- **不要自行重启或中断用户正在运行的 DSH 服务**；在交付说明里标注需要重启即可。

## UI 必须对齐官方，不许手搓控件

**权威来源是官方公开仓库，不是参考插件**：
`github.com/deepseek-ai/deepseek-harness`（MIT、公开、默认分支 `master`）。
按安装版本取 tag，例如 `dsh-v0.2.0-rc.2`：

```
packages/client/ui-primitives/src/         官方控件库（TSX 原文）
packages/client/ui-plugin-manager/src/client/PluginManagerPage.module.css
packages/client/ui-schedule/src/           另一张列表页范式
```

也可以用 `tools/asar-extract.mjs` 从 `app.asar` 取**已安装版本**的编译产物
（`node tools/asar-extract.mjs <asar> <outDir> <pathPrefix>`）。
nightly 通道下 tag 与已装版本可能不同，要核验再照抄。

**规则**：

1. 控件一律用 `@deepseek-ai/dsh-client-ui-primitives`（它在宿主冻结模块表内，
   走注入的 `require` 解析）。官方文档明确说：本包是控件唯一可共享的地方，
   **复制已有控件正是禁止的**。`panel.module.css` 只写布局与几何，不重画控件。
2. 页面结构照抄 `ui-plugin-manager`：居中 960px 列、20px 标题 + 13px 说明行、
   `section.group > .groupHead(h3 + span.count) + ul.cards > li.card > .cardHead`。
   卡片是**单行**：48px 细边框图标框 + `cardMain`（标题行 + 一行 clamp 描述）+ `cardEnd`。
3. **组级说明只写一次**，不要每张卡片重复同一句话（这是已经犯过的错：
   列表里每行都印「运行时注册的技能没有本地文件」，整页读起来像散文）。
   卡片上的状态标签最多一个——启用状态已经由尾部 `Switch` 表达，再加绿色
   「已启用」是把同一件事说两遍。
4. 删除确认用官方 `Modal`，不要 `window.confirm`（无法换肤、无法本地化）。
5. **markdown 内容不得包含 frontmatter。** 官方 `MarkdownText` 不引入
   `mdast-util-frontmatter`，但它支持 `thematicBreak` 与 `setext`：整份 `SKILL.md`
   丢进去，结尾的 `---` 会把上面的 `description:` 行变成 **setext 二级标题**，
   整块 YAML 渲染成零散散文。正确做法是**分开传**：正文走 `MarkdownText`，
   frontmatter 字段由 host 单独返回、弹窗用定义列表呈现。

## 技能预览

- 预览路由 `preview` **只收技能名，不收路径**，并且**双源**：先读文件（写入路由信任的那份），
  文件不存在时回退 `ctx.skills.get(name, {cwd})`。回退不是可选项——bundled / runtime 注册的
  技能磁盘上没有 SKILL.md，只读文件会让**用户最想看的那些技能预览不了**。
- 响应带 `source: 'file' | 'registry'`，UI 据此如实标注来源，不假装存在磁盘路径。
- **文件存在时绝不回查注册表**：文件才是用户能操作的对象。
- 正文用官方 `MarkdownText` + 官方 `Modal`。`labels` 必须 `useMemo` 稳定引用，
  否则渲染器每次 render 都丢弃解析缓存。

## 测试纪律

- `tests/m0-smoke.mjs`：按宿主的方式加载两个 bundle，断言 loader 合约、注入的 `require`、
  host 导出、路由注册，以及**确实复用了官方 primitives**。改 bundle 结构后必须仍然全绿。
- `tests/m1-host.mjs`：在**真实临时目录树**上驱动路由，断言扫描分级、rank 决出、
  验收规则丢弃、写路由的 409 身份校验、`.trash` 删除、符号链接保护、围栏 403/405。
  新增路由行为时在这里加断言，不要只断言导出形状。
- `tests/theme-tokens.mjs`：见上。
- `tests/ui-structure.mjs`：控件来源、卡片 anatomy、组说明只出现一次、无 `window.confirm`、
  960px 列与 20px 标题、描述 clamp 一行。改 UI 后必须全绿，并**用负向控制验证过**
  （把缺陷改回去，守卫必须失败）。扫描前会剥掉注释，否则解释「为什么不用某个写法」
  的注释本身会被误报成违规。
