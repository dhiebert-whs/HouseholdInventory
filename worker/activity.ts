// Activity summaries (SPEC v3.0 §3, F17): one line per change, written by the server, such as
// "moved Snowman lights to ATTIC-04 Christmas 4". The person's name is shown in front of it by
// the app. Changes nobody needs to read about (a list's order, a thumbnail) get none.
import { PART_NAME, type Part } from '../src/domain/types';
import { recordName, type RecordType } from '../src/domain/sync';

type Data = Record<string, unknown>;
/** Looks up another live record on the server: a bin, a spot, a season… */
export type Lookup = (type: RecordType, id: string) => Promise<Data | null>;

export interface Described {
  summary: string;
  part: Part | '';
  areaId: string;
  seasonId: string;
}

const s = (v: unknown) => (typeof v === 'string' ? v : '');
/** Fields whose change alone isn't worth a line: order, the derived photo flag. */
const QUIET = new Set(['order', 'hasPhoto', 'labelPrintedAt', 'labelContents']);

function changedFields(before: Data, after: Data): string[] {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]));
}

async function placeLabel(look: Lookup, binId: string, spotId: string): Promise<string> {
  if (binId) {
    const b = await look('bin', binId);
    return b ? `${s(b.code)} ${s(b.name)}` : 'a bin';
  }
  if (spotId) {
    const sp = await look('spot', spotId);
    const a = sp ? await look('area', s(sp.areaId)) : null;
    return sp ? (a ? `${s(a.name)} › ${s(sp.name)}` : s(sp.name)) : 'a spot';
  }
  return 'No home yet';
}

async function areaOf(look: Lookup, binId: string, spotId: string): Promise<string> {
  let spot = spotId;
  if (binId) spot = s((await look('bin', binId))?.spotId);
  if (!spot) return '';
  return s((await look('spot', spot))?.areaId);
}

/**
 * The line for one change, or null when it isn't worth one. `before` is the server's live
 * version (null: new), `after` the new one (null: deleted).
 */
export async function describe(type: RecordType, before: Data | null, after: Data | null, look: Lookup): Promise<Described | null> {
  const rec = after ?? before;
  if (!rec) return null;
  const name = recordName(type, rec);
  const fields = before && after ? changedFields(before, after).filter((f) => !QUIET.has(f)) : [];
  if (before && after && fields.length === 0) return null;
  const part = (s(rec.part) as Part) || '';
  const base: Omit<Described, 'summary'> = { part, areaId: '', seasonId: '' };
  const verb = !before ? 'added' : !after ? 'deleted' : 'edited';

  switch (type) {
    case 'item': {
      const binId = s(rec.binId);
      const bin = binId ? await look('bin', binId) : null;
      const out = { ...base, areaId: await areaOf(look, binId, s(rec.spotId)), seasonId: s(rec.seasonId) || s(bin?.seasonId) };
      if (!before || !after) return { ...out, summary: `${verb} ${name}` };
      if (before.part !== after.part) return { ...out, summary: `moved ${name} to ${PART_NAME[after.part as Part] ?? 'the other part'}` };
      if (fields.includes('binId') || fields.includes('spotId')) return { ...out, summary: `moved ${name} to ${await placeLabel(look, s(after.binId), s(after.spotId))}` };
      if (fields.includes('status')) {
        if (after.status === 'out') {
          const display = s(after.outDisplayId) ? await look('display', s(after.outDisplayId)) : null;
          const where = display ? s(display.name) : s(after.outWhere);
          return { ...out, summary: `put out ${name}${where ? ` on ${where}` : ''}` };
        }
        if (after.status === 'lent') return { ...out, summary: `lent ${name} to ${s(after.lentTo) || 'someone'}` };
        return { ...out, summary: before.status === 'lent' ? `marked ${name} returned` : `put back ${name}` };
      }
      if (fields.includes('condition') || fields.includes('checkedAt')) return { ...out, summary: `checked ${name}: ${s(after.condition)}` };
      if (fields.length === 1 && fields[0] === 'quantity') return { ...out, summary: `changed ${name} to ${String(after.quantity)}` };
      return { ...out, summary: `edited ${name}` };
    }
    case 'bin': {
      const out = { ...base, areaId: await areaOf(look, '', s(rec.spotId)), seasonId: s(rec.seasonId) };
      if (!before || !after) return { ...out, summary: `${verb} bin ${name}` };
      if (fields.includes('part')) return { ...out, summary: `moved bin ${name} to ${PART_NAME[after.part as Part] ?? 'the other part'}` };
      if (fields.includes('spotId')) return { ...out, summary: `moved bin ${name} to ${await placeLabel(look, '', s(after.spotId))}` };
      if (fields.includes('state')) return { ...out, summary: after.state === 'out' ? `brought out bin ${name}` : `put away bin ${name}` };
      if (fields.includes('code')) return { ...out, summary: `renamed bin ${s(before.code)} to ${s(after.code)}` };
      return { ...out, summary: `edited bin ${name}` };
    }
    case 'area':
    case 'spot':
    case 'season':
    case 'display': {
      const word = { area: 'area', spot: 'spot', season: 'season', display: 'display' }[type];
      const out = { ...base, areaId: type === 'area' ? s(rec.id) : type === 'spot' ? s(rec.areaId) : '', seasonId: type === 'season' ? s(rec.id) : '' };
      if (before && after && fields.includes('name')) return { ...out, summary: `renamed ${word} ${s(before.name)} to ${s(after.name)}` };
      if (type === 'spot' && before && after && fields.includes('areaId')) return { ...out, summary: `moved spot ${name} to ${s((await look('area', s(after.areaId)))?.name) || 'another area'}` };
      return { ...out, summary: `${verb} ${word} ${name}` };
    }
    case 'photo': {
      if (before && after) return null;
      const ownerType = s(rec.ownerType) as RecordType;
      const owner = await look(ownerType, s(rec.ownerId));
      const ownerName = owner ? recordName(ownerType, owner) : `a ${ownerType}`;
      return { ...base, seasonId: s(rec.seasonId), summary: after ? `added a photo to ${ownerName}` : `removed a photo from ${ownerName}` };
    }
    case 'task': {
      const season = await look('season', s(rec.seasonId));
      const out = { ...base, part: 'holiday' as const, seasonId: s(rec.seasonId) };
      return { ...out, summary: `${verb} ${s(rec.phase)} task ${name}${season ? ` for ${s(season.name)}` : ''}` };
    }
    case 'run': {
      const season = await look('season', s(rec.seasonId));
      const sn = season ? s(season.name) : 'a season';
      const out = { ...base, part: 'holiday' as const, seasonId: s(rec.seasonId) };
      if (!after) return { ...out, summary: `deleted ${sn}’s ${String(rec.year)} run` };
      const phase = { planned: '', 'setting up': `started setup of ${sn}`, up: `finished setup of ${sn}`, 'taking down': `started takedown of ${sn}`, done: `finished takedown of ${sn}` }[s(after.phase)] ?? '';
      if ((!before || before.phase !== after.phase) && phase) return { ...out, summary: phase };
      const was = new Set(Array.isArray(before?.doneTaskIds) ? (before.doneTaskIds as string[]) : []);
      const ticked = (Array.isArray(after.doneTaskIds) ? (after.doneTaskIds as string[]) : []).filter((t) => !was.has(t));
      if (ticked.length === 1) {
        const task = await look('task', ticked[0]!);
        return { ...out, summary: `ticked ${task ? recordName('task', task) : 'a task'} for ${sn}` };
      }
      if (ticked.length > 1) return { ...out, summary: `ticked ${ticked.length} tasks for ${sn}` };
      return before ? null : { ...out, summary: `started ${sn}’s ${String(after.year)} run` };
    }
    case 'tag':
    case 'category':
      if (before && after && !fields.includes('subcategories')) return null;
      return { ...base, summary: `${verb} ${type} ${name}` };
  }
}

/** Above this many lines in one push, the log gets one line instead ("made 40 changes: 32 items, 8 bins"). */
export const BULK_LINES = 10;

export function bulkSummary(types: readonly RecordType[]): string {
  const counts = new Map<RecordType, number>();
  for (const t of types) counts.set(t, (counts.get(t) ?? 0) + 1);
  const plural: Record<RecordType, string> = { item: 'items', area: 'areas', spot: 'spots', bin: 'bins', season: 'seasons', tag: 'tags', category: 'categories', photo: 'photos', display: 'displays', task: 'tasks', run: 'season runs' };
  const parts = [...counts].sort((a, b) => b[1] - a[1]).map(([t, n]) => `${n} ${n === 1 ? t : plural[t]}`);
  return `made ${types.length} changes: ${parts.join(', ')}`;
}
