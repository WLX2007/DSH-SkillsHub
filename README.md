# @wulongxi/dsh-skills-hub

DeepSeek Harness (DSH) **Skills Hub** — a native web GUI panel for browsing and
searching **online** skill registries, installing skills into user/project
roots, and managing or creating local skills.

> Status: **M1 (local management)**. The sidebar entry, the native center-column
> panel, the host route family, the trust fence and the build pipeline are
> complete and verified. Local skills can be browsed, enabled/disabled, created,
> edited and deleted. The market search and install engine land in M2-M4 (see the
> development plan in `docs/`).

## What it does

| Tab | Purpose | Status |
| --- | --- | --- |
| Market | Search online skill registries, preview `SKILL.md`, install into the user or project root | M2-M4 |
| My Skills | Browse loaded skills by source, enable/disable, edit, delete | **done** |
| Create | Write a new skill into the user or project root | **done** |

The panel reads the official skill roots
(`<project>/.dsh/skills`, `<project>/.agents/skills`, `~/.dsh/skills`,
`~/.agents/skills`, plus configured `customSkillDirs`) and merges the host's
skill registry on top, so what the panel shows is what the model receives.

## Routes

| Route | Method | Purpose |
| --- | --- | --- |
| `api/skills-hub/list` | GET | Local skills grouped by source |
| `api/skills-hub/read` | GET | One skill's editable fields and body |
| `api/skills-hub/preview` | GET | Skill preview (file first, registry fallback) |
| `api/skills-hub/set-enabled` | POST | Enable/disable (rewrites `disable-model-invocation`) |
| `api/skills-hub/set-provider-enabled` | POST | Enable/disable a plugin-provided skill in the panel's own store |
| `api/skills-hub/create` | POST | Create a skill under the user or project root |
| `api/skills-hub/update` | POST | Rewrite an existing skill in place |
| `api/skills-hub/delete` | POST | Move a skill into `.trash` |
| `api/skills-hub/health` | GET | Liveness and capability probe |

## Skill preview

Selecting a skill's name (or its Preview action) opens a preview dialog. The body
is rendered by the shell's own markdown renderer (the official `MarkdownText`),
so a skill reads here exactly as it does in a conversation — same typography,
same code fences with their copy toolbar. Raw HTML stays disabled and link
protocols are allowlisted, which matters because a skill body is untrusted text
that may come from a downloaded repository.

**Every skill previews**, including bundled and runtime-registered ones. Those
have no SKILL.md the panel may open, so the host reads them through the skill
registry instead, and the dialog labels the source honestly ("From file" / "From
skill registry") rather than showing a path that does not exist.

Frontmatter fields (name, description, when-to-use, invocation policy) are shown
as their own definition list and are **never** mixed into the markdown: a leading
`---` fence is a thematic break in GFM, which would turn the YAML lines into a
heading and print the block as stray prose.

## Security model

- Every route sits behind the shared loopback fence (socket address + Host header
  + browser same-origin markers). An unpaired LAN client receives
  `403 forbidden: loopback-only` before any skill file is touched. When
  `dsh-remote-web-ui` is loaded, a live paired-device cookie is an extra allow
  path; unpaired and revoked devices still get 403.
- **A client-submitted `path` is only an identity claim.** Before touching any
  file the host re-scans and requires the same name to resolve to that exact
  path, so a project skill that disappeared can never be redirected onto a
  same-named user skill, and the routes cannot be used to write or read an
  arbitrary path.
- `update` carries the current enabled state over, so an edit never silently
  re-enables a disabled skill.
- Linked (symlinked) skills are listable and toggleable but refuse delete and
  update: both would escape the skill root they appear under.
- Skill body content is capped at 64 KB; deletes move the file into `.trash`
  rather than removing it.

## Design notes

- **Native panel, not a DOM takeover.** The plugin contributes a row to the
  shell's own sidebar panel list (`sidebar.panellist`) and its page to the
  layout's keyed `main` slot. The shell owns the row box, the label, the active
  highlight, the collapsed rail and the panel switch — exactly as it does for
  the shipped Plugins and Schedule pages.
- **Conditional registration.** Both seats go through `ctx.slots.inject`, which
  fires only once the owning shell entry has declared the seat, so load order
  does not matter and a shell that cannot serve the seats simply leaves the
  panel absent instead of failing boot.
- **Failures degrade, never throw.** A registration problem is logged; the web
  shell fails its whole boot when a plugin apply throws, and an external plugin
  must not take the GUI down.
- **Host-only network access.** All remote fetching happens in the host half
  behind a loopback trust fence, and the browser half only ever sends
  identities (ids/names), never URLs or file lists.

## Install

```sh
dsh plugin --profile <name> add link:E:\Code\DSH-SkillsHub
```

A `cordis.patch.yml` bundle-row change takes effect on the next DSH service
start. After the restart the sidebar shows a **Skills Hub** row.

## Build

The toolchain is the runtime-bundled Node/pnpm; `dsh` is not on `PATH`.

```sh
node <dsh-runtime>/dependencies/node/bin/node.exe <dsh-runtime>/dependencies/pnpm/bin/pnpm.mjs install
node node_modules/typescript/bin/tsc --noEmit          # typecheck
node node_modules/tsdown/dist/run.mjs                  # build lib/index.js + lib/client.js
node node_modules/typescript/bin/tsc -b tsconfig.build.json   # emit lib/types
node tests/m0-smoke.mjs                                # bundle contract smoke test
node tests/m1-host.mjs                                 # host logic against a real temp skill tree
node tests/theme-tokens.mjs                            # theme token guard
```

`tests/theme-tokens.mjs` exists because an undefined CSS custom property makes
`var()` resolve to nothing, silently dropping the whole declaration — a typo in a
theme token is an invisible style bug, not an error. It harvests the real token
names out of the shipped `app.asar` and fails when this package references one
that is not defined.

## Layout

```
src/index.ts              host half: route family + mountOnce guard
src/routes.ts             /api/skills-hub/* handlers
src/core/frontmatter.ts   zero-dependency SKILL.md frontmatter parse/rewrite
src/core/collect.ts       multi-root scan + rank resolution + registry merge + writes
src/core/provider-toggles.ts  panel-local switch store for plugin-provided skills
src/access.ts             trust fence (loopback + paired-device cookie)
src/loopback.ts           socket/Host/same-origin checks
src/pair-access.ts        paired-device allow path
src/http.ts               bounded body reader, JSON writer, identity-encoding fetch init
src/client/index.ts       browser half: dictionaries + panel wiring
src/client/native-panel.tsx  the two slot registrations
src/client/skill-filter.ts   pure query/workspace filtering
src/client/panel/         controller, panel shell, the four tabs, CSS Modules
tests/m0-smoke.mjs        loads both bundles the way the host does and asserts contracts
tests/m1-host.mjs         drives the routes against real files in a temp tree
tests/theme-tokens.mjs    theme token guard (asar ground truth, negative-controlled)
```

## License

BSD-3-Clause.
