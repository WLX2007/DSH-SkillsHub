# @wulongxi/dsh-skills-hub

**Skills Hub** is a [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (DSH) plugin that adds a native, first-class panel to the web GUI for discovering, installing, and managing Agent Skills.

It ships three capabilities in one panel:

- **Market** — search online skill registries (default: [skillhub.cn](https://skillhub.cn), plus skills.sh and any public GitHub repository), preview a skill's full documentation, and read its file manifest before deciding to install.
- **My Skills** — browse every skill the runtime has loaded, grouped by source; enable or disable skills, edit their `SKILL.md`, or remove them (deletes go to `.trash`, never straight to disk loss).
- **Create** — write a new skill into the user-level or project-level skill root, with frontmatter handling handled for you.

The panel reads the official skill roots (`<project>/.dsh/skills`, `<project>/.agents/skills`, `~/.dsh/skills`, `~/.agents/skills`, plus any configured `customSkillDirs`) and merges the host's skill registry on top, so what the panel displays is exactly what the model receives.

| | |
|---|---|
| Status | Market search & preview: **available**. Skill installation: planned (see [Roadmap](#roadmap)). |
| Requires | DSH `>= 0.2.0-rc.2` |
| License | [BSD-3-Clause](LICENSE) |
| Languages | English, 简体中文 (follows the GUI language setting) |

---

## Installation

### From a local checkout (link install)

```sh
dsh plugin --profile <profile> add link:<path-to-this-repo>
```

Restart the DSH service. The sidebar then shows a **Skills Hub** entry; selecting it opens the panel in the center column.

### From npm (once published)

```sh
dsh plugin --profile <profile> add @wulongxi/dsh-skills-hub
```

## Usage

### Market tab

Type a query and press Enter. The source picker to the left of the search field selects which registry the search asks; the choice applies to the next search, so results always match the query that produced them.

- **skillhub.cn** (default) — a China-hosted skill store with 190,000+ skills, reachable directly with no network accelerator. The site explicitly invites agent integration: it publishes an agent-facing integration document (`install/skillhub.md`), allows crawlers in `robots.txt`, and its read path is unauthenticated. Rows carry Chinese descriptions, download counts, and icons.
- **skills.sh** — the Agent Skills registry's search endpoint. This source serves one page; the panel says so honestly instead of offering a load-more control that could only return empty.
- **GitHub repositories** — a repository can also be browsed directly: any `owner/repo` (a full URL or a `.git` suffix also works) is enumerated through the GitHub API, and every skill directory inside it becomes a row.

Long result lists load the next page automatically as you scroll, with an explicit "load more" button as the keyboard/click target. Selecting a skill's name opens a detail dialog rendered by the shell's own markdown renderer — the skill reads exactly as it does in a conversation — alongside its file list and total size.

**Licences are stated, never laundered.** Every result row declares its licence: declared ones show it (MIT, GPL-3.0, …); undeclared ones show *No licence declared*. In a sampled catalogue more than half of the entries declare none, and that is a fact a user needs before deciding to copy a skill to disk.

### My Skills tab

Skills are grouped by provenance (project, user, plugin providers, runtime registration). A skill backed by a file can be enabled or disabled — the toggle rewrites `disable-model-invocation` in its frontmatter — edited, or deleted. Skills registered by plugins at runtime have no file on disk; the panel says so once, per group, instead of decorating every row, and their enable state is stored in the panel's own configuration.

### Preview

Every skill can be previewed, including bundled and runtime-registered ones that have no `SKILL.md` on disk — the host falls back to the runtime skill registry for those, and the dialog labels the source honestly ("from file" / "from skill registry"). Frontmatter fields are shown as a definition list above the body and are never mixed into the markdown, because a leading `---` fence is a thematic break in GFM and would mangle the YAML into headings and stray prose.

## Configuration

Plugin config (profile patch):

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `enabled` | `boolean` | `true` | Master switch; `false` mounts no routes. |
| `githubProxies` | `string[]` | built-in chain | Accelerator prefixes for GitHub raw content, tried in order; include `""` to try direct first. |
| `customSkillDirs` | `string[]` | `[]` | Additional skill root directories to scan. |
| `dshHome` | `string` | `$DSH_HOME` or `~/.dsh` | Override for the user config root. |

## Security model

- **Every route sits behind the shared loopback fence** (socket address + `Host` header + browser same-origin markers). An unpaired LAN client receives `403 forbidden: loopback-only` before any skill file is touched. When `dsh-remote-web-ui` is loaded, a live paired-device cookie is an additional allow path; unpaired and revoked devices still receive 403.
- **A client-submitted `path` is only an identity claim.** Before touching any file, the host re-scans and requires the same skill name to resolve to that exact path. A project skill that disappeared can therefore never be redirected onto a same-named user skill, and the routes cannot be used to read or write an arbitrary path.
- **The browser never sends a URL.** Market requests carry only the opaque skill id the host issued; repositories, refs, directories and file paths are re-derived host-side, and the id grammar is validated segment by segment, so a path traversal is rejected before it can reach any fetch.
- **Remote fetching happens only in the host half**, behind the trust fence. The unauthenticated GitHub API allows 60 requests/hour, so only discovery (tree listing) touches it, cached for 30 minutes; file bodies come from `raw.githubusercontent.com` through an accelerator chain, which does not count against that budget. skillhub.cn is reached directly.
- **Registry icons are proxied, not linked.** Icon URLs are fetched host-side under an explicit policy (https only, allow-listed host, image content-type, 256 KB cap) and re-served as data URLs, so the browser never loads a third-party origin: no referrer leak, no tracking pixel per render.
- Writes are bounded (64 KB bodies), symlinks refuse delete/update (both would escape their skill root), and deletes move files into `.trash` rather than removing them.

## Architecture

The package is a dual-half DSH plugin:

- **Host half** (`lib/index.js`, runs in the DSH server process) — serves the `/api/skills-hub/*` route family, owns all network access, file I/O, and the trust fence.
- **Client half** (`lib/client.js`, runs in the web GUI) — registers the sidebar entry and the center-column page through the shell's official slot seats (`sidebar.panellist` and the keyed `main` slot), so the shell owns the row box, active highlight and panel switching exactly as it does for its own Plugins and Schedule pages.

The client is built only on the host's frozen browser module table (`react`, `@deepseek-ai/cordis`, `@deepseek-ai/dsh-client-ui-*`); every control is the official shared primitive (`Button`, `Switch`, `Input`, `Menu`, `Modal`, `MarkdownText`, …) — nothing is hand-drawn. Registration failures are logged and degrade the panel; they never fail the GUI's boot.

## Development

```sh
pnpm install
pnpm typecheck        # tsc --noEmit
pnpm build            # tsc -b tsconfig.build.json && tsdown
```

Test suites (run with `node tests/<file>.mjs`):

| Suite | Scope |
| --- | --- |
| `m0-smoke.mjs` | Loads both bundles the way the host does; asserts the loader contract, injected-require usage and route registration. |
| `m1-host.mjs` | Drives the route family against a real temporary skill tree: scan grading, write-route identity checks, symlink protection, fence denials. |
| `market.mjs` | Market layer with fake transports, zero network: aggregation, dedup, id grammar (incl. path-escape attempts), source contracts. |
| `ui-structure.mjs` | UI guards: official-primitives-only, card anatomy, scroll height chain — each negative-controlled. |
| `theme-tokens.mjs` | Verifies every referenced CSS custom property exists in the shipped theme, because an undefined token makes `var()` silently drop the whole declaration. |
| `market-live*.mjs`, `icon-live.mjs`, `tools/scroll-selftest.mjs` | Manual, live-network / real-browser smoke tests; not part of the automated gate. |

## Project layout

```
src/
  index.ts                host entry: plugin contract, config, mount-once guard
  routes.ts               /api/skills-hub/* handlers
  access.ts, loopback.ts,
  pair-access.ts          trust fence (loopback + paired-device cookie)
  http.ts                 bounded body reader, JSON writer
  core/                   multi-root skill scan, frontmatter parse/rewrite,
                          provider toggle store
  market/                 source registry: fetch limits, TTL caches, accelerator
                          chain, skill-id codec, source adapters
  client/                 browser half: dictionaries, slot registrations, panel
tests/                    automated suites (see Development)
docs/                     design documents (Chinese)
```

## Roadmap

| Milestone | Scope | Status |
| --- | --- | --- |
| M0 | Plugin skeleton, sidebar entry, build pipeline | ✅ Shipped |
| M1 | Local management: browse / enable / edit / create / delete / preview | ✅ Shipped |
| M2 | Market: multi-source search, detail preview, paging, icons | ✅ Shipped |
| M3 | Installation engine: validation, size caps, atomic writes, provenance | Planned |
| M4 | Lifecycle: provenance store, update checks, local-modification detection | Planned |
| M5 | Custom registry manifests, offline import, accelerator settings UI | Planned |

## License

[BSD-3-Clause](LICENSE) © WLX2007
