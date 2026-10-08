import React, { useCallback, useEffect, useState } from 'react';
import { api, parseRoute, dayKey, href } from './lib.js';
import Masthead from './components/Masthead.jsx';
import EditionBar from './components/EditionBar.jsx';
import FrontPage from './components/FrontPage.jsx';
import ArticlePage from './components/ArticlePage.jsx';
import SectionPage from './components/SectionPage.jsx';
import Colophon from './components/Colophon.jsx';

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
  const [day, setDay] = useState(() => route.day || (route.edition ? route.edition.slice(0, 10) : dayKey(Date.now())));
  const [status, setStatus] = useState(null);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState(null);
  const [loaded, setLoaded] = useState(false);

  // Edizione corrente
  useEffect(() => {
    let alive = true;
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
  }, [route.edition, route.day]);

  useEffect(() => { if (route.day) setDay(route.day); }, [route.day]);

  const refreshList = useCallback(() => api(`/editions?day=${day}`).then(setList).catch(() => setList([])), [day]);
  useEffect(() => { refreshList(); }, [refreshList]);

  const refreshStatus = useCallback((check) => api(`/status${check ? '?check=1' : ''}`).then(setStatus).catch(() => {}), []);
  useEffect(() => {
    refreshStatus(true);
    const t = setInterval(() => {
      refreshStatus(false);
      refreshList();
      if (!location.hash || location.hash === '#/') {
        api('/editions/latest').then((e) => e && setEdition((cur) => (cur?.createdAt === e.createdAt ? cur : e))).catch(() => {});
      }
    }, 60e3);
    return () => clearInterval(t);
  }, [refreshStatus, refreshList]);

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
      <Masthead edition={edition} day={day} status={status} activeSlug={route.section} />
      <EditionBar day={day} list={list} current={edition?.id} onPrint={printNow} printing={printing} />
      {error && <p className="notice" role="status">{error}</p>}
      <main>
        {route.section ? (
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
