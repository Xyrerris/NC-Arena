# Handoff: analisi grafica e scelta del redesign

Sessione del 2026-11-13. Piano operativo: [PLAN-redesign-scouting-card.md](PLAN-redesign-scouting-card.md).

## Stato

- **Nessun codice dell'app è stato modificato.** Questo branch contiene solo i due documenti.
- La direzione è decisa: versione B "Scouting Card" con accento **smeraldo**.
- Il lavoro parte dalla fase 1 del piano (token).

## Cosa è stato fatto

1. Analisi del front-end (React Native/Expo): `tokens.ts`, `typography.ts`, `ScreenScaffold`,
   `ArenaButton`, `SegmentedTabs`, `ViewerCard`, `RosterScreen`, `RosterRow`, `CollectionRow`,
   `src/app/me.tsx`.
2. Proposte di due versioni grafiche (A "Dark Refined", B "Scouting Card").
3. Mockup di Roster, Collezione e "Aggiorna le mie stat" per entrambe. **I mockup non sono nel
   repo**: erano widget nella conversazione. La loro descrizione è nel piano; se servono come
   immagini vanno rifatti.
4. Scelta dell'utente: B, palette smeraldo al posto del ciano.

## Cosa è emerso dall'analisi

- Header del roster sovraccarico: 9 elementi prima della lista.
- Superfici quasi indistinguibili (`#07100d`, `#08120f`, `#0e1a16`), profondità solo da bordi.
- Righe senza avatar, CP in grigio a 11,5 px.
- Tutti i pulsanti sono pillole outline con la stessa gerarchia.
- Punti di forza da conservare: token centralizzati, contrasto AA, touch target 48 dp, gruppi per lo
  screen reader, `accessibilityActions` come alternativa allo swipe.

## Decisioni prese

- Versione B, tab bar in basso (Arena · Collezione · Io), Collezione a griglia, `/me` come "Io".
- Accento smeraldo; valori proposti nel piano, ancora da misurare per il contrasto.

## Aperto

Elencato nel piano, sezione "Punti aperti": sparkline senza storico dati, avatar degli altri
giocatori, Cinzel sì/no, dettaglio dei pezzi in Collezione, modifica manuale, nomi dei campi di "Io".

## Note pratiche

- Branch: `feature/design-taste-frontend-analysis-c545dd`. Il worktree della sessione è stato
  eliminato; il branch resta con i due documenti.
- La skill `design-taste-frontend` è pensata per siti web, non per React Native: è servita solo come
  riferimento di principi.
- `docs/HANDOFF.md` (Phase 5) non è stato toccato e non cita questo lavoro.
