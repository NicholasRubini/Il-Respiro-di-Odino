const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/calc.js');

test('parseTime: formati supportati', () => {
    assert.equal(C.parseTime('1:30:00'), 5400);
    assert.equal(C.parseTime('45:30'), 2730);
    assert.equal(C.parseTime('45.30'), 2730);
    assert.equal(C.parseTime('45,30'), 2730);
    assert.equal(C.parseTime("45'30\""), 2730);
    assert.equal(C.parseTime('1h30m'), 5400);
    assert.equal(C.parseTime('1h 30m 15s'), 5415);
    assert.equal(C.parseTime("3h15'"), 11700);
    assert.equal(C.parseTime('3h'), 10800);
    assert.equal(C.parseTime('45'), 2700);
    assert.equal(C.parseTime(' 19:45 '), 1185);
});

test('parseTime: input non validi', () => {
    for (const bad of ['', 'abc', '45:75', '1:75:00', '1:2:3:4', '0', '0:00', '-5:00', '45:3a']) {
        assert.equal(C.parseTime(bad), null, bad);
    }
});

test('formatTime e formatPace arrotondano senza produrre :60', () => {
    assert.equal(C.formatTime(59.6), '1:00');
    assert.equal(C.formatTime(3599.7), '1:00:00');
    assert.equal(C.formatPace(239.6, 'km'), '4:00/km');
    assert.equal(C.formatPace(240, '400'), '1:36');
    assert.equal(C.formatPace(300, 'mi'), '8:03/mi');
});

test('calculateVO2max: valori di riferimento Daniels', () => {
    // Tabelle VDOT: 5 km in 19:57 ≈ VDOT 50; maratona 3:10:49 ≈ VDOT 50
    assert.ok(Math.abs(C.calculateVO2max(5000, 19 * 60 + 57) - 50) < 0.3);
    assert.ok(Math.abs(C.calculateVO2max(42195, 3 * 3600 + 10 * 60 + 49) - 50) < 0.3);
});

test('calculateRaceTime è l\'inversa esatta di calculateVO2max', () => {
    for (const [d, t] of [[5000, 1200], [10000, 2400], [21097.5, 5400], [42195, 12600], [1609.344, 330]]) {
        const v = C.calculateVO2max(d, t);
        assert.ok(Math.abs(C.calculateRaceTime(v, d) - t) < 0.5, `${d}m`);
    }
});

test('calculateRaceTime cresce con la distanza e cala con il VDOT', () => {
    let prev = 0;
    for (const d of C.DISTANCES) {
        const t = C.calculateRaceTime(50, d.meters);
        assert.ok(t > prev);
        prev = t;
    }
    assert.ok(C.calculateRaceTime(60, 10000) < C.calculateRaceTime(50, 10000));
});

test('ritmi di allenamento Daniels a VDOT 50 (tolleranza 3 s/km)', () => {
    const T = C.calculateTrainingPace(50, 88);
    const I = C.calculateTrainingPace(50, 97.5);
    assert.ok(Math.abs(T - 255) <= 3, `T ${T}`);   // 4:15/km
    assert.ok(Math.abs(I - 235) <= 3, `I ${I}`);   // 3:55/km
});

test("getZonePaces: fast <= ref <= slow per ogni zona", () => {
    for (const coach of Object.values(C.TRAINING_ZONES)) {
        for (const z of coach.zones) {
            const p = C.getZonePaces(45, z);
            assert.ok(p.fast <= p.ref && p.ref <= p.slow, z.name);
        }
    }
});

test('evenSplits termina con il tempo totale', () => {
    const s = C.evenSplits(12600, 42195);
    assert.equal(s[s.length - 1].time, 12600);
    assert.ok(s.some(x => x.label === 'Mezza'));
    const s10 = C.evenSplits(2400, 10000);
    assert.equal(s10.length, 10);
    assert.equal(Math.round(s10[4].time), 1200);
});

test('validateInput', () => {
    assert.equal(C.validateInput(10000, 2400), null);
    assert.ok(C.validateInput(500, 90));
    assert.ok(C.validateInput(10000, null));
    assert.ok(C.validateInput(10000, 600));
    assert.ok(C.validateInput(5000, 5000 * 1.0));
});

test('levelScalePercent e getVO2maxLevel', () => {
    assert.equal(C.levelScalePercent(30), 0);
    assert.equal(C.levelScalePercent(55), 50);
    assert.equal(C.levelScalePercent(95), 100);
    assert.equal(C.getVO2maxLevel(50).title, 'Corridore Intermedio');
    assert.equal(C.getVO2maxLevel(88).title, 'Campione Olimpico');
});

test('parseDistance accetta la virgola', () => {
    assert.equal(C.parseDistance('21,0975'), 21.0975);
    assert.ok(Number.isNaN(C.parseDistance('10km')));
});

const zone = (coach, name) => C.TRAINING_ZONES[coach].zones.find(z => z.name === name);
// VDOT che corrisponde a una maratona in 3:00:00 (ritmo 4:15.9/km)
const V3H = C.calculateVO2max(42195, 3 * 3600);
const MP3H = 3 * 3600 / 42.195;

test('solo i metodi con regole ricavabili da un tempo gara', () => {
    assert.deepEqual(Object.keys(C.TRAINING_ZONES), ['daniels', 'pfitzinger', 'hansons']);
});

test('Daniels M = ritmo maratona previsto', () => {
    const p = C.getZonePaces(V3H, zone('daniels', 'Marathon (M)'));
    assert.ok(Math.abs(p.fast - MP3H) < 0.5);
    assert.equal(C.formatZonePace(p, 'km'), '4:16/km');
});

test('Hansons: tempo = MP, strength = MP −10 s/miglio, easy = MP +1–2 min/miglio', () => {
    const tempo = C.getZonePaces(V3H, zone('hansons', 'Tempo (Marathon Pace)'));
    assert.ok(Math.abs(tempo.fast - MP3H) < 0.5);
    const strength = C.getZonePaces(V3H, zone('hansons', 'Strength'));
    assert.ok(Math.abs((MP3H - strength.fast) * C.METERS_PER_MILE / 1000 - 10) < 0.1);
    const easy = C.getZonePaces(V3H, zone('hansons', 'Easy'));
    assert.ok(Math.abs((easy.fast - MP3H) * C.METERS_PER_MILE / 1000 - 60) < 0.1);
    assert.ok(Math.abs((easy.slow - MP3H) * C.METERS_PER_MILE / 1000 - 120) < 0.1);
});

test('Pfitzinger: GA = MP +15–25%, endurance = MP +10–20%, LT = gara 45–60 min, VO2max = ritmo 3–5 km', () => {
    const ga = C.getZonePaces(V3H, zone('pfitzinger', 'General Aerobic'));
    assert.ok(Math.abs(ga.fast / MP3H - 1.15) < 1e-3 && Math.abs(ga.slow / MP3H - 1.25) < 1e-3);
    const en = C.getZonePaces(V3H, zone('pfitzinger', 'Endurance'));
    assert.ok(Math.abs(en.fast / MP3H - 1.10) < 1e-3 && Math.abs(en.slow / MP3H - 1.20) < 1e-3);
    const lt = C.getZonePaces(V3H, zone('pfitzinger', 'Lactate Threshold'));
    // il ritmo "slow" della soglia è quello di una gara che dura esattamente 60 minuti
    const d60 = 3600 / lt.slow * 1000;
    assert.ok(Math.abs(C.calculateRaceTime(V3H, d60) - 3600) < 1);
    assert.ok(lt.fast < lt.slow);
    const vo2 = C.getZonePaces(V3H, zone('pfitzinger', 'VO2max'));
    assert.ok(Math.abs(vo2.fast - C.calculateRaceTime(V3H, 3000) / 3) < 0.5);
    const rec = C.getZonePaces(V3H, zone('pfitzinger', 'Recovery'));
    assert.ok(C.formatZonePace(rec, 'km').startsWith('≥ '));
});

test('Pfitzinger LT per un amatore da 10 km in 55 min ≈ ritmo 10 km (sito Pfitzinger Coaching)', () => {
    const v = C.calculateVO2max(10000, 55 * 60);
    const lt = C.getZonePaces(v, zone('pfitzinger', 'Lactate Threshold'));
    const pace10k = 55 * 60 / 10;
    assert.ok(lt.fast <= pace10k + 1 && lt.slow >= pace10k - 1, `${lt.fast} ${lt.slow} vs ${pace10k}`);
});
