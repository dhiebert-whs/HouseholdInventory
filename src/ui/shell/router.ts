// Hash routes, so a reload under any hosting sub-path never 404s. Tab screens carry their part
// (SPEC v3.0 F21): #/holiday/season, #/household/find?q=…; other screens use the record's part
// or the part in use.
import { useEffect, useState } from 'preact/hooks';
import type { Part } from '../../domain/types';

export type Tab = 'season' | 'find' | 'browse' | 'scan' | 'lists' | 'more';

/** Each part's tab bar (§10): Household five tabs, Holiday six with its own Browse (Dan, 2026-11-04). */
export const PART_TABS: Readonly<Record<Part, readonly Tab[]>> = {
  household: ['find', 'browse', 'scan', 'lists', 'more'],
  holiday: ['season', 'find', 'browse', 'scan', 'lists', 'more'],
};

/** A part's home tab (§10): Find in Household, Season in Holiday. */
export const homeTab = (part: Part): Tab => PART_TABS[part][0]!;

export type ManagedList = 'categories' | 'places' | 'seasons' | 'tags' | 'displays';

export type Route =
  /** `part` null: the part in use (an address without one, e.g. the app's start page). */
  | { tab: Tab; screen: 'tab'; part: Part | null; q: string }
  | { tab: 'find'; screen: 'item'; id: string }
  | { tab: 'find'; screen: 'edit'; id: string }
  /** `home`: a bin or spot id the new item starts in (Add item here), or ''. */
  | { tab: 'find'; screen: 'add'; name: string; barcode: string; home: string }
  | { tab: 'find'; screen: 'bin'; id: string }
  | { tab: 'find'; screen: 'bin-edit'; id: string }
  /** A new bin on a spot (`spot`), or in an area with no spot (`area`), or neither. */
  | { tab: 'find'; screen: 'bin-add'; spot: string; area: string }
  | { tab: 'find'; screen: 'spot'; id: string }
  /** Holiday (H4): a season, its setup list (F25), a display (F22). */
  | { tab: 'season'; screen: 'season'; id: string }
  | { tab: 'season'; screen: 'setup'; id: string }
  | { tab: 'season'; screen: 'display'; id: string }
  /** `ids`: records chosen before opening (Print label on a card); [] for the Labels screen. */
  | { tab: 'more'; screen: 'labels'; ids: string[] }
  | { tab: 'more'; screen: ManagedList }
  | { tab: 'more'; screen: 'backup' }
  | { tab: 'more'; screen: 'settings' }
  | { tab: 'more'; screen: 'activity' };

const TABS: readonly Tab[] = ['season', 'find', 'browse', 'scan', 'lists', 'more'];
const LISTS: readonly ManagedList[] = ['categories', 'places', 'seasons', 'tags', 'displays'];

export function parseHash(hash: string): Route {
  const [path = '', query = ''] = hash.replace(/^#\/?/, '').split('?');
  const parts = path.split('/').map((p) => {
    try {
      return decodeURIComponent(p);
    } catch {
      return p;
    }
  });
  const q = new URLSearchParams(query);
  if (parts[0] === 'item' && parts[1]) {
    return parts[2] === 'edit' ? { tab: 'find', screen: 'edit', id: parts[1] } : { tab: 'find', screen: 'item', id: parts[1] };
  }
  if (parts[0] === 'add') return { tab: 'find', screen: 'add', name: q.get('name') ?? '', barcode: q.get('barcode') ?? '', home: q.get('home') ?? '' };
  if (parts[0] === 'bin' && parts[1]) {
    return parts[2] === 'edit' ? { tab: 'find', screen: 'bin-edit', id: parts[1] } : { tab: 'find', screen: 'bin', id: parts[1] };
  }
  if (parts[0] === 'new-bin') return { tab: 'find', screen: 'bin-add', spot: q.get('spot') ?? '', area: q.get('area') ?? '' };
  if (parts[0] === 'spot' && parts[1]) return { tab: 'find', screen: 'spot', id: parts[1] };
  if (parts[0] === 'season' && parts[1]) return parts[2] === 'setup' ? { tab: 'season', screen: 'setup', id: parts[1] } : { tab: 'season', screen: 'season', id: parts[1] };
  if (parts[0] === 'display' && parts[1]) return { tab: 'season', screen: 'display', id: parts[1] };
  if (parts[0] === 'labels') return { tab: 'more', screen: 'labels', ids: (q.get('ids') ?? '').split(',').filter(Boolean) };
  if (parts[0] === 'more') {
    const list = LISTS.find((l) => l === parts[1]);
    if (list) return { tab: 'more', screen: list };
    if (parts[1] === 'backup') return { tab: 'more', screen: 'backup' };
    if (parts[1] === 'settings') return { tab: 'more', screen: 'settings' };
    if (parts[1] === 'activity') return { tab: 'more', screen: 'activity' };
  }
  const part = parts[0] === 'household' || parts[0] === 'holiday' ? parts[0] : null;
  const name = part ? parts[1] : parts[0];
  const tab = TABS.find((t) => t === name);
  // A tab the part doesn't have (Season in Household) opens the part's home.
  if (part && tab && PART_TABS[part].includes(tab)) return { tab, screen: 'tab', part, q: q.get('q') ?? '' };
  if (part) return { tab: homeTab(part), screen: 'tab', part, q: '' };
  // Before 0.1.3: #/inventory, #/scan, #/more…, without a part.
  if (tab === 'scan' || tab === 'more') return { tab, screen: 'tab', part: null, q: '' };
  return { tab: 'find', screen: 'tab', part: null, q: '' };
}

export const href = {
  tab: (part: Part, t: Tab, q = '') => `#/${part}/${t}${q ? `?${new URLSearchParams({ q })}` : ''}`,
  home: (part: Part) => `#/${part}/${homeTab(part)}`,
  item: (id: string) => `#/item/${encodeURIComponent(id)}`,
  edit: (id: string) => `#/item/${encodeURIComponent(id)}/edit`,
  add: (name = '', barcode = '', home = '') => {
    const q = new URLSearchParams();
    if (name) q.set('name', name);
    if (barcode) q.set('barcode', barcode);
    if (home) q.set('home', home);
    return q.size ? `#/add?${q}` : '#/add';
  },
  bin: (id: string) => `#/bin/${encodeURIComponent(id)}`,
  binEdit: (id: string) => `#/bin/${encodeURIComponent(id)}/edit`,
  binAdd: (place: { spot?: string; area?: string } = {}) => {
    const q = new URLSearchParams();
    if (place.spot) q.set('spot', place.spot);
    if (place.area) q.set('area', place.area);
    return q.size ? `#/new-bin?${q}` : '#/new-bin';
  },
  spot: (id: string) => `#/spot/${encodeURIComponent(id)}`,
  season: (id: string) => `#/season/${encodeURIComponent(id)}`,
  setup: (id: string) => `#/season/${encodeURIComponent(id)}/setup`,
  display: (id: string) => `#/display/${encodeURIComponent(id)}`,
  labels: (ids: string[] = []) => (ids.length ? `#/labels?${new URLSearchParams({ ids: ids.join(',') })}` : '#/labels'),
  list: (l: ManagedList) => `#/more/${l}`,
  backup: '#/more/backup',
  settings: '#/more/settings',
  activity: '#/more/activity',
};

// History entries are numbered and remember the screen they were opened from, so Back can
// tell whether the previous screen is in the app (then it goes back, keeping the list's
// place) or not (then it opens the parent screen).
interface Stamp {
  appIndex: number;
  from: string | null;
}
const isStamp = (s: unknown): s is Stamp => typeof (s as Stamp | null)?.appIndex === 'number';

let replacing = false;
let index = 0;
let here = '';
let hereFrom: string | null = null;

function stamp(): void {
  const s: unknown = history.state;
  if (isStamp(s)) {
    index = s.appIndex;
    hereFrom = s.from;
  } else {
    // A replaced entry keeps the place it was opened from.
    const from = replacing ? hereFrom : here;
    if (!replacing) index += 1;
    history.replaceState({ appIndex: index, from } satisfies Stamp, '');
    hereFrom = from;
  }
  here = location.hash;
  replacing = false;
}

/** The screen (hash) the current one was opened from, when it was opened inside the app. */
export function openedFrom(): string | null {
  return hereFrom;
}

/** Opens `to` in place of the current screen (after a save, so Back skips the form). */
export function replaceRoute(to: string): void {
  replacing = true;
  location.replace(to);
}

/** Back button: the previous in-app screen, or `fallback` when the app was opened here. */
export function goBack(fallback: string): void {
  const s: unknown = history.state;
  if (isStamp(s) && s.appIndex > 0) history.back();
  else replaceRoute(fallback);
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(location.hash));
  useEffect(() => {
    const s: unknown = history.state;
    here = location.hash;
    if (isStamp(s)) {
      index = s.appIndex;
      hereFrom = s.from;
    } else history.replaceState({ appIndex: 0, from: null } satisfies Stamp, '');
    const on = () => {
      stamp();
      setRoute(parseHash(location.hash));
    };
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return route;
}
