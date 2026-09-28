// ============================================
// VALHALLA VO2 — Interfaccia
// ============================================

(function () {
    'use strict';

    const C = window.Calc;
    const $ = (id) => document.getElementById(id);

    const STORAGE_KEYS = { prefs: 'valhalla-prefs', history: 'valhalla-history' };
    const HISTORY_LIMIT = 30;

    // ============================================
    // STORAGE (tollerante a modalità privata / storage bloccato)
    // ============================================

    const store = {
        get(key, fallback) {
            try {
                const raw = localStorage.getItem(key);
                return raw ? JSON.parse(raw) : fallback;
            } catch (e) {
                return fallback;
            }
        },
        set(key, value) {
            try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignora */ }
        }
    };

    // ============================================
    // STATE
    // ============================================

    const prefs = Object.assign({
        mode: 'calculate',
        paceUnit: 'km',
        paceFormat: 'km',
        coach: 'daniels',
        distance: '',
        unit: 'km',
        time: '',
        targetDistance: '21097.5',
        targetTime: '',
        plan: null
    }, store.get(STORAGE_KEYS.prefs, {}));

    if (!C.TRAINING_ZONES[prefs.coach]) prefs.coach = 'daniels';

    const state = {
        result: null,       // { mode, meters, seconds, vdot }
        history: store.get(STORAGE_KEYS.history, []).filter(h => h && h.vdot > 0),
        currentImage: null  // { blob, url, filename }
    };

    function savePrefs() {
        store.set(STORAGE_KEYS.prefs, prefs);
    }

    // ============================================
    // DOM
    // ============================================

    const el = {
        tabs: document.querySelectorAll('.mode-tab'),
        calculateSection: $('calculateSection'),
        targetSection: $('targetSection'),
        distance: $('distance'),
        unit: $('unit'),
        timeInput: $('timeInput'),
        timePreview: $('timePreview'),
        errorMessage: $('errorMessage'),
        targetDistance: $('targetDistance'),
        targetTimeInput: $('targetTimeInput'),
        targetTimePreview: $('targetTimePreview'),
        targetErrorMessage: $('targetErrorMessage'),
        vo2maxDisplay: $('vo2maxDisplay'),
        vo2maxLabel: $('vo2maxLabel'),
        vo2maxValue: $('vo2maxValue'),
        vo2maxSource: $('vo2maxSource'),
        levelMarker: $('levelMarker'),
        levelLabels: $('levelLabels'),
        levelTitle: $('levelTitle'),
        levelDescription: $('levelDescription'),
        compareCard: $('compareCard'),
        compareCurrent: $('compareCurrent'),
        compareTarget: $('compareTarget'),
        compareText: $('compareText'),
        trainingInsight: $('trainingInsight'),
        insightText: $('insightText'),
        insightRecommendation: $('insightRecommendation'),
        exportSection: $('exportSection'),
        resultsSection: $('resultsSection'),
        splitsBlock: $('splitsBlock'),
        splitsMeta: $('splitsMeta'),
        splitsBody: $('splitsBody'),
        performanceBody: $('performanceBody'),
        zonesContainer: $('zonesContainer'),
        coachNote: $('coachNote'),
        repsHead: $('repsHead'),
        repsBody: $('repsBody'),
        historySection: $('historySection'),
        historyList: $('historyList'),
        sparklineWrap: $('sparklineWrap'),
        shareModal: $('shareModal'),
        modalTitle: $('modalTitle'),
        modalImage: $('modalImage'),
        modalClose: $('modalClose'),
        modalShare: $('modalShare'),
        toast: $('toast'),
        resultsNav: $('resultsNav'),
        navHistory: $('navHistory')
    };

    // ============================================
    // UTILITY
    // ============================================

    // Una runa per tipo di zona. Significati dai poemi runici (norvegese, islandese, anglosassone).
    const FOCUS_RUNES = {
        recovery: { rune: 'ᛚ', name: 'Laguz, l\'acqua' },
        endurance: { rune: 'ᚱ', name: 'Raidō, il viaggio' },
        threshold: { rune: 'ᚦ', name: 'Thurisaz, la spina' },
        vo2max: { rune: 'ᛊ', name: 'Sōwilō, il sole' },
        speed: { rune: 'ᛖ', name: 'Ehwaz, il cavallo' }
    };

    function runeBadge(focus) {
        const r = FOCUS_RUNES[focus];
        return r ? `<span class="zone-rune" title="${r.name}" aria-hidden="true">${r.rune}</span>` : '';
    }

    function escapeHtml(str) {
        return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }

    let toastTimer = null;
    function showToast(message) {
        el.toast.textContent = message;
        el.toast.classList.add('visible');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => el.toast.classList.remove('visible'), 2800);
    }

    function showError(message, isTarget) {
        const box = isTarget ? el.targetErrorMessage : el.errorMessage;
        box.textContent = message;
        box.classList.remove('visible');
        void box.offsetWidth; // riavvia l'animazione
        box.classList.add('visible');
    }

    function clearError(isTarget) {
        const box = isTarget ? el.targetErrorMessage : el.errorMessage;
        box.classList.remove('visible');
        box.textContent = '';
    }

    function setPressed(buttons, isActive) {
        buttons.forEach(b => {
            const active = isActive(b);
            b.classList.toggle('active', active);
            b.setAttribute('aria-pressed', String(active));
        });
    }

    function formatDate(ts) {
        return new Date(ts).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    function readCalculateInput() {
        const value = C.parseDistance(el.distance.value);
        const meters = isNaN(value) ? NaN : C.toMeters(value, el.unit.value);
        return { meters, seconds: C.parseTime(el.timeInput.value) };
    }

    function readTargetInput() {
        return { meters: parseFloat(el.targetDistance.value), seconds: C.parseTime(el.targetTimeInput.value) };
    }

    // ============================================
    // LIVE PREVIEW DEL TEMPO
    // ============================================

    function updateTimePreview(input, preview, meters, defaultText) {
        const raw = input.value.trim();
        input.classList.remove('error');
        preview.classList.remove('ok', 'bad');
        if (!raw) { preview.textContent = defaultText; return; }
        const seconds = C.parseTime(raw);
        if (!seconds) {
            preview.textContent = 'Formato non riconosciuto';
            preview.classList.add('bad');
            return;
        }
        let text = `= ${C.formatTime(seconds)}`;
        if (meters > 0) text += ` · ${C.formatPace(seconds / (meters / 1000), prefs.paceUnit)}`;
        preview.textContent = text;
        preview.classList.add('ok');
    }

    const DEFAULT_HINTS = {
        calc: el.timePreview.textContent,
        target: el.targetTimePreview.textContent
    };

    function refreshPreviews() {
        updateTimePreview(el.timeInput, el.timePreview, readCalculateInput().meters, DEFAULT_HINTS.calc);
        updateTimePreview(el.targetTimeInput, el.targetTimePreview, readTargetInput().meters, DEFAULT_HINTS.target);
    }

    function syncPresetButtons() {
        const { meters } = readCalculateInput();
        const presets = document.querySelectorAll('.preset-btn');
        setPressed(presets, b => meters > 0 && C.isSameDistance(meters, C.toMeters(parseFloat(b.dataset.distance), b.dataset.unit)));
    }

    // ============================================
    // CALCOLO
    // ============================================

    function compute(mode, options) {
        const opts = Object.assign({ save: true, scroll: true }, options);
        const isTarget = mode === 'target';
        const input = isTarget ? readTargetInput() : readCalculateInput();

        const inputError = C.validateInput(input.meters, input.seconds);
        if (inputError) {
            showError(inputError, isTarget);
            (isTarget ? el.targetTimeInput : (input.meters > 0 ? el.timeInput : el.distance)).classList.add('error');
            return false;
        }

        const vdot = C.calculateVO2max(input.meters, input.seconds);
        const resultError = C.validateVO2maxResult(vdot);
        if (resultError) { showError(resultError, isTarget); return false; }

        clearError(isTarget);
        state.result = { mode, meters: input.meters, seconds: input.seconds, vdot };

        if (!isTarget && opts.save) addToHistory(state.result);
        updateUrl();
        renderAll();

        if (opts.scroll) {
            requestAnimationFrame(() => {
                el.vo2maxDisplay.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
                el.vo2maxDisplay.focus({ preventScroll: true });
            });
        }
        return true;
    }

    function prefersReducedMotion() {
        return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    // ============================================
    // RENDER
    // ============================================

    function renderAll() {
        if (!state.result) return;
        el.vo2maxDisplay.classList.add('visible');
        el.trainingInsight.classList.add('visible');
        el.exportSection.classList.add('visible');
        el.resultsSection.classList.add('visible');
        el.resultsNav.classList.add('visible');
        renderSummary();
        renderComparison();
        renderInsight();
        renderSplits();
        renderPerformances();
        renderZones();
        renderReps();
        renderHistory();
        renderPlanCta();
    }

    // ============================================
    // INVITO ALL'AZIONE (programmi a pagamento)
    // ============================================

    const PLAN_URLS = {
        hybrid: 'https://www.nicholasrubini.it/hybrid.html',
        running: 'https://app.preparazioneatletica.com/sport/running'
    };

    function planUrl(plan) {
        const url = new URL(PLAN_URLS[plan]);
        url.searchParams.set('utm_source', 'valhalla-vo2');
        url.searchParams.set('utm_medium', 'tool');
        url.searchParams.set('utm_campaign', `cta_${plan}`);
        if (state.result) url.searchParams.set('utm_content', `vdot_${Math.round(state.result.vdot)}`);
        return url.toString();
    }

    function renderPlanCta() {
        const choice = prefs.plan;
        setPressed(document.querySelectorAll('.plan-choice-btn'), b => b.dataset.plan === choice);
        document.querySelectorAll('.plan-offer').forEach(o => { o.hidden = o.dataset.offer !== choice; });
        $('ctaHybrid').href = planUrl('hybrid');
        $('ctaRunning').href = planUrl('running');
        const ctx = $('planContext');
        if (choice && state.result) {
            ctx.textContent = `Il tuo VO2max di oggi: ${state.result.vdot.toFixed(1)}. Rifai il calcolo dopo il programma per misurare i progressi.`;
        } else {
            ctx.textContent = '';
        }
    }

    function renderLevelLabels() {
        el.levelLabels.innerHTML = C.LEVEL_SCALE.ticks.map((t, i, arr) =>
            `<span style="left:${C.levelScalePercent(t)}%">${t}${i === arr.length - 1 ? '+' : ''}</span>`
        ).join('');
    }

    function renderSummary() {
        const r = state.result;
        const level = C.getVO2maxLevel(r.vdot);
        el.vo2maxLabel.textContent = r.mode === 'target' ? 'VO2max Richiesto' : 'VO2max Stimato';
        el.vo2maxValue.textContent = r.vdot.toFixed(1);
        el.vo2maxValue.classList.remove('carve');
        void el.vo2maxValue.offsetWidth; // riavvia l'animazione di "incisione"
        el.vo2maxValue.classList.add('carve');
        el.vo2maxSource.textContent = `${r.mode === 'target' ? 'Obiettivo' : 'Da'}: ${C.formatDistance(r.meters)} in ${C.formatTime(r.seconds)} (${C.formatPace(r.seconds / (r.meters / 1000), 'km')})`;
        el.levelMarker.style.left = `${C.levelScalePercent(r.vdot)}%`;
        el.levelTitle.textContent = level.title;
        el.levelDescription.textContent = level.description;
    }

    function latestActual() {
        return state.history.length ? state.history[0] : null;
    }

    function renderComparison() {
        const r = state.result;
        const current = latestActual();
        if (r.mode !== 'target' || !current) { el.compareCard.hidden = true; return; }

        const gap = r.vdot - current.vdot;
        const predicted = C.calculateRaceTime(current.vdot, r.meters);
        const diff = predicted - r.seconds;
        el.compareCurrent.textContent = current.vdot.toFixed(1);
        el.compareTarget.textContent = r.vdot.toFixed(1);

        const base = `Con il tuo ultimo risultato (${C.formatDistance(current.meters)} in ${C.formatTime(current.seconds)}, ${formatDate(current.ts)}) la previsione su questa distanza è ${C.formatTime(predicted)}.`;
        if (gap <= 0) {
            el.compareText.textContent = `${base} L'obiettivo è già alla tua portata sulla carta: ora serve l'allenamento specifico per la distanza.`;
        } else {
            el.compareText.textContent = `${base} Ti mancano ${C.formatTime(diff)} (+${gap.toFixed(1)} punti VDOT, +${(gap / current.vdot * 100).toFixed(1)}%).`;
        }
        el.compareCard.hidden = false;
    }

    function renderInsight() {
        const v = state.result.vdot;
        let insight, recommendation;
        if (v < 45) {
            insight = 'Il tuo focus principale dovrebbe essere costruire una solida base aerobica. La costanza è più importante dell\'intensità in questa fase.';
            recommendation = 'Aumenta gradualmente la durata del fondo lungo settimanale.';
        } else if (v < 52) {
            insight = 'Hai una buona base. È il momento di introdurre lavoro di soglia per sbloccare il prossimo livello di performance.';
            recommendation = 'Inserisci una sessione di tempo run settimanale (20-40 min continui).';
        } else if (v < 58) {
            insight = 'Sei un corridore solido. Per continuare a progredire, bilancia il lavoro di soglia con sessioni VO2max mirate.';
            recommendation = 'Prova intervalli 4-6×1000m al ritmo Interval (I).';
        } else if (v < 65) {
            insight = 'Performance di alto livello! A questo punto l\'ottimizzazione diventa chiave: economia di corsa, periodizzazione e recupero.';
            recommendation = 'Aggiungi 4-6×100m strides dopo le corse facili, 2-3 volte a settimana.';
        } else {
            insight = 'Sei tra l\'élite. Lavora con un coach esperto per microaggiustamenti specifici. Il margine di miglioramento è nei dettagli.';
            recommendation = 'Considera analisi biomeccanica e periodizzazione avanzata.';
        }
        el.insightText.textContent = insight;
        el.insightRecommendation.innerHTML = `<span class="rune-inline" title="Kenaz, la torcia" aria-hidden="true">ᚲ</span> ${escapeHtml(recommendation)}`;
    }

    function renderSplits() {
        const r = state.result;
        if (r.mode !== 'target') { el.splitsBlock.hidden = true; return; }
        const pace = r.seconds / (r.meters / 1000);
        el.splitsMeta.textContent = `ritmo costante ${C.formatPace(pace, prefs.paceUnit)}`;
        el.splitsBody.innerHTML = C.evenSplits(r.seconds, r.meters).map(s => {
            const name = s.label === 'Mezza' ? 'Mezza' : (s.label === 'Arrivo' ? `Arrivo (${C.formatDistance(r.meters)})` : C.formatDistance(s.meters));
            return `<tr${s.label === 'Arrivo' ? ' class="highlight"' : ''}><td>${escapeHtml(name)}</td><td>${C.formatTime(s.time)}</td></tr>`;
        }).join('');
        el.splitsBlock.hidden = false;
    }

    function renderPerformances() {
        const r = state.result;
        el.performanceBody.innerHTML = C.equivalentPerformances(r.vdot).map(p => {
            const mine = C.isSameDistance(p.meters, r.meters);
            return `<tr${mine ? ' class="highlight"' : ''}><td>${escapeHtml(p.name)}</td><td>${C.formatTime(p.time)}</td><td>${C.formatPace(p.pace, prefs.paceUnit)}</td></tr>`;
        }).join('');
    }

    function renderZones() {
        const coach = C.TRAINING_ZONES[prefs.coach];
        const vdot = state.result.vdot;
        const expanded = new Set(Array.from(el.zonesContainer.querySelectorAll('.zone-row.expanded')).map(r => r.dataset.index));
        el.zonesContainer.innerHTML = coach.zones.map((zone, index) => {
            const p = C.getZonePaces(vdot, zone);
            if (!p) return '';
            const isOpen = expanded.has(String(index));
            return `
                <div class="zone-row${isOpen ? ' expanded' : ''}" data-index="${index}" data-focus="${zone.focus}">
                    <button type="button" class="zone-header" aria-expanded="${isOpen}" aria-controls="zone-details-${index}">
                        ${runeBadge(zone.focus)}
                        <span class="zone-info">
                            <span class="zone-name">${escapeHtml(zone.name)}<span class="zone-expand-icon" aria-hidden="true">▶</span></span>
                            <span class="zone-percent">${escapeHtml(p.basis)}</span>
                        </span>
                        <span class="zone-pace">${C.formatZonePace(p, prefs.paceFormat)}</span>
                    </button>
                    <div class="zone-details" id="zone-details-${index}">
                        <div class="zone-description">${escapeHtml(zone.description)}</div>
                        <div class="zone-workout"><strong>Allenamento tipo:</strong> ${escapeHtml(zone.workout)}</div>
                        ${zone.hr ? `<div class="zone-workout"><strong>Frequenza cardiaca:</strong> ${escapeHtml(zone.hr)}</div>` : ''}
                        <div class="zone-workout"><strong>Velocità:</strong> ${C.formatZoneSpeed(p)} km/h (tapis roulant)</div>
                    </div>
                </div>`;
        }).join('');
        el.coachNote.textContent = coach.note;
    }

    function repZones() {
        return C.TRAINING_ZONES[prefs.coach].zones.filter(z => ['threshold', 'vo2max', 'speed'].includes(z.focus));
    }

    function renderReps() {
        const vdot = state.result.vdot;
        const zones = repZones();
        el.repsHead.innerHTML = `<tr><th scope="col">Zona</th>${C.REP_DISTANCES.map(d => `<th scope="col">${d}m</th>`).join('')}</tr>`;
        el.repsBody.innerHTML = zones.map(zone => {
            const p = C.getZonePaces(vdot, zone);
            if (!p) return '';
            // Oltre maxRep la zona non si usa in pratica (es. ritmo R su 1600m)
            const cells = C.repTimes(p.ref).map(rt => `<td>${zone.maxRep && rt.meters > zone.maxRep ? '—' : C.formatSplit(rt.time)}</td>`).join('');
            return `<tr><td><span class="rune-inline" aria-hidden="true">${FOCUS_RUNES[zone.focus].rune}</span> ${escapeHtml(zone.name)}</td>${cells}</tr>`;
        }).join('');
    }

    // ============================================
    // STORICO
    // ============================================

    function addToHistory(result) {
        const last = state.history[0];
        if (last && C.isSameDistance(last.meters, result.meters) && Math.round(last.seconds) === Math.round(result.seconds)) {
            last.ts = Date.now();
        } else {
            state.history.unshift({ ts: Date.now(), meters: result.meters, seconds: result.seconds, vdot: result.vdot });
            state.history = state.history.slice(0, HISTORY_LIMIT);
        }
        store.set(STORAGE_KEYS.history, state.history);
    }

    function renderSparkline() {
        const points = state.history.slice().reverse();
        if (points.length < 2) { el.sparklineWrap.innerHTML = ''; return; }
        const w = 300, h = 60, pad = 6;
        const values = points.map(p => p.vdot);
        const min = Math.min(...values), max = Math.max(...values);
        const span = Math.max(max - min, 1);
        const coords = points.map((p, i) => [
            pad + (i / (points.length - 1)) * (w - pad * 2),
            h - pad - ((p.vdot - min) / span) * (h - pad * 2)
        ]);
        const path = coords.map((c, i) => `${i ? 'L' : 'M'}${c[0].toFixed(1)},${c[1].toFixed(1)}`).join(' ');
        const last = coords[coords.length - 1];
        const delta = values[values.length - 1] - values[0];
        el.sparklineWrap.innerHTML = `
            <div class="sparkline-head">
                <span>Andamento VDOT</span>
                <span class="${delta >= 0 ? 'up' : 'down'}">${delta >= 0 ? '+' : ''}${delta.toFixed(1)}</span>
            </div>
            <svg class="sparkline" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Andamento VDOT: da ${values[0].toFixed(1)} a ${values[values.length - 1].toFixed(1)}">
                <path d="${path}" fill="none" stroke="currentColor" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>
                <circle cx="${last[0]}" cy="${last[1]}" r="3.5" fill="currentColor"/>
            </svg>`;
    }

    function renderHistory() {
        el.navHistory.hidden = !state.history.length;
        if (!state.history.length) { el.historySection.hidden = true; return; }
        el.historySection.hidden = false;
        renderSparkline();
        el.historyList.innerHTML = state.history.map((h, i) => `
            <li class="history-item">
                <button type="button" class="history-load" data-index="${i}" aria-label="Ricarica ${escapeHtml(C.formatDistance(h.meters))} in ${C.formatTime(h.seconds)}">
                    <span class="history-main">${escapeHtml(C.formatDistance(h.meters))} · ${C.formatTime(h.seconds)}</span>
                    <span class="history-date">${formatDate(h.ts)}</span>
                </button>
                <span class="history-vdot">${h.vdot.toFixed(1)}</span>
                <button type="button" class="history-delete" data-index="${i}" aria-label="Elimina">×</button>
            </li>`).join('');
    }

    function loadFromHistory(index) {
        const h = state.history[index];
        if (!h) return;
        setMode('calculate');
        fillCalculateInputs(h.meters, h.seconds);
        compute('calculate', { save: false });
    }

    function fillCalculateInputs(meters, seconds) {
        if (C.isSameDistance(meters, C.METERS_PER_MILE)) {
            el.distance.value = '1';
            el.unit.value = 'mi';
        } else if (meters < 1000) {
            el.distance.value = String(Math.round(meters));
            el.unit.value = 'm';
        } else {
            el.distance.value = String(+(meters / 1000).toFixed(4));
            el.unit.value = 'km';
        }
        el.timeInput.value = C.formatTime(seconds);
        persistInputs();
        syncPresetButtons();
        refreshPreviews();
    }

    // ============================================
    // URL CONDIVISIBILE
    // ============================================

    function buildShareUrl() {
        const r = state.result;
        const url = new URL(window.location.href);
        url.search = '';
        url.hash = '';
        url.searchParams.set('d', String(+r.meters.toFixed(2)));
        url.searchParams.set('t', String(Math.round(r.seconds)));
        if (r.mode === 'target') url.searchParams.set('m', 'target');
        return url.toString();
    }

    function updateUrl() {
        try { history.replaceState(null, '', buildShareUrl()); } catch (e) { /* file:// o sandbox */ }
    }

    function applyUrlParams() {
        const params = new URLSearchParams(window.location.search);
        const meters = parseFloat(params.get('d'));
        const seconds = parseInt(params.get('t'), 10);
        if (!(meters > 0) || !(seconds > 0)) return false;

        if (params.get('m') === 'target') {
            setMode('target');
            const option = Array.from(el.targetDistance.options).find(o => C.isSameDistance(parseFloat(o.value), meters));
            if (!option) return false;
            el.targetDistance.value = option.value;
            el.targetTimeInput.value = C.formatTime(seconds);
            refreshPreviews();
            return compute('target', { save: false, scroll: false });
        }
        setMode('calculate');
        fillCalculateInputs(meters, seconds);
        // Link condivisi da altri: non finiscono nel tuo storico
        return compute('calculate', { save: false, scroll: false });
    }

    async function copyText(text, successMessage) {
        try {
            await navigator.clipboard.writeText(text);
        } catch (e) {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', '');
            ta.style.position = 'fixed';
            ta.style.opacity = '0';
            document.body.appendChild(ta);
            ta.select();
            try { document.execCommand('copy'); } catch (err) { showToast('Copia non riuscita'); return; }
            finally { document.body.removeChild(ta); }
        }
        showToast(successMessage);
    }

    async function shareLink() {
        const url = buildShareUrl();
        const r = state.result;
        const text = r.mode === 'target'
            ? `Per ${C.formatDistance(r.meters)} in ${C.formatTime(r.seconds)} serve un VO2max di ${r.vdot.toFixed(1)}`
            : `Il mio VO2max: ${r.vdot.toFixed(1)} ml/kg/min`;
        if (navigator.share) {
            try {
                await navigator.share({ title: 'Valhalla VO2', text, url });
                return;
            } catch (e) {
                if (e.name === 'AbortError') return;
            }
        }
        copyText(url, '✓ Link copiato negli appunti');
    }

    // ============================================
    // EXPORT IMMAGINI (Instagram Stories 1080×1920)
    // ============================================

    const COLORS = { bg: '#0a0a0a', card: 'rgba(20, 19, 17, 0.94)', gold: '#c9a227', goldLight: '#e6c65c', text: '#e8e6e3', muted: '#9a9590', faint: '#8a8480', border: 'rgba(201, 162, 39, 0.35)' };
    const FUTHARK = 'ᚠᚢᚦᚨᚱᚲᚷᚹ·ᚺᚾᛁᛃᛇᛈᛉᛊ·ᛏᛒᛖᛗᛚᛜᛞᛟ';
    const W = 1080, H = 1920;

    function roundRectPath(ctx, x, y, w, h, r) {
        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); return; }
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    let fontsReady = null;
    function ensureFonts() {
        if (!document.fonts || !document.fonts.load) return Promise.resolve();
        if (!fontsReady) {
            const loads = ['600 56px Cinzel', '700 200px Cinzel', 'italic 28px "Cormorant Garamond"', '500 36px "Cormorant Garamond"', '600 36px Cinzel', '300 40px "Cormorant Garamond"']
                .map(f => document.fonts.load(f).catch(() => null));
            const timeout = new Promise(res => setTimeout(res, 2500));
            fontsReady = Promise.race([Promise.all(loads), timeout]);
        }
        return fontsReady;
    }

    function spacedText(ctx, text, x, y, spacing) {
        // letterSpacing non è supportato ovunque nel canvas: spaziatura manuale, centrata su x
        const chars = Array.from(text);
        const widths = chars.map(c => ctx.measureText(c).width);
        const total = widths.reduce((a, w) => a + w, 0) + spacing * (chars.length - 1);
        let cx = x - total / 2;
        const align = ctx.textAlign;
        ctx.textAlign = 'left';
        chars.forEach((c, i) => { ctx.fillText(c, cx, y); cx += widths[i] + spacing; });
        ctx.textAlign = align;
    }

    function drawFuthark(ctx, y, reversed) {
        const runes = Array.from(reversed ? Array.from(FUTHARK).reverse().join('') : FUTHARK);
        ctx.font = '30px serif';
        ctx.fillStyle = 'rgba(201, 162, 39, 0.4)';
        ctx.textAlign = 'center';
        const left = 130, right = W - 130;
        const step = (right - left) / (runes.length - 1);
        runes.forEach((r, i) => ctx.fillText(r, left + i * step, y));
    }

    function drawOthala(ctx, cx, cy, size) {
        // Runa ᛟ, la stessa dell'icona dell'app (path in coordinate 512×512)
        const k = size / 300;
        ctx.save();
        ctx.translate(cx - 256 * k, cy - 244 * k);
        ctx.scale(k, k);
        ctx.strokeStyle = COLORS.gold;
        ctx.lineWidth = 30;
        ctx.lineJoin = 'miter';
        ctx.lineCap = 'square';
        ctx.shadowColor = 'rgba(201, 162, 39, 0.6)';
        ctx.shadowBlur = 20;
        ctx.beginPath();
        ctx.moveTo(160, 196); ctx.lineTo(256, 100); ctx.lineTo(352, 196);
        ctx.moveTo(160, 196); ctx.lineTo(352, 388);
        ctx.moveTo(352, 196); ctx.lineTo(160, 388);
        ctx.stroke();
        ctx.restore();
    }

    function drawCorners(ctx, x, y, w, h, len, color) {
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]].forEach(([px, py, dx, dy]) => {
            ctx.moveTo(px + dx * len, py);
            ctx.lineTo(px, py);
            ctx.lineTo(px, py + dy * len);
        });
        ctx.stroke();
    }

    function drawDiamond(ctx, x, y, size, color) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(x, y - size);
        ctx.lineTo(x + size, y);
        ctx.lineTo(x, y + size);
        ctx.lineTo(x - size, y);
        ctx.closePath();
        ctx.fill();
    }

    // Cifre in Cinzel (allineate, nel canvas non si possono attivare i numeri "lnum" di Cormorant),
    // il resto (/km, trattini) in Cormorant. Es. "4:40/km – 4:54/km".
    function drawNumber(ctx, text, x, y, align, size, color) {
        const runs = String(text).match(/[\d:.,'"]+|[^\d:.,'"]+/g) || [];
        const fonts = { num: `600 ${size}px Cinzel, serif`, txt: `400 ${Math.round(size * 0.82)}px "Cormorant Garamond", serif` };
        const parts = runs.map(t => {
            const kind = /^[\d:.,'"]+$/.test(t) ? 'num' : 'txt';
            ctx.font = fonts[kind];
            return { t, kind, w: ctx.measureText(t).width };
        });
        const total = parts.reduce((a, p) => a + p.w, 0);
        let cx = align === 'right' ? x - total : (align === 'center' ? x - total / 2 : x);
        const prevAlign = ctx.textAlign;
        ctx.textAlign = 'left';
        parts.forEach(p => {
            ctx.font = fonts[p.kind];
            ctx.fillStyle = p.kind === 'num' ? color : COLORS.muted;
            ctx.fillText(p.t, cx, y);
            cx += p.w;
        });
        ctx.textAlign = prevAlign;
    }

    // Testo in Cormorant con eventuali cifre in Cinzel (es. "10 km", "59–74% VO2max")
    function drawMixed(ctx, text, x, y, align, size, color, style) {
        const runs = String(text).match(/[\d:.,]+|[^\d:.,]+/g) || [];
        const txtFont = `${style || '500'} ${size}px "Cormorant Garamond", serif`;
        const numFont = `500 ${Math.round(size * 0.78)}px Cinzel, serif`;
        const parts = runs.map(t => {
            const isNum = /^[\d:.,]+$/.test(t) && /\d/.test(t);
            ctx.font = isNum ? numFont : txtFont;
            return { t, font: ctx.font, w: ctx.measureText(t).width };
        });
        const total = parts.reduce((a, p) => a + p.w, 0);
        let cx = align === 'right' ? x - total : (align === 'center' ? x - total / 2 : x);
        const prevAlign = ctx.textAlign;
        ctx.textAlign = 'left';
        ctx.fillStyle = color;
        parts.forEach(p => { ctx.font = p.font; ctx.fillText(p.t, cx, y); cx += p.w; });
        ctx.textAlign = prevAlign;
    }

    function spacedWidth(ctx, text, spacing) {
        const chars = Array.from(text);
        return chars.reduce((a, c) => a + ctx.measureText(c).width, 0) + spacing * (chars.length - 1);
    }

    function createStoryCanvas() {
        const canvas = document.createElement('canvas');
        canvas.width = W;
        canvas.height = H;
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(0, 0, W, H);
        const glow = ctx.createRadialGradient(540, 520, 0, 540, 520, 900);
        glow.addColorStop(0, 'rgba(201, 162, 39, 0.12)');
        glow.addColorStop(1, 'rgba(201, 162, 39, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, W, H);

        // Cornice doppia con rombi agli angoli
        ctx.strokeStyle = 'rgba(201, 162, 39, 0.4)';
        ctx.lineWidth = 2;
        ctx.strokeRect(40, 40, W - 80, H - 80);
        ctx.strokeStyle = 'rgba(201, 162, 39, 0.15)';
        ctx.lineWidth = 1;
        ctx.strokeRect(54, 54, W - 108, H - 108);
        [[40, 40], [W - 40, 40], [40, H - 40], [W - 40, H - 40]].forEach(([x, y]) => drawDiamond(ctx, x, y, 10, COLORS.gold));

        drawFuthark(ctx, 118, false);

        ctx.textAlign = 'center';
        ctx.font = '600 64px Cinzel, serif';
        ctx.fillStyle = COLORS.text;
        spacedText(ctx, 'VALHALLA VO2', 540, 230, 10);
        ctx.font = 'italic 32px "Cormorant Garamond", serif';
        ctx.fillStyle = COLORS.gold;
        ctx.fillText('Il Respiro di Odino', 540, 284);

        const lineL = ctx.createLinearGradient(300, 0, 500, 0);
        lineL.addColorStop(0, 'rgba(201, 162, 39, 0)');
        lineL.addColorStop(1, 'rgba(201, 162, 39, 0.8)');
        ctx.strokeStyle = lineL;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(300, 340); ctx.lineTo(505, 340); ctx.stroke();
        const lineR = ctx.createLinearGradient(575, 0, 780, 0);
        lineR.addColorStop(0, 'rgba(201, 162, 39, 0.8)');
        lineR.addColorStop(1, 'rgba(201, 162, 39, 0)');
        ctx.strokeStyle = lineR;
        ctx.beginPath(); ctx.moveTo(575, 340); ctx.lineTo(780, 340); ctx.stroke();
        drawOthala(ctx, 540, 340, 64);

        ctx.textAlign = 'center';
        ctx.font = '30px "Cormorant Garamond", serif';
        ctx.fillStyle = 'rgba(201, 162, 39, 0.85)';
        ctx.fillText('NicholasRubini.it', 540, 1770);
        drawFuthark(ctx, 1838, true);

        return { canvas, ctx };
    }

    function drawCard(ctx, x, y, w, h) {
        ctx.fillStyle = COLORS.card;
        ctx.strokeStyle = COLORS.border;
        ctx.lineWidth = 2;
        roundRectPath(ctx, x, y, w, h, 18);
        ctx.fill();
        ctx.stroke();
        drawCorners(ctx, x + 14, y + 14, w - 28, h - 28, 28, 'rgba(201, 162, 39, 0.6)');
    }

    function drawCardTitle(ctx, title, y) {
        ctx.textAlign = 'center';
        ctx.font = '600 28px Cinzel, serif';
        ctx.fillStyle = COLORS.gold;
        spacedText(ctx, title, 540, y, 5);
        const half = spacedWidth(ctx, title, 5) / 2;
        drawDiamond(ctx, 540 - half - 28, y - 10, 6, COLORS.gold);
        drawDiamond(ctx, 540 + half + 28, y - 10, 6, COLORS.gold);
    }

    function drawSmallVdot(ctx, y) {
        ctx.textAlign = 'center';
        ctx.font = '600 26px Cinzel, serif';
        ctx.fillStyle = COLORS.muted;
        spacedText(ctx, state.result.mode === 'target' ? 'VO2MAX RICHIESTO' : 'VO2MAX', 540, y, 6);
        ctx.font = '700 96px Cinzel, serif';
        ctx.fillStyle = COLORS.gold;
        ctx.shadowColor = 'rgba(201, 162, 39, 0.5)';
        ctx.shadowBlur = 30;
        ctx.fillText(state.result.vdot.toFixed(1), 540, y + 100);
        ctx.shadowBlur = 0;
    }

    function drawRowDivider(ctx, y, left, right) {
        ctx.strokeStyle = 'rgba(201, 162, 39, 0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
    }

    function drawPerformanceRows(ctx, rows, top, step, left, right, size) {
        let y = top;
        rows.forEach((p, i) => {
            const mine = C.isSameDistance(p.meters, state.result.meters);
            if (mine) {
                ctx.fillStyle = 'rgba(201, 162, 39, 0.12)';
                ctx.fillRect(left - 30, y - step * 0.62, right - left + 60, step);
            }
            drawMixed(ctx, p.name, left, y, 'left', size, mine ? COLORS.gold : COLORS.muted);
            drawNumber(ctx, C.formatTime(p.time), 590, y, 'center', size - 4, COLORS.text);
            drawNumber(ctx, C.formatPace(p.pace, 'km'), right, y, 'right', size - 6, COLORS.gold);
            if (i < rows.length - 1) drawRowDivider(ctx, y + step * 0.38, left, right);
            y += step;
        });
    }

    function drawLevelBar(ctx, vdot, y) {
        const x0 = 190, x1 = 890;
        const grad = ctx.createLinearGradient(x0, 0, x1, 0);
        grad.addColorStop(0, '#2e2512');
        grad.addColorStop(0.35, '#6b5418');
        grad.addColorStop(0.75, '#c9a227');
        grad.addColorStop(1, '#f3dc8c');
        ctx.fillStyle = grad;
        roundRectPath(ctx, x0, y, x1 - x0, 12, 6);
        ctx.fill();
        const mx = x0 + (x1 - x0) * C.levelScalePercent(vdot) / 100;
        ctx.shadowColor = 'rgba(230, 198, 92, 0.8)';
        ctx.shadowBlur = 16;
        drawDiamond(ctx, mx, y + 6, 16, COLORS.goldLight);
        ctx.shadowBlur = 0;
        ctx.textAlign = 'center';
        ctx.font = '400 22px Cinzel, serif';
        ctx.fillStyle = COLORS.faint;
        C.LEVEL_SCALE.ticks.forEach((t, i, arr) => {
            ctx.fillText(`${t}${i === arr.length - 1 ? '+' : ''}`, x0 + (x1 - x0) * C.levelScalePercent(t) / 100, y + 52);
        });
    }

    function generateVO2Image() {
        const { canvas, ctx } = createStoryCanvas();
        const r = state.result;

        ctx.textAlign = 'center';
        ctx.font = '600 30px Cinzel, serif';
        ctx.fillStyle = COLORS.muted;
        spacedText(ctx, r.mode === 'target' ? 'VO2MAX RICHIESTO' : 'VO2MAX STIMATO', 540, 450, 8);

        ctx.font = '700 230px Cinzel, serif';
        ctx.fillStyle = COLORS.gold;
        ctx.shadowColor = 'rgba(201, 162, 39, 0.55)';
        ctx.shadowBlur = 60;
        ctx.fillText(r.vdot.toFixed(1), 540, 680);
        ctx.shadowBlur = 0;

        ctx.font = '300 40px "Cormorant Garamond", serif';
        ctx.fillStyle = COLORS.muted;
        ctx.fillText('ml/kg/min · VDOT', 540, 750);

        const level = C.getVO2maxLevel(r.vdot);
        ctx.font = '600 44px Cinzel, serif';
        ctx.fillStyle = COLORS.text;
        spacedText(ctx, level.title.toUpperCase(), 540, 850, 4);
        ctx.font = 'italic 34px "Cormorant Garamond", serif';
        ctx.fillStyle = COLORS.muted;
        ctx.fillText(level.description, 540, 900);

        drawLevelBar(ctx, r.vdot, 960);

        drawCard(ctx, 100, 1080, 880, 600);
        drawCardTitle(ctx, 'PRESTAZIONI EQUIVALENTI', 1160);
        drawMixed(ctx, `${r.mode === 'target' ? 'Obiettivo' : 'Da'}: ${C.formatDistance(r.meters)} in ${C.formatTime(r.seconds)}`, 540, 1210, 'center', 30, COLORS.muted, 'italic 400');

        const key = C.DISTANCES.filter(d => [5000, 10000, 21097.5, 42195].includes(d.meters));
        drawPerformanceRows(ctx, C.equivalentPerformances(r.vdot, key), 1310, 105, 170, 910, 40);
        return canvas;
    }

    function generatePerformanceImage() {
        const { canvas, ctx } = createStoryCanvas();
        drawSmallVdot(ctx, 450);

        const rows = C.equivalentPerformances(state.result.vdot);
        const step = 118;
        const cardH = 200 + rows.length * step;
        const cardTop = Math.max(620, 620 + (1100 - cardH) / 2);
        drawCard(ctx, 80, cardTop, 920, cardH);
        drawCardTitle(ctx, 'PRESTAZIONI EQUIVALENTI', cardTop + 80);

        ctx.font = '600 20px Cinzel, serif';
        ctx.fillStyle = COLORS.faint;
        ctx.textAlign = 'left';
        ctx.fillText('DISTANZA', 150, cardTop + 145);
        ctx.textAlign = 'center';
        ctx.fillText('TEMPO', 590, cardTop + 145);
        ctx.textAlign = 'right';
        ctx.fillText('RITMO', 930, cardTop + 145);

        drawPerformanceRows(ctx, rows, cardTop + 225, step, 150, 930, 38);
        return canvas;
    }

    function generateZonesImage() {
        const { canvas, ctx } = createStoryCanvas();
        const coach = C.TRAINING_ZONES[prefs.coach];
        drawSmallVdot(ctx, 450);

        const zones = coach.zones.map(z => ({ zone: z, p: C.getZonePaces(state.result.vdot, z) })).filter(z => z.p);
        const step = Math.min(150, 980 / zones.length);
        const cardH = 190 + zones.length * step;
        const cardTop = Math.max(620, 620 + (1100 - cardH) / 2); // centrata nello spazio disponibile
        drawCard(ctx, 80, cardTop, 920, cardH);
        drawCardTitle(ctx, 'RITMI DI ALLENAMENTO', cardTop + 80);
        ctx.textAlign = 'center';
        ctx.font = 'italic 30px "Cormorant Garamond", serif';
        ctx.fillStyle = COLORS.muted;
        ctx.fillText(`Sistema ${coach.name}`, 540, cardTop + 128);

        let y = cardTop + 220;
        zones.forEach(({ zone, p }, i) => {
            // Runa della zona in un riquadro
            const rune = FOCUS_RUNES[zone.focus];
            ctx.strokeStyle = COLORS.border;
            ctx.lineWidth = 2;
            roundRectPath(ctx, 140, y - 42, 56, 56, 8);
            ctx.stroke();
            ctx.textAlign = 'center';
            ctx.font = '34px serif';
            ctx.fillStyle = COLORS.gold;
            ctx.fillText(rune ? rune.rune : '', 168, y - 2);

            drawMixed(ctx, zone.name, 222, y - 8, 'left', 36, COLORS.text);
            drawMixed(ctx, p.basis, 222, y + 26, 'left', 25, COLORS.faint, '400');

            drawNumber(ctx, C.formatZonePace(p, 'km'), 940, y, 'right', 32, COLORS.gold);
            if (i < zones.length - 1) drawRowDivider(ctx, y + step * 0.45, 140, 940);
            y += step;
        });
        return canvas;
    }

    function canvasToBlob(canvas) {
        return new Promise((resolve) => {
            if (canvas.toBlob) canvas.toBlob(resolve, 'image/png');
            else fetch(canvas.toDataURL('image/png')).then(r => r.blob()).then(resolve);
        });
    }

    async function exportImage(generator, filename, title, button) {
        if (!state.result) return;
        if (button) button.disabled = true;
        try {
            await ensureFonts();
            const blob = await canvasToBlob(generator());
            if (!blob) throw new Error('blob');
            if (state.currentImage) URL.revokeObjectURL(state.currentImage.url);
            state.currentImage = { blob, filename, url: URL.createObjectURL(blob) };

            const file = new File([blob], filename, { type: 'image/png' });
            if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({ files: [file], title: 'Valhalla VO2' });
                    return;
                } catch (e) {
                    if (e.name === 'AbortError') return;
                }
            }
            openModal(title);
        } catch (e) {
            showToast('Impossibile generare l\'immagine');
        } finally {
            if (button) button.disabled = false;
        }
    }

    let lastFocus = null;
    function openModal(title) {
        lastFocus = document.activeElement;
        el.modalTitle.textContent = title;
        el.modalImage.src = state.currentImage.url;
        el.shareModal.hidden = false;
        el.shareModal.classList.add('visible');
        document.body.classList.add('modal-open');
        el.modalShare.focus();
    }

    function closeModal() {
        el.shareModal.classList.remove('visible');
        el.shareModal.hidden = true;
        document.body.classList.remove('modal-open');
        if (lastFocus) lastFocus.focus();
    }

    function downloadCurrentImage() {
        if (!state.currentImage) return;
        const link = document.createElement('a');
        link.download = state.currentImage.filename;
        link.href = state.currentImage.url;
        document.body.appendChild(link);
        link.click();
        link.remove();
        showToast('Immagine scaricata');
    }

    function getZonesText() {
        const coach = C.TRAINING_ZONES[prefs.coach];
        const lines = [
            '🏃 RITMI DI ALLENAMENTO',
            `Sistema ${coach.name}`,
            `VO2max (VDOT): ${state.result.vdot.toFixed(1)}`,
            ''
        ];
        coach.zones.forEach(zone => {
            const p = C.getZonePaces(state.result.vdot, zone);
            if (p) lines.push(`${zone.name}: ${C.formatZonePace(p, prefs.paceFormat === '400' || prefs.paceFormat === '200' ? 'km' : prefs.paceFormat)}`);
        });
        lines.push('', `Calcolato con Valhalla VO2 · ${buildShareUrl()}`);
        return lines.join('\n');
    }

    // ============================================
    // MODE
    // ============================================

    function setMode(mode) {
        prefs.mode = mode;
        el.tabs.forEach(tab => {
            const active = tab.dataset.mode === mode;
            tab.classList.toggle('active', active);
            tab.setAttribute('aria-selected', String(active));
            tab.tabIndex = active ? 0 : -1;
        });
        el.calculateSection.hidden = mode !== 'calculate';
        el.targetSection.hidden = mode !== 'target';
        savePrefs();
    }

    function persistInputs() {
        prefs.distance = el.distance.value;
        prefs.unit = el.unit.value;
        prefs.time = el.timeInput.value;
        prefs.targetDistance = el.targetDistance.value;
        prefs.targetTime = el.targetTimeInput.value;
        savePrefs();
    }

    // ============================================
    // EVENTI
    // ============================================

    el.tabs.forEach(tab => {
        tab.addEventListener('click', () => setMode(tab.dataset.mode));
        tab.addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            const next = tab.dataset.mode === 'calculate' ? 'target' : 'calculate';
            setMode(next);
            document.querySelector(`.mode-tab[data-mode="${next}"]`).focus();
        });
    });

    el.calculateSection.addEventListener('submit', (e) => { e.preventDefault(); compute('calculate'); });
    el.targetSection.addEventListener('submit', (e) => { e.preventDefault(); compute('target'); });

    [el.distance, el.unit, el.timeInput, el.targetDistance, el.targetTimeInput].forEach(input => {
        input.addEventListener('input', () => {
            input.classList.remove('error');
            persistInputs();
            syncPresetButtons();
            refreshPreviews();
        });
        input.addEventListener('change', () => { persistInputs(); refreshPreviews(); });
    });

    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            el.distance.value = btn.dataset.distance;
            el.unit.value = btn.dataset.unit;
            el.distance.classList.remove('error');
            persistInputs();
            syncPresetButtons();
            refreshPreviews();
            el.timeInput.focus();
        });
    });

    document.querySelectorAll('[data-pace-unit]').forEach(btn => {
        btn.addEventListener('click', () => {
            prefs.paceUnit = btn.dataset.paceUnit;
            setPressed(document.querySelectorAll('[data-pace-unit]'), b => b.dataset.paceUnit === prefs.paceUnit);
            savePrefs();
            refreshPreviews();
            if (state.result) { renderPerformances(); renderSplits(); }
        });
    });

    document.querySelectorAll('.pace-format-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            prefs.paceFormat = btn.dataset.format;
            setPressed(document.querySelectorAll('.pace-format-btn'), b => b.dataset.format === prefs.paceFormat);
            savePrefs();
            if (state.result) renderZones();
        });
    });

    document.querySelectorAll('.coach-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            prefs.coach = btn.dataset.coach;
            setPressed(document.querySelectorAll('.coach-btn'), b => b.dataset.coach === prefs.coach);
            savePrefs();
            if (state.result) { el.zonesContainer.innerHTML = ''; renderZones(); renderReps(); }
        });
    });

    el.zonesContainer.addEventListener('click', (e) => {
        const header = e.target.closest('.zone-header');
        if (!header) return;
        const row = header.parentElement;
        const open = row.classList.toggle('expanded');
        header.setAttribute('aria-expanded', String(open));
    });

    el.historyList.addEventListener('click', (e) => {
        const del = e.target.closest('.history-delete');
        if (del) {
            state.history.splice(parseInt(del.dataset.index, 10), 1);
            store.set(STORAGE_KEYS.history, state.history);
            renderHistory();
            if (state.result) renderComparison();
            return;
        }
        const load = e.target.closest('.history-load');
        if (load) loadFromHistory(parseInt(load.dataset.index, 10));
    });

    document.querySelectorAll('.plan-choice-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            prefs.plan = btn.dataset.plan;
            savePrefs();
            renderPlanCta();
        });
    });

    $('btnClearHistory').addEventListener('click', () => {
        if (!window.confirm('Cancellare tutto lo storico su questo dispositivo?')) return;
        state.history = [];
        store.set(STORAGE_KEYS.history, state.history);
        renderHistory();
        if (state.result) renderComparison();
    });

    $('btnShareVO2').addEventListener('click', (e) => exportImage(generateVO2Image, `valhalla-vo2-${state.result.vdot.toFixed(1)}.png`, 'Il Tuo VO2max', e.currentTarget));
    $('btnSharePerformance').addEventListener('click', (e) => exportImage(generatePerformanceImage, 'valhalla-prestazioni.png', 'Le Tue Prestazioni', e.currentTarget));
    $('btnShareZones').addEventListener('click', (e) => exportImage(generateZonesImage, `valhalla-ritmi-${prefs.coach}.png`, 'I Tuoi Ritmi', e.currentTarget));
    $('btnCopyZones').addEventListener('click', () => copyText(getZonesText(), '✓ Ritmi copiati negli appunti'));
    $('btnCopyLink').addEventListener('click', shareLink);

    el.modalClose.addEventListener('click', closeModal);
    el.modalShare.addEventListener('click', downloadCurrentImage);
    el.shareModal.addEventListener('click', (e) => { if (e.target === el.shareModal) closeModal(); });
    document.addEventListener('keydown', (e) => {
        if (el.shareModal.hidden) return;
        if (e.key === 'Escape') closeModal();
        if (e.key === 'Tab') {
            // Focus trap minimale tra i due pulsanti del modal
            const focusables = [el.modalClose, el.modalShare];
            const idx = focusables.indexOf(document.activeElement);
            e.preventDefault();
            focusables[(idx + (e.shiftKey ? -1 : 1) + focusables.length) % focusables.length].focus();
        }
    });

    // ============================================
    // INIT
    // ============================================

    function setupResultsNav() {
        if (!('IntersectionObserver' in window)) return;
        const links = Array.from(el.resultsNav.querySelectorAll('a'));
        const targets = links.map(a => document.querySelector(a.getAttribute('href')));
        const visible = new Map();
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(e => visible.set(e.target, e.isIntersecting));
            const idx = targets.findIndex(t => visible.get(t));
            if (idx < 0) return;
            links.forEach((a, i) => a.classList.toggle('active', i === idx));
        }, { rootMargin: '-70px 0px -55% 0px' });
        targets.forEach(t => t && observer.observe(t));
    }

    function init() {
        setupResultsNav();
        renderLevelLabels();

        el.distance.value = prefs.distance;
        el.unit.value = prefs.unit;
        el.timeInput.value = prefs.time;
        if (Array.from(el.targetDistance.options).some(o => o.value === prefs.targetDistance)) {
            el.targetDistance.value = prefs.targetDistance;
        }
        el.targetTimeInput.value = prefs.targetTime;

        setPressed(document.querySelectorAll('[data-pace-unit]'), b => b.dataset.paceUnit === prefs.paceUnit);
        setPressed(document.querySelectorAll('.pace-format-btn'), b => b.dataset.format === prefs.paceFormat);
        setPressed(document.querySelectorAll('.coach-btn'), b => b.dataset.coach === prefs.coach);
        setMode(prefs.mode);
        syncPresetButtons();
        refreshPreviews();

        if (!applyUrlParams()) renderHistory();

        if ('serviceWorker' in navigator && location.protocol === 'https:') {
            window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => null));
        }
    }

    init();
})();
