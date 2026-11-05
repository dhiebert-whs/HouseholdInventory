// Activity (SPEC v3.0 F17): who changed what, newest first, written by the server and synced
// down. More › Activity shows the current part, with a "Both parts" option and filters by
// person, area and season; item, bin and spot screens show their last 10 entries.
import { liveQuery } from 'dexie';
import { useEffect, useMemo, useState } from 'preact/hooks';
import type { InventoryDb } from '../../../data/db';
import { formatDateTime } from '../../../domain/dates';
import type { Activity, Person } from '../../../domain/sync';
import type { Part } from '../../../domain/types';
import { BackButton, TopBar } from '../../components/common';
import { useDb, usePartSnapshot } from '../../data-hooks';
import { href } from '../../shell/router';
import { syncStatus } from '../../sync-runner';

/** The newest entries shown at once. */
const SHOWN = 200;

function useActivity(db: InventoryDb, recordId: string | null): { list: Activity[]; people: Map<string, Person> } | null {
  const [v, setV] = useState<{ list: Activity[]; people: Map<string, Person> } | null>(null);
  useEffect(() => {
    const sub = liveQuery(async () => {
      const list = recordId ? await db.activity.where('recordId').equals(recordId).toArray() : await db.activity.toArray();
      return { list: list.sort((a, b) => b.at - a.at), people: new Map((await db.people.toArray()).map((p) => [p.id, p])) };
    }).subscribe({ next: setV, error: () => setV(null) });
    return () => sub.unsubscribe();
  }, [db, recordId]);
  return v;
}

/** "Ann moved Snowman lights to ATTIC-04 Christmas 4". */
export function activityText(a: Activity, people: ReadonlyMap<string, Person>): string {
  return `${people.get(a.personId)?.name ?? 'Someone'} ${a.summary}`;
}

function Entry({ a, people }: { a: Activity; people: ReadonlyMap<string, Person> }) {
  const over = a.overwrote ? `Replaced ${people.get(a.overwrote.personId)?.name ?? 'someone'}’s change from ${formatDateTime(new Date(a.overwrote.at))}` : null;
  return (
    <li class="lrow">
      <span class="t">
        <strong>{activityText(a, people)}</strong>
        <span>
          {formatDateTime(new Date(a.at))}
          {over && ` · ${over}`}
        </span>
      </span>
    </li>
  );
}

const noServer = () => syncStatus().kind === 'no-server';

export function ActivityScreen({ part }: { part: Part }) {
  const db = useDb();
  const v = useActivity(db, null);
  const { all } = usePartSnapshot(part);
  const [both, setBoth] = useState(false);
  const [person, setPerson] = useState('');
  const [area, setArea] = useState('');
  const [season, setSeason] = useState('');
  const shown = useMemo(
    () =>
      (v?.list ?? []).filter(
        (a) => (both || a.part === part || a.part === '') && (!person || a.personId === person) && (!area || a.areaId === area) && (!season || a.seasonId === season),
      ),
    [v, both, part, person, area, season],
  );
  const areas = (all?.areas ?? []).filter((a) => both || a.part === part);
  const select = (label: string, value: string, set: (s: string) => void, options: { id: string; name: string }[]) => (
    <label class="setrow">
      <span class="lbl">{label}</span>
      <select class="field" value={value} onChange={(e) => set((e.currentTarget as HTMLSelectElement).value)}>
        <option value="">Everyone / everywhere</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <>
      <TopBar title="Activity" subtitle={both ? 'Both parts' : part === 'holiday' ? 'Holiday' : 'Household'} back={<BackButton label="More" fallback={href.tab(part, 'more')} />} />
      <div class="fbody">
        <div class="setform card">
          <label class="small">
            <input type="checkbox" checked={both} onChange={(e) => setBoth((e.currentTarget as HTMLInputElement).checked)} /> Both parts
          </label>
          {select('Person', person, setPerson, [...(v?.people.values() ?? [])].map((p) => ({ id: p.id, name: p.name })))}
          {select('Area', area, setArea, areas)}
          {(part === 'holiday' || both) && select('Season', season, setSeason, all?.seasons ?? [])}
        </div>
        {noServer() ? (
          <p class="empty">The activity log comes from the server. This copy of the app has none.</p>
        ) : shown.length === 0 ? (
          <p class="empty">{v === null ? 'Loading…' : 'Nothing yet.'}</p>
        ) : (
          <ul class="m0" style={{ padding: 0, listStyle: 'none' }}>
            {shown.slice(0, SHOWN).map((a) => (
              <Entry key={a.id} a={a} people={v!.people} />
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

/** The last 10 entries for one item, bin or spot (F17). Nothing without a server or entries. */
export function RecentActivity({ recordId }: { recordId: string }) {
  const db = useDb();
  const v = useActivity(db, recordId);
  if (!v || v.list.length === 0) return null;
  return (
    <section class="lsec" aria-label="Activity">
      <h2>Activity</h2>
      <ul class="m0" style={{ padding: 0, listStyle: 'none' }}>
        {v.list.slice(0, 10).map((a) => (
          <Entry key={a.id} a={a} people={v.people} />
        ))}
      </ul>
    </section>
  );
}
