/**
 * The skills-hub panel shell.
 *
 * Structure mirrors the shipped Plugin-manager page: one centred 960px column
 * that owns the scroll, a 20px page title with a 13px intro line, the page's
 * primary action at the right of that head row, then the tab row and content.
 * Every control is an official `@deepseek-ai/dsh-client-ui-primitives`
 * component, so geometry, focus rings and theme response are the shell's.
 *
 * The active tab and the editor target live in the controller, not in component
 * state: the layout mounts this page only while the panel is selected, so local
 * state would drop the open tab and any in-progress edit on every panel switch.
 *
 * @module @wulongxi/dsh-skills-hub/client/panel/SkillsHubPanel
 */

import { Button, IconPlusOutlineRegular, SegmentedControl } from '@deepseek-ai/dsh-client-ui-primitives'
import { useSyncExternalStore } from 'react'
import type { SkillsHubApi } from '../api.ts'
import { tt } from '../panel-helpers.ts'
import type { HubTab, PanelController } from './controller.ts'
import { CreateTab } from './CreateTab.tsx'
import { EditTab } from './EditTab.tsx'
import { MarketTab } from './MarketTab.tsx'
import { SkillsTab } from './SkillsTab.tsx'
import css from './panel.module.css'

/** Panel shell props. */
export interface SkillsHubPanelProps {
  /** The panel state owner (open/close/toggle, active tab, editor target). */
  controller: PanelController
  /** The API client every tab operates through. */
  api: SkillsHubApi
}

/** The panel's tab id prefix, required by the segmented control's a11y wiring. */
const TABS_ID = 'skills-hub-tabs'

/** The skills-hub panel. */
export function SkillsHubPanel({ controller, api }: SkillsHubPanelProps) {
  const { activeTab, editing } = useSyncExternalStore(
    listener => controller.subscribe(listener),
    () => controller.getSnapshot(),
  )

  // The edit tab appears only while a skill is being edited; the control needs
  // at least two segments, which the three base tabs always provide.
  const options = [
    { value: 'market' as HubTab, label: tt('tab.market') },
    { value: 'skills' as HubTab, label: tt('tab.skills') },
    { value: 'create' as HubTab, label: tt('tab.create') },
    ...(editing === undefined ? [] : [{ value: 'edit' as HubTab, label: tt('tab.edit') }]),
  ]

  return (
    <section className={css.page} data-dsh-plugin="skills-hub" data-dsh-part="page">
      {/* No back control: the sidebar row toggles this panel, and opening any
          session (or new chat) returns the center column to the conversation,
          exactly like the shell's own Plugins and Schedule pages. */}
      <header className={css.pageHead}>
        <div>
          <h1 className={css.pageTitle}>{tt('panel.title')}</h1>
          <p className={css.pageIntro}>{tt('panel.subtitle')}</p>
        </div>
        <div className={css.toolbar}>
          {activeTab === 'skills' && (
            <Button
              size="sm"
              variant="outline"
              icon={<IconPlusOutlineRegular size={16} />}
              onClick={() => { controller.setActiveTab('create') }}
            >
              {tt('action.new')}
            </Button>
          )}
        </div>
      </header>

      <div className={css.tabRow}>
        <SegmentedControl
          id={TABS_ID}
          value={activeTab}
          options={options}
          onChange={next => { controller.setActiveTab(next) }}
          label={tt('panel.tabsLabel')}
        />
      </div>

      {/* The segmented control points each tab's aria-controls at
          `<id>-<value>-panel`, so the active panel carries exactly that id and
          is labelled back by its tab. The inactive tabs unmount, which is also
          what lets the list refetch when it returns. */}
      <div
        id={`${TABS_ID}-${activeTab}-panel`}
        role="tabpanel"
        aria-labelledby={`${TABS_ID}-${activeTab}`}
        className={css.content}
        data-dsh-part="content"
      >
        {activeTab === 'market' && <MarketTab api={api} />}
        {activeTab === 'skills' && <SkillsTab api={api} onEdit={skill => { controller.openEditor(skill) }} />}
        {activeTab === 'create' && <CreateTab api={api} />}
        {activeTab === 'edit' && editing !== undefined && (
          <EditTab
            api={api}
            skill={editing}
            onDone={() => { controller.closeEditor() }}
            onCancel={() => { controller.closeEditor() }}
          />
        )}
      </div>
    </section>
  )
}
