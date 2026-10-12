/**
 * Skills-hub panel controller: the single owner of the panel's view state.
 *
 * Framework-free so the sidebar row and the React panel share one tiny
 * subscription surface. The center column belongs to the layout service: this
 * controller asks it to select the panel id instead of taking the column over at
 * the DOM level.
 *
 * The tab and the editor target live here rather than in the panel component
 * because the layout mounts a keyed page only while its panel is selected:
 * component-local state would drop the open tab and any in-progress edit on
 * every panel switch.
 *
 * @module @wulongxi/dsh-skills-hub/client/panel/controller
 */

import type { SkillEntry } from '../api.ts'

/** Stable id shared by the sidebar panel row and the main-slot page. */
export const SKILLS_HUB_PANEL_ID = 'skills-hub'

/** The panel's tab identifiers. */
export type HubTab = 'market' | 'skills' | 'create' | 'edit'

/** Immutable controller snapshot for UI subscriptions. */
export interface PanelControllerSnapshot {
  /** Whether the center column shows this panel. */
  panelOpen: boolean
  /** The tab the panel is showing. */
  activeTab: HubTab
  /** The skill being edited; the edit tab exists only while it is set. */
  editing: SkillEntry | undefined
}

/**
 * The layout's panel-navigation face. Selecting the panel is the layout's
 * business, and this is the one call that asks for it (null returns the column
 * to the conversation). Optional, so a shell-less composition keeps the pure
 * state transitions testable.
 */
export interface PanelNavigationFace {
  /** Select this panel, or null to hand the column back to the conversation. */
  select(panelId: string | null): void
}

/** Controller dependencies. */
export interface PanelControllerDeps {
  /** Layout panel selection; absent keeps the controller state-only. */
  panel?: PanelNavigationFace
}

/** The panel state owner the sidebar row and the view both read. */
export class PanelController {
  private panelOpen = false
  private activeTab: HubTab = 'market'
  private editing: SkillEntry | undefined
  private listeners = new Set<() => void>()
  /** Cached so getSnapshot stays referentially stable between changes. */
  private snapshot: PanelControllerSnapshot = { panelOpen: false, activeTab: 'market', editing: undefined }

  constructor(private readonly deps: PanelControllerDeps = {}) {}

  getSnapshot(): PanelControllerSnapshot {
    return this.snapshot
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  /** Show the panel and ask the layout for the center column. */
  open(): void {
    if (this.panelOpen) return
    this.panelOpen = true
    this.commit()
    this.selectPanel(SKILLS_HUB_PANEL_ID)
  }

  /** Return the column to the conversation, asking the layout explicitly. */
  close(): void {
    if (!this.panelOpen) return
    this.panelOpen = false
    this.commit()
    this.selectPanel(null)
  }

  toggle(): void {
    if (this.panelOpen) this.close()
    else this.open()
  }

  /**
   * Reflect a selection made outside this controller (the user clicked another
   * sidebar row, or the layout dropped the panel id), keeping `panelOpen`
   * aligned with what the column actually shows.
   * @param panelId - the layout's current panel id, or null for the conversation.
   */
  syncPanelSelection(panelId: string | null): void {
    const open = panelId === SKILLS_HUB_PANEL_ID
    if (open === this.panelOpen) return
    this.panelOpen = open
    this.commit()
  }

  /** Switch tabs without touching the editor target. */
  setActiveTab(tab: HubTab): void {
    if (this.activeTab === tab) return
    this.activeTab = tab
    this.commit()
  }

  /** Open the editor for one row; the edit tab appears while it is set. */
  openEditor(skill: SkillEntry): void {
    this.editing = skill
    this.activeTab = 'edit'
    this.commit()
  }

  /** Leave the editor; the list remounts and refetches the saved copy. */
  closeEditor(): void {
    this.editing = undefined
    this.activeTab = 'skills'
    this.commit()
  }

  private commit(): void {
    this.snapshot = { panelOpen: this.panelOpen, activeTab: this.activeTab, editing: this.editing }
    for (const fn of [...this.listeners]) fn()
  }

  /** Ask the layout to select a panel; a shell without the face is a no-op. */
  private selectPanel(panelId: string | null): void {
    try {
      this.deps.panel?.select(panelId)
    } catch {
      // The layout service throws by contract before its root entry mounts; the
      // state flip above already stands and the next selection retries.
    }
  }
}
