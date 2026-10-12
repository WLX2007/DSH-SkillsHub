/**
 * M1 host-logic test: exercise the skill scan and the write paths against a REAL
 * temporary directory tree, then drive the route handlers with fake req/res.
 *
 * This is deliberately not an export-shape assertion. The failure modes that
 * matter here are silent: a scan that skips a root, a rank that lets the wrong
 * duplicate win, a write route that trusts a client-supplied path, a toggle that
 * re-enables a disabled skill. Each is checked against real files on disk.
 *
 * Run: node tests/m1-host.mjs
 */

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const host = await import(new URL('../lib/index.js', import.meta.url).href)

let passed = 0
const failures = []
async function check(label, fn) {
  try {
    await fn()
    passed += 1
    console.log(`  PASS  ${label}`)
  } catch (error) {
    failures.push({ label, error })
    console.error(`  FAIL  ${label}\n        ${error.message}`)
    process.exitCode = 1
  }
}

/** Build one SKILL.md body. */
function skillFile(name, description, extra = '') {
  return `---\nname: ${name}\ndescription: ${description}\n${extra}---\n\n# ${name}\n\nBody for ${name}.\n`
}

/** A fake registry that reports no skills (filesystem is the subject here). */
const emptyRegistry = { snapshot: async () => ({ skills: [], complete: true }) }

/**
 * Drive one route handler with a fake node req/res pair.
 * @returns {{status: number, body: any}}
 */
async function callRoute(routes, path, { method = 'GET', body, url } = {}) {
  const route = routes.find(candidate => candidate.path === path)
  assert.ok(route, `route not registered: ${path}`)
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body), 'utf8')]
  const req = {
    method,
    url: url ?? path,
    headers: { host: '127.0.0.1:19387' },
    socket: { remoteAddress: '127.0.0.1' },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
    destroy() {},
  }
  let status = 0
  let payload
  const res = {
    writeHead(code) { status = code; return this },
    end(text) { payload = text === undefined ? undefined : JSON.parse(text) },
  }
  await route.handler(req, res)
  return { status, body: payload }
}

/** A host ctx whose trust fence passes (loopback test request). */
function makeCtx() {
  return {
    logger: { warn() {} },
    get: () => undefined,
  }
}

// ---------------------------------------------------------------------------
console.log('scan: source levels, ranking and acceptance rules')

const sandbox = mkdtempSync(join(tmpdir(), 'skills-hub-m1-'))
const dshHome = join(sandbox, 'dsh')
const agentsHome = join(sandbox, 'agents')
const project = join(sandbox, 'project')
const customRoot = join(sandbox, 'custom-skills')

try {
  // A project with user, project and custom roots populated.
  mkdirSync(join(project, '.git'), { recursive: true })
  mkdirSync(join(project, '.dsh', 'skills', 'project-skill'), { recursive: true })
  writeFileSync(join(project, '.dsh', 'skills', 'project-skill', 'SKILL.md'), skillFile('project-skill', 'A project skill'))
  mkdirSync(join(project, '.agents', 'skills', 'agents-skill'), { recursive: true })
  writeFileSync(join(project, '.agents', 'skills', 'agents-skill', 'SKILL.md'), skillFile('agents-skill', 'An agents skill'))
  mkdirSync(join(dshHome, 'skills', 'user-skill'), { recursive: true })
  writeFileSync(join(dshHome, 'skills', 'user-skill', 'SKILL.md'), skillFile('user-skill', 'A user skill'))
  mkdirSync(join(dshHome, 'skills', 'disabled-skill'), { recursive: true })
  writeFileSync(join(dshHome, 'skills', 'disabled-skill', 'SKILL.md'), skillFile('disabled-skill', 'A disabled skill', 'disable-model-invocation: true\n'))
  mkdirSync(join(customRoot, 'custom-skill'), { recursive: true })
  writeFileSync(join(customRoot, 'custom-skill', 'SKILL.md'), skillFile('custom-skill', 'A custom skill'))
  // Acceptance-rule fixtures: these must NOT be listed.
  mkdirSync(join(dshHome, 'skills', 'no-description'), { recursive: true })
  writeFileSync(join(dshHome, 'skills', 'no-description', 'SKILL.md'), '---\nname: no-description\n---\n\nbody\n')
  mkdirSync(join(dshHome, 'skills', 'Bad_Name'), { recursive: true })
  writeFileSync(join(dshHome, 'skills', 'Bad_Name', 'SKILL.md'), skillFile('Bad_Name', 'Invalid name grammar'))
  mkdirSync(join(dshHome, 'skills', 'nameless'), { recursive: true })
  writeFileSync(join(dshHome, 'skills', 'nameless', 'SKILL.md'), '---\ndescription: has no name\n---\n\nbody\n')
  // A same-name duplicate: project-dsh (rank 100) must beat user-dsh (rank 400).
  mkdirSync(join(dshHome, 'skills', 'shared-name'), { recursive: true })
  writeFileSync(join(dshHome, 'skills', 'shared-name', 'SKILL.md'), skillFile('shared-name', 'USER copy should lose'))
  mkdirSync(join(project, '.dsh', 'skills', 'shared-name'), { recursive: true })
  writeFileSync(join(project, '.dsh', 'skills', 'shared-name', 'SKILL.md'), skillFile('shared-name', 'PROJECT copy should win'))

  const routes = host.makeRoutes(makeCtx(), {
    dshHome,
    customSkillDirs: [customRoot],
    registry: emptyRegistry,
    loadSkill: undefined,
    activeSessionCwds: () => [project],
    logger: { warn() {} },
  })

  const list = await callRoute(routes, host.ROUTES.list)
  const all = list.body.groups.flatMap(group => group.skills)
  const names = all.map(skill => skill.name)

  await check('list route answers 200 with a grouped payload', () => {
    assert.equal(list.status, 200)
    assert.ok(Array.isArray(list.body.groups))
    assert.equal(list.body.cwd, project)
  })

  await check('every populated source level is listed', () => {
    for (const expected of ['project-skill', 'agents-skill', 'user-skill', 'custom-skill', 'disabled-skill']) {
      assert.ok(names.includes(expected), `missing ${expected}; got ${names.join(', ')}`)
    }
  })

  await check('each skill is grouped under its own source level', () => {
    const levelOf = (name) => all.find(skill => skill.name === name)?.level
    assert.equal(levelOf('project-skill'), 'project-dsh')
    assert.equal(levelOf('agents-skill'), 'project-agents')
    assert.equal(levelOf('user-skill'), 'user-dsh')
    assert.equal(levelOf('custom-skill'), 'custom')
  })

  await check('a file missing name/description or with a bad name grammar is dropped', () => {
    for (const excluded of ['no-description', 'Bad_Name', 'nameless']) {
      assert.ok(!names.includes(excluded), `${excluded} should not be listed`)
    }
  })

  await check('a duplicate name resolves by official source rank (project beats user)', () => {
    const winner = all.find(skill => skill.name === 'shared-name')
    assert.ok(winner, 'shared-name should be listed')
    assert.equal(winner.description, 'PROJECT copy should win')
    assert.equal(winner.level, 'project-dsh')
  })

  await check('frontmatter disable-model-invocation is honored', () => {
    const disabled = all.find(skill => skill.name === 'disabled-skill')
    assert.equal(disabled.modelInvocable, false)
    assert.equal(all.find(skill => skill.name === 'user-skill').modelInvocable, true)
  })

  await check('scanned skills carry a writable path and editable fileState', () => {
    const skill = all.find(s => s.name === 'user-skill')
    assert.equal(skill.fileState, 'editable')
    assert.ok(existsSync(skill.path), `path should exist: ${skill.path}`)
  })

  // -------------------------------------------------------------------------
  console.log('\nwrite routes: trust fence, path identity, and file effects')

  const userSkillPath = join(dshHome, 'skills', 'user-skill', 'SKILL.md')

  await check('a non-loopback caller is refused with 403', async () => {
    const remoteReq = {
      method: 'GET',
      url: host.ROUTES.list,
      headers: { host: '10.0.0.5:19387' },
      socket: { remoteAddress: '10.0.0.5' },
      async *[Symbol.asyncIterator]() {},
    }
    const route = routes.find(candidate => candidate.path === host.ROUTES.list)
    let status = 0
    const res = { writeHead(code) { status = code; return this }, end() {} }
    await route.handler(remoteReq, res)
    assert.equal(status, 403)
  })

  await check('set-enabled rewrites disable-model-invocation in place', async () => {
    const result = await callRoute(routes, host.ROUTES.setEnabled, {
      method: 'POST',
      body: { name: 'user-skill', path: userSkillPath, enabled: false },
    })
    assert.equal(result.status, 200)
    assert.equal(result.body.modelInvocable, false)
    const text = readFileSync(userSkillPath, 'utf8')
    assert.match(text, /disable-model-invocation: true/)
    // The rest of the file must survive verbatim.
    assert.match(text, /Body for user-skill\./)
  })

  await check('a second toggle round-trips back to enabled', async () => {
    const result = await callRoute(routes, host.ROUTES.setEnabled, {
      method: 'POST',
      body: { name: 'user-skill', path: userSkillPath, enabled: true },
    })
    assert.equal(result.status, 200)
    assert.equal(result.body.modelInvocable, true)
    assert.match(readFileSync(userSkillPath, 'utf8'), /disable-model-invocation: false/)
  })

  await check('a client-supplied path that is not the scanned file is refused with 409', async () => {
    const result = await callRoute(routes, host.ROUTES.setEnabled, {
      method: 'POST',
      body: { name: 'user-skill', path: join(sandbox, 'evil', 'SKILL.md'), enabled: false },
    })
    assert.equal(result.status, 409)
    // The real file must be untouched by the refused call.
    assert.doesNotMatch(readFileSync(userSkillPath, 'utf8'), /disable-model-invocation: true/)
  })

  await check('read returns the body without frontmatter', async () => {
    const result = await callRoute(routes, host.ROUTES.read, {
      url: `${host.ROUTES.read}?name=user-skill&path=${encodeURIComponent(userSkillPath)}`,
    })
    assert.equal(result.status, 200)
    assert.equal(result.body.description, 'A user skill')
    assert.match(result.body.content, /Body for user-skill\./)
    assert.doesNotMatch(result.body.content, /^---/)
  })

  await check('read refuses an unlisted path with 409', async () => {
    const result = await callRoute(routes, host.ROUTES.read, {
      url: `${host.ROUTES.read}?name=user-skill&path=${encodeURIComponent('C:/Windows/System32/drivers/etc/hosts')}`,
    })
    assert.equal(result.status, 409)
  })

  await check('create writes a new skill under the user root', async () => {
    const result = await callRoute(routes, host.ROUTES.create, {
      method: 'POST',
      body: { root: 'user', name: 'created-skill', description: 'Created by the test', content: '# Created\n\nHello.', cwd: project },
    })
    assert.equal(result.status, 200)
    const target = join(dshHome, 'skills', 'created-skill', 'SKILL.md')
    assert.ok(existsSync(target), 'SKILL.md should exist')
    const text = readFileSync(target, 'utf8')
    assert.match(text, /name: created-skill/)
    assert.match(text, /description: 'Created by the test'/)
    assert.match(text, /Hello\./)
  })

  await check('create into the project root lands under the project .dsh/skills', async () => {
    const result = await callRoute(routes, host.ROUTES.create, {
      method: 'POST',
      body: { root: 'project', name: 'project-created', description: 'Project scoped', content: 'Body', cwd: project },
    })
    assert.equal(result.status, 200)
    assert.ok(existsSync(join(project, '.dsh', 'skills', 'project-created', 'SKILL.md')))
  })

  await check('creating a duplicate name is refused with 409', async () => {
    const result = await callRoute(routes, host.ROUTES.create, {
      method: 'POST',
      body: { root: 'user', name: 'user-skill', description: 'dup', content: 'x', cwd: project },
    })
    assert.equal(result.status, 409)
  })

  await check('create rejects an invalid skill name with 400', async () => {
    const result = await callRoute(routes, host.ROUTES.create, {
      method: 'POST',
      body: { root: 'user', name: 'Not Valid', description: 'x', content: 'y', cwd: project },
    })
    assert.equal(result.status, 400)
  })

  await check('update rewrites description and body in place without re-enabling', async () => {
    // Disable it first, then prove the update carries the flag over.
    await callRoute(routes, host.ROUTES.setEnabled, {
      method: 'POST',
      body: { name: 'created-skill', path: join(dshHome, 'skills', 'created-skill', 'SKILL.md'), enabled: false },
    })
    const target = join(dshHome, 'skills', 'created-skill', 'SKILL.md')
    const result = await callRoute(routes, host.ROUTES.update, {
      method: 'POST',
      body: { name: 'created-skill', path: target, description: 'Updated description', content: '# Updated\n\nNew body.' },
    })
    assert.equal(result.status, 200)
    assert.equal(result.body.disabled, true)
    const text = readFileSync(target, 'utf8')
    assert.match(text, /Updated description/)
    assert.match(text, /New body\./)
    assert.match(text, /disable-model-invocation: true/)
  })

  await check('delete moves the file into .trash and leaves the original gone', async () => {
    const target = join(dshHome, 'skills', 'created-skill', 'SKILL.md')
    const result = await callRoute(routes, host.ROUTES.delete, {
      method: 'POST',
      body: { name: 'created-skill', path: target },
    })
    assert.equal(result.status, 200)
    assert.equal(existsSync(target), false, 'original should be moved away')
    assert.ok(existsSync(result.body.moved), 'trashed copy should exist')
    assert.match(result.body.moved, /\.trash/)
  })

  await check('delete of a stale path is refused with 409', async () => {
    const result = await callRoute(routes, host.ROUTES.delete, {
      method: 'POST',
      body: { name: 'user-skill', path: join(sandbox, 'nope', 'SKILL.md') },
    })
    assert.equal(result.status, 409)
    assert.ok(existsSync(userSkillPath), 'user-skill must survive')
  })

  // -------------------------------------------------------------------------
  console.log('\nprovider switches and symlink safety')

  await check('set-provider-enabled records then clears a panel-local switch', async () => {
    const off = await callRoute(routes, host.ROUTES.setProviderEnabled, {
      method: 'POST',
      body: { name: 'ghost-skill', provider: 'plugin-x', enabled: false },
    })
    // No such provider-file row is listed, so disabling must be refused.
    assert.equal(off.status, 404)

    const on = await callRoute(routes, host.ROUTES.setProviderEnabled, {
      method: 'POST',
      body: { name: 'ghost-skill', provider: 'plugin-x', enabled: true },
    })
    // Enabling only ever drops a record, so it stays allowed.
    assert.equal(on.status, 200)
  })

  await check('a symlinked skill is listable but refuses delete and update', async () => {
    const external = join(sandbox, 'external-skill')
    mkdirSync(external, { recursive: true })
    writeFileSync(join(external, 'SKILL.md'), skillFile('linked-skill', 'Lives outside the root'))
    const linkPath = join(dshHome, 'skills', 'linked-skill')
    try {
      symlinkSync(external, linkPath, 'junction')
    } catch {
      console.log('        (skipped: symlink creation not permitted on this machine)')
      return
    }
    const fresh = await callRoute(routes, host.ROUTES.list)
    const linked = fresh.body.groups.flatMap(g => g.skills).find(s => s.name === 'linked-skill')
    assert.ok(linked, 'linked skill should be listed')
    assert.equal(linked.linked, true)

    const del = await callRoute(routes, host.ROUTES.delete, {
      method: 'POST',
      body: { name: 'linked-skill', path: linked.path },
    })
    assert.equal(del.status, 400)
    assert.ok(existsSync(join(external, 'SKILL.md')), 'the link target must survive')
  })

  await check('registry entries merge in and registry-only rows stay pathless', async () => {
    const withRegistry = host.makeRoutes(makeCtx(), {
      dshHome,
      customSkillDirs: [],
      registry: {
        snapshot: async () => ({
          skills: [
            { name: 'bundled-skill', description: 'From the registry', source: 'bundled' },
            { name: 'provider-skill', description: 'Has a provider file', source: 'runtime', provider: 'plugin-y', path: join(sandbox, 'elsewhere', 'SKILL.md') },
          ],
          complete: true,
        }),
      },
      loadSkill: undefined,
      activeSessionCwds: () => [project],
      logger: { warn() {} },
    })
    const result = await callRoute(withRegistry, host.ROUTES.list)
    const merged = result.body.groups.flatMap(g => g.skills)
    const bundled = merged.find(s => s.name === 'bundled-skill')
    const provider = merged.find(s => s.name === 'provider-skill')
    assert.equal(bundled.fileState, 'virtual')
    assert.equal(bundled.path, undefined)
    assert.equal(provider.fileState, 'provider-file')
    assert.equal(provider.path, undefined, 'a provider path must never be exposed as writable')
  })

  // -------------------------------------------------------------------------
  console.log('\npreview: file-backed and registry-backed skills both render')

  await check('preview of a file-backed skill returns the BODY, not the raw file', async () => {
    const result = await callRoute(routes, host.ROUTES.preview, {
      url: `${host.ROUTES.preview}?name=user-skill`,
    })
    assert.equal(result.status, 200)
    assert.equal(result.body.source, 'file')
    assert.equal(result.body.name, 'user-skill')
    assert.equal(result.body.level, 'user-dsh')
    assert.match(result.body.markdown, /Body for user-skill\./)
    // The frontmatter must NOT reach the markdown renderer: a leading `---` is a
    // thematic break in GFM, so it would turn the YAML into a setext heading and
    // print the fields as stray prose. The fields travel as their own JSON.
    assert.doesNotMatch(result.body.markdown, /^---/, 'the frontmatter fence leaked into the markdown')
    assert.doesNotMatch(result.body.markdown, /^name:/m, 'frontmatter fields leaked into the markdown')
    assert.equal(result.body.description, 'A user skill')
    // The path is exposed here because the preview reads it directly.
    assert.ok(existsSync(result.body.path), 'the reported path should exist')
  })

  await check('preview of a bundled skill works through the registry, with no file', async () => {
    // This is the whole point of the route: a bundled or runtime-registered
    // skill has no SKILL.md this panel may open, so only the registry can
    // answer — and those are exactly the skills a user needs to read.
    const asked = []
    const withRegistry = host.makeRoutes(makeCtx(), {
      dshHome,
      customSkillDirs: [],
      registry: emptyRegistry,
      loadSkill: async (name, options) => {
        asked.push({ name, cwd: options.cwd })
        if (name !== 'bundled-skill') return undefined
        return {
          name: 'bundled-skill',
          description: 'From the registry',
          content: '# Bundled\n\nInstructions live in the plugin, not on disk.',
        }
      },
      activeSessionCwds: () => [project],
      logger: { warn() {} },
    })
    const result = await callRoute(withRegistry, host.ROUTES.preview, {
      url: `${host.ROUTES.preview}?name=bundled-skill`,
    })
    assert.equal(result.status, 200)
    assert.equal(result.body.source, 'registry')
    assert.match(result.body.markdown, /Instructions live in the plugin/)
    assert.equal(result.body.description, 'From the registry')
    assert.equal(result.body.path, undefined, 'a registry skill reports no file path')
    // The registry is asked with the workspace the panel is showing.
    assert.deepEqual(asked, [{ name: 'bundled-skill', cwd: project }])
  })

  await check('preview prefers the file when the skill has one', async () => {
    // A file-backed skill must not be answered from the registry: the file is
    // what the user can act on, and the write routes trust it.
    let called = false
    const withRegistry = host.makeRoutes(makeCtx(), {
      dshHome,
      customSkillDirs: [customRoot],
      registry: emptyRegistry,
      loadSkill: async () => { called = true; return undefined },
      activeSessionCwds: () => [project],
      logger: { warn() {} },
    })
    const result = await callRoute(withRegistry, host.ROUTES.preview, {
      url: `${host.ROUTES.preview}?name=user-skill`,
    })
    assert.equal(result.status, 200)
    assert.equal(result.body.source, 'file')
    assert.equal(called, false, 'the registry must not be consulted for a file-backed skill')
  })

  await check('preview of an unknown skill answers 404', async () => {
    const result = await callRoute(routes, host.ROUTES.preview, {
      url: `${host.ROUTES.preview}?name=no-such-skill`,
    })
    assert.equal(result.status, 404)
  })

  await check('preview rejects a non-kebab-case name with 400', async () => {
    const result = await callRoute(routes, host.ROUTES.preview, {
      url: `${host.ROUTES.preview}?name=Not%20Valid`,
    })
    assert.equal(result.status, 400)
  })

  await check('preview refuses a non-loopback caller', async () => {
    const route = routes.find(candidate => candidate.path === host.ROUTES.preview)
    const remoteReq = {
      method: 'GET',
      url: `${host.ROUTES.preview}?name=user-skill`,
      headers: { host: '10.0.0.5:19387' },
      socket: { remoteAddress: '10.0.0.5' },
      async *[Symbol.asyncIterator]() {},
    }
    let status = 0
    const res = { writeHead(code) { status = code; return this }, end() {} }
    await route.handler(remoteReq, res)
    assert.equal(status, 403)
  })

  await check('preview survives a registry that throws', async () => {
    // A registry outage must degrade to a clear 404, not a 500 that hides the
    // reason, and it must not take the panel down.
    const withRegistry = host.makeRoutes(makeCtx(), {
      dshHome,
      customSkillDirs: [],
      registry: emptyRegistry,
      loadSkill: async () => { throw new Error('registry offline') },
      activeSessionCwds: () => [project],
      logger: { warn() {} },
    })
    const result = await callRoute(withRegistry, host.ROUTES.preview, {
      url: `${host.ROUTES.preview}?name=anything`,
    })
    assert.equal(result.status, 500)
  })

  await check('health reports the M1 capability and the resolved roots', async () => {
    const result = await callRoute(routes, host.ROUTES.health)
    assert.equal(result.status, 200)
    assert.equal(result.body.capabilities.localManagement, true)
    assert.equal(result.body.capabilities.market, false)
    assert.equal(result.body.dshHome, dshHome)
    assert.deepEqual(result.body.customSkillDirs, [customRoot])
  })

  await check('every method mismatch answers 405', async () => {
    const result = await callRoute(routes, host.ROUTES.list, { method: 'POST' })
    assert.equal(result.status, 405)
  })
} finally {
  rmSync(sandbox, { recursive: true, force: true })
}

console.log(`\n${passed} checks passed${failures.length > 0 ? `, ${failures.length} failed` : ''}`)
