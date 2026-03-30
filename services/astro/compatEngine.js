// services/astro/compatEngine.js
const swe = require('swisseph');
swe.swe_set_ephe_path(process.env.SWISSEPH_PATH || './sweph');
const logger = require('../../logger');

// ----- утилиты
const norm360 = x => ((x % 360) + 360) % 360;
const deltaAngle = (a, b) => {
  const d = Math.abs(norm360(a) - norm360(b));
  return d > 180 ? 360 - d : d;
};

// орбы (допуски) — светила шире, личные средние, внешние уже
const ORB_LUMIN = 6;   // Sun/Moon в паре
const ORB_PERSO = 4;   // Mercury/Venus/Mars/ASC в паре
const ORB_OUTER = 3;   // Jupiter/Saturn вовлечены

function aspectHit(a1, a2, type, orb) {
  const target = { conj: 0, sext: 60, sq: 90, tri: 120, opp: 180 }[type];
  const angle = deltaAngle(a1, a2);
  const offset = Math.abs(angle - target);
  return { hit: offset <= orb, angle, target, offset };
}

// корректная раскладка стихий по знаку Солнца
function elementOf(long) {
  const sign = Math.floor(norm360(long) / 30); // 0..11 (Овен..Рыбы)
  if ([0, 4, 8].includes(sign)) return 'fire';    // Овен, Лев, Стрелец
  if ([1, 5, 9].includes(sign)) return 'earth';   // Телец, Дева, Козерог
  if ([2, 6, 10].includes(sign)) return 'air';    // Близнецы, Весы, Водолей
  return 'water';                                  // Рак, Скорпион, Рыбы
}

// получаем долготy планет на UTC-дате
function getPlanetsUTC(date) {
  const jd = swe.swe_julday(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours() + date.getUTCMinutes() / 60,
    swe.SE_GREG_CAL
  );

  const lonOf = (body) => {
    const r = swe.swe_calc_ut(jd, body, swe.SEFLG_SWIEPH);
    return norm360(r.longitude);
  };

  return {
    sun: lonOf(swe.SE_SUN),
    moon: lonOf(swe.SE_MOON),
    mercury: lonOf(swe.SE_MERCURY),
    venus: lonOf(swe.SE_VENUS),
    mars: lonOf(swe.SE_MARS),
    jupiter: lonOf(swe.SE_JUPITER), // добавлено
    saturn: lonOf(swe.SE_SATURN),   // добавлено
  };
}

// Ascendant: у swisseph ascendant лежит в h.ascmc[0]
function computeAsc(date, lat, lon) {
  const jd = swe.swe_julday(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    date.getUTCHours() + date.getUTCMinutes() / 60,
    swe.SE_GREG_CAL
  );

  try {
    const h = swe.swe_houses(jd, lat, lon, 'P'); // Placidus

    // Варианты ответов библиотеки:
    // 1) { ascmc: [ASC, MC, ...], ... }
    // 2) { ascendant: <num>, mc: <num>, house: [...], ... }  <-- как у тебя
    let asc = null;

    if (h && Array.isArray(h.ascmc) && h.ascmc[0] != null && !Number.isNaN(h.ascmc[0])) {
      asc = h.ascmc[0];
    } else if (h && typeof h.ascendant === 'number' && !Number.isNaN(h.ascendant)) {
      asc = h.ascendant;
    } else if (h && Array.isArray(h.house) && h.house[0] != null) {
      // Некоторые биндинги кладут ASC как кусп 1 дома
      asc = h.house[0];
    } else {
      logger.error('[compatEngine, computeAsc] Не нашёл поле ASC в результате swe_houses:', h);
      return null;
    }

    return norm360(asc);
  } catch (e) {
    logger.error(`[compatEngine, computeAsc]  Ошибка: ${e.message}`);
    return null;
  }
}


// собираем «миникарту» (только нужные точки)

function buildChart(p) {
  const pl = getPlanetsUTC(p.instantUTC);
  let asc = null;
  if (p.birth_time && p.lat != null && p.lon != null) {
    asc = computeAsc(p.instantUTC, p.lat, p.lon);
  }
  return { ...pl, asc };
}

// веса аспектов: базовые/для светил/для внешних
// идея: тригон лучший, секстиль тёплый, соединение нейтрально+контекстное, квадрат/опп — напряжение
const W = {
  tri: { base: 8, lum: 10, outer: 5 },
  sext: { base: 6, lum: 8, outer: 4 },
  conj: { base: 5, lum: 6, outer: 3 },
  sq: { base: -6, lum: -10, outer: -4 },
  opp: { base: -8, lum: -10, outer: -5 },
};

function scoreAspect(type, classTag) {
  // classTag: 'lum' | 'outer' | 'base'
  return W[type][classTag];
}

// === Профили режимов ===
const MODE = {
  romance: {
    // множители для аспектов
    aspectMult: { conj: 1.1, sext: 1.15, tri: 1.2, sq: 0.9, opp: 0.95 },
    // буст конкретных пар
    pairBoost: (aName, bName) => {
      const s = new Set([aName, bName]);
      if (s.has('venus') && s.has('mars')) return 1.6;       // искра
      if (s.has('sun') && s.has('moon')) return 1.4;         // ядро
      if (s.has('asc') && (s.has('sun') || s.has('moon') || s.has('venus') || s.has('mars')))
        return 1.25;                                         // личные ↔ ASC
      return 1.0;
    },
    // вклад стихий Солнца
    elementsScore: ({ elA, elB }) => {
      if (elA === elB) return 6;
      const comp = ['fire-air','air-fire','earth-water','water-earth'];
      return comp.includes(`${elA}-${elB}`) ? 4 : -3;
    }
  },
  friendship: {
    aspectMult: { conj: 1.0, sext: 1.15, tri: 1.25, sq: 0.85, opp: 0.9 },
    pairBoost: (aName, bName) => {
      const s = new Set([aName, bName]);
      if (s.has('mercury') && (s.has('mercury') || s.has('moon') || s.has('asc'))) return 1.5; // болтовня/понимание
      if (s.has('sun') && s.has('jupiter')) return 1.35;                                       // поддержка/рост
      return 1.0;
    },
    elementsScore: ({ elA, elB }) => {
      if (elA === elB) return 7; // общий темп дружбе в плюс
      const comp = ['fire-air','air-fire','earth-water','water-earth'];
      return comp.includes(`${elA}-${elB}`) ? 3 : -2;
    }
  }
};

const SOFT = new Set(['sext','tri']);

// главная синстрия с режимами: mode = 'romance' | 'friendship'
function computeSynastry(a, b, mode) {
  const cfg = MODE[mode] || MODE.romance;

  const pts = ['sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter', 'saturn'];
  const aspects = ['conj', 'sext', 'sq', 'tri', 'opp'];

  let total = 0;
  const breakdown = [];

  function classOfPair(n1, n2) {
    const lum = (x) => x === 'sun' || x === 'moon';
    const outer = (x) => x === 'jupiter' || x === 'saturn';
    if (n1 === 'asc' || n2 === 'asc') return 'base'; // ASC считаем как личное
    if (lum(n1) || lum(n2)) return 'lum';
    if (outer(n1) || outer(n2)) return 'outer';
    return 'base';
  }

  function orbFor(classTag, aName, bName) {
    if (aName === 'asc' || bName === 'asc') return ORB_PERSO; // для ASC возьмём личный орб
    if (classTag === 'lum') return ORB_LUMIN;
    if (classTag === 'outer') return ORB_OUTER;
    return ORB_PERSO;
  }

  function pair(n1, n2) {
    const la = a[n1], lb = b[n2];
    if (la == null || lb == null || Number.isNaN(la) || Number.isNaN(lb)) return;

    const cls = classOfPair(n1, n2);
    const orb = orbFor(cls, n1, n2);
    const pairMult = cfg.pairBoost(n1, n2);

    for (const t of aspects) {
      const target = { conj:0, sext:60, sq:90, tri:120, opp:180 }[t];
      const angle = deltaAngle(la, lb);
      const offset = Math.abs(angle - target);
      if (offset > orb) continue;

      // базовый вес из твоей таблицы W
      let sc = W[t][cls];

      // профиль аспекта (мягкие в дружбе/романтике ценнее и т.п.)
      sc *= (cfg.aspectMult[t] || 1);

      // доп. бонус для дружеского мягкого Сатурна
      if (mode === 'friendship') {
        const s = new Set([n1, n2]);
        if (s.has('saturn') && SOFT.has(t)) sc *= 1.25;
      }

      // множитель пары
      sc *= pairMult;

      // округление, чтобы очки были целыми
      sc = Math[sc >= 0 ? 'ceil' : 'floor'](sc);

      total += sc;
      breakdown.push({
        a: n1, b: n2, type: t,
        angle, target, offset, orb,
        class: cls, score: sc,
        mode
      });
      break; // один ближайший аспект на пару
    }
  }

  // все планетные пары
  for (const i of pts) for (const j of pts) pair(i, j);
  // связи с ASC (если он посчитан)
  if (a.asc != null) for (const j of pts) pair('asc', j);
  if (b.asc != null) for (const i of pts) pair(i, 'asc');

  // стихии Солнца — через профиль
  const elA = elementOf(a.sun), elB = elementOf(b.sun);
  const elScore = cfg.elementsScore({ elA, elB });
  total += elScore;
  breakdown.push({ factor: 'sun_elements', a: elA, b: elB, score: elScore, mode });

  return { rawScore: total, breakdown, elA, elB, mode };
}


// приводим сырые очки к шкале 0..100
function normalizeScore(raw) {
  const min = -80, max = 80;
  const x = Math.max(min, Math.min(max, raw));
  return Math.round(((x - min) / (max - min)) * 100);
}

module.exports = { buildChart, computeSynastry, normalizeScore, elementOf };
