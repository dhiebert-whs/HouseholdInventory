import { describe, expect, it } from 'vitest';
import { PART_TABS, homeTab, href, parseHash } from '../src/ui/shell/router';

describe('hash routes (SPEC v3.0 F21, §10)', () => {
  it.each([
    // No part: the part in use, at its home (App resolves 'find' with no part to the home tab).
    ['', { tab: 'find', screen: 'tab', part: null, q: '' }],
    ['#/', { tab: 'find', screen: 'tab', part: null, q: '' }],
    ['#/inventory', { tab: 'find', screen: 'tab', part: null, q: '' }],
    ['#/nonsense', { tab: 'find', screen: 'tab', part: null, q: '' }],
    ['#/scan', { tab: 'scan', screen: 'tab', part: null, q: '' }],
    ['#/more', { tab: 'more', screen: 'tab', part: null, q: '' }],
    // Tab screens carry their part.
    ['#/holiday/season', { tab: 'season', screen: 'tab', part: 'holiday', q: '' }],
    ['#/holiday/find?q=lights', { tab: 'find', screen: 'tab', part: 'holiday', q: 'lights' }],
    ['#/holiday/browse', { tab: 'browse', screen: 'tab', part: 'holiday', q: '' }],
    ['#/household/find', { tab: 'find', screen: 'tab', part: 'household', q: '' }],
    ['#/household/browse', { tab: 'browse', screen: 'tab', part: 'household', q: '' }],
    ['#/household/scan', { tab: 'scan', screen: 'tab', part: 'household', q: '' }],
    ['#/household/lists', { tab: 'lists', screen: 'tab', part: 'household', q: '' }],
    ['#/household/more', { tab: 'more', screen: 'tab', part: 'household', q: '' }],
    // A tab the part doesn't have opens the part's home.
    ['#/household/season', { tab: 'find', screen: 'tab', part: 'household', q: '' }],
    ['#/holiday', { tab: 'season', screen: 'tab', part: 'holiday', q: '' }],
    ['#/holiday/nonsense', { tab: 'season', screen: 'tab', part: 'holiday', q: '' }],
    // Records and lists.
    ['#/item/st-0001', { tab: 'find', screen: 'item', id: 'st-0001' }],
    ['#/add', { tab: 'find', screen: 'add', name: '', barcode: '', home: '' }],
    ['#/add?home=bn-A1B2C3D4', { tab: 'find', screen: 'add', name: '', barcode: '', home: 'bn-A1B2C3D4' }],
    ['#/bin/bn-A1B2C3D4', { tab: 'find', screen: 'bin', id: 'bn-A1B2C3D4' }],
    ['#/bin/bn-A1B2C3D4/edit', { tab: 'find', screen: 'bin-edit', id: 'bn-A1B2C3D4' }],
    ['#/new-bin?spot=sp-1', { tab: 'find', screen: 'bin-add', spot: 'sp-1', area: '' }],
    ['#/new-bin', { tab: 'find', screen: 'bin-add', spot: '', area: '' }],
    ['#/spot/sp-1', { tab: 'find', screen: 'spot', id: 'sp-1' }],
    ['#/labels', { tab: 'more', screen: 'labels', ids: [] }],
    ['#/labels?ids=st-0063', { tab: 'more', screen: 'labels', ids: ['st-0063'] }],
    ['#/labels?ids=', { tab: 'more', screen: 'labels', ids: [] }],
    ['#/item/st-0063/edit', { tab: 'find', screen: 'edit', id: 'st-0063' }],
    ['#/more/backup', { tab: 'more', screen: 'backup' }],
    ['#/more/settings', { tab: 'more', screen: 'settings' }],
    ['#/more/activity', { tab: 'more', screen: 'activity' }],
    ['#/more/categories', { tab: 'more', screen: 'categories' }],
    ['#/more/places', { tab: 'more', screen: 'places' }],
    ['#/more/seasons', { tab: 'more', screen: 'seasons' }],
    ['#/more/tags', { tab: 'more', screen: 'tags' }],
    ['#/more/nonsense', { tab: 'more', screen: 'tab', part: null, q: '' }],
  ])('%s', (hash, route) => {
    expect(parseHash(hash)).toEqual(route);
  });

  it('Household five tabs, Holiday six with its own Browse (Dan, 2026-11-04); homes are Find and Season', () => {
    expect(PART_TABS.household).toEqual(['find', 'browse', 'scan', 'lists', 'more']);
    expect(PART_TABS.holiday).toEqual(['season', 'find', 'browse', 'scan', 'lists', 'more']);
    expect(PART_TABS.household.indexOf('scan')).toBe(2);
    expect(PART_TABS.holiday.indexOf('scan')).toBe(3);
    expect(homeTab('household')).toBe('find');
    expect(homeTab('holiday')).toBe('season');
  });

  it('round-trips ids, names and searches with special characters', () => {
    expect(parseHash(href.item('tm-7K/3 x'))).toEqual({ tab: 'find', screen: 'item', id: 'tm-7K/3 x' });
    expect(parseHash(href.add('wreath & “more”?'))).toEqual({ tab: 'find', screen: 'add', name: 'wreath & “more”?', barcode: '', home: '' });
    expect(parseHash(href.add('', '012345678905'))).toEqual({ tab: 'find', screen: 'add', name: '', barcode: '012345678905', home: '' });
    expect(href.add()).toBe('#/add');
    expect(parseHash(href.labels(['st-0063', 'tm-7K3QX']))).toEqual({ tab: 'more', screen: 'labels', ids: ['st-0063', 'tm-7K3QX'] });
    expect(href.labels()).toBe('#/labels');
    expect(parseHash(href.edit('tm-7K/3 x'))).toEqual({ tab: 'find', screen: 'edit', id: 'tm-7K/3 x' });
    expect(parseHash(href.list('places'))).toEqual({ tab: 'more', screen: 'places' });
    expect(parseHash(href.binAdd({ area: 'ar-1' }))).toEqual({ tab: 'find', screen: 'bin-add', spot: '', area: 'ar-1' });
    expect(parseHash(href.add('', '', 'sp-1'))).toMatchObject({ home: 'sp-1' });
    expect(parseHash(href.tab('holiday', 'find', 'Snowman & “lights”?'))).toEqual({ tab: 'find', screen: 'tab', part: 'holiday', q: 'Snowman & “lights”?' });
    expect(href.home('holiday')).toBe('#/holiday/season');
    expect(href.home('household')).toBe('#/household/find');
  });

  it('a malformed escape does not throw', () => {
    expect(parseHash('#/item/%E0%A4%A')).toEqual({ tab: 'find', screen: 'item', id: '%E0%A4%A' });
  });
});
