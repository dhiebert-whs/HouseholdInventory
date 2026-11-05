// Item detail (F16): photo carousel, path breadcrumbs, status, condition and season chips, the
// quantity stepper, details and a collapsed Records section. Actions: Edit, Move (F7), and under
// More…: Split a line, Duplicate, Print QR label, Delete; in Holiday, Put out… or Put back (F5) and
// its usual display (F22). The top bar shows the item's part in its
// color (F21); opening an item of the other part switches the app to it. H7 restyles it.
import { RecentActivity } from '../more/Activity';
import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { adjustQuantity, setQuantity, type InventorySnapshot } from '../../../data/inventory';
import { putBack } from '../../../data/holiday';
import { duplicateItem, getRecentHomes, homeId, moveItemsHome, splitItem, type Home } from '../../../data/items';
import { noteViewed } from '../../../data/prefs';
import { kindOfId } from '../../../domain/ids';
import { formatCents } from '../../../domain/money';
import { indexPlaces, itemPath, itemSeasonId, NO_HOME, NO_SPOT, pathText, type PathPart } from '../../../domain/places';
import { formatIsoDate } from '../../../domain/dates';
import { partView } from '../../../domain/parts';
import type { Item } from '../../../domain/types';
import { BackButton, StateMessage, TopBar, plural } from '../../components/common';
import { ConditionChip, SeasonChip, StatusChip } from '../../components/chips';
import { Dialog, DialogActions } from '../../components/Dialog';
import { HomePicker } from '../../components/HomePicker';
import { PhotoCarousel } from '../../components/PhotoCarousel';
import { CountStepper } from '../../components/QuantityStepper';
import { useDb, useSnapshot } from '../../data-hooks';
import { Icon } from '../../icons';
import { href } from '../../shell/router';
import { getPart, useRecordPart } from '../../part';
import { showToast } from '../../shell/toast';
import { StorageError } from '../StorageError';
import { DeleteItemButton } from './DeleteItem';
import { PutOutDialog } from '../holiday/PutOut';

const crumb = (i: Item) => (i.subcategory ? `${i.category} › ${i.subcategory}` : i.category);

/** A home id ('' none, else bn-/sp-) as a Home for moveItemsHome. */
export const toHome = (id: string): Home => (id === '' ? 'none' : kindOfId(id) === 'bin' ? { binId: id } : { spotId: id });

export function DetailScreen({ id }: { id: string }) {
  const live = useSnapshot();
  const back = <BackButton fallback={href.home(getPart())} />;
  if (live.state === 'error') {
    return (
      <>
        <TopBar title="Item" back={back} />
        <StorageError error={live.error} />
      </>
    );
  }
  if (live.state === 'loading') {
    return (
      <>
        <TopBar title="Loading…" kicker="" back={back} />
        <div class="state" aria-busy="true">
          <p class="state-text muted">Loading item…</p>
        </div>
      </>
    );
  }
  const item = live.value.items.find((i) => i.id === id);
  if (!item) return <ItemMissing id={id} back={back} />;
  return <Detail item={item} snap={live.value} back={back} />;
}

export function ItemMissing({ id, back }: { id: string; back: ComponentChildren }) {
  return (
    <>
      <TopBar title="Item not found" back={back} />
      <StateMessage
        icon="search"
        title={`No item “${id}”`}
        actions={
          <a class="btn pri" href={href.home(getPart())}>
            <Icon name="inventory" />
            Go to the inventory
          </a>
        }
      >
        <p class="state-text">It may have been deleted, or this phone was restored from an older backup.</p>
      </StateMessage>
    </>
  );
}

/** Where a breadcrumb opens: a spot or bin screen, or the area in More › Areas & spots. */
export const partHref = (p: PathPart) => (p.kind === 'bin' ? href.bin(p.id) : p.kind === 'spot' ? href.spot(p.id) : href.list('places'));

/** Breadcrumbs (§10): tap a level to open it. */
export function Breadcrumbs({ parts, empty }: { parts: readonly PathPart[]; empty: string }) {
  if (parts.length === 0) return <span class="noloc">{empty}</span>;
  return (
    <nav class="crumbs" aria-label="Where it is">
      {parts.map((p, i) => (
        <span key={p.id}>
          {i > 0 && <span class="crumb-sep"> › </span>}
          <a href={partHref(p)}>{p.label}</a>
        </span>
      ))}
      {parts.length === 1 && parts[0]!.kind === 'bin' && <span class="muted"> ({NO_SPOT})</span>}
    </nav>
  );
}

type Open = 'move' | 'more' | 'split' | 'out' | null;

function Detail({ item, snap, back }: { item: Item; snap: InventorySnapshot; back: ComponentChildren }) {
  const db = useDb();
  const [open, setOpen] = useState<Open>(null);
  const [recent, setRecent] = useState<string[]>([]);
  // Offered under the Inventory search box (F1).
  useEffect(() => noteViewed(item.id), [item.id]);
  useEffect(() => void getRecentHomes(db).then(setRecent), [db, open]);
  useRecordPart(item.part);

  const ix = indexPlaces(snap);
  const path = itemPath(item, ix);
  const season = snap.seasons.find((s) => s.id === itemSeasonId(item, ix));
  const ownSeason = item.seasonId !== '';
  const display = snap.displays.find((d) => d.id === item.displayId);
  const fail = (e: unknown) => showToast(`Couldn't save: ${e instanceof Error ? e.message : String(e)}`);
  const records = [item.purchaseDate, item.model, item.serial, item.warrantyUntil].some((x) => x !== '');

  return (
    <>
      <TopBar title={item.name} kicker={path.length ? pathText(path) : NO_HOME} back={back} part={item.part} />
      <div class="dbody">
        <div class="dleft">
          <PhotoCarousel ownerType="item" ownerId={item.id} name={item.name} />
          <div class="dacts">
            <a class="btn pri lg" href={href.edit(item.id)}>
              <Icon name="pencil" />
              Edit
            </a>
            <button type="button" class="btn lg" onClick={() => setOpen('move')}>
              <Icon name="pin" />
              Move…
            </button>
            <button type="button" class="btn lg" onClick={() => setOpen('more')}>
              <Icon name="dots" />
              More…
            </button>
            {item.part === 'holiday' &&
              (item.status === 'out' ? (
                <button type="button" class="btn lg" onClick={() => void putBack(db, [item.id]).then(() => showToast(`${item.name} is back in ${path.length ? pathText(path) : 'storage'}.`), fail)}>
                  <Icon name="check" />
                  Put back
                </button>
              ) : (
                <button type="button" class="btn lg" onClick={() => setOpen('out')}>
                  <Icon name="arrowOut" />
                  Put out…
                </button>
              ))}
          </div>
        </div>

        <div class="dright">
          <div class="dchips">
            <StatusChip item={item} />
            <ConditionChip condition={item.condition} />
            <SeasonChip season={season} />
            {item.tags.map((t) => (
              <span key={t} class="chip mut">
                {t}
              </span>
            ))}
          </div>

          <div class="card box">
            <span class="lbl">Quantity{item.approx ? ' (about)' : ''}</span>
            <div class="qty">
              <CountStepper
                value={item.quantity}
                itemName={item.name}
                size="xl"
                onStep={(d) => void adjustQuantity(db, item.id, d).catch(fail)}
                onSet={(n) =>
                  setQuantity(db, item.id, n).catch((e: unknown) => {
                    fail(e);
                    throw e;
                  })
                }
              />
            </div>
          </div>

          <div class="card box kv">
            <span class="lbl">Home</span>
            <Breadcrumbs parts={path} empty={NO_HOME} />
            <span class="lbl">Category</span>
            <span>{crumb(item)}</span>
            {item.part === 'holiday' && (
              <>
                <span class="lbl">Season</span>
                <span class={season ? '' : 'muted'}>{season ? `${season.name}${ownSeason ? '' : ' (from its bin)'}` : 'None'}</span>
                <span class="lbl">Usual display</span>
                {display ? <a href={href.display(display.id)}>{display.name}</a> : <span class="muted">None</span>}
              </>
            )}
            {item.condition !== 'ok' && (
              <>
                <span class="lbl">Condition</span>
                <span>{item.conditionNote || 'No note'}</span>
              </>
            )}
            <span class="lbl">Value</span>
            <span class={item.value === null ? 'muted' : ''}>{item.value === null ? 'Not set' : formatCents(item.value)}</span>
            <span class="lbl">Barcode</span>
            <span class={item.barcode ? 'mono' : 'muted'}>{item.barcode || 'None'}</span>
            <span class="lbl">Notes</span>
            <span class={item.notes ? 'notes' : 'muted'}>{item.notes || 'No notes'}</span>
          </div>

          <details class="card box records" open={records}>
            <summary class="lbl">Records</summary>
            <div class="kv">
              <span class="lbl">Purchased</span>
              <span class={item.purchaseDate ? '' : 'muted'}>{item.purchaseDate ? formatIsoDate(item.purchaseDate) : 'Not set'}</span>
              <span class="lbl">Model</span>
              <span class={item.model ? '' : 'muted'}>{item.model || 'Not set'}</span>
              <span class="lbl">Serial</span>
              <span class={item.serial ? 'mono' : 'muted'}>{item.serial || 'Not set'}</span>
              <span class="lbl">Warranty until</span>
              <span class={item.warrantyUntil ? '' : 'muted'}>{item.warrantyUntil ? formatIsoDate(item.warrantyUntil) : 'Not set'}</span>
            </div>
            <p class="small muted m0">Manuals and receipts (attachments) come in a later version.</p>
          </details>

          <div class="dchips">
            <span class="chip mut">ID {item.id}</span>
          </div>
          <RecentActivity recordId={item.id} />
        </div>
      </div>

      {open === 'out' && <PutOutDialog item={item} displays={snap.displays} onClose={() => setOpen(null)} />}
      {open === 'move' && (
        <HomePicker
          snap={partView(snap, item.part)}
          all={snap}
          part={item.part}
          mode="item"
          title={`Move ${item.name} to…`}
          current={homeId(item)}
          recent={recent}
          onClose={() => setOpen(null)}
          onPick={async (to) => {
            await moveItemsHome(db, [item.id], toHome(to));
            setOpen(null);
            showToast(`Moved to ${to ? pathText(itemPath(toHomeFields(to), ix)) : NO_HOME}.`);
          }}
        />
      )}
      {open === 'more' && (
        <Dialog label={item.name} onClose={() => setOpen(null)}>
          <h2 class="h2">{item.name}</h2>
          <div class="menu-acts">
            <button type="button" class="btn lg" data-autofocus disabled={item.quantity < 2} onClick={() => setOpen('split')}>
              <Icon name="split" />
              Split this line…
            </button>
            <button
              type="button"
              class="btn lg"
              onClick={() =>
                void duplicateItem(db, item.id).then((copy) => {
                  setOpen(null);
                  showToast(`Duplicated as “${copy.name}”.`);
                  location.hash = href.item(copy.id);
                }, fail)
              }
            >
              <Icon name="copy" />
              Duplicate
            </button>
            <a class="btn lg" href={href.labels([item.id])}>
              <Icon name="print" />
              Print QR label
            </a>
            <DeleteItemButton item={item} />
          </div>
          <DialogActions>
            <button type="button" class="btn lg" onClick={() => setOpen(null)}>
              Close
            </button>
          </DialogActions>
        </Dialog>
      )}
      {open === 'split' && <SplitDialog item={item} snap={snap} recent={recent} onClose={() => setOpen(null)} />}
    </>
  );
}

const toHomeFields = (id: string) => (kindOfId(id) === 'bin' ? { binId: id, spotId: '' } : { binId: '', spotId: id });

/** Split a line (F16): take n out of this item into a new one, here or in another home. */
function SplitDialog({ item, snap, recent, onClose }: { item: Item; snap: InventorySnapshot; recent: string[]; onClose: () => void }) {
  const db = useDb();
  const [n, setN] = useState(String(Math.min(1, item.quantity - 1)));
  const [home, setHome] = useState(homeId(item));
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const count = /^\d+$/.test(n.trim()) ? Number(n) : NaN;
  const ok = count >= 1 && count < item.quantity;
  const ix = indexPlaces(snap);
  const where = home ? pathText(itemPath(toHomeFields(home), ix)) : NO_HOME;

  const go = async () => {
    setBusy(true);
    try {
      const part = await splitItem(db, item.id, count, home === homeId(item) ? null : toHome(home));
      showToast(`Split off ${plural(count, 'piece')} into a new line.`);
      onClose();
      location.hash = href.item(part.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  if (picking) {
    return <HomePicker snap={partView(snap, item.part)} part={item.part} mode="item" title="Put the new line in…" current={home} recent={recent} submitLabel="Choose" onClose={() => setPicking(false)} onPick={(to) => (setHome(to), setPicking(false))} />;
  }
  return (
    <Dialog label="Split this line" onClose={() => !busy && onClose()}>
      <h2 class="h2">Split {item.name}</h2>
      <p class="dlg-p">
        Take some out of this line (now {item.approx ? '~' : ''}
        {item.quantity}) into a new line with the same details.
      </p>
      <div>
        <label class="lbl" for="split-n">
          How many to take out
        </label>
        <input id="split-n" class="field num" inputMode="numeric" value={n} onInput={(e) => setN((e.currentTarget as HTMLInputElement).value)} />
      </div>
      <div>
        <span class="lbl">New line goes to</span>
        <button type="button" class="btn" onClick={() => setPicking(true)}>
          <Icon name="pin" />
          {where}
        </button>
      </div>
      {error && (
        <div class="err" role="alert">
          {error}
        </div>
      )}
      <DialogActions>
        <button type="button" class="btn lg" disabled={busy} onClick={onClose}>
          Cancel
        </button>
        <button type="button" class="btn pri lg" disabled={busy || !ok} onClick={() => void go()}>
          {ok ? `Split off ${count}` : 'Split'}
        </button>
      </DialogActions>
    </Dialog>
  );
}
