import test from 'node:test';
import assert from 'node:assert/strict';
import { setLang } from '../server/i18n.js';
import { findSubjects } from '../server/newsroom/subjects.js';
import { buildStories, factSheet } from '../server/newsroom/cluster.js';
import { fallbackArticle } from '../server/newsroom/fallback.js';

const T0 = new Date(2026, 9, 18, 15, 0).getTime();
let n = 0;
const ev = (source, kind, min, title, meta = {}) => ({ id: `${source}:t:${n++}`, source, kind, ts: T0 + min * 60e3, title, detail: kind === 'search' ? 'Google' : null, url: meta.host ? `https://${meta.host}/${n}` : null, meta });
const visit = (min, host, title) => ev('safari', 'visit', min, title, { host });

function day() {
  n = 0;
  return [
    ev('safari', 'search', 0, 'lisbon what to see', { host: 'google.com', engine: 'Google' }),
    visit(2, 'youtube.com', 'Lisbon in three days: tram 28 and Alfama - YouTube'),
    visit(9, 'youtube.com', 'A morning walk through Lisbon (4K) - YouTube'),
    visit(20, 'youtube.com', 'Gatti che suonano il piano - YouTube'),
    visit(21, 'youtube.com', 'Il miglior gol del 1990 - YouTube'),
    visit(22, 'youtube.com', 'Ricetta del risotto alla zucca - YouTube'),
    visit(30, 'chatgpt.com', 'Questions about Lisbon'),
    ev('books', 'opened', 40, 'Lisbon, a walking guide', { author: 'Ana Sousa', progress: 0.43 }),
    ev('safari', 'search', 50, 'lisbon pastel de nata', { host: 'google.com', engine: 'Google' }),
    visit(55, 'github.com', 'vitejs/vite: Next generation frontend tooling'),
  ];
}

test('subjects: one subject across the searches, a site, an assistant and a book', () => {
  const [s] = findSubjects(day());
  assert.equal(s.label, 'Lisbon');
  assert.equal(s.events.length, 6);
  assert.deepEqual([...s.places.keys()].sort(), ['books', 'chatgpt.com', 'search', 'youtube.com']);
});

test('subjects: the brand of a site, and the words every title of a site carries, are never subjects', () => {
  n = 0;
  const evs = [];
  for (let i = 0; i < 9; i++) evs.push(visit(i, 'nytimes.com', `Story number ${i} about something else - The New York Times`));
  evs.push(ev('safari', 'search', 10, 'youtube music', { host: 'google.com' }), visit(11, 'youtube.com', 'YouTube Music'), visit(12, 'reddit.com', 'YouTube is down'));
  assert.deepEqual(findSubjects(evs).map((s) => s.label), []);
});

test('subjects: a subject is one story, and its events leave the stories of the sites', () => {
  const stories = buildStories(day());
  const subject = stories.find((s) => s.kind === 'subject');
  assert.equal(subject.id, 'subject:lisbon');
  assert.equal(subject.topic, 'Lisbon');
  // what YouTube still has to tell is the rest: the cats, the goal, the risotto
  const yt = stories.find((s) => s.kind === 'site' && s.topic === 'youtube.com');
  assert.ok(yt && yt.events.every((e) => !/Lisbon/.test(e.title)));
  // the subject, not YouTube, leads
  assert.equal(stories[0].kind, 'subject');
});

test('subjects: the fact sheet tells the subject and where it went; the typesetting writes it in both languages', () => {
  for (const l of ['en', 'it']) {
    setLang(l);
    const subject = buildStories(day()).find((s) => s.kind === 'subject');
    const facts = factSheet(subject);
    assert.match(facts, /Lisbon/);
    assert.match(facts, l === 'en' ? /4 different places/ : /4 posti diversi/);
    assert.match(facts, /chatgpt\.com: [“«]Questions about Lisbon/);
    const a = fallbackArticle(subject);
    assert.ok(a.headline.includes('Lisbon'), a.headline);
    assert.ok(a.body.length >= 2);
  }
  setLang('en');
});
