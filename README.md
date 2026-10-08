# The Daily Mac

*«Tutte le notizie che il tuo Mac ha visto»*

Un quotidiano in stile New York Times che racconta ciò che è successo sul tuo MacBook.
Ogni ora la redazione raccoglie i segnali (Safari, Mail, Terminale, Note, Journal, Podcast, Libri),
li raggruppa in storie e un modello linguistico locale le scrive come articoli.
Il giornale è la testata, le fonti sono le sezioni, gli eventi diventano articoli.

| Fonte     | Sezione        | Cosa legge                                                          |
|-----------|----------------|---------------------------------------------------------------------|
| Safari    | Esteri         | Cronologia (solo questo Mac, non iCloud), ricerche su Google & co.  |
| Mail      | Corrispondenza | Mittente, oggetto, inviata/ricevuta. **Non** il testo delle email.  |
| Terminale | Officina       | `~/.zsh_history` / `~/.bash_history`, con i segreti oscurati        |
| Note      | Taccuino       | Note create/modificate, titolo, cartella, estratto                  |
| Journal   | Diario         | Voci del diario (sperimentale). Testo **riservato** per default     |
| Podcast   | Radio          | Episodi ascoltati, avanzamento                                      |
| Libri     | Cultura        | Libri aperti, avanzamento, passi evidenziati                        |

Tutto resta sul Mac: database in `data/`, i dati delle app sono letti da una **copia** temporanea
(mai toccati gli originali). L'unica cosa che esce è il testo inviato al tuo redattore in LAN.

## Requisiti

- macOS, **Node.js 22.13+** (`brew install node`)
- Il redattore: un server OpenAI-compatibile (llama.cpp, LM Studio, Ollama…),
  di default `http://192.168.1.20:8080/v1`. Se è spento, scrive la **tipografia automatica**
  (articoli a modelli fissi): il giornale esce comunque.

## Avvio

```bash
npm install
npm run demo      # giornale con dati inventati, per vedere com'è → http://localhost:4321
npm run probe     # controlla fonti e permessi
npm start         # il giornale vero → http://localhost:4321
```

Sviluppo con ricarica a caldo: `npm run dev` → http://localhost:5173

### Permessi (importante)

Safari, Mail, Note, Podcast, Libri e Journal stanno in cartelle protette da macOS.
Vai in **Impostazioni di Sistema → Privacy e sicurezza → Accesso completo al disco**
e abilita l'app da cui lanci `npm start` (Terminale, iTerm, VS Code…). Poi riavviala.
`npm run probe` ti dice fonte per fonte se è leggibile (✓) o bloccata (⛔).

### Terminale: orari precisi

Di default zsh scrive la cronologia senza orari e solo alla chiusura della finestra.
Per avere comandi datati al minuto aggiungi a `~/.zshrc`:

```zsh
setopt EXTENDED_HISTORY INC_APPEND_HISTORY
```

## Come funziona

```
fonti (SQLite delle app) ──► raccolta ogni 5 min ──► data/dailymac.sqlite (events)
                                                         │
                                  allo scoccare dell'ora ▼
                    cluster in storie ──► redattore LLM / tipografia ──► edizione
                                                         │
                                       React (web/) ◄────┘  API Express (server/)
```

- `server/sources/` — un file per fonte (`locate()` + `collect()`)
- `server/newsroom/cluster.js` — dagli eventi alle storie (per sito, thread, nota, libro…)
- `server/newsroom/prompts.js` — il "manuale di stile" del redattore
- `server/newsroom/fallback.js` — la tipografia automatica
- `web/` — la prima pagina, gli articoli, le sezioni, la linea del tempo delle edizioni

Al primo avvio recupera gli arretrati delle ultime 12 ore. Il pulsante **Stampa ora**
stampa subito l'edizione dell'ora in corso, che verrà ristampata in versione definitiva allo scoccare dell'ora.

## Configurazione

Copia `config.example.json` in `config.json` e modifica: indirizzo e modello del redattore,
fonti attive, privacy (`blockedDomains`, `blockedMailSenders`, `blockedNoteFolders`,
`notesIncludeSnippet`, `journalIncludeText`, `mailIncludeSummary`), articoli per edizione.

Variabili utili: `DAILYMAC_LLM_URL`, `DAILYMAC_LLM_MODEL`, `PORT`.

## Journal (sperimentale)

Apple non documenta dove l'app Journal salva le voci sul Mac. Il raccoglitore cerca da solo
database nei container con "journal" nel nome. Se non trova nulla:
`npm run probe` mostra cartelle e tabelle candidate (solo nomi, nessun contenuto) e ci dice dove guardare.
