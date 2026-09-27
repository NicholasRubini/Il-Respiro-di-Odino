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

test('getZonePaces: fast < ref < slow', () => {
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
