/**
 * Native panel registration for the skills hub.
 *
 * The panel is an official-style center-column page, not a DOM takeover: it
 * contributes a row into the sidebar shell's own global panel list
 * (`sidebar.panellist`) and its page into the layout's keyed `main` slot. The
 * shell then owns the row box, the label, the active highlight, the collapsed
 * rail and the panel switch, exactly as it does for the shipped Plugins and
 * Schedule pages.
 *
 * Both registrations go through `ctx.slots.inject`, which fires only once the
 * owning shell entry has declared the seat: load order between this plugin and
 * ui-layout / ui-sidebar therefore does not matter, and a shell that cannot
 * serve the seats simply never runs the callback.
 *
 * @module @wulongxi/dsh-skills-hub/client/native-panel
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { SkillsHubApi } from './api.ts'
import { SKILLS_HUB_PANEL_ID, type PanelController } from './panel/controller.ts'
import { SkillsHubPanel } from './panel/SkillsHubPanel.tsx'
import { tt } from './panel-helpers.ts'
import css from './panel/panel.module.css'

/** The panel id shared by the sidebar row and the main-slot occupant. */
export { SKILLS_HUB_PANEL_ID }

/**
 * Row order among the shell's global panel rows. Shipped entries occupy
 * Plugins 0 and Schedule 10; the sibling skill-explorer uses 30, so this panel
 * lands after it rather than displacing it.
 */
const PANEL_ORDER = 40

/**
 * The sidebar row glyph the shell asks for at its own size and active state.
 * The shell owns the button, label, tooltip and rail geometry; this component
 * draws only the glyph, like every other panel row.
 *
 * The glyph carries `data-dsh-panel-entry` because it is the only DOM this
 * panel's own code owns inside that shell-owned row: the skin L2 contract
 * resolves which row belongs to which plugin through it.
 *
 * @param props - the shell's icon share: square edge and selection state.
 * @returns the decorative skills-hub glyph.
 */
export function SkillsHubPanelIcon({ size }: { size: number; active: boolean }): React.ReactElement {
  return (
    <svg
      data-dsh-panel-entry={SKILLS_HUB_PANEL_ID}
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {/* A storefront: awning, counter, and a small box on the counter. */}
      <path d="M2 6.5V13h12V6.5" />
      <path d="M1.5 6.5 3 3h10l1.5 3.5z" />
      <path d="M6 13v-3.2h4V13" />
    </svg>
  )
}

/**
 * The main-slot page. The layout mounts it only while this panel is selected,
 * so the conversation keeps the center column untouched the rest of the time.
 * The wrapper carries the pinned `data-dsh-skills-hub-view` semantic anchor.
 *
 * @param props - the framework main-slot share plus this entry's injected face.
 * @returns the skills-hub page.
 */
export function SkillsHubPanelPage({ controller, api }: { controller: PanelController; api: SkillsHubApi }): React.ReactElement {
  return (
    <div className={css.view} data-dsh-skills-hub-view="" data-dsh-plugin="skills-hub">
      <SkillsHubPanel controller={controller} api={api} />
    </div>
  )
}

/** The injected face both registrations receive. */
interface PanelFace {
  controller: PanelController
  api: SkillsHubApi
}

/**
 * Register the skills hub's sidebar row and center-column page.
 *
 * Both seats are declared by shell plugins this package does not depend on at
 * runtime, so each registration is wrapped in `ctx.slots.inject`: the callback
 * runs only after the owning entry declares the seat, and a shell that never
 * declares it leaves the panel absent instead of failing boot.
 *
 * @param ctx - client root context (services: slots).
 * @param controller - the controller the page and the row drive.
 * @param api - the API client the page operates through.
 * @returns disposer releasing both registrations.
 */
export function registerSkillsHubPanel(ctx: ClientContext, controller: PanelController, api: SkillsHubApi): () => void {
  const slots = ctx.slots as {
    inject(key: string, callback: () => () => void): () => void
    register(options: Record<string, unknown>, component: unknown): () => void
  }
  const disposers: Array<() => void> = []

  disposers.push(slots.inject('sidebar.panellist', () => slots.register({
    name: 'sidebar.panellist',
    id: SKILLS_HUB_PANEL_ID,
    order: PANEL_ORDER,
    // The shell resolves this through its label projection on every locale
    // change, so the module-level translate reads the active language at call
    // time.
    label: () => tt('entry.label'),
  }, SkillsHubPanelIcon)))

  disposers.push(slots.inject('main', () => slots.register({
    name: 'main',
    key: SKILLS_HUB_PANEL_ID,
    inject: (): PanelFace => ({ controller, api }),
  }, SkillsHubPanelPage as never)))

  return () => {
    for (const dispose of disposers.splice(0)) dispose()
  }
}
