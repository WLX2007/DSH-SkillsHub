/**
 * skills-hub dictionaries.
 *
 * `zh` is the key source: every other locale must carry the identical key set.
 * Keys are grouped by the surface that reads them so a missing entry is easy to
 * spot. A `label` registered on a slot is read through a thunk on every
 * projection, so localized text follows the active language without
 * re-registering.
 *
 * Group titles come from the host payload, and the tab prefers a dictionary
 * entry keyed `group.<level>` / `groupHint.<level>` when one exists, so a new
 * source level degrades to the host's English copy instead of showing a raw key.
 *
 * @module @wulongxi/dsh-skills-hub/client/locales
 */

/** Chinese dictionary: the key source. */
export const zh = {
  'entry.label': '技能中心',
  'panel.title': '技能中心',
  'panel.subtitle': '浏览、安装并管理技能',
  'panel.tabsLabel': '技能中心页面',
  'tab.market': '市场',
  'tab.skills': '我的技能',
  'tab.create': '创建',
  'tab.edit': '编辑',

  // --- Page actions ---
  'action.new': '新建技能',
  'action.refresh': '刷新',
  'action.retry': '重试',

  // --- Market (M2-M4) ---
  'market.searchPlaceholder': '搜索网络技能库…',
  'market.searchEmpty': '输入关键词开始搜索网络技能',
  'market.searching': '正在搜索…',
  'market.comingSoon': '技能市场将在后续版本开放',
  'market.noResults': '没有找到匹配的技能',
  'market.error': '搜索失败：{message}',
  'market.source': '来源',
  'market.installs': '安装量',
  'market.detail': '详情',
  'market.install.user': '安装到用户技能',
  'market.install.project': '安装到当前项目',
  'market.installing': '正在安装…',
  'market.installed': '已安装',
  'market.preview': 'SKILL.md 预览',
  'market.fromMarket': '市场',

  // --- Skills list ---
  'list.loading': '正在加载…',
  'list.loadFailed': '加载失败：{error}',
  'list.enabled': '已启用（模型可自动调用）',
  'list.disabled': '已停用',
  'list.toggleFailed': '操作失败：{error}',
  'list.deleteTitle': '删除技能',
  'list.deleteConfirm': '确定要删除技能「{name}」吗？文件会移入 .trash，可手动恢复。',
  'list.deleteFailed': '删除失败：{error}',
  'list.edit': '编辑',
  'list.delete': '删除',
  'list.linked': '符号链接',
  'list.providerFile': '由插件提供',
  'list.noFile': '无本地文件',

  // --- Skill preview ---
  'preview.action': '预览',
  'preview.open': '预览技能 {name}',
  'preview.loading': '正在读取技能内容…',
  'preview.failed': '读取失败：{error}',
  'preview.fromFile': '来自文件',
  'preview.fromRegistry': '来自技能注册表',
  'preview.copy': '复制',
  'preview.copied': '已复制',
  'preview.code': '代码',
  'preview.wrap': '自动换行',
  'preview.unwrap': '不换行',
  'preview.footnotes': '脚注',
  'preview.emptyBody': '该技能没有正文内容',
  'preview.field.name': '技能名',
  'preview.field.description': '描述',
  'preview.field.whenToUse': '适用场景',
  'preview.field.invocation': '可调用',
  'preview.field.modelYes': '模型可自动调用',
  'preview.field.modelNo': '模型不可自动调用',
  'preview.field.userYes': '用户可显式调用',
  'preview.field.userNo': '用户不可显式调用',

  // --- Filters ---
  'filter.searchLabel': '搜索技能',
  'filter.searchPlaceholder': '按名称或描述搜索…',
  'filter.workspaceAll': '全部工作区',
  'filter.workspaceCurrent': '{name}（当前）',
  'filter.empty': '没有匹配「{query}」的技能',
  'filter.emptyWorkspace': '该工作区下没有技能',

  // --- Source groups ---
  'group.bundled': '系统内置',
  'group.project-dsh': '项目技能（.dsh/skills）',
  'group.project-agents': '项目技能（.agents/skills）',
  'group.custom': '自定义目录',
  'group.user-dsh': '用户技能（~/.dsh/skills）',
  'group.user-agents': '用户技能（~/.agents/skills）',
  'group.runtime': '运行时注册',
  'groupHint.bundled': '随 DSH 及其插件发布，无法编辑或删除',
  'groupHint.project-dsh': '位于项目目录中，仅在其工作区生效',
  'groupHint.project-agents': '位于项目目录中，仅在其工作区生效',
  'groupHint.custom': '来自 customSkillDirs 配置',
  'groupHint.user-dsh': '本机所有项目共享',
  'groupHint.user-agents': '本机所有项目共享',
  'groupHint.runtime': '插件在运行时注册，磁盘上没有 SKILL.md，无法编辑或删除',

  // --- Workspace badges ---
  'workspace.isolated': '其他工作区',

  // --- Create form ---
  'create.name': '技能名',
  'create.namePlaceholder': '例如 pdf-tools（小写字母、数字与连字符）',
  'create.description': '描述',
  'create.whenToUse': '适用场景',
  'create.content': '正文',
  'create.root': '写入位置',
  'create.root.user': '用户技能（全局生效）',
  'create.root.project': '项目技能（仅当前项目）',
  'create.submit': '创建',
  'create.submitting': '正在创建…',
  'create.empty': '技能名、描述与正文都不能为空',
  'create.created': '已创建：{path}',
  'create.failed': '创建失败：{error}',
  'create.note': '技能名必须是小写字母、数字与单个连字符，且不能与已有技能重名。',

  // --- Edit form ---
  'edit.name': '技能名（不可修改）',
  'edit.loading': '正在读取技能…',
  'edit.loadFailed': '读取失败：{error}',
  'edit.submit': '保存',
  'edit.back': '返回列表',
  'edit.failed': '保存失败：{error}',
  'edit.note': '保存会原地改写该技能，技能名、位置与启用状态保持不变。',

  // --- Shared actions ---
  'common.cancel': '取消',
  'common.close': '关闭',

  // --- Panel fallback ---
  'status.notMounted': '技能中心尚未就绪，请重启 DSH 服务',
} as const

/** The key set every locale must satisfy. */
export type SkillsHubKey = keyof typeof zh

/** English dictionary: key-parity with the Chinese source. */
export const en: Record<SkillsHubKey, string> = {
  'entry.label': 'Skills Hub',
  'panel.title': 'Skills Hub',
  'panel.subtitle': 'Browse, install and manage skills',
  'panel.tabsLabel': 'Skills Hub pages',
  'tab.market': 'Market',
  'tab.skills': 'My Skills',
  'tab.create': 'Create',
  'tab.edit': 'Edit',

  'action.new': 'New skill',
  'action.refresh': 'Refresh',
  'action.retry': 'Retry',

  'market.searchPlaceholder': 'Search online skill registries…',
  'market.searchEmpty': 'Type a keyword to search online skills',
  'market.searching': 'Searching…',
  'market.comingSoon': 'The skill market opens in a later release',
  'market.noResults': 'No matching skills found',
  'market.error': 'Search failed: {message}',
  'market.source': 'Source',
  'market.installs': 'Installs',
  'market.detail': 'Details',
  'market.install.user': 'Install for this user',
  'market.install.project': 'Install into this project',
  'market.installing': 'Installing…',
  'market.installed': 'Installed',
  'market.preview': 'SKILL.md preview',
  'market.fromMarket': 'Market',

  'list.loading': 'Loading…',
  'list.loadFailed': 'Failed to load: {error}',
  'list.enabled': 'Enabled (the model may invoke it)',
  'list.disabled': 'Disabled',
  'list.toggleFailed': 'Action failed: {error}',
  'list.deleteTitle': 'Delete skill',
  'list.deleteConfirm': 'Delete skill "{name}"? The file moves into .trash and can be restored by hand.',
  'list.deleteFailed': 'Delete failed: {error}',
  'list.edit': 'Edit',
  'list.delete': 'Delete',
  'list.linked': 'Symlink',
  'list.providerFile': 'Provided by plugin',
  'list.noFile': 'No local file',

  'preview.action': 'Preview',
  'preview.open': 'Preview skill {name}',
  'preview.loading': 'Reading the skill…',
  'preview.failed': 'Failed to read: {error}',
  'preview.fromFile': 'From file',
  'preview.fromRegistry': 'From skill registry',
  'preview.copy': 'Copy',
  'preview.copied': 'Copied',
  'preview.code': 'Code',
  'preview.wrap': 'Wrap lines',
  'preview.unwrap': 'Do not wrap',
  'preview.footnotes': 'Footnotes',
  'preview.emptyBody': 'This skill has no body content',
  'preview.field.name': 'Name',
  'preview.field.description': 'Description',
  'preview.field.whenToUse': 'When to use',
  'preview.field.invocation': 'Invocable',
  'preview.field.modelYes': 'model may auto-invoke',
  'preview.field.modelNo': 'model may not auto-invoke',
  'preview.field.userYes': 'user may invoke',
  'preview.field.userNo': 'user may not invoke',

  'filter.searchLabel': 'Search skills',
  'filter.searchPlaceholder': 'Search by name or description…',
  'filter.workspaceAll': 'All workspaces',
  'filter.workspaceCurrent': '{name} (current)',
  'filter.empty': 'No skill matches "{query}"',
  'filter.emptyWorkspace': 'No skills in this workspace',

  'group.bundled': 'System bundled',
  'group.project-dsh': 'Project skills (.dsh/skills)',
  'group.project-agents': 'Project skills (.agents/skills)',
  'group.custom': 'Custom directories',
  'group.user-dsh': 'User skills (~/.dsh/skills)',
  'group.user-agents': 'User skills (~/.agents/skills)',
  'group.runtime': 'Runtime registered',
  'groupHint.bundled': 'Shipped with DSH and its plugins; cannot be edited or deleted',
  'groupHint.project-dsh': 'Located in the project directory, scoped to its workspace',
  'groupHint.project-agents': 'Located in the project directory, scoped to its workspace',
  'groupHint.custom': 'From customSkillDirs config',
  'groupHint.user-dsh': 'Shared by all projects on this machine',
  'groupHint.user-agents': 'Shared by all projects on this machine',
  'groupHint.runtime': 'Registered at runtime by plugins; no SKILL.md on disk, so it cannot be edited or deleted',

  'workspace.isolated': 'Other workspace',

  'create.name': 'Name',
  'create.namePlaceholder': 'e.g. pdf-tools (lowercase, digits, hyphens)',
  'create.description': 'Description',
  'create.whenToUse': 'When to use',
  'create.content': 'Body',
  'create.root': 'Location',
  'create.root.user': 'User skills (all projects)',
  'create.root.project': 'Project skills (this project only)',
  'create.submit': 'Create',
  'create.submitting': 'Creating…',
  'create.empty': 'Name, description and body are all required',
  'create.created': 'Created: {path}',
  'create.failed': 'Create failed: {error}',
  'create.note': 'The name must be lowercase letters, digits and single hyphens, and must not collide with an existing skill.',

  'edit.name': 'Name (read-only)',
  'edit.loading': 'Reading the skill…',
  'edit.loadFailed': 'Failed to read: {error}',
  'edit.submit': 'Save',
  'edit.back': 'Back to list',
  'edit.failed': 'Save failed: {error}',
  'edit.note': 'Saving rewrites this skill in place; its name, location and enabled state stay unchanged.',

  'common.cancel': 'Cancel',
  'common.close': 'Close',

  'status.notMounted': 'Skills Hub is not mounted yet; restart the DSH service',
}
