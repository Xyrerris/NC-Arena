# Piano: redesign "Scouting Card" (palette smeraldo)

Stato: **proposto, nulla implementato.** Contesto e decisioni della sessione di analisi:
[HANDOFF-redesign.md](HANDOFF-redesign.md).

## Direzione scelta

Versione B ("Scouting Card") dell'analisi del 2026-11-13, con una sola variazione: l'accento è
**verde smeraldo** al posto del ciano. Il resto resta quello del mockup B:

- righe del roster come schede con avatar tondo, CP evidenziato e mini-barre;
- ViewerCard a tutta larghezza in testa al roster;
- navigazione a tab in basso: **Arena · Collezione · Io**;
- Collezione a griglia di card con progresso;
- `/me` diventa la pagina "Io": profilo, "Aggiorna da screenshot" come azione principale, stat in
  sola lettura con barre, modifica manuale come passaggio secondario, backup come due tile.

## Palette (proposta, da misurare)

Sfondo grafite freddo, accento smeraldo. I valori vanno in `src/core/design-system/tokens.ts` e
nient'altro: nessun hex fuori da quel file (`npm run check:tokens`).

| Ruolo          | Valore    | Nota                               |
| -------------- | --------- | ---------------------------------- |
| `backdrop`     | `#0e1218` | fondo pagina e barra tab           |
| `surface`      | `#12161d` | fondo schermata                    |
| `raised`       | `#1c222c` | card                               |
| bordo card     | `#2a3340` | decorativo, non testo              |
| `accent`       | `#10b981` | smeraldo, azioni e rank            |
| `accentBright` | `#34d399` | testo accento su card scure        |
| `accentDeep`   | `#064e3b` | riempimenti tenui, avatar          |
| `onAccent`     | `#022c22` | testo su pulsante pieno            |
| `negative`     | `#e0705f` | invariato, sconfitte e distruttive |

**Punto aperto:** il verde non può più significare "vittoria" in contrapposizione all'accento,
perché ora sono lo stesso colore. Le vittorie si distinguono da etichetta e forma (V/S, non solo
colore), in linea con la regola di ridondanza non cromatica della Phase 6.
Il pavimento di contrasto AA (`text.*` ≥ 0,50 alpha) vale ancora: va rimisurato con la nuova base e
`tokens.test.ts` aggiornato.

## Fasi

Ogni fase è un commit che passa `npm run verify`. Ordine pensato per non rompere le schermate a metà.

1. **Token.** Nuova palette e, se serve, nuova scala di raggi (card 16–20). Aggiornare
   `tokens.test.ts` e la tabella dei contrasti nel commento di `tokens.ts`.
2. **Componenti base.** `Avatar` (tondo, iniziali di ripiego), `ArenaButton` con gerarchia
   (pieno / testo), `StatBar` (mini-barra). Tutti in `src/core/design-system`.
3. **Navigazione a tab.** Sostituire `SectionTabs` con una tab bar in basso (Arena, Collezione, Io)
   in `src/app/_layout.tsx`. Resta valido il vincolo: una feature non importa un'altra, compone la
   route.
4. **Roster.** `RosterRow` come scheda con avatar e barre; header ridotto (titolo, stagione, sync
   discreto); "Aggiungi giocatore" fuori dal header. Lo swipe vittoria/sconfitta e le
   `accessibilityActions` restano com'erano.
5. **ViewerCard.** A tutta larghezza, con avatar. La sparkline è condizionata a un punto aperto
   (sotto).
6. **Collezione.** Griglia a due colonne con progresso. La tap su una card apre un dettaglio con i
   pezzi e l'azione "Segna come posseduto".
7. **Io (`/me`).** Ristrutturare `ViewerScreen` e il footer di `me.tsx`: profilo, scansione in
   evidenza, stat in sola lettura, modifica manuale, backup.
8. **Rifinitura.** Font scale 200%, TalkBack, screenshot `npm run e2e`, rimozione del codice morto
   (`SectionTabs`).

## Punti aperti (⚠️ da decidere prima della fase indicata)

- ⚠️ **Sparkline (fase 5).** Nel mockup mostra l'andamento del CP, ma non risulta esistere uno
  storico dei valori nel DB. Senza dati va tolta, oppure serve prima una tabella di snapshot.
- ⚠️ **Avatar degli altri giocatori (fase 2/4).** L'endpoint avatar riguarda il viewer. Per gli altri
  restano le iniziali, a meno che il backend non li esponga.
- ⚠️ **Titoli in Cinzel (fase 1).** Il mockup usa un sans per i titoli. Decidere se Cinzel resta per
  "Arena" e i titoli di schermata o se si abbandona (e con lui un file font da 3 MB circa).
- ⚠️ **Pezzi nella Collezione (fase 6).** La griglia non mostra i singoli pezzi; il dettaglio è da
  disegnare, compresi i pezzi che richiedono una skill.
- ⚠️ **Modifica manuale (fase 7).** Passa da schermata principale a passaggio secondario: confermare
  che va bene per chi non usa la scansione.
- ⚠️ **Nomi dei campi di "Io".** Nel mockup Attacco, Difesa, Critico %, Velocità sono illustrativi:
  vanno presi da `PlayerFormScreen`.

## Vincoli del repo da rispettare

- `npm run verify` prima di ogni push; i due gate di `check:rules` non si toccano senza una prova
  propria (ADR-0006).
- Nessun hex o numero di spaziatura fuori da `tokens.ts`.
- Estensioni dei test: `.test.ts` Node, `.test.tsx` jest-expo.
- Non fare push su `claude/backend-data-management-w98hph`: Coolify lo pubblica.
- Le nuove decisioni di design meritano un ADR in `docs/DECISIONS.md`.
