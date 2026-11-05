import { useEffect, type ReactNode } from 'react';
import type { ApiError } from './api.ts';
import { SaveIndicator } from './components.tsx';
import { BedsPage } from './pages/Beds.tsx';
import { DecorPage } from './pages/Decor.tsx';
import { FilesPage } from './pages/Files.tsx';
import { FlowersPage } from './pages/Flowers.tsx';
import { HomePage } from './pages/Home.tsx';
import { MusicPage } from './pages/Music.tsx';
import { PublishPage } from './pages/Publish.tsx';
import { useRoute } from './router.ts';
import { loadStudio, useStudio } from './store.ts';

const TABS = [
  { path: '', label: 'Home' },
  { path: 'music', label: 'Music' },
  { path: 'beds', label: 'Beds' },
  { path: 'flowers', label: 'Flowers' },
  { path: 'decor', label: 'Decor' },
  { path: 'files', label: 'Files' },
  { path: 'publish', label: 'Publish' },
] as const;

export function App() {
  const status = useStudio((s) => s.status);
  const fatal = useStudio((s) => s.fatal);
  const route = useRoute();

  useEffect(() => {
    void loadStudio();
  }, []);

  if (fatal) {
    return (
      <Shell>
        <Locked error={fatal} onRetry={() => void loadStudio()} />
      </Shell>
    );
  }
  if (!status) {
    return (
      <Shell>
        <p className="studio-loading">Opening the Studio…</p>
      </Shell>
    );
  }

  const [section = '', detail = null] = route;
  const ready = status.database.ok;
  let page: ReactNode;
  if (!ready || section === '') page = <HomePage />;
  else if (section === 'music') page = <MusicPage songId={detail} />;
  else if (section === 'beds') page = <BedsPage bedId={detail} />;
  else if (section === 'flowers') page = <FlowersPage songId={detail} />;
  else if (section === 'decor') page = <DecorPage />;
  else if (section === 'files') page = <FilesPage />;
  else if (section === 'publish') page = <PublishPage />;
  else page = <HomePage />;

  return (
    <Shell
      email={status.email}
      gardenUrl={status.gardenUrl}
      section={ready ? section : ''}
      showTabs={ready}
      unpublished={status.draft?.changes ?? 0}
    >
      {page}
    </Shell>
  );
}

function Shell({
  email,
  gardenUrl,
  children,
  section = '',
  showTabs = false,
  unpublished = 0,
}: {
  email?: string;
  gardenUrl?: string | null;
  children?: ReactNode;
  section?: string;
  showTabs?: boolean;
  unpublished?: number;
}) {
  return (
    <div className="studio">
      <header className="studio-bar">
        <a className="studio-bar__brand" href="#/">
          <span className="studio-logo">SKAR’S ELYSIUM</span>
          <span className="studio-tag">STUDIO</span>
        </a>
        <div className="studio-bar__side">
          <SaveIndicator />
          {showTabs && unpublished > 0 && section !== 'publish' && (
            <a className="btn btn--small" href="#/publish">
              Review & publish
            </a>
          )}
          {email && (
            <span className="studio-bar__email" title="Signed in with Cloudflare Access">
              {email}
            </span>
          )}
          {gardenUrl && (
            <a className="btn btn--ghost btn--small" href={gardenUrl} target="_blank" rel="noopener">
              Open garden ↗
            </a>
          )}
        </div>
      </header>
      {showTabs && (
        <nav className="tabs" aria-label="Studio sections">
          {TABS.map((tab) => (
            <a
              key={tab.path}
              className={`tabs__item${section === tab.path ? ' tabs__item--on' : ''}`}
              href={`#/${tab.path}`}
              aria-current={section === tab.path ? 'page' : undefined}
            >
              {tab.label}
              {tab.path === 'publish' && unpublished > 0 && (
                <span className="tabs__count" aria-label={`${unpublished} unpublished changes`}>
                  {unpublished}
                </span>
              )}
            </a>
          ))}
        </nav>
      )}
      <div className="greek-band" aria-hidden="true" />
      <main className="studio-main">{children}</main>
    </div>
  );
}

function Locked({ error, onRetry }: { error: ApiError; onRetry: () => void }) {
  const expired = error.code === 'auth' && error.status === 0;
  const title = expired
    ? 'Sign-in expired'
    : error.status === 403
      ? 'Not allowed'
      : error.code === 'auth'
        ? 'The Studio is locked'
        : 'Studio unavailable';
  return (
    <section className="card card--alert" role="alert">
      <h1 className="card__title">{title}</h1>
      <p>{error.message}</p>
      {error.status === 500 && error.code === 'auth' && <p className="muted">Finish “Lock the Studio” in DEPLOY.md, then reload.</p>}
      <div className="row">
        {expired ? (
          <button type="button" className="btn" onClick={() => location.reload()}>
            Reload and sign in
          </button>
        ) : (
          <button type="button" className="btn" onClick={onRetry}>
            Try again
          </button>
        )}
      </div>
    </section>
  );
}
