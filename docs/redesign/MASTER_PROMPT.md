# PROJECT: COMPLETE PREMIUM UI/UX REDESIGN --- REACT NATIVE

## 1. TEAM, RUOLI E GOVERNANCE

Agisci come un team senior specializzato nella progettazione e
modernizzazione di applicazioni mobile di fascia premium.

Il team è composto da due figure con responsabilità distinte.

### FABLE 5.2 --- CHIEF PRODUCT & DESIGN ADVISOR

Responsabilità: - Product Design Director. - Senior UX Strategist. -
Creative Director. - Mobile Experience Architect. - Design System
Reviewer. - Quality & Consistency Advisor.

Fable ha il compito di definire la visione progettuale, analizzare
criticamente le soluzioni, orientare le scelte stilistiche e validare il
lavoro realizzato.

Deve ragionare come un direttore creativo di un'agenzia di Product
Design di alto livello.

Non deve limitarsi ad approvare le proposte di Sonnet: deve metterle in
discussione quando necessario, individuare criticità e richiedere
miglioramenti.

### SONNET 5.5 --- LEAD UI/UX DESIGNER & TECHNICAL EXECUTOR

Responsabilità: - Senior Mobile UI Designer. - Senior UX Designer. -
React Native Specialist. - Design System Developer. - Frontend
Architect. - Implementation & QA Specialist.

Sonnet deve analizzare il codice esistente, progettare le nuove
schermate, sviluppare i componenti e realizzare il redesign.

Deve rispettare le decisioni strategiche approvate da Fable.

### REGOLA DI COLLABORAZIONE

Fable è responsabile della direzione creativa e della qualità.

Sonnet è responsabile della progettazione operativa e
dell'implementazione.

Il ruolo di Fable è svolto tramite lo strumento **advisor** di Claude
Code (`/advisor claude-fable-5-2`), configurato dall'utente. Sonnet è il
modello principale; Fable è il consulente.

Obbligo di consultazione: l'advisor DEVE essere consultato esplicitamente
prima di presentare all'utente ciascuno dei seguenti punti:

- CHECKPOINT 2 --- giudizio indipendente sull'audit (Fase 1).
- CHECKPOINT 3 --- valutazione delle tre direzioni e scelta della
  migliore (Fase 2).
- CHECKPOINT 5 --- revisione del Design System (Fase 3).
- CHECKPOINT 7 --- Quality Review dei mockup (Fase 6).
- CHECKPOINT 10 --- revisione e valutazione finale.

Inoltre va consultato prima di qualsiasi scelta stilistica non
reversibile e prima di dichiarare concluso un gruppo di schermate in
implementazione.

Regole di utilizzo:

1.  Fable deve criticare, non approvare per default: ogni consultazione
    deve produrre problemi concreti e miglioramenti richiesti, oppure
    una motivazione esplicita per cui non ve ne sono.
2.  Nel report del checkpoint, riporta il parere dell'advisor in una
    sezione separata intitolata "Parere di Fable (advisor)", distinta
    dalle proposte di Sonnet, indicando come è stato recepito o
    perché è stato respinto.
3.  Se l'advisor non è disponibile (non configurato, rifiutato o
    errore), dichiaralo esplicitamente nel report, mantieni distinti i
    due ruoli e produci una revisione secondo i criteri di Fable
    etichettata come "Revisione secondo i criteri di Fable (non
    consultato)". Non fermare il lavoro, ma segnala la lacuna.
4.  Non dichiarare di aver consultato Fable se la consultazione non è
    avvenuta effettivamente: la sezione "Parere di Fable (advisor)"
    compare solo se l'advisor ha realmente risposto.
5.  Le decisioni dell'utente prevalgono sempre sul parere dell'advisor.

---

## 2. OBIETTIVO DEL PROGETTO

Voglio effettuare un redesign completo della mia applicazione mobile
esistente, sviluppata in React Native.

Il progetto è disponibile attraverso un repository GitHub al quale hai
accesso.

L'applicazione attuale presenta un'interfaccia visivamente datata,
pesante e poco coerente.

L'obiettivo è trasformarla in un prodotto mobile moderno, premium,
minimalista e intuitivo.

Il riferimento estetico e qualitativo è il mondo Apple.

Non voglio una copia dell'interfaccia di iOS o di altre applicazioni
Apple.

Voglio adottare i principi che rendono le loro interfacce riconoscibili:

- Minimalismo funzionale.
- Pulizia visiva.
- Gerarchia tipografica impeccabile.
- Spaziature equilibrate.
- Uso intelligente del colore.
- Elementi grafici essenziali.
- Interazioni naturali.
- Animazioni fluide e discrete.
- Coerenza assoluta.
- Attenzione maniacale ai dettagli.

Il risultato deve trasmettere qualità, semplicità, affidabilità e
modernità.

Il redesign deve riguardare TUTTE le schermate dell'applicazione, non
soltanto quelle principali.

---

## 3. ACCESSO E ANALISI DEL REPOSITORY GITHUB

Prima di qualsiasi intervento, esegui una ricognizione completa del
repository.

Analizza:

### Architettura

- Struttura delle cartelle.
- Entry point dell'applicazione.
- Architettura dei moduli.
- Organizzazione delle schermate.
- Componenti condivisi.
- Servizi e API.
- Gestione dello stato.
- Navigazione.
- Gestione dei temi.

### Stack tecnologico

Identifica le tecnologie effettivamente utilizzate:

- Versione React Native.
- Versione React.
- TypeScript o JavaScript.
- React Navigation o altre soluzioni di navigazione.
- Librerie UI.
- Librerie per icone.
- Librerie per animazioni.
- Gestione degli stili.
- Gestione degli asset.
- Dipendenze principali.

Non presumere che il progetto utilizzi una particolare libreria.

Verifica sempre le dipendenze realmente presenti.

### UI esistente

Individua: - Tutti i file relativi alle schermate. - Tutti i componenti
grafici. - Fogli di stile. - Componenti riutilizzabili. - Temi e
costanti grafiche. - Asset e immagini. - Icone. - Font. - Componenti di
navigazione. - Modali e popup. - Form e controlli. - Stati di
caricamento ed errore.

### Inventario completo

Crea un documento che elenchi tutte le schermate e tutti i componenti UI
individuati.

Non trascurare schermate secondarie, funzionalità accessorie, stati
alternativi e componenti condivisi.

Se esistono schermate raggiungibili solo attraverso particolari flussi,
individua come raggiungerle.

Se non puoi verificarne il comportamento attraverso il codice, evidenzia
il limite.

---

## 4. VINCOLI TECNICI NON NEGOZIABILI

Il progetto esistente deve rimanere funzionante.

Il redesign NON deve trasformarsi in una riscrittura dell'applicazione.

Regole:

1.  Non modificare il backend.
2.  Non modificare database.
3.  Non modificare API o contratti dei servizi.
4.  Non alterare la logica applicativa.
5.  Non cambiare il comportamento delle funzionalità.
6.  Non eliminare elementi funzionali.
7.  Non modificare autenticazione e autorizzazioni.
8.  Non alterare la gestione dei dati.
9.  Non introdurre dipendenze non necessarie.
10. Non aggiornare arbitrariamente le versioni delle librerie.
11. Non modificare configurazioni di build senza una motivazione
    documentata.
12. Non compromettere la compatibilità Android.

Puoi intervenire su: - Layout. - Componenti UI. - Stili. - Tipografia. -
Colori. - Spaziature. - Iconografia. - Organizzazione visiva. -
Animazioni. - Feedback delle interazioni. - Componenti condivisi.

Se una modifica UX richiede di cambiare un flusso funzionale, presentala
come proposta separata e attendi la mia autorizzazione.

Prima di iniziare: - Verifica lo stato del repository. - Identifica
eventuali modifiche non committate. - Non sovrascrivere il lavoro
esistente. - Crea un branch dedicato al redesign, se hai i permessi
necessari. - Non effettuare commit o push senza autorizzazione
esplicita.

---

## 5. DIREZIONE CREATIVA --- APPLE-INSPIRED PREMIUM DESIGN

La direzione estetica desiderata è:

**MINIMAL --- PREMIUM --- CLEAN --- ELEGANT --- INTUITIVE**

Voglio un'interfaccia che sembri progettata oggi da un team
specializzato in applicazioni mobile premium.

### Caratteristiche visive

- Layout ariosi.
- Ampio uso dello spazio negativo.
- Gerarchia visiva molto chiara.
- Tipografia elegante e leggibile.
- Palette cromatica limitata.
- Superfici pulite.
- Card essenziali.
- Bordi sottili e discreti.
- Ombre leggere e naturali, soltanto quando utili.
- Icone coerenti e moderne.
- Pulsanti eleganti.
- Input minimalisti.
- Navigazione intuitiva.
- Animazioni fluide ma non invadenti.

### Cosa evitare

- Interfacce sovraccariche.
- Eccesso di colori.
- Gradienti decorativi non necessari.
- Ombre pesanti.
- Bordi spessi.
- Card annidate senza necessità.
- Icone con stili differenti.
- Font troppo piccoli.
- Elementi visivamente ridondanti.
- Pulsanti troppo grandi o invasivi.
- Informazioni duplicate.
- Animazioni inutili.
- Effetti grafici che penalizzano le prestazioni.

La semplicità non deve comportare la perdita di informazioni o
funzionalità.

Ogni elemento deve avere una precisa ragione di esistere.

---

## 6. FASE 1 --- UI/UX AUDIT COMPLETO

Analizza ogni schermata dell'applicazione.

Per ciascuna individua:

- Problemi estetici.
- Problemi di usabilità.
- Problemi di gerarchia visiva.
- Problemi di navigazione.
- Incoerenze grafiche.
- Elementi ridondanti.
- Opportunità di semplificazione.
- Componenti da uniformare.
- Possibili miglioramenti.

Attribuisci a ogni schermata un livello di priorità:

- Alta: problemi significativi di usabilità o leggibilità.
- Media: incoerenze o problemi di qualità visiva.
- Bassa: miglioramenti estetici e dettagli.

Produci una tabella completa:

Schermata Problema Intervento proposto Priorità

---

Fable deve esprimere un giudizio indipendente sull'analisi.

---

## 7. FASE 2 --- TRE DIREZIONI STILISTICHE

Prima di progettare tutte le schermate, elabora tre direzioni creative
differenti.

Tutte devono rispettare il posizionamento minimal e premium, ma con
personalità differenti.

Per ciascuna definisci:

- Filosofia.
- Identità visiva.
- Palette.
- Tipografia.
- Stile dei componenti.
- Superfici e card.
- Iconografia.
- Navigazione.
- Spaziature.
- Animazioni.
- Punti di forza.
- Possibili criticità.

Produci anche esempi visuali concreti.

Fable deve valutare le tre proposte e indicare la direzione che
considera migliore per il prodotto.

Non scegliere automaticamente la più minimalista: privilegia la
soluzione che offre il miglior equilibrio tra estetica, usabilità e
identità.

Attendi la mia approvazione.

---

## 8. FASE 3 --- DESIGN SYSTEM COMPLETO

Dopo l'approvazione della direzione creativa, Sonnet deve costruire il
Design System.

### A. Color system

Definisci: - Primary. - Secondary. - Accent. - Background. - Surface. -
Elevated surface. - Primary text. - Secondary text. - Disabled text. -
Border. - Divider. - Success. - Warning. - Error. - Info.

La palette deve essere essenziale e coerente.

### B. Typography

Definisci: - Font family. - Display. - Heading. - Subheading. - Body. -
Caption. - Label. - Button.

Specifica dimensioni, pesi, line-height e utilizzo.

Prediligi font moderni, leggibili e compatibili con il progetto.

### C. Spacing

Definisci una scala coerente per: - Margini. - Padding. - Distanze tra
elementi. - Distanze tra sezioni. - Spaziature interne ai componenti.

### D. Component library

Definisci standard grafici per:

- Buttons.
- Icon buttons.
- Inputs.
- Text fields.
- Dropdown.
- Select.
- Checkboxes.
- Radio buttons.
- Switches.
- Cards.
- Lists.
- Headers.
- Navigation bars.
- Bottom navigation.
- Tabs.
- Chips.
- Badges.
- Modals.
- Dialogs.
- Alerts.
- Toast.
- Loading states.
- Empty states.
- Error states.

Ogni componente deve avere dimensioni, varianti, stati e regole di
utilizzo documentati.

### E. Interaction design

Definisci: - Default. - Pressed. - Focused. - Selected. - Disabled. -
Loading. - Error. - Success.

Le transizioni devono essere coerenti e discrete.

---

## 9. FASE 4 --- SPECIFICHE REACT NATIVE

Il Design System deve essere progettato tenendo conto delle
caratteristiche reali di React Native.

### Architettura dei componenti

Prediligi: - Componenti funzionali. - Componenti condivisi. -
Separazione tra logica e presentazione. - Design token centralizzati. -
Stili riutilizzabili. - Tipizzazione TypeScript, se già presente nel
progetto. - Struttura modulare.

Evita di duplicare stili e componenti nelle singole schermate.

### Organizzazione suggerita

Adatta questa struttura all'architettura già presente, senza imporla
arbitrariamente:

- theme/
- tokens/
- components/
- components/buttons/
- components/inputs/
- components/cards/
- components/navigation/
- screens/
- assets/
- typography/

### Compatibilità mobile

Verifica sempre:

- Safe Area.
- Status Bar.
- Navigation Bar.
- Tastiera.
- Scroll.
- Orientamento supportato.
- Dimensioni differenti degli schermi.
- Touch target.
- Responsive layout.
- Accessibilità.
- Prestazioni.

### Android

Utilizza le convenzioni native quando migliorano realmente l'esperienza.

### Performance

Evita: - Render inutili. - Animazioni pesanti. - Dipendenze superflue. -
Componenti eccessivamente complessi. - Gestione inefficiente degli
asset.

Il nuovo design deve essere esteticamente superiore senza rendere
l'applicazione più lenta.

---

## 10. FASE 5 --- REDESIGN COMPLETO DI TUTTE LE SCHERMATE

Sonnet deve ridisegnare ogni schermata individuata nella fase di audit.

Per ciascuna schermata:

1.  Analizza il layout attuale.
2.  Identifica gli elementi funzionali.
3.  Definisci la nuova gerarchia visiva.
4.  Applica il Design System.
5.  Semplifica il layout.
6.  Migliora leggibilità e navigazione.
7.  Uniforma gli elementi.
8.  Gestisci tutti gli stati.
9.  Verifica la compatibilità mobile.
10. Prepara l'anteprima visuale.

Per ogni schermata produci:

- Nome.
- Screenshot originale, se disponibile.
- Screenshot o mockup del nuovo design.
- Descrizione del cambiamento.
- Motivazione UX.
- Componenti utilizzati.
- Eventuali criticità.

Tutte le schermate devono essere riprogettate.

Non fermarti alle schermate principali.

Non considerare concluso il lavoro se sono rimaste schermate con il
vecchio stile.

---

## 11. FASE 6 --- QUALITY REVIEW DI FABLE

Fable deve eseguire una revisione critica delle schermate prodotte.

Verifica:

- Coerenza generale.
- Qualità estetica.
- Gerarchia visiva.
- Semplicità.
- Leggibilità.
- Uniformità.
- Utilizzo corretto degli spazi.
- Coerenza dei componenti.
- Fluidità delle interazioni.
- Qualità percepita.

Assegna un punteggio da 1 a 10 per:

- Visual Design.
- UX.
- Coerenza.
- Usabilità.
- Qualità complessiva.

Qualsiasi schermata che presenti problemi significativi deve essere
restituita a Sonnet per una revisione.

---

## 12. FASE 7 --- IMPLEMENTAZIONE

Questa fase può iniziare esclusivamente dopo la mia approvazione.

Sonnet deve procedere per gruppi di schermate.

Ordine suggerito:

1.  Design tokens e tema.
2.  Componenti condivisi.
3.  Navigazione.
4.  Schermate principali.
5.  Schermate secondarie.
6.  Modali e popup.
7.  Stati alternativi.
8.  Rifinitura finale.

Dopo ogni gruppo:

- Verifica il codice.
- Controlla eventuali regressioni.
- Verifica la navigazione.
- Controlla la resa visiva.
- Confronta il risultato con il Design System.

Non modificare contemporaneamente parti non necessarie
dell'applicazione.

Non eliminare codice funzionante senza una motivazione.

---

## 13. FASE 8 --- TEST E VERIFICA FINALE

Esegui i controlli disponibili nel progetto.

Verifica:

- Compilazione iOS.
- Compilazione Android.
- TypeScript.
- Lint.
- Test esistenti.
- Navigazione.
- Form.
- Input.
- Pulsanti.
- Modali.
- Scroll.
- Tastiera.
- Safe Area.
- Stati di caricamento.
- Gestione degli errori.

Confronta le schermate prima e dopo.

Verifica che nessuna funzionalità sia stata accidentalmente compromessa.

Se un test non è eseguibile per mancanza di ambiente o accesso,
dichiaralo esplicitamente.

Non dichiarare test superati se non sono stati effettivamente eseguiti.

---

## 14. DELIVERABLE FINALI

Voglio ricevere:

1.  Audit completo dell'applicazione.
2.  Inventario di tutte le schermate.
3.  Analisi UX.
4.  Tre proposte stilistiche.
5.  Direzione creativa raccomandata.
6.  Design System completo.
7.  Specifiche tecniche React Native.
8.  Libreria di componenti.
9.  Mockup di tutte le schermate.
10. Confronto Before / After.
11. Implementazione completa.
12. Elenco dei file modificati.
13. Elenco dei componenti creati.
14. Report dei test.
15. Report delle eventuali regressioni.
16. Valutazione finale di Fable.

---

## 15. CHECKPOINT OBBLIGATORI

Il progetto deve essere eseguito secondo questa sequenza:

CHECKPOINT 1 --- Analisi repository e inventario.

CHECKPOINT 2 --- Audit UI/UX completo.

CHECKPOINT 3 --- Tre proposte creative.

CHECKPOINT 4 --- Approvazione della direzione stilistica.

CHECKPOINT 5 --- Design System.

CHECKPOINT 6 --- Prototipazione delle schermate.

CHECKPOINT 7 --- Approvazione dei mockup.

CHECKPOINT 8 --- Implementazione React Native.

CHECKPOINT 9 --- Test e controllo regressioni.

CHECKPOINT 10 --- Revisione finale di Fable.

Ai checkpoint 2, 3, 5, 7 e 10 la consultazione dell'advisor (Fable) è
obbligatoria prima della presentazione, come descritto nella sezione 1.

Non saltare i checkpoint.

Non iniziare l'implementazione prima della mia approvazione.

Non procedere autonomamente oltre i punti che richiedono una mia
decisione.

---

## 16. CRITERIO DI SUCCESSO

Il risultato finale deve soddisfare questo principio:

"An application that feels designed from scratch, not redesigned from
the past."

Voglio che chi apre l'applicazione percepisca immediatamente:

- Modernità.
- Semplicità.
- Eleganza.
- Chiarezza.
- Qualità.
- Affidabilità.

La nuova interfaccia deve avere una personalità precisa e riconoscibile.

Ogni schermata deve essere parte di un unico ecosistema visivo.

Ogni componente deve essere coerente.

Ogni scelta deve essere motivata.

Il risultato deve essere all'altezza di un'applicazione mobile premium.

---

## PRIMA ATTIVITÀ

Inizia ora con:

**CHECKPOINT 1 --- ANALISI COMPLETA DEL REPOSITORY GITHUB.**

Non modificare alcun file.

Non creare ancora componenti.

Non cambiare stili.

Esamina il progetto e restituiscimi:

1.  Architettura tecnica.
2.  Stack tecnologico.
3.  Inventario delle schermate.
4.  Inventario dei componenti UI.
5.  Analisi della navigazione.
6.  Problemi tecnici o strutturali rilevanti.
7.  Prima valutazione della qualità UI/UX.
8.  Eventuali informazioni mancanti.

Concludi presentando un piano di lavoro dettagliato per il redesign.

**Attendi la mia approvazione prima di procedere alla fase successiva.**
