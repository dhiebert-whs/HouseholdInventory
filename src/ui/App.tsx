// Boot: open the inventory → storage error | first-launch setup (what the inventory starts with,
// SPEC v3.0 §12.5) | app. Tab screens belong to a part (F21); their address says which.
import { useEffect, useState } from 'preact/hooks';
import { InventoryDb, checkSchema } from '../data/db';
import { isSetUp, watchPersistentStorage } from '../data/setup';
import { watchSignIn } from '../data/signin-log';
import { checkSignIn } from '../io/signin';
import { TopBar } from './components/common';
import { DbContext } from './data-hooks';
import { BrowseScreen } from './screens/inventory/Inventory';
import { FindScreen } from './screens/find/Find';
import { SeasonHomeScreen } from './screens/home/SeasonHome';
import { ListsScreen } from './screens/lists/Lists';
import { DetailScreen } from './screens/item/Detail';
import { EditorScreen } from './screens/item/Editor';
import { BackupScreen } from './screens/more/Backup';
import { CategoriesScreen } from './screens/more/Categories';
import { MoreScreen } from './screens/more/More';
import { PlacesScreen } from './screens/more/Places';
import { SeasonsScreen, TagsScreen } from './screens/more/Seasons';
import { BinEditorScreen, BinScreen } from './screens/places/Bin';
import { SpotScreen } from './screens/places/Spot';
import { DisplayScreen, DisplaysScreen } from './screens/holiday/Displays';
import { SeasonScreen } from './screens/holiday/Season';
import { SetupListScreen } from './screens/holiday/SetupList';
import { SettingsScreen } from './screens/more/Settings';
import { LabelsScreen } from './screens/labels/Labels';
import { ScanScreen } from './screens/scan/Scan';
import { SetupScreen } from './screens/Setup';
import { AppOutdated, OpenBlocked, StorageError, UpdatedElsewhere } from './screens/StorageError';
import { Shell } from './shell/Shell';
import { homeTab, useRoute, type Route, type Tab } from './shell/router';
import { setPart, usePart } from './part';

type Boot =
  | { state: 'opening' }
  | { state: 'ready'; db: InventoryDb; setup: boolean }
  | { state: 'error'; error: unknown }
  /** Another tab of the app holds the database while this one upgrades it. */
  | { state: 'blocked' }
  /** The database is newer than this copy of the app. */
  | { state: 'outdated' }
  /** A newer copy upgraded the database in another tab; this one closed its connection. */
  | { state: 'replaced' };

async function openDb(on: { blocked: () => void; replaced: () => void }): Promise<InventoryDb | 'outdated'> {
  const db = new InventoryDb();
  db.on('blocked', on.blocked);
  db.on('versionchange', () => {
    db.close();
    on.replaced();
    return false;
  });
  await db.open();
  // Checked before anything is written, so an out-of-date copy changes nothing.
  if ((await checkSchema(db)) === 'outdated') {
    db.close();
    return 'outdated';
  }
  return db;
}

/** The tab a route shows: an address without a part opens the part in use at its home. */
function tabOf(route: Route, part: ReturnType<typeof usePart>): Tab {
  if (route.screen === 'tab' && route.part === null && route.tab === 'find') return homeTab(part);
  return route.tab;
}

function Screen({ route }: { route: Route }) {
  const part = usePart();
  const routePart = route.screen === 'tab' ? route.part : null;
  // A tab address names its part: switching there (a link, Back) switches the app (F21).
  useEffect(() => {
    if (routePart) setPart(routePart);
  }, [routePart]);
  const shown = routePart ?? part;
  switch (route.screen) {
    case 'item':
      return <DetailScreen key={route.id} id={route.id} />;
    case 'edit':
      return <EditorScreen key={`edit-${route.id}`} mode="edit" id={route.id} />;
    case 'add':
      return <EditorScreen key={`add-${route.name}-${route.barcode}-${route.home}`} mode="add" name={route.name} barcode={route.barcode} home={route.home} />;
    case 'bin':
      return <BinScreen key={route.id} id={route.id} />;
    case 'bin-edit':
      return <BinEditorScreen key={`bin-edit-${route.id}`} mode="edit" id={route.id} />;
    case 'bin-add':
      return <BinEditorScreen key={`bin-add-${route.spot}-${route.area}`} mode="add" spot={route.spot} area={route.area} />;
    case 'spot':
      return <SpotScreen key={route.id} id={route.id} />;
    case 'season':
      return <SeasonScreen key={route.id} id={route.id} />;
    case 'setup':
      return <SetupListScreen key={route.id} id={route.id} />;
    case 'display':
      return <DisplayScreen key={route.id} id={route.id} />;
    case 'displays':
      return <DisplaysScreen />;
    case 'labels':
      return <LabelsScreen key={`${part}-${route.ids.join(',')}`} part={part} ids={route.ids} />;
    case 'categories':
      return <CategoriesScreen key={part} part={part} />;
    case 'places':
      return <PlacesScreen key={part} part={part} />;
    case 'seasons':
      return <SeasonsScreen />;
    case 'tags':
      return <TagsScreen key={part} part={part} />;
    case 'backup':
      return <BackupScreen />;
    case 'settings':
      return <SettingsScreen />;
    case 'tab':
      break;
  }
  switch (tabOf(route, shown)) {
    case 'season':
      return <SeasonHomeScreen />;
    case 'find':
      return <FindScreen key={`${shown}-${route.q}`} part={shown} q={route.q} />;
    case 'browse':
      return <BrowseScreen key={shown} part={shown} />;
    case 'scan':
      return <ScanScreen />;
    case 'lists':
      return <ListsScreen key={shown} part={shown} />;
    case 'more':
      return <MoreScreen key={shown} part={shown} />;
  }
}

export function App() {
  const [boot, setBoot] = useState<Boot>({ state: 'opening' });
  const part = usePart();
  // Failed opens in a row, so "Set up again" waits until Try again has failed too (finding 1).
  const [failures, setFailures] = useState(0);
  const route = useRoute();
  const openMain = () => {
    setBoot({ state: 'opening' });
    openDb({ blocked: () => setBoot({ state: 'blocked' }), replaced: () => setBoot({ state: 'replaced' }) }).then(
      async (db) => {
        setFailures(0);
        setBoot(db === 'outdated' ? { state: 'outdated' } : { state: 'ready', db, setup: !(await isSetUp(db)) });
      },
      (error: unknown) => {
        setFailures((n) => n + 1);
        setBoot({ state: 'error', error });
      },
    );
  };
  const start = openMain;
  useEffect(start, []);
  // Ask for persistent storage on every launch until granted, and again once installed (§2).
  useEffect(() => watchPersistentStorage(), []);
  // H5 spike: how long a Cloudflare Access session lasts on this phone (§12.4).
  const readyDb = boot.state === 'ready' ? boot.db : null;
  useEffect(() => (readyDb ? watchSignIn(readyDb, () => checkSignIn()) : undefined), [readyDb]);

  if (boot.state === 'error') {
    return (
      <Shell tab={route.tab}>
        <TopBar title="Inventory" subtitle="Storage unavailable" />
        <StorageError error={boot.error} onRetry={start} failures={failures} />
      </Shell>
    );
  }
  if (boot.state === 'blocked' || boot.state === 'outdated' || boot.state === 'replaced') {
    return (
      <Shell tab={route.tab}>
        <TopBar title="Inventory" subtitle={boot.state === 'blocked' ? 'Waiting for other tabs' : 'Update needed'} />
        {boot.state === 'blocked' ? <OpenBlocked /> : boot.state === 'outdated' ? <AppOutdated /> : <UpdatedElsewhere />}
      </Shell>
    );
  }
  if (boot.state === 'opening') {
    return (
      <Shell tab={route.tab}>
        <TopBar title="Inventory" subtitle="Loading…" />
        <div class="list" aria-busy="true">
          <div class="cathdr static">
            <span class="hc">Opening the inventory…</span>
          </div>
        </div>
      </Shell>
    );
  }
  if (boot.setup) {
    return (
      <DbContext.Provider value={boot.db}>
        <SetupScreen onDone={() => setBoot({ ...boot, setup: false })} />
      </DbContext.Provider>
    );
  }
  return (
    <DbContext.Provider value={boot.db}>
      <Shell tab={tabOf(route, route.screen === 'tab' ? (route.part ?? part) : part)}>
        <Screen route={route} />
      </Shell>
    </DbContext.Provider>
  );
}
