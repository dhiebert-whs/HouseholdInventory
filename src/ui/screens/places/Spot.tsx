// Spot detail (SPEC v3.0 §3, F11): photos, its area, the bins on it and its loose items. Actions:
// Add bin here, Add item here, Print label, Rename, Move to another area (of the same part),
// Remove. The dialogs are shared with More › Areas & spots. The top bar shows the spot's part.
import { RecentActivity } from '../more/Activity';
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { InventorySnapshot } from '../../../data/inventory';
import { moveSpotToArea, removeSpot, updateSpot } from '../../../data/places';
import { noteViewed } from '../../../data/prefs';
import { partView } from '../../../domain/parts';
import { binLabel, indexPlaces, pathText, spotPath } from '../../../domain/places';
import { type Area, type Part, type Spot } from '../../../domain/types';
import { BackButton, TopBar, plural } from '../../components/common';
import { SeasonChip } from '../../components/chips';
import { Dialog, DialogActions } from '../../components/Dialog';
import { PhotoCarousel } from '../../components/PhotoCarousel';
import { useDb, useSnapshot } from '../../data-hooks';
import { Icon } from '../../icons';
import { href, replaceRoute } from '../../shell/router';
import { useRecordPart } from '../../part';
import { showToast } from '../../shell/toast';
import { EntryDialog } from '../more/EntryDialog';
import { StorageError } from '../StorageError';
import { ItemLinks, Missing } from './Bin';

export function SpotScreen({ id }: { id: string }) {
  const live = useSnapshot();
  const back = <BackButton fallback={href.list('places')} />;
  if (live.state === 'error') return <StorageError error={live.error} />;
  if (live.state === 'loading') {
    return (
      <>
        <TopBar title="Spot" kicker="" back={back} />
        <div class="state" aria-busy="true">
          <p class="state-text muted">Loading…</p>
        </div>
      </>
    );
  }
  const spot = live.value.spots.find((s) => s.id === id);
  const part = live.value.areas.find((a) => a.id === spot?.areaId)?.part;
  if (!spot || !part) return <Missing what="Spot" id={id} back={back} />;
  // Everything on this screen (other areas and spots to move to) is in the spot's part.
  return <SpotDetail spot={spot} snap={partView(live.value, part)} part={part} back={back} />;
}

type Open = 'rename' | 'move' | 'remove' | null;

function SpotDetail({ spot, snap, part, back }: { spot: Spot; snap: InventorySnapshot; part: Part; back: ComponentChildren }) {
  const [open, setOpen] = useState<Open>(null);
  useEffect(() => noteViewed(spot.id), [spot.id]);
  useRecordPart(part);
  const ix = indexPlaces(snap);
  const area = ix.area.get(spot.areaId);
  const bins = snap.bins.filter((b) => b.spotId === spot.id).sort((a, b) => a.code.localeCompare(b.code, 'en-US', { numeric: true }));
  const loose = snap.items.filter((i) => i.spotId === spot.id).sort((a, b) => a.name.localeCompare(b.name, 'en-US', { sensitivity: 'base' }));
  const seasons = new Map(snap.seasons.map((s) => [s.id, s]));
  const count = (binId: string) => snap.items.filter((i) => i.binId === binId).length;

  return (
    <>
      <TopBar title={spot.name} kicker={area?.name ?? ''} back={back} part={part} />
      <div class="dbody">
        <div class="dleft">
          <PhotoCarousel ownerType="spot" ownerId={spot.id} name={spot.name} />
          <div class="dacts">
            <a class="btn pri lg" href={href.binAdd({ spot: spot.id })}>
              <Icon name="plus" />
              Add bin here
            </a>
            <a class="btn lg" href={href.add('', '', spot.id)}>
              <Icon name="plus" />
              Add item here
            </a>
            <a class="btn lg" href={href.labels([spot.id])}>
              <Icon name="print" />
              Print label
            </a>
            <button type="button" class="btn lg" onClick={() => setOpen('rename')}>
              <Icon name="pencil" />
              Rename…
            </button>
            <button type="button" class="btn lg" onClick={() => setOpen('move')}>
              <Icon name="area" />
              Move to another area…
            </button>
            <button type="button" class="btn danger lg" onClick={() => setOpen('remove')}>
              <Icon name="trash" />
              Remove spot…
            </button>
          </div>
        </div>
        <div class="dright">
          {spot.notes && (
            <div class="card box">
              <span class="lbl">Notes</span>
              <span class="notes">{spot.notes}</span>
            </div>
          )}
          <div class="card box">
            <h2 class="h2">Bins here · {bins.length}</h2>
            {bins.length === 0 ? (
              <p class="muted m0">No bins on this spot.</p>
            ) : (
              <div class="ilinks">
                {bins.map((b) => (
                  <a key={b.id} class="ilink" href={href.bin(b.id)}>
                    <span class="bincode sm">{b.code}</span>
                    <span class="grow">
                      <strong>{b.name}</strong> <span class="small muted">{plural(count(b.id), 'item')}</span>
                      <span class="ilink-chips">
                        <SeasonChip season={seasons.get(b.seasonId)} />
                      </span>
                    </span>
                    <Icon name="chevRight" />
                  </a>
                ))}
              </div>
            )}
          </div>
          <div class="card box">
            <h2 class="h2">Loose items · {loose.length}</h2>
            <ItemLinks items={loose} empty="No loose items on this spot." />
          </div>
          <RecentActivity recordId={spot.id} />
        </div>
      </div>

      {open === 'rename' && <RenameSpot spot={spot} snap={snap} onClose={() => setOpen(null)} />}
      {open === 'move' && <MoveSpot spot={spot} areas={snap.areas} onClose={() => setOpen(null)} />}
      {open === 'remove' && <RemoveSpot spot={spot} snap={snap} onClose={() => setOpen(null)} onRemoved={() => replaceRoute(href.list('places'))} />}
    </>
  );
}

export function RenameSpot({ spot, snap, onClose }: { spot: Spot; snap: InventorySnapshot; onClose: () => void }) {
  const db = useDb();
  return (
    <EntryDialog
      title={`Rename “${spot.name}”`}
      what="Spot"
      existing={snap.spots.filter((s) => s.areaId === spot.areaId).map((s) => s.name)}
      self={spot.name}
      initial={spot}
      notes
      notesPlaceholder="e.g. top shelf, left of the vent"
      explain="Its bins, items and labels follow the new name."
      submitLabel="Save"
      onClose={onClose}
      onSubmit={async (v) => {
        await updateSpot(db, spot.id, { name: v.name, notes: v.notes });
        onClose();
        showToast('Saved.');
      }}
    />
  );
}

/** Move spot to another area (sorting the H1 “Unsorted” spots). */
export function MoveSpot({ spot, areas, onClose }: { spot: Spot; areas: readonly Area[]; onClose: () => void }) {
  const db = useDb();
  const others = [...areas].sort((a, b) => a.order - b.order).filter((a) => a.id !== spot.areaId);
  const [to, setTo] = useState(others[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    try {
      await moveSpotToArea(db, spot.id, to);
      showToast(`Moved “${spot.name}” to ${areas.find((a) => a.id === to)?.name}. Its bins and items went with it.`);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  return (
    <Dialog label="Move spot" onClose={() => !busy && onClose()}>
      <h2 class="h2">Move “{spot.name}” to another area</h2>
      {others.length === 0 ? (
        <p class="dlg-p">There’s no other area yet. Add one in More › Areas & spots.</p>
      ) : (
        <div>
          <label class="lbl" for="mv-area">
            Area
          </label>
          <select id="mv-area" class="field" value={to} onChange={(e) => setTo((e.currentTarget as HTMLSelectElement).value)}>
            {others.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <p class="small muted">Its bins and loose items go with it. Bin codes stay the same, so printed labels stay true.</p>
        </div>
      )}
      {error && (
        <div class="err" role="alert">
          {error}
        </div>
      )}
      <DialogActions>
        <button type="button" class="btn lg" disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button type="button" class="btn pri lg" disabled={busy || !to} onClick={() => void go()}>
          Move spot
        </button>
      </DialogActions>
    </Dialog>
  );
}

/** Remove a spot (F11): what's on it goes to another spot, or to no spot, first. */
export function RemoveSpot({ spot, snap, onClose, onRemoved }: { spot: Spot; snap: InventorySnapshot; onClose: () => void; onRemoved?: () => void }) {
  const db = useDb();
  const ix = indexPlaces(snap);
  const bins = snap.bins.filter((b) => b.spotId === spot.id);
  const loose = snap.items.filter((i) => i.spotId === spot.id);
  const held = bins.length + loose.length;
  const others = snap.spots.filter((s) => s.id !== spot.id);
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const target = others.find((s) => s.id === to);
  const go = async () => {
    setBusy(true);
    try {
      await removeSpot(db, spot.id, to);
      showToast(held ? `Removed “${spot.name}”; its contents moved to ${target ? pathText(spotPath(target, ix)) : 'no spot'}.` : `Removed “${spot.name}”.`);
      onClose();
      onRemoved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  const what = [bins.length ? plural(bins.length, 'bin') : '', loose.length ? plural(loose.length, 'loose item') : ''].filter(Boolean).join(' and ');
  return (
    <Dialog label="Remove spot" role="alertdialog" onClose={() => !busy && onClose()}>
      <h2 class="h2">Remove “{spot.name}”?</h2>
      {held > 0 ? (
        <>
          <p class="dlg-big">
            It holds <strong>{what}</strong>
            {bins.length ? ` (${bins.slice(0, 3).map(binLabel).join(', ')}${bins.length > 3 ? '…' : ''})` : ''}. Choose where {held === 1 ? 'it goes' : 'they go'} first.
          </p>
          <div>
            <label class="lbl" for="rm-to">
              Move to
            </label>
            <select id="rm-to" class="field" value={to} onChange={(e) => setTo((e.currentTarget as HTMLSelectElement).value)}>
              <option value="">No spot (bins) / No home yet (items)</option>
              {others.map((s) => (
                <option key={s.id} value={s.id}>
                  {pathText(spotPath(s, ix))}
                </option>
              ))}
            </select>
          </div>
        </>
      ) : (
        <p class="dlg-big">Nothing is on it.</p>
      )}
      {error && (
        <div class="err" role="alert">
          {error}
        </div>
      )}
      <DialogActions>
        <button type="button" class="btn lg" data-autofocus disabled={busy} onClick={onClose}>
          Keep it
        </button>
        <button type="button" class="btn danger lg" disabled={busy} onClick={() => void go()}>
          <Icon name="trash" />
          {held ? 'Move contents and remove' : 'Remove'}
        </button>
      </DialogActions>
    </Dialog>
  );
}
