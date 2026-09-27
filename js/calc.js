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

    // percent = intensità in % del VO2max (costo di ossigeno), come nel modello di Daniels.
    // ref (opzionale) = intensità "canonica" usata per i tempi di ripetuta; default: punto medio.
    const TRAINING_ZONES = {
        daniels: {
            name: 'Jack Daniels',
            note: 'Sistema VDOT (Daniels\' Running Formula). Unico sistema qui definito nativamente in % VO2max.',
            native: true,
            zones: [
                { name: 'Easy (E)', percent: [59, 74], description: 'Corsa facile e recupero attivo. Dovresti poter conversare senza problemi.', workout: 'Corsa continua 30-90 min. Respirazione nasale possibile.', focus: 'recovery' },
                { name: 'Marathon (M)', percent: [75, 84], description: 'Ritmo maratona sostenibile. Concentrazione richiesta ma gestibile.', workout: 'Fondo lungo fino a 150 min, o porzioni a ritmo gara.', focus: 'endurance' },
                { name: 'Threshold (T)', percent: [83, 88], ref: 88, description: 'Soglia lattacida. "Comfortably hard" — impegnativo ma controllato.', workout: 'Tempo run 20 min continui, o cruise intervals 3-5×1.6km con 1 min di recupero.', focus: 'threshold' },
                { name: 'Interval (I)', percent: [95, 100], ref: 97.5, description: 'Massimo consumo di ossigeno. Respirazione intensa, alta concentrazione.', workout: 'Intervalli 3-5 min (800-1200m) con recupero jog di durata simile.', focus: 'vo2max' },
                { name: 'Repetition (R)', percent: [105, 110], ref: 105, description: 'Sviluppo velocità ed economia di corsa. Sprint controllati.', workout: 'Ripetute brevi 200-400m con recupero completo.', focus: 'speed' }
            ]
        },
        pfitzinger: {
            name: 'Pete Pfitzinger',
            note: 'Advanced Marathoning / Faster Road Racing. Zone originali in % FCmax/ritmo soglia: qui convertite in % VO2max (approssimazione).',
            zones: [
                { name: 'Recovery', percent: [55, 65], description: 'Recupero puro. Molto facile, quasi imbarazzante.', workout: '20-45 min il giorno dopo allenamenti duri.', focus: 'recovery' },
                { name: 'General Aerobic', percent: [62, 75], description: 'Base aerobica quotidiana. Il pane quotidiano del maratoneta.', workout: '45-90 min a sensazione, conversazione possibile.', focus: 'endurance' },
                { name: 'Endurance', percent: [65, 78], description: 'Fondo lungo per adattamenti metabolici e mentali.', workout: 'Long run 90-150 min con progressione finale opzionale.', focus: 'endurance' },
                { name: 'Lactate Threshold', percent: [82, 88], description: 'Soglia anaerobica. Massimo ritmo sostenibile per ~60 min.', workout: 'Tempo run 25-45 min, o 2×20 min con breve recupero.', focus: 'threshold' },
                { name: 'VO2max', percent: [94, 100], description: 'Potenza aerobica massima. Cuore e polmoni al limite.', workout: 'Intervalli 600-1600m, recupero 50-90% del tempo di lavoro.', focus: 'vo2max' },
                { name: 'Speed', percent: [105, 115], description: 'Neuromuscolare puro. Esplosività e meccanica di corsa.', workout: 'Strides, 150-300m con recupero completo.', focus: 'speed' }
            ]
        },
        laufcampus: {
            name: 'Laufcampus',
            note: 'Sistema tedesco (Andreas Butz). Zone originali basate su lattato/FC: qui convertite in % VO2max (approssimazione).',
            zones: [
                { name: 'Regeneration (Rekom)', percent: [55, 65], description: 'Rigenerazione attiva. Promuove il recupero senza stress.', workout: '20-40 min molto leggeri. Può includere cammino.', focus: 'recovery' },
                { name: 'Grundlagen 1 (GA1)', percent: [65, 75], description: 'Costruzione base aerobica. Metabolismo lipidico.', workout: '45-120 min continui. Zona di volume primaria.', focus: 'endurance' },
                { name: 'Grundlagen 2 (GA2)', percent: [75, 85], description: 'Aerobico intenso. Transizione verso metabolismo glicolitico.', workout: 'Medium long run, fartlek strutturato.', focus: 'endurance' },
                { name: 'Schwellenbereich (SB)', percent: [85, 92], description: 'Zona soglia. Equilibrio tra accumulo e smaltimento lattato.', workout: 'Tempo runs, progressivi, cruise intervals.', focus: 'threshold' },
                { name: 'Entwicklungsbereich (EB)', percent: [92, 100], description: 'Sviluppo VO2max. Alta intensità sostenuta.', workout: 'Intervalli 3-8 min. 10-15 min totali ad alta intensità.', focus: 'vo2max' },
                { name: 'Schnelligkeitsbereich', percent: [100, 115], description: 'Velocità massimale. Sistema anaerobico.', workout: 'Sprint 100-400m con pieno recupero.', focus: 'speed' }
            ]
        },
        zintl: {
            name: 'Zintl & Eisenhut',
            note: 'Ausdauertraining. Zone originali basate su lattato/FC: qui convertite in % VO2max (approssimazione).',
            zones: [
                { name: 'Kompensation (KOMP)', percent: [50, 60], description: 'Compensazione metabolica. Smaltimento prodotti di scarto.', workout: 'Corsa molto leggera o camminata veloce post-gara.', focus: 'recovery' },
                { name: 'Grundlagenausdauer 1', percent: [60, 70], description: 'Resistenza base primaria. Adattamenti centrali e periferici.', workout: 'Volume alto, bassa intensità. 60-120 min.', focus: 'endurance' },
                { name: 'Grundlagenausdauer 2', percent: [70, 80], description: 'Resistenza base intensa. Maggiore stimolo cardiovascolare.', workout: 'Fondo medio progressivo, fartlek.', focus: 'endurance' },
                { name: 'Entwicklungsbereich', percent: [80, 90], description: 'Zona di sviluppo. Adattamenti specifici alla competizione.', workout: 'Tempo run, intervalli lunghi.', focus: 'threshold' },
                { name: 'Wettkampfspezifisch', percent: [90, 100], description: 'Specifico gara. Simula le richieste della competizione.', workout: 'Simulazioni gara, intervalli a ritmo obiettivo.', focus: 'vo2max' },
                { name: 'Schnelligkeitsausdauer', percent: [100, 110], description: 'Resistenza alla velocità. Capacità anaerobica.', workout: 'Ripetute brevi massimali, lavoro in salita.', focus: 'speed' }
            ]
        },
        fitzgerald: {
            name: 'Matt Fitzgerald',
            note: '80/20 Running (polarizzato: 80% facile, 20% intenso). Zone originali in FC/ritmo soglia: qui convertite in % VO2max (approssimazione).',
            zones: [
                { name: 'Zona 1 (Low Aerobic)', percent: [55, 65], description: 'Aerobico basso. Facilissimo, conversazione fluente.', workout: 'Recovery run, parte iniziale dei long run.', focus: 'recovery' },
                { name: 'Zona 2 (Moderate Aerobic)', percent: [65, 75], description: 'Aerobico moderato. Comodo ma presente.', workout: 'Corsa generale, attenzione a non passarci troppo tempo.', focus: 'endurance' },
                { name: 'Zona 3 (High Aerobic)', percent: [75, 82], description: 'Aerobico alto. Ritmo maratona per molti runners.', workout: 'Fondo lungo finale, marathon pace segments.', focus: 'endurance' },
                { name: 'Zona 4 (Threshold)', percent: [82, 89], description: 'Soglia. Massimo ritmo sostenibile ~1 ora.', workout: 'Tempo run classico, cruise intervals.', focus: 'threshold' },
                { name: 'Zona 5 (VO2max)', percent: [95, 100], description: 'VO2max. Il 20% che conta per la performance.', workout: 'Intervalli 2-6 min, recupero attivo.', focus: 'vo2max' },
                { name: 'Zona 6 (Speed)', percent: [105, 115], description: 'Velocità. Neuromuscolare e anaerobico.', workout: 'Strides, hill sprints, ripetute corte.', focus: 'speed' }
            ]
        },
        hansons: {
            name: 'Hansons',
            note: 'Hansons Marathon Method (fatica cumulativa). Ritmi originali derivati dal tempo gara: qui convertiti in % VO2max (approssimazione).',
            zones: [
                { name: 'Easy', percent: [55, 68], description: 'Facile vero. Nel metodo Hansons, "easy" significa davvero easy.', workout: 'Corsa quotidiana, recupero tra qualità.', focus: 'recovery' },
                { name: 'Long Run', percent: [68, 75], description: 'Fondo lungo. Più corto ma più veloce del tradizionale.', workout: 'Max ~26 km, focus su ritmo, non distanza.', focus: 'endurance' },
                { name: 'Marathon Pace', percent: [75, 84], description: 'Ritmo gara. Cuore del metodo per memorizzare il ritmo.', workout: 'Progressivi fino a ~16 km a marathon pace.', focus: 'endurance' },
                { name: 'Tempo', percent: [84, 90], description: 'Soglia. Costruisce resistenza alla fatica mentale.', workout: '8-16 km continui a ritmo tempo.', focus: 'threshold' },
                { name: 'Strength', percent: [90, 97], description: 'Forza specifica. VO2max per potenza aerobica.', workout: '3×3.2 km o 6×1.6 km con jog recovery.', focus: 'vo2max' },
                { name: 'Speed', percent: [105, 115], description: 'Velocità. Meno comune nel metodo ma presente.', workout: 'Strides 100m post-easy run.', focus: 'speed' }
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

    // Ritmo (s/km) a una data % del VO2max
    function calculateTrainingPace(vo2max, percentVO2max) {
        const v = velocityForVO2(vo2max * percentVO2max / 100);
        if (!(v > 0)) return null;
        return 60000 / v;
    }

    function getZonePaces(vo2max, zone) {
        const slow = calculateTrainingPace(vo2max, zone.percent[0]);
        const fast = calculateTrainingPace(vo2max, zone.percent[1]);
        const refPct = zone.ref || (zone.percent[0] + zone.percent[1]) / 2;
        const ref = calculateTrainingPace(vo2max, refPct);
        return (slow && fast && ref) ? { slow, fast, ref, refPct } : null;
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
        calculateTrainingPace, getZonePaces, getVO2maxLevel, levelScalePercent, isSameDistance,
        equivalentPerformances, evenSplits, repTimes, validateInput, validateVO2maxResult
    };

    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    else root.Calc = api;
})(typeof self !== 'undefined' ? self : this);
