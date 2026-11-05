// App frame (SPEC v3.0 §10, H3 mockups): the screen, then each part's bottom tab bar (labels under
// icons, Scan raised; five tabs in Household, six in Holiday) in the part's color.
import type { ComponentChildren } from 'preact';
import type { Part } from '../../domain/types';
import { Icon, type IconName } from '../icons';
import { usePart } from '../part';
import { href, PART_TABS, type Tab } from './router';
import { ToastHost } from './toast';
import { SyncBanner } from './SyncBanner';
import { UpdateBanner } from './UpdateBanner';

const TAB_INFO: Readonly<Record<Tab, [string, IconName]>> = {
  season: ['Season', 'calendar'],
  find: ['Find', 'search'],
  browse: ['Browse', 'browse'],
  scan: ['Scan', 'scan'],
  lists: ['Lists', 'lists'],
  more: ['More', 'moreDots'],
};

export function Shell({ tab, children }: { tab: Tab; children: ComponentChildren }) {
  const part = usePart();
  return (
    <div class="app" data-part={part}>
      <main class="main">
        <UpdateBanner />
        <SyncBanner />
        {children}
      </main>
      <nav class="tabs" aria-label={part === 'holiday' ? 'Holiday tabs' : 'Household tabs'}>
        {PART_TABS[part].map((t) => {
          const [label, icon] = TAB_INFO[t];
          return (
            <a key={t} href={href.tab(part, t)} class={t === 'scan' ? 'tab scan-tab' : 'tab'} aria-current={t === tab ? 'page' : undefined}>
              {t === 'scan' ? (
                <span class="scan-btn">
                  <Icon name={icon} class="ic lg" />
                </span>
              ) : (
                <Icon name={icon} />
              )}
              <span>{label}</span>
            </a>
          );
        })}
      </nav>
      <ToastHost />
    </div>
  );
}
