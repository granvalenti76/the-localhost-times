import React, { useCallback, useEffect, useState } from 'react';
import { api, parseRoute, dayKey, href } from './lib.js';
import Masthead from './components/Masthead.jsx';
import EditionBar from './components/EditionBar.jsx';
import FrontPage from './components/FrontPage.jsx';
import ArticlePage from './components/ArticlePage.jsx';
import SectionPage from './components/SectionPage.jsx';
import Colophon from './components/Colophon.jsx';
import Newsroom from './components/Newsroom.jsx';
import EveningPage from './components/EveningPage.jsx';

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
  const dayOf = (id) => (id?.startsWith('sera-') ? id.slice(5) : id?.slice(0, 10));
  const [day, setDay] = useState(() => route.day || route.evening || dayOf(route.edition) || dayKey(Date.now()));
  const [evening, setEvening] = useState(null);
  const [status, setStatus] = useState(null);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState(null);
  const [loaded, setLoaded] = useState(false);

  // Edizione corrente
  useEffect(() => {
    let alive = true;
    if (route.desk || route.evening) { setLoaded(true); return () => { alive = false; }; }
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
  }, [route.edition, route.day, route.desk, route.evening]);

  useEffect(() => { if (route.day) setDay(route.day); }, [route.day]);
  useEffect(() => { if (route.evening) setDay(route.evening); }, [route.evening]);
  useEffect(() => { if (route.desk && route.edition) setDay(dayOf(route.edition)); }, [route.desk, route.edition]);

  // L'edizione della sera del giorno visualizzato (se è uscita)
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
        setError('Nell\'ora corrente non è ancora successo nulla da raccontare.');
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

  return (
    <div className="paper">
      <Masthead edition={route.desk || route.evening ? null : edition} evening={route.evening ? evening : null} day={day} status={status} activeSlug={route.desk ? 'redazione' : route.evening ? 'sera' : route.section} />
      {!route.desk && (
        <EditionBar day={day} list={list} current={route.evening ? evening?.id : edition?.id} onPrint={printNow} printing={printing}
          evening={evening && evening.status !== 'draft' ? evening : null} />
      )}
      {!route.desk && !route.evening && !route.article && evening && evening.status !== 'draft' && edition && edition.id.slice(0, 10) === evening.day && (
        <div className="evening-banner">
          <span><strong>È uscita l'edizione della sera.</strong> {evening.editorial.headline}</span>
          <a href={href.evening(evening.day)}>Leggi →</a>
        </div>
      )}
      {error && <p className="notice" role="status">{error}</p>}
      <main>
        {route.desk ? (
          <Newsroom key={route.edition || 'desk'} editionId={route.edition} onPublished={() => { refreshList(); refreshStatus(false); refreshEvening(); }} />
        ) : route.evening ? (
          evening ? <EveningPage evening={evening} /> : loaded ? <p className="empty-text" style={{ marginTop: 40, textAlign: 'center' }}>L'edizione della sera non è ancora uscita.</p> : null
        ) : route.section ? (
          <SectionPage day={day} slug={route.section} />
        ) : article ? (
          <ArticlePage edition={edition} article={article} />
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
      <p className="empty-title">La rotativa è ferma.</p>
      <p className="empty-text">
        {list.length
          ? 'Scegli un\'edizione dalla linea del tempo qui sopra.'
          : 'Nessuna edizione per questo giorno. Il Mac raccoglie le notizie ogni cinque minuti e stampa un numero allo scoccare di ogni ora.'}
      </p>
      <button className="btn" onClick={onPrint} disabled={printing}>{printing ? 'In stampa…' : 'Stampa l\'edizione di quest\'ora'}</button>
    </section>
  );
}
