# Valhalla VO2 — Il Respiro di Odino

Calcolatore per runner: VO2max (VDOT, modello Daniels–Gilbert) da una gara, prestazioni equivalenti, ritmi di allenamento per 6 metodi, tempi per ripetuta, piano di gara per un tempo obiettivo e storico locale.

Sito statico (GitHub Pages, `CNAME` → respiro-odino.nicholasrubini.it). Funziona offline come PWA.

## Struttura
- `index.html`: markup
- `css/styles.css`: stili
- `js/calc.js`: calcoli puri (nessun DOM), testati
- `js/app.js`: interfaccia, storico, condivisione, export immagini
- `sw.js`, `manifest.webmanifest`, `icons/`: PWA

## Test
```
npm test
```
Non ci sono dipendenze: basta Node ≥ 18.

Quando modifichi i file dell'app, incrementa `CACHE` in `sw.js`, così chi l'ha installata riceve l'aggiornamento.
