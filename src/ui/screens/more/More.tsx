// More (SPEC v3.0 §10): the current part's lists (Areas & spots, Categories, Tags, and in Holiday
// Seasons and Displays), Labels, Backup & restore (both parts), Settings and About.
import { plural } from '../../components/common';
import { PartSwitch } from '../../components/PartSwitch';
import { PART_NAME, type Part } from '../../../domain/types';
import { daysSinceBackup } from '../../../domain/backup-reminder';
import { formatBytes } from '../../../domain/dates';
import { APP_NAME, APP_VERSION } from '../../../io/backup';
import { useNow, usePartSnapshot, useSettings, useStorageStatus } from '../../data-hooks';
import { Icon, type IconName } from '../../icons';
import { href } from '../../shell/router';

function Row(props: { icon: IconName; title: string; sub: string; to?: string }) {
  const body = (
    <>
      <span class="mi">
        <Icon name={props.icon} />
      </span>
      <span class="grow">
        <span class="mt">{props.title}</span>
        <span class="small muted block">{props.sub}</span>
      </span>
      {props.to && <Icon name="chevRight" />}
    </>
  );
  return props.to ? (
    <a class="mrow" href={props.to}>
      {body}
    </a>
  ) : (
    <div class="mrow later" aria-disabled="true">
      {body}
    </div>
  );
}

export function MoreScreen({ part }: { part: Part }) {
  const { snap, all } = usePartSnapshot(part);
  const settings = useSettings();
  const days = daysSinceBackup(settings.lastBackupAt, useNow());
  const storage = useStorageStatus();
  const storageText = !storage
    ? ''
    : ` · persistent storage ${storage.persisted === null ? 'unknown' : storage.persisted ? 'granted' : 'not granted'}${storage.usage === null ? '' : ` · ${formatBytes(storage.usage)} used`}`;
  const backupSub = `Last backup: ${days === null ? 'never' : days === 0 ? 'today' : `${plural(days, 'day')} ago`} · full or data only`;
  const reminder = settings.reminderDays === 0 ? 'Backup reminder off' : `Backup reminder every ${plural(settings.reminderDays, 'day')}`;
  return (
    <>
      <header class="phead top">
        <PartSwitch part={part} />
        <h1 class="h1">More</h1>
      </header>
      <div class="mbody">
        <div class="mcol">
          <div class="grp">
            <h3>{PART_NAME[part]}</h3>
            <Row
              icon="area"
              title="Areas & spots"
              sub={snap ? (snap.areas.length ? `${plural(snap.areas.length, 'area')} · ${plural(snap.spots.length, 'spot')} · ${plural(snap.bins.length, 'bin')}` : 'No areas yet · rooms, shelves, bins') : 'Rooms, shelves, bins'}
              to={href.list('places')}
            />
            {part === 'holiday' && <Row icon="season" title="Seasons" sub={snap ? `${plural(snap.seasons.length, 'season')} · dates, colors, order` : 'Dates, colors, order'} to={href.list('seasons')} />}
            {part === 'holiday' && <Row icon="pin" title="Displays" sub={snap ? `${snap.displays.length ? plural(snap.displays.length, 'display') : 'No displays yet'} · Mantel, Front porch…` : 'Mantel, Front porch…'} to={href.list('displays')} />}
            <Row icon="folder" title="Categories" sub={snap ? `${plural(snap.categories.length, 'category', 'categories')} · add, rename, reorder` : 'Add, rename, reorder'} to={href.list('categories')} />
            <Row icon="tag" title="Tags" sub={snap ? `${snap.tags.length ? plural(snap.tags.length, 'tag') : 'No tags yet'} · Fragile, Outdoor…` : 'Fragile, Outdoor…'} to={href.list('tags')} />
            <Row icon="labels" title="Labels" sub="QR labels for bins, spots and items" to={href.labels()} />
          </div>
          <div class="grp">
            <h3>Both parts</h3>
            <Row icon="upload" title="Backup & restore" sub={backupSub} to={href.backup} />
            <Row icon="lists" title="Activity" sub="Who changed what, newest first" to={href.activity} />
            <Row icon="clock" title="Settings" sub={`Sync, your name · ${reminder}`} to={href.settings} />
          </div>
          <div class="grp">
            <h3>About</h3>
            <Row icon="database" title={APP_NAME} sub={`${all ? `${plural(all.items.length, 'item')} on this phone` : 'Stored on this phone'}${storageText}`} />
            <Row icon="info" title={`App version ${APP_VERSION}`} sub={`Built ${new Date(__BUILD_TIME__).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`} />
          </div>
        </div>
      </div>
    </>
  );
}
