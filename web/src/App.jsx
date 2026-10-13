import React, { useCallback, useEffect, useState } from 'react';
import { api, parseRoute, dayKey, href } from './lib.js';
import { tr } from './i18n.js';
import Masthead from './components/Masthead.jsx';
import EditionBar from './components/EditionBar.jsx';
import FrontPage from './components/FrontPage.jsx';
import ArticlePage from './components/ArticlePage.jsx';
import SectionPage from './components/SectionPage.jsx';
import Colophon from './components/Colophon.jsx';
import Newsroom from './components/Newsroom.jsx';
import EveningPage from './components/EveningPage.jsx';
import LettersPage from './components/Letters.jsx';
import ArchivePage from './components/ArchivePage.jsx';
import { InvestigationsPage, InvestigationPage } from './components/Investigations.jsx';
import { InquiryPage, EditorDeskPage } from './components/Inquiry.jsx';
import { SpotlightList, SpotlightPage } from './components/Spotlight.jsx';
import { CallsBar, CallsPage } from './components/Live.jsx';
import { FeaturePage, FeaturesList } from './components/Features.jsx';
import { SerialPage, SportPage } from './components/Games.jsx';
import Bench from './components/Bench.jsx';
import WritingRoom from './components/WritingRoom.jsx';
import Desk from './components/Desk.jsx';
import Dispatches from './components/Dispatches.jsx';
import ProofRoom from './components/ProofRoom.jsx';
import House from './components/House.jsx';

function useHashRoute() {
  const [route, setRoute] = useState(() => parseRoute(location.hash));
  useEffect(() => {
    const on = () => {
      setRoute(parseRoute(location.hash));
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}

export default function App() {
  const route = useHashRoute();
  const [edition, setEdition] = useState(null);
  const [list, setList] = useState([]);
  // the day of an edition id ("2026-10-09T18", "sera-2026-10-09"); other newsroom pages have none
  const dayOf = (id) => { const d = /^(?:sera-)?(\d{4}-\d{2}-\d{2})/.exec(id || ''); return d ? d[1] : null; };
  const [day, setDay] = useState(() => route.day || route.evening || dayOf(route.edition) || dayKey(Date.now()));
  const [evening, setEvening] = useState(null);
  const [status, setStatus] = useState(null);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState(null);
  const [loaded, setLoaded] = useState(false);

  // The current edition
  useEffect(() => {
    let alive = true;
    const page = route.room || route.house || route.dispatches || route.desk || route.inquiry || route.editorDesk || route.evening || route.letters || route.archive || route.investigations || route.investigation || route.spotlight || route.scoop || route.calls || route.feature || route.features || route.serial || route.sport;
    if (page) { setLoaded(true); return () => { alive = false; }; }
    const p = route.edition ? api(`/editions/${encodeURIComponent(route.edition)}`) : route.day ? Promise.resolve(null) : api('/editions/latest');
    p.then((e) => {
      if (!alive) return;
      if (e || route.edition || !route.day) setEdition(e);
      if (e) setDay(e.id.slice(0, 10));
      setError(null);
    })
      .catch((err) => alive && (setEdition(null), setError(route.edition ? err.message : null)))
      .finally(() => alive && setLoaded(true));
    return () => { alive = false; };
  }, [route.room, route.house, route.dispatches, route.edition, route.day, route.desk, route.evening, route.letters, route.archive, route.investigations, route.investigation, route.spotlight, route.scoop, route.calls, route.feature, route.features, route.serial, route.sport, route.inquiry, route.editorDesk]);

  useEffect(() => { if (route.day) setDay(route.day); }, [route.day]);
  useEffect(() => { if (route.evening) setDay(route.evening); }, [route.evening]);
  useEffect(() => { if (route.desk && dayOf(route.edition)) setDay(dayOf(route.edition)); }, [route.desk, route.edition]);

  // The evening edition of the day on screen (if it is out)
  const refreshEvening = useCallback(() => api(`/evening/${day}`).then(setEvening).catch(() => setEvening(null)), [day]);
  useEffect(() => { refreshEvening(); }, [refreshEvening, route.evening]);

  const refreshList = useCallback(() => api(`/editions?day=${day}`).then(setList).catch(() => setList([])), [day]);
  useEffect(() => { refreshList(); }, [refreshList]);

  const refreshStatus = useCallback((check) => api(`/status${check ? '?check=1' : ''}`).then(setStatus).catch(() => {}), []);
  useEffect(() => {
    refreshStatus(true);
    const t = setInterval(() => {
      refreshStatus(false);
      refreshList();
      refreshEvening();
      if (!location.hash || location.hash === '#/' || location.hash === '#') {
        api('/editions/latest').then((e) => e && setEdition((cur) => (cur?.createdAt === e.createdAt ? cur : e))).catch(() => {});
      }
    }, 60e3);
    return () => clearInterval(t);
  }, [refreshStatus, refreshList, refreshEvening]);

  async function printNow() {
    setPrinting(true);
    try {
      const e = await api('/print', { method: 'POST' });
      if (e) {
        setEdition(e);
        setDay(e.id.slice(0, 10));
        location.hash = href.edition(e.id);
      } else {
        setError(tr({ en: 'Nothing worth telling has happened yet this hour.', it: 'Nell\'ora corrente non è ancora successo nulla da raccontare.' }));
      }
      await refreshList();
      refreshStatus(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setPrinting(false);
    }
  }

  const article = route.article && edition?.articles.find((a) => a.id === route.article);
  // pages of their own: no timeline bar above them
  const standalone = route.house || route.dispatches || route.desk || route.inquiry || route.editorDesk || route.letters || route.archive || route.investigations || route.investigation || route.spotlight || route.scoop
    || route.calls || route.feature || route.features || route.serial || route.sport;

  // the writing room and the proof round take the whole page: nothing else on screen
  if (route.room) {
    return (
      <div className="rd-focus-page">
        {route.room === 'write' ? <WritingRoom key={route.sid || 'w'} sid={route.sid} /> : <ProofRoom key={route.sid || 'p'} sid={route.sid} />}
      </div>
    );
  }

  return (
    <div className="paper">
      <Masthead edition={route.desk || route.evening || standalone ? null : edition} evening={route.evening ? evening : null} day={day} status={status} activeSlug={route.desk || route.inquiry || route.editorDesk || route.house || route.dispatches ? 'newsroom' : route.spotlight || route.scoop ? 'spotlight' : route.letters ? 'letters' : route.features || route.feature ? 'features' : route.archive || route.investigations || route.investigation ? 'archive' : route.evening ? 'evening' : route.section} />
      {!route.calls && <CallsBar />}
      {!standalone && (
        <EditionBar day={day} list={list} current={route.evening ? evening?.id : edition?.id} onPrint={printNow} printing={printing}
          evening={evening && evening.status !== 'draft' ? evening : null}
          exportable={route.evening ? (evening ? { evening } : null) : edition && !route.article && !route.section && !route.day ? { edition } : null} />
      )}
      {!standalone && !route.evening && !route.article && evening && evening.status !== 'draft' && edition && edition.id.slice(0, 10) === evening.day && (
        <div className="evening-banner">
          <span><strong>{tr({ en: 'The evening edition is out.', it: 'È uscita l\'edizione della sera.' })}</strong> {evening.editorial.headline}</span>
          <a href={href.evening(evening.day)}>{tr({ en: 'Read', it: 'Leggi' })} →</a>
        </div>
      )}
      {error && <p className="notice" role="status">{error}</p>}
      <main>
        {route.dispatches ? (
          <Dispatches />
        ) : route.house ? (
          <House tab={route.house} />
        ) : route.inquiry ? (
          <InquiryPage key={String(route.inquiry)} id={route.inquiry === true ? null : route.inquiry} />
        ) : route.editorDesk ? (
          <EditorDeskPage key={String(route.editorDesk)} id={route.editorDesk === true ? null : route.editorDesk} />
        ) : route.desk && route.bench ? (
          <Bench key={route.edition || 'bench'} editionId={route.edition} />
        ) : route.calls ? (
          <CallsPage id={route.calls === true ? null : route.calls} />
        ) : route.feature ? (
          <FeaturePage key={route.feature} id={route.feature} />
        ) : route.features ? (
          <FeaturesList />
        ) : route.serial ? (
          <SerialPage id={route.serial === true ? null : route.serial} />
        ) : route.sport ? (
          <SportPage />
        ) : route.desk && !route.edition ? (
          <Desk />
        ) : route.desk ? (
          <Newsroom key={route.edition || 'desk'} editionId={route.edition} onPublished={() => { refreshList(); refreshStatus(false); refreshEvening(); }} />
        ) : route.letters ? (
          <LettersPage />
        ) : route.archive ? (
          <ArchivePage query={route.query} />
        ) : route.investigations ? (
          <InvestigationsPage />
        ) : route.spotlight ? (
          <SpotlightList />
        ) : route.scoop ? (
          <SpotlightPage id={route.scoop} />
        ) : route.investigation ? (
          <InvestigationPage id={route.investigation} />
        ) : route.evening ? (
          evening ? <EveningPage evening={evening} /> : loaded ? <p className="empty-text" style={{ marginTop: 40, textAlign: 'center' }}>{tr({ en: 'The evening edition is not out yet.', it: 'L\'edizione della sera non è ancora uscita.' })}</p> : null
        ) : route.section ? (
          <SectionPage day={day} slug={route.section} />
        ) : article ? (
          <ArticlePage key={`${article.id}-${route.xray ? 'x' : ''}`} edition={edition} article={article} xray={!!route.xray} />
        ) : edition && !route.day ? (
          <FrontPage edition={edition} />
        ) : loaded ? (
          <Empty day={day} list={list} onPrint={printNow} printing={printing} />
        ) : null}
      </main>
      <Colophon status={status} onCheck={() => refreshStatus(true)} />
    </div>
  );
}

function Empty({ list, onPrint, printing }) {
  return (
    <section className="empty">
      <p className="empty-title">{tr({ en: 'The presses are still.', it: 'La rotativa è ferma.' })}</p>
      <p className="empty-text">
        {list.length
          ? tr({ en: 'Pick an edition from the timeline above.', it: 'Scegli un\'edizione dalla linea del tempo qui sopra.' })
          : tr({
            en: 'No editions for this day. The Mac gathers the news every five minutes and prints an issue on the hour.',
            it: 'Nessuna edizione per questo giorno. Il Mac raccoglie le notizie ogni cinque minuti e stampa un numero allo scoccare di ogni ora.',
          })}
      </p>
      <button className="btn" onClick={onPrint} disabled={printing}>{printing ? tr({ en: 'Printing…', it: 'In stampa…' }) : tr({ en: 'Print this hour\'s edition', it: 'Stampa l\'edizione di quest\'ora' })}</button>
    </section>
  );
}
