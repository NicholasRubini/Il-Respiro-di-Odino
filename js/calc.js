// ============================================
// VALHALLA VO2 — Calcoli puri (nessuna dipendenza dal DOM)
// Usabile nel browser (window.Calc) e in Node (module.exports) per i test.
// ============================================

(function (root) {
    'use strict';

    const METERS_PER_MILE = 1609.344;

    const DISTANCES = [
        { name: '1 miglio', short: '1 mi', meters: METERS_PER_MILE },
        { name: '3000m', short: '3 km', meters: 3000 },
        { name: '5 km', short: '5 km', meters: 5000 },
        { name: '10 km', short: '10 km', meters: 10000 },
        { name: '10 miglia', short: '10 mi', meters: 16093.44 },
        { name: 'Mezza maratona', short: 'Mezza', meters: 21097.5 },
        { name: 'Maratona', short: 'Maratona', meters: 42195 }
    ];

    const VO2MAX_LEVELS = [
        { min: 0, max: 30, title: 'Principiante', description: 'Inizia il tuo viaggio verso Valhalla' },
        { min: 30, max: 38, title: 'Novizio', description: 'I primi passi del guerriero' },
        { min: 38, max: 45, title: 'Corridore Ricreativo', description: 'Il sentiero si fa più chiaro' },
        { min: 45, max: 52, title: 'Corridore Intermedio', description: 'Forza e resistenza crescono' },
        { min: 52, max: 58, title: 'Corridore Avanzato', description: 'Il cuore di un vero guerriero' },
        { min: 58, max: 65, title: 'Atleta Competitivo', description: 'Degno del banchetto di Odino' },
        { min: 65, max: 72, title: 'Atleta d\'Élite', description: 'Tra i migliori del Midgard' },
        { min: 72, max: 80, title: 'Élite Mondiale', description: 'Leggenda vivente' },
        { min: 80, max: Infinity, title: 'Campione Olimpico', description: 'Gli dei ti osservano' }
    ];

    // Scala della barra livello: estremi e tacche mostrate
    const LEVEL_SCALE = { min: 30, max: 80, ticks: [30, 40, 50, 60, 70, 80] };

    // Due tipi di zona:
    // - percent: intensità in % del VO2max (costo di ossigeno), come nel modello di Daniels.
    //   ref (opzionale) = intensità "canonica" usata per i tempi di ripetuta; default: punto medio.
    // - pace(ctx): regole originali dell'autore basate sui ritmi gara. ctx.race(m) = ritmo gara
    //   previsto (s/km) sulla distanza m, ctx.mp = ritmo maratona. Restituisce { fast, slow, open? }.
    const PER_MILE = 1000 / METERS_PER_MILE; // secondi/miglio → secondi/km

    const TRAINING_ZONES = {
        daniels: {
            name: 'Jack Daniels',
            note: 'Daniels\' Running Formula. E, T, I, R in % del VO2max; M è il ritmo maratona previsto dal tuo VDOT, come nelle tabelle originali.',
            zones: [
                { name: 'Easy (E)', percent: [59, 74], description: 'Corsa facile e recupero attivo. Dovresti poter conversare senza problemi.', workout: 'Corsa continua 30-90 min. Anche il lungo si corre a questo ritmo.', focus: 'recovery' },
                { name: 'Marathon (M)', basis: 'Ritmo maratona previsto', pace: (c) => ({ fast: c.mp, slow: c.mp }), description: 'Ritmo maratona. Concentrazione richiesta ma gestibile.', workout: 'Porzioni a ritmo M all\'interno del lungo, fino a ~110 min totali a M.', focus: 'endurance' },
                { name: 'Threshold (T)', percent: [83, 88], ref: 88, description: 'Soglia lattacida. "Comfortably hard": impegnativo ma controllato, sostenibile per circa un\'ora in gara.', workout: 'Tempo run 20 min continui, o cruise intervals 3-5×1.6km con 1 min di recupero.', focus: 'threshold' },
                { name: 'Interval (I)', percent: [95, 100], ref: 97.5, description: 'Massimo consumo di ossigeno. Respirazione intensa, alta concentrazione.', workout: 'Intervalli 3-5 min (800-1200m) con recupero jog di durata simile.', focus: 'vo2max' },
                { name: 'Repetition (R)', percent: [105, 110], ref: 105, maxRep: 800, description: 'Velocità ed economia di corsa. Circa il ritmo gara del miglio.', workout: 'Ripetute brevi 200-400m con recupero completo.', focus: 'speed' }
            ]
        },
        pfitzinger: {
            name: 'Pete Pfitzinger',
            note: 'Advanced Marathoning (4ª ed.) / Faster Road Racing. Soglia dal sistema "LT pace" di Pfitzinger (ritmo di una gara da 45–60 min), fondi e lunghi come % del ritmo maratona. Pfitzinger prescrive anche la FC: la trovi aprendo ogni zona.',
            zones: [
                { name: 'Recovery', basis: 'Più lento del General Aerobic', hr: '< 76% FCmax · < 70% FC di riserva', pace: (c) => ({ slow: c.mp * 1.25, fast: c.mp * 1.25, open: 'slower' }), description: 'Corsa di recupero dopo le sedute dure. Il libro la definisce solo con la FC: il ritmo è quello che ti tiene sotto il limite, anche molto lento.', workout: '6-11 km (4-7 miglia) il giorno dopo un lavoro di qualità.', focus: 'recovery' },
                { name: 'General Aerobic', basis: 'Ritmo maratona +15–25%', hr: '70–81% FCmax · 62–75% FC di riserva', pace: (c) => ({ fast: c.mp * 1.15, slow: c.mp * 1.25 }), description: 'Corsa aerobica quotidiana: costruisce volume e capillarizzazione senza affaticare.', workout: 'Fino a ~16 km (10 miglia), a volte con 8-10×100m strides.', focus: 'endurance' },
                { name: 'Endurance', basis: 'Lunghi e medio-lunghi · MP +10–20%', hr: '74–84% FCmax · 65–78% FC di riserva', pace: (c) => ({ fast: c.mp * 1.10, slow: c.mp * 1.20 }), description: 'Lunghi e medio-lunghi. Parti sul lato lento e chiudi su quello veloce.', workout: 'Medio-lungo 18-24 km (11-15 miglia); lungo da 26 km (16 miglia) in su.', focus: 'endurance' },
                { name: 'Marathon Pace', basis: 'Ritmo maratona (obiettivo)', hr: '79–88% FCmax · 73–84% FC di riserva', pace: (c) => ({ fast: c.mp, slow: c.mp }), description: 'Il ritmo gara della maratona. Nel libro è il ritmo obiettivo: usa la modalità Obiettivo Tempo sulla maratona.', workout: 'Porzioni a ritmo maratona dentro un lungo (es. 26 km con 19 km a MP).', focus: 'endurance' },
                { name: 'Lactate Threshold', basis: 'Ritmo di una gara da 45–60 min', hr: '82–91% FCmax · 77–88% FC di riserva', pace: (c) => ({ fast: c.dur(45 * 60), slow: c.dur(60 * 60) }), description: 'Il ritmo che reggi in gara per circa un\'ora. Per atleti veloci ≈ ritmo 15 km–mezza, per chi corre i 10 km in 50-65 min ≈ ritmo 10 km.', workout: 'Tempo run: 20-45 min continui a LT (4ª ed.: prescritti a tempo), oppure LT intervals.', focus: 'threshold' },
                { name: 'VO2max', basis: 'Ritmo gara 3 km – 5 km', hr: '93–95% FCmax · 91–94% FC di riserva', pace: (c) => ({ fast: c.race(3000), slow: c.race(5000) }), description: 'Potenza aerobica massima. Nei piani maratona Pfitzinger punta al lato del ritmo 5 km; ripetute brevi verso il lato 3 km.', workout: 'Ripetute 600-1600m (2-6 min), 5-8 km totali, recupero jog 50-90% del tempo di lavoro.', focus: 'vo2max' },
                { name: 'Speed', basis: 'Più veloce del ritmo VO2max', hr: 'FC non indicativa', pace: (c) => ({ fast: c.race(3000), slow: c.race(3000), open: 'faster' }), maxRep: 200, description: 'Rapidità e meccanica: veloce ma rilassato, mai uno sprint massimale.', workout: 'Strides 8-10×100m a fine corsa aerobica, recupero completo.', focus: 'speed' }
            ]
        },
        hansons: {
            name: 'Hansons',
            note: 'Hansons Marathon Method. Tutti i ritmi derivano dal ritmo maratona obiettivo: usa la modalità "Obiettivo Tempo" sulla maratona per avere i ritmi del tuo piano.',
            zones: [
                { name: 'Easy', basis: 'Ritmo maratona +1–2 min/miglio', pace: (c) => ({ fast: c.mp + 60 * PER_MILE, slow: c.mp + 120 * PER_MILE }), description: 'Facile vero. Nel metodo Hansons "easy" significa davvero easy: è la maggior parte del volume.', workout: 'Corsa quotidiana. Il lungo (max ~26 km) si corre in questo range, sul lato veloce.', focus: 'recovery' },
                { name: 'Tempo (Marathon Pace)', basis: 'Ritmo maratona obiettivo', pace: (c) => ({ fast: c.mp, slow: c.mp }), description: 'Nel metodo Hansons il tempo run È il ritmo maratona: serve a memorizzarlo nella fatica.', workout: 'Da 8 fino a ~16 km continui a ritmo maratona.', focus: 'threshold' },
                { name: 'Strength', basis: 'Ritmo maratona −10 s/miglio', pace: (c) => ({ fast: c.mp - 10 * PER_MILE, slow: c.mp - 10 * PER_MILE }), description: 'Ripetute lunghe appena più veloci del ritmo gara. Resistenza specifica.', workout: '6×1.6 km, 4×2.4 km, 3×3.2 km con recupero jog.', focus: 'vo2max' },
                { name: 'Speed', basis: 'Ritmo gara 5 km – 10 km', pace: (c) => ({ fast: c.race(5000), slow: c.race(10000) }), description: 'Potenza aerobica nella prima metà del piano.', workout: '12×400m, 6×800m, 4×1200m con recupero jog.', focus: 'speed' }
            ]
        }
    };

    const REP_DISTANCES = [200, 400, 800, 1000, 1600];

    // ============================================
    // PARSING E FORMATTAZIONE
    // ============================================

    function toMeters(distance, unit) {
        switch (unit) {
            case 'mi': return distance * METERS_PER_MILE;
            case 'm': return distance;
            default: return distance * 1000;
        }
    }

    function parseDistance(str) {
        if (typeof str !== 'string') return NaN;
        const cleaned = str.trim().replace(',', '.');
        if (!/^\d*\.?\d+$/.test(cleaned)) return NaN;
        return parseFloat(cleaned);
    }

    // Accetta: 1:30:00, 45:30, 45.30, 45,30, 45'30", 1h30m, 1h 30' 15", 45 (minuti).
    // Restituisce i secondi totali oppure null se il formato non è valido.
    function parseTime(input) {
        if (typeof input !== 'string') return null;
        const str = input.trim().toLowerCase().replace(/\s+/g, ' ');
        if (!str) return null;

        // Formato con unità esplicite (h / m, min, ' / s, sec, ")
        const unitMatch = str.match(/^(?:(\d+)\s*h)?\s*(?:(\d+)\s*(?:min|m|'|’))?\s*(?:(\d+)\s*(?:sec|s|"|”|''))?$/);
        if (unitMatch && /[hms'’"”]/.test(str)) {
            const h = parseInt(unitMatch[1] || '0', 10);
            const m = parseInt(unitMatch[2] || '0', 10);
            const s = parseInt(unitMatch[3] || '0', 10);
            if ((unitMatch[1] && (m >= 60)) || s >= 60) return null;
            const total = h * 3600 + m * 60 + s;
            return total > 0 ? total : null;
        }

        // Formato a separatori (: . , spazio)
        if (!/^\d+(?:[:.,' ]\d+){0,2}$/.test(str)) return null;
        const parts = str.split(/[:.,' ]/).map(p => parseInt(p, 10));
        let total;
        if (parts.length === 3) {
            if (parts[1] >= 60 || parts[2] >= 60) return null;
            total = parts[0] * 3600 + parts[1] * 60 + parts[2];
        } else if (parts.length === 2) {
            if (parts[1] >= 60) return null;
            total = parts[0] * 60 + parts[1];
        } else {
            total = parts[0] * 60; // numero singolo = minuti
        }
        return total > 0 ? total : null;
    }

    function pad2(n) {
        return n.toString().padStart(2, '0');
    }

    function formatTime(totalSeconds) {
        if (!isFinite(totalSeconds) || totalSeconds <= 0) return '--:--';
        const r = Math.round(totalSeconds);
        const h = Math.floor(r / 3600);
        const m = Math.floor((r % 3600) / 60);
        const s = r % 60;
        return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
    }

    // Tempi brevi (ripetute): sotto i 60s mostra 45" invece di 0:45
    function formatSplit(totalSeconds) {
        if (!isFinite(totalSeconds) || totalSeconds <= 0) return '--';
        if (totalSeconds < 60) return `${Math.round(totalSeconds)}"`;
        return formatTime(totalSeconds);
    }

    const PACE_FORMATS = {
        km: { factor: 1, suffix: '/km' },
        mi: { factor: METERS_PER_MILE / 1000, suffix: '/mi' },
        400: { factor: 0.4, suffix: '' },
        200: { factor: 0.2, suffix: '' }
    };

    function formatPace(secondsPerKm, format) {
        if (!isFinite(secondsPerKm) || secondsPerKm <= 0) return '--:--';
        const f = PACE_FORMATS[format] || PACE_FORMATS.km;
        const r = Math.round(secondsPerKm * f.factor);
        return `${Math.floor(r / 60)}:${pad2(r % 60)}${f.suffix}`;
    }

    function formatPaceRange(slowPace, fastPace, format) {
        // Mostra sempre prima il ritmo più veloce (numero più basso)
        return `${formatPace(fastPace, format)} – ${formatPace(slowPace, format)}`;
    }

    function formatSpeedKmh(secondsPerKm) {
        return (3600 / secondsPerKm).toFixed(1);
    }

    // ============================================
    // MODELLO DANIELS-GILBERT
    // ============================================

    // Costo di ossigeno (ml/kg/min) a una velocità v (m/min)
    function oxygenCost(v) {
        return -4.60 + 0.182258 * v + 0.000104 * v * v;
    }

    // Frazione di VO2max sostenibile per una durata t (min)
    function sustainableFraction(tMinutes) {
        return 0.8 + 0.1894393 * Math.exp(-0.012778 * tMinutes) + 0.2989558 * Math.exp(-0.1932605 * tMinutes);
    }

    // Velocità (m/min) il cui costo di ossigeno è vo2
    function velocityForVO2(vo2) {
        const a = 0.000104, b = 0.182258, c = -4.60 - vo2;
        const disc = b * b - 4 * a * c;
        if (disc < 0) return NaN;
        return (-b + Math.sqrt(disc)) / (2 * a);
    }

    // VDOT (VO2max "di prestazione") da una gara. Non arrotondato.
    function calculateVO2max(distanceMeters, timeSeconds) {
        const t = timeSeconds / 60;
        const v = distanceMeters / t;
        return oxygenCost(v) / sustainableFraction(t);
    }

    // Tempo gara previsto (s): inversione numerica esatta della formula di Daniels,
    // quindi coerente con calculateVO2max (la distanza inserita restituisce il tempo inserito).
    function calculateRaceTime(vo2max, distanceMeters) {
        if (!(vo2max > 0) || !(distanceMeters > 0)) return NaN;
        // Limiti di ricerca: da 1:00/km a 60:00/km
        let lo = distanceMeters * 0.06;
        let hi = distanceMeters * 3.6;
        if (calculateVO2max(distanceMeters, hi) > vo2max) return NaN;
        for (let i = 0; i < 80; i++) {
            const mid = (lo + hi) / 2;
            if (calculateVO2max(distanceMeters, mid) > vo2max) lo = mid;
            else hi = mid;
        }
        return (lo + hi) / 2;
    }

    // Ritmo gara (s/km) per una gara che dura `seconds`: cerca la distanza corrispondente
    function paceForDuration(vo2max, seconds) {
        let lo = 500, hi = 100000;
        if (!(calculateRaceTime(vo2max, hi) > seconds)) return NaN;
        for (let i = 0; i < 60; i++) {
            const mid = (lo + hi) / 2;
            if (calculateRaceTime(vo2max, mid) < seconds) lo = mid; else hi = mid;
        }
        const d = (lo + hi) / 2;
        return seconds / (d / 1000);
    }

    // Ritmo (s/km) a una data % del VO2max
    function calculateTrainingPace(vo2max, percentVO2max) {
        const v = velocityForVO2(vo2max * percentVO2max / 100);
        if (!(v > 0)) return null;
        return 60000 / v;
    }

    function getZonePaces(vo2max, zone) {
        if (typeof zone.pace === 'function') {
            const race = (m) => calculateRaceTime(vo2max, m) / (m / 1000);
            const dur = (seconds) => paceForDuration(vo2max, seconds);
            const p = zone.pace({ race, dur, mp: race(42195) });
            if (!(p.fast > 0) || !(p.slow > 0)) return null;
            const ref = p.open === 'slower' ? p.slow : (p.open === 'faster' ? p.fast : (p.fast + p.slow) / 2);
            return { fast: p.fast, slow: p.slow, open: p.open || null, ref, basis: zone.basis };
        }
        const slow = calculateTrainingPace(vo2max, zone.percent[0]);
        const fast = calculateTrainingPace(vo2max, zone.percent[1]);
        const refPct = zone.ref || (zone.percent[0] + zone.percent[1]) / 2;
        const ref = calculateTrainingPace(vo2max, refPct);
        if (!(slow && fast && ref)) return null;
        return { fast, slow, open: null, ref, basis: `${zone.percent[0]}–${zone.percent[1]}% VO2max` };
    }

    // Ritmo di una zona: intervallo, valore singolo o limite aperto (≥ / ≤)
    function formatZonePace(p, format) {
        if (p.open === 'slower') return `≥ ${formatPace(p.slow, format)}`;
        if (p.open === 'faster') return `≤ ${formatPace(p.fast, format)}`;
        if (Math.abs(p.slow - p.fast) < 0.5) return formatPace(p.fast, format);
        return formatPaceRange(p.slow, p.fast, format);
    }

    function formatZoneSpeed(p) {
        if (p.open === 'slower') return `≤ ${formatSpeedKmh(p.slow)}`;
        if (p.open === 'faster') return `≥ ${formatSpeedKmh(p.fast)}`;
        if (Math.abs(p.slow - p.fast) < 0.5) return formatSpeedKmh(p.fast);
        return `${formatSpeedKmh(p.slow)}–${formatSpeedKmh(p.fast)}`;
    }

    // ============================================
    // LIVELLI, PREVISIONI, SPLIT
    // ============================================

    function getVO2maxLevel(vo2max) {
        return VO2MAX_LEVELS.find(l => vo2max >= l.min && vo2max < l.max) || VO2MAX_LEVELS[VO2MAX_LEVELS.length - 1];
    }

    function levelScalePercent(vo2max) {
        const { min, max } = LEVEL_SCALE;
        return Math.max(0, Math.min(100, ((vo2max - min) / (max - min)) * 100));
    }

    function isSameDistance(a, b) {
        return a > 0 && b > 0 && Math.abs(a - b) / b < 0.005;
    }

    function equivalentPerformances(vo2max, distances) {
        return (distances || DISTANCES).map(d => {
            const time = calculateRaceTime(vo2max, d.meters);
            return Object.assign({}, d, { time, pace: time / (d.meters / 1000) });
        });
    }

    // Tabella di passaggio a ritmo costante. step in metri.
    function evenSplits(totalSeconds, distanceMeters, step) {
        if (!step) step = distanceMeters <= 10000 ? 1000 : 5000;
        const pace = totalSeconds / distanceMeters;
        const splits = [];
        for (let d = step; d < distanceMeters - 1e-6; d += step) {
            splits.push({ meters: d, time: d * pace });
        }
        // Checkpoint notevoli per le gare lunghe
        if (distanceMeters > 21097.5 && step >= 5000) {
            splits.push({ meters: 21097.5, time: 21097.5 * pace, label: 'Mezza' });
            splits.sort((a, b) => a.meters - b.meters);
        }
        splits.push({ meters: distanceMeters, time: totalSeconds, label: 'Arrivo' });
        return splits;
    }

    function repTimes(paceSecondsPerKm, distances) {
        return (distances || REP_DISTANCES).map(m => ({ meters: m, time: paceSecondsPerKm * m / 1000 }));
    }

    function formatDistance(meters) {
        const known = DISTANCES.find(d => isSameDistance(meters, d.meters));
        if (known) return known.name;
        if (meters < 1000) return `${Math.round(meters)} m`;
        const km = meters / 1000;
        return `${Number.isInteger(km) ? km : km.toFixed(2).replace(/\.?0+$/, '')} km`;
    }

    function validateInput(distanceMeters, timeSeconds) {
        if (!(distanceMeters > 0)) return 'Inserisci una distanza valida (es. 10 o 21,1)';
        if (distanceMeters < 1000) return 'Distanza troppo corta: il modello è affidabile da 1 km in su';
        if (distanceMeters > 100000) return 'Distanza troppo lunga (massimo 100 km)';
        if (!timeSeconds) return 'Tempo non valido. Esempi: 45:30, 1:30:00, 1h30m';
        const t = timeSeconds / 60;
        if (t < 3.5) return 'Durata troppo breve: il modello richiede prove di almeno 3-4 minuti';
        const pacePerKm = timeSeconds / (distanceMeters / 1000);
        if (pacePerKm < 150) return 'Ritmo sotto i 2:30/km: controlla i dati inseriti';
        if (pacePerKm > 900) return 'Ritmo oltre i 15:00/km: il modello non è valido per la camminata';
        return null;
    }

    function validateVO2maxResult(vo2max) {
        if (vo2max < 20) return 'VO2max stimato sotto 20: controlla distanza e tempo inseriti.';
        if (vo2max > 90) return 'VO2max oltre 90: fuori dal range umano documentato. Controlla i dati.';
        return null;
    }

    const api = {
        METERS_PER_MILE, DISTANCES, VO2MAX_LEVELS, LEVEL_SCALE, TRAINING_ZONES, REP_DISTANCES,
        toMeters, parseDistance, parseTime, formatTime, formatSplit, formatPace, formatPaceRange, formatSpeedKmh,
        formatDistance, oxygenCost, sustainableFraction, velocityForVO2, calculateVO2max, calculateRaceTime,
        calculateTrainingPace, paceForDuration, getZonePaces, formatZonePace, formatZoneSpeed, getVO2maxLevel, levelScalePercent, isSameDistance,
        equivalentPerformances, evenSplits, repTimes, validateInput, validateVO2maxResult
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.Calc = api;
})(typeof self !== 'undefined' ? self : this);
