# Leggere l'inventario di un avatar tramite address

Sì: lo stato di Nine Chronicles è pubblico sulla blockchain, quindi con l'address
dell'avatar si può leggere l'inventario senza autenticazione.

## Come farlo

1. **GraphQL del nodo (headless)**
   La query `stateQuery` espone il campo `avatar(avatarAddress: "0x...")`, che
   restituisce lo stato dell'avatar. Dentro ci sono l'inventario (equipaggiamenti,
   consumabili, materiali, costumi) e dati utili come livello e action point.
   Si può usare un nodo pubblico di Planetarium oppure uno proprio.

2. **Mimir** (indexer GraphQL di Planetarium)
   Permette di interrogare l'inventario per avatar address in modo più comodo,
   senza decodificare lo stato grezzo. Lo schema esatto va verificato sulla
   documentazione corrente.

3. **Stato grezzo**
   Nelle versioni recenti l'inventario è salvato a un address derivato da quello
   dell'avatar (`avatarAddress.Derive("inventory")`), separato dall'`AvatarState`.
   Con `getState` su quell'address si ottiene il valore codificato in Bencodex,
   da decodificare.

## Cosa non si può fare

Con il solo address non si può modificare nulla. Per compiere azioni (craft,
claim, ecc.) serve la chiave privata dell'agent che possiede l'avatar.

## Note

I nomi dei campi nello schema GraphQL cambiano tra le versioni del nodo: conviene
controllare lo schema dell'endpoint usato prima di scrivere le query.
