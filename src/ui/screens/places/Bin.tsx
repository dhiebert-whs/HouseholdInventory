// Bin detail and editor (SPEC v3.0 §3, F7, F10, §6). Detail: photos, where it is, season (Holiday)
// and tags, what's in it, its label ("Label out of date" with Reprint, §4), and Add item here,
// Print label, Move bin (also to the other part), Edit, Delete; in Holiday, Unpack (F5). The top
// bar shows the bin's part.
import { RecentActivity } from '../more/Activity';
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { InventorySnapshot } from '../../../data/inventory';
import { addBin, deleteBin, moveBin, suggestBinCode, updateBin } from '../../../data/places';
import { noteViewed } from '../../../data/prefs';
import { formatDateTime } from '../../../domain/dates';
import { binLabelState } from '../../../domain/labels';
import { partView } from '../../../domain/parts';
import { binContents, binLabel, indexPlaces, pathText, spotPath, tidyBinCode } from '../../../domain/places';
import { BIN_CODE_PATTERN } from '../../../domain/validate';
import { nameKey, type Bin, type BinState, type Item, type Part } from '../../../domain/types';
import { BackButton, StateMessage, TopBar, plural } from '../../components/common';
import { ConditionChip, Qty, SeasonChip, StatusChip } from '../../components/chips';
import { Dialog, DialogActions } from '../../components/Dialog';
import { HomePicker } from '../../components/HomePicker';
import { PhotoCarousel } from '../../components/PhotoCarousel';
import { useDb, useSnapshot } from '../../data-hooks';
import { Icon } from '../../icons';
import { goBack, href, openedFrom, replaceRoute } from '../../shell/router';
import { getPart, useRecordPart } from '../../part';
import { showToast } from '../../shell/toast';
import { Thumb } from '../inventory/ItemRow';
import { Breadcrumbs } from '../item/Detail';
import { StorageError } from '../StorageError';
import { UnpackDialog } from '../holiday/PutOut';

function Loading({ title, back }: { title: string; back: ComponentChildren }) {
  return (
    <>
      <TopBar title={title} kicker="" back={back} />
      <div class="state" aria-busy="true">
        <p class="state-text muted">Loading…</p>
      </div>
    </>
  );
}

export function Missing({ what, id, back }: { what: string; id: string; back: ComponentChildren }) {
  return (
    <>
      <TopBar title={`${what} not found`} back={back} />
      <StateMessage
        icon="search"
        title={`No ${what.toLowerCase()} “${id}”`}
        actions={
          <a class="btn pri" href={href.list('places')}>
            <Icon name="area" />
            Areas & spots
          </a>
        }
      >
        <p class="state-text">It may have been deleted, or this phone was restored from an older backup.</p>
      </StateMessage>
    </>
  );
}

/** Items in a list with their quantity and chips, each opening its card. */
export function ItemLinks({ items, empty }: { items: readonly Item[]; empty: string }) {
  if (items.length === 0) return <p class="muted m0">{empty}</p>;
  return (
    <div class="ilinks">
      {items.map((i) => (
        <a key={i.id} class="ilink" href={href.item(i.id)}>
          <Thumb itemId={i.id} hasPhoto={i.hasPhoto} />
          <span class="grow">
            <strong>{i.name}</strong> <Qty item={i} />
            <span class="ilink-chips">
              <StatusChip item={i} />
              <ConditionChip condition={i.condition} />
            </span>
          </span>
          <Icon name="chevRight" />
        </a>
      ))}
    </div>
  );
}

export function BinScreen({ id }: { id: string }) {
  const live = useSnapshot();
  const back = <BackButton fallback={href.home(getPart())} />;
  if (live.state === 'error') return <StorageError error={live.error} />;
  if (live.state === 'loading') return <Loading title="Bin" back={back} />;
  const bin = live.value.bins.find((b) => b.id === id);
  if (!bin) return <Missing what="Bin" id={id} back={back} />;
  return <BinDetail bin={bin} snap={live.value} back={back} />;
}

function BinDetail({ bin, snap, back }: { bin: Bin; snap: InventorySnapshot; back: ComponentChildren }) {
  const db = useDb();
  const [open, setOpen] = useState<'move' | 'delete' | 'unpack' | null>(null);
  useEffect(() => noteViewed(bin.id), [bin.id]);
  useRecordPart(bin.part);
  const ix = indexPlaces(snap);
  const labelState = binLabelState(bin, snap.items);
  const spot = bin.spotId ? ix.spot.get(bin.spotId) : undefined;
  const where = spot ? spotPath(spot, ix) : [];
  const season = snap.seasons.find((s) => s.id === bin.seasonId);
  const items = snap.items.filter((i) => i.binId === bin.id).sort((a, b) => a.name.localeCompare(b.name, 'en-US', { sensitivity: 'base' }));
  const summary = binContents(snap.items, bin.id);

  return (
    <>
      <TopBar title={binLabel(bin)} kicker={where.length ? pathText(where) : 'No spot'} back={back} part={bin.part} />
      <div class="dbody">
        <div class="dleft">
          <PhotoCarousel ownerType="bin" ownerId={bin.id} name={binLabel(bin)} />
          <div class="dacts">
            {bin.part === 'holiday' && items.some((i) => i.status === 'stored') && (
              <button type="button" class="btn pri lg" onClick={() => setOpen('unpack')}>
                <Icon name="arrowOut" />
                Unpack…
              </button>
            )}
            <a class={bin.part === 'holiday' && items.some((i) => i.status === 'stored') ? 'btn lg' : 'btn pri lg'} href={href.add('', '', bin.id)}>
              <Icon name="plus" />
              Add item here
            </a>
            <a class="btn lg" href={href.labels([bin.id])}>
              <Icon name="print" />
              {labelState === 'none' ? 'Print label' : 'Reprint label'}
            </a>
            <button type="button" class="btn lg" onClick={() => setOpen('move')}>
              <Icon name="pin" />
              Move bin…
            </button>
            <a class="btn lg" href={href.binEdit(bin.id)}>
              <Icon name="pencil" />
              Edit bin
            </a>
            <button type="button" class="btn danger lg" onClick={() => setOpen('delete')}>
              <Icon name="trash" />
              Delete bin…
            </button>
          </div>
        </div>
        <div class="dright">
          <div class="bincode" aria-label={`Bin code ${bin.code}`}>
            {bin.code}
          </div>
          <div class="dchips">
            {bin.state === 'out' && (
              <span class="chip st-out">
                <Icon name="arrowOut" />
                OUT (unpacked)
              </span>
            )}
            <SeasonChip season={season} />
            {bin.tags.map((t) => (
              <span key={t} class="chip mut">
                {t}
              </span>
            ))}
          </div>
          <div class="card box kv">
            <span class="lbl">Where</span>
            <Breadcrumbs parts={where} empty="No spot" />
            {bin.part === 'holiday' && (
              <>
                <span class="lbl">Season</span>
                <span class={season ? '' : 'muted'}>{season?.name ?? 'None'}</span>
              </>
            )}
            <span class="lbl">Label</span>
            <span class="muted">{bin.labelPrintedAt === null ? 'Not printed yet' : `Printed ${formatDateTime(new Date(bin.labelPrintedAt))}`}</span>
            <span class="lbl">Notes</span>
            <span class={bin.notes ? 'notes' : 'muted'}>{bin.notes || 'No notes'}</span>
          </div>
          {labelState === 'stale' && (
            <div class="stale" role="note">
              <span>
                <strong>Label out of date.</strong> What's in the bin changed since its label was printed.
              </span>
              <a class="btn" href={href.labels([bin.id])}>
                Reprint
              </a>
            </div>
          )}
          <div class="card box">
            <h2 class="h2">In this bin · {plural(items.length, 'item')}</h2>
            <ItemLinks items={items} empty="Nothing in it yet. Add item here puts things in it." />
            {summary.length > 0 && (
              <p class="small muted m0">
                On its label: {summary.slice(0, 6).join(' · ')}
                {summary.length > 6 ? ` · + ${summary.length - 6} more` : ''}
              </p>
            )}
          </div>
          <RecentActivity recordId={bin.id} />
        </div>
      </div>

      {open === 'move' && (
        <HomePicker
          snap={partView(snap, bin.part)}
          all={snap}
          part={bin.part}
          mode="bin"
          title={`Move ${bin.code} to…`}
          current={bin.spotId}
          onClose={() => setOpen(null)}
          onPick={async (spotId) => {
            await moveBin(db, bin.id, spotId);
            setOpen(null);
            const to = spotId ? ix.spot.get(spotId) : undefined;
            const moved = await moveBinResult(snap, to?.areaId);
            showToast(`Moved ${bin.code} to ${to ? pathText(spotPath(to, ix)) : 'no spot'}${moved && moved !== bin.part ? ` in ${moved === 'holiday' ? 'Holiday' : 'Household'}` : ''}. Its code stays ${bin.code}.`);
          }}
        />
      )}
      {open === 'unpack' && <UnpackDialog bin={bin} items={items} displays={snap.displays} onClose={() => setOpen(null)} />}
      {open === 'delete' && <DeleteBin bin={bin} items={items} spotName={spot?.name ?? null} onClose={() => setOpen(null)} />}
    </>
  );
}

/** Delete a bin (§6): its items move to the bin's spot (the default) or are deleted too. */
function DeleteBin({ bin, items, spotName, onClose }: { bin: Bin; items: Item[]; spotName: string | null; onClose: () => void }) {
  const db = useDb();
  const [what, setWhat] = useState<'to-spot' | 'delete'>('to-spot');
  const [busy, setBusy] = useState(false);
  const n = items.length;
  const go = async () => {
    setBusy(true);
    try {
      await deleteBin(db, bin.id, what);
      showToast(`Deleted ${binLabel(bin)}${n ? (what === 'delete' ? ` and ${plural(n, 'item')}` : `; ${plural(n, 'item')} moved to ${spotName ?? 'No home yet'}`) : ''}.`);
      replaceRoute(href.home(getPart()));
    } catch (e) {
      showToast(`Couldn't delete: ${e instanceof Error ? e.message : String(e)}`);
      setBusy(false);
    }
  };
  return (
    <Dialog label="Delete bin" role="alertdialog" onClose={() => !busy && onClose()}>
      <h2 class="h2">Delete {binLabel(bin)}?</h2>
      {n > 0 ? (
        <div class="choices" role="radiogroup" aria-label="Its items">
          <p class="dlg-p">It holds {plural(n, 'item')}.</p>
          <label class="tick">
            <input type="radio" name="bin-items" checked={what === 'to-spot'} onChange={() => setWhat('to-spot')} />
            <span>Keep them: move them to {spotName ? `the spot ${spotName}` : 'No home yet'}</span>
          </label>
          <label class="tick">
            <input type="radio" name="bin-items" checked={what === 'delete'} onChange={() => setWhat('delete')} />
            <span>Delete them too ({items.slice(0, 3).map((i) => i.name).join(', ')}{n > 3 ? ` and ${n - 3} more` : ''})</span>
          </label>
        </div>
      ) : (
        <p class="dlg-p">It’s empty.</p>
      )}
      <p class="small muted">There’s no undo. A backup made before now still has it.</p>
      <DialogActions>
        <button type="button" class="btn lg" data-autofocus disabled={busy} onClick={onClose}>
          Keep it
        </button>
        <button type="button" class="btn danger lg" disabled={busy} onClick={() => void go()}>
          <Icon name="trash" />
          {n && what === 'delete' ? `Delete bin and ${plural(n, 'item')}` : 'Delete bin'}
        </button>
      </DialogActions>
    </Dialog>
  );
}

// ── Editor ──

interface BinDraft {
  name: string;
  code: string;
  spotId: string;
  /** For a bin with no spot: the area whose code its code starts with. */
  areaId: string;
  seasonId: string;
  tags: string;
  state: BinState;
  notes: string;
}

export function BinEditorScreen(props: { mode: 'add'; spot: string; area: string } | { mode: 'edit'; id: string }) {
  const live = useSnapshot();
  const fallback = props.mode === 'edit' ? href.bin(props.id) : href.list('places');
  const back = (
    <button type="button" class="btn" onClick={() => goBack(fallback)}>
      <Icon name="close" />
      Cancel
    </button>
  );
  if (live.state === 'error') return <StorageError error={live.error} />;
  if (live.state === 'loading') return <Loading title={props.mode === 'add' ? 'Add bin' : 'Edit bin'} back={back} />;
  const snap = live.value;
  if (props.mode === 'edit') {
    const bin = snap.bins.find((b) => b.id === props.id);
    if (!bin) return <Missing what="Bin" id={props.id} back={back} />;
    return <BinForm all={snap} part={bin.part} base={bin} start={{ ...bin, tags: bin.tags.join('; '), areaId: '' }} fallback={fallback} />;
  }
  // A new bin is in its spot's part (Add bin here), or the area's, else the part in use.
  const spot = snap.spots.find((s) => s.id === props.spot);
  const areaPart = (id: string | undefined) => snap.areas.find((a) => a.id === id)?.part;
  const part: Part = areaPart(spot?.areaId) ?? areaPart(props.area) ?? getPart();
  const mine = snap.areas.filter((a) => a.part === part);
  const areaId = spot?.areaId ?? (mine.some((a) => a.id === props.area) ? props.area : (mine[0]?.id ?? ''));
  return <BinForm all={snap} part={part} base={null} start={{ name: '', code: '', spotId: spot?.id ?? '', areaId, seasonId: '', tags: '', state: 'stored', notes: '' }} fallback={fallback} />;
}

function BinForm(props: { all: InventorySnapshot; part: Part; base: Bin | null; start: BinDraft; fallback: string }) {
  const db = useDb();
  const { base, part } = props;
  const snap = partView(props.all, part);
  useRecordPart(part);
  const [d, setD] = useState<BinDraft>(props.start);
  const [suggested, setSuggested] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<BinDraft>) => setD((p) => ({ ...p, ...patch }));
  const ix = indexPlaces(snap);
  const spot = d.spotId ? ix.spot.get(d.spotId) : undefined;

  // A new bin's code follows its spot's area (or the chosen area when it has no spot).
  useEffect(() => {
    if (base) return;
    void suggestBinCode(db, d.spotId ? { spotId: d.spotId } : { areaId: d.areaId }).then(setSuggested);
  }, [db, d.spotId, d.areaId, base]);

  const code = d.code.trim() === '' ? (suggested ?? '') : tidyBinCode(d.code);
  const codeBad = code !== '' && !BIN_CODE_PATTERN.test(code);
  // Codes are unique across both parts (§3).
  const clash = props.all.bins.find((b) => b.id !== base?.id && tidyBinCode(b.code) === code);
  const ready = d.name.trim() !== '' && code !== '' && !codeBad && !clash;
  const tags = d.tags
    .split(';')
    .map((t) => t.trim())
    .filter((t, i, all) => t !== '' && all.findIndex((x) => nameKey(x) === nameKey(t)) === i);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const fields = { code, name: d.name, spotId: d.spotId, seasonId: part === 'holiday' ? d.seasonId : '', tags, state: d.state, notes: d.notes };
      const saved = base ? await updateBin(db, base.id, { ...fields, part: base.part }) : await addBin(db, { ...fields, part, areaId: d.areaId });
      showToast(base ? 'Saved.' : `Added ${binLabel(saved)}.`);
      if (base && openedFrom() === href.bin(saved.id)) history.back();
      else replaceRoute(href.bin(saved.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <>
      <TopBar
        title={base ? `Edit ${base.code}` : 'Add bin'}
        part={part}
        back={
          <button type="button" class="btn" onClick={() => goBack(props.fallback)}>
            <Icon name="close" />
            Cancel
          </button>
        }
        actions={
          <button type="button" class="btn pri lg" disabled={busy || !ready} onClick={() => void save()}>
            <Icon name="check" />
            {base ? 'Save' : 'Add bin'}
          </button>
        }
      />
      <div class="fbody">
        <div class="card sec">
          {error && (
            <div class="errsum" role="alert">
              {error}
            </div>
          )}
          <div>
            <label class="lbl" for="bn">
              Name <span class="req">*</span>
            </label>
            <input id="bn" class="field" value={d.name} placeholder="e.g. Christmas 4: lights & garland" autoComplete="off" onInput={(e) => set({ name: (e.currentTarget as HTMLInputElement).value })} />
          </div>
          <div>
            <span class="lbl">Where it’s stored</span>
            <button type="button" class="btn field-btn" onClick={() => setPicking(true)}>
              <Icon name="pin" />
              <span class="grow">{spot ? pathText(spotPath(spot, ix)) : 'No spot'}</span>
              <Icon name="chevRight" />
            </button>
          </div>
          {!base && !d.spotId && (
            <div>
              <label class="lbl" for="ba">
                Area (its code starts the bin’s)
              </label>
              <select id="ba" class="field" value={d.areaId} onChange={(e) => set({ areaId: (e.currentTarget as HTMLSelectElement).value })}>
                {snap.areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.code})
                  </option>
                ))}
              </select>
            </div>
          )}
          <div>
            <label class="lbl" for="bc">
              Code <span class="lbl-opt">(printed large on its label; stays when the bin moves)</span>
            </label>
            <input id="bc" class={codeBad || clash ? 'field bad mono' : 'field mono'} value={d.code} placeholder={suggested ?? 'e.g. A-04'} autoComplete="off" onInput={(e) => set({ code: (e.currentTarget as HTMLInputElement).value })} />
            {codeBad && <div class="err">A code is an area code, a dash and a number, like ATTIC-04.</div>}
            {clash && <div class="err">{code} is already on “{clash.name}”{clash.part !== part ? ` in ${clash.part === 'holiday' ? 'Holiday' : 'Household'}` : ''}.</div>}
            {!base && d.code.trim() === '' && suggested && <div class="small muted">Leave blank for {suggested}, the next code in this area.</div>}
            {!base && !suggested && snap.areas.length === 0 && <div class="err">Add an area first (More › Areas & spots), so the bin gets a code.</div>}
          </div>
          <div class="row2">
            {part === 'holiday' && (
            <div>
              <label class="lbl" for="bs">
                Season <span class="lbl-opt">(optional)</span>
              </label>
              <select id="bs" class="field" value={d.seasonId} onChange={(e) => set({ seasonId: (e.currentTarget as HTMLSelectElement).value })}>
                <option value="">None</option>
                {snap.seasons.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            )}
            <div>
              <label class="lbl" for="bst">
                State
              </label>
              <select id="bst" class="field" value={d.state} onChange={(e) => set({ state: (e.currentTarget as HTMLSelectElement).value as BinState })}>
                <option value="stored">Stored</option>
                <option value="out">Out (unpacked)</option>
              </select>
            </div>
          </div>
          <div>
            <label class="lbl" for="btg">
              Tags <span class="lbl-opt">(optional; separate with ;)</span>
            </label>
            <input id="btg" class="field" value={d.tags} placeholder={snap.tags.slice(0, 3).map((t) => t.name).join('; ') || 'e.g. Fragile; Heavy'} autoComplete="off" onInput={(e) => set({ tags: (e.currentTarget as HTMLInputElement).value })} />
          </div>
          <div>
            <label class="lbl" for="bno">
              Notes <span class="lbl-opt">(optional)</span>
            </label>
            <textarea id="bno" class="field" value={d.notes} placeholder="e.g. lid cracked" onInput={(e) => set({ notes: (e.currentTarget as HTMLTextAreaElement).value })} />
          </div>
        </div>
      </div>
      {picking && (
        <HomePicker
          snap={snap}
          part={part}
          mode="bin"
          title="Where is the bin stored?"
          current={d.spotId}
          submitLabel="Choose"
          onClose={() => setPicking(false)}
          onPick={(id) => {
            set({ spotId: id });
            setPicking(false);
          }}
        />
      )}
    </>
  );
}

/** The part a moved bin ended up in: its new spot's area's (undefined for no spot). */
async function moveBinResult(snap: InventorySnapshot, areaId: string | undefined): Promise<Part | undefined> {
  return areaId ? snap.areas.find((a) => a.id === areaId)?.part : undefined;
}
