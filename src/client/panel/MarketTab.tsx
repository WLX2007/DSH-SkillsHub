/**
 * Market tab placeholder until M2-M4.
 *
 * The market search, preview and install engine land in M2-M4. Until then this
 * tab reports the host capability flag honestly instead of rendering a search
 * box whose route does not exist yet, so a user never meets a control that can
 * only fail.
 *
 * @module @wulongxi/dsh-skills-hub/client/panel/MarketTab
 */

import { IconGlobeOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import { useEffect, useState } from 'react'
import { SkillsHubApi } from '../api.ts'
import { tt } from '../panel-helpers.ts'
import css from './panel.module.css'

/** The market tab body. */
export function MarketTab({ api }: { api: SkillsHubApi }): React.JSX.Element {
  const [marketReady, setMarketReady] = useState<boolean | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    const probe = async (): Promise<void> => {
      try {
        const health = await api.health()
        if (!cancelled) setMarketReady(health.capabilities.market)
      } catch {
        if (!cancelled) setMarketReady(false)
      }
    }
    void probe()
    return () => { cancelled = true }
  }, [api])

  return (
    <div className={css.empty} data-dsh-part="market-empty">
      <IconGlobeOutlineRegular size={28} className={css.emptyIcon} />
      <p className={css.emptyText}>
        {marketReady === true ? tt('market.searchEmpty') : tt('market.comingSoon')}
      </p>
    </div>
  )
}
