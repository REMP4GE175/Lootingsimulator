// Server-side game configuration (read-only)
// This prevents client-side manipulation

const BOX_CONFIGS = Object.freeze({
  "Box#1": { cost: 0, columns: 3, rows: 2 },
  "Box#2": { cost: 500, columns: 3, rows: 2 },
  "Box#3": { cost: 5000, columns: 3, rows: 3 },
  "Box#4": { cost: 50000, columns: 4, rows: 3 },
  "Box#5": { cost: 250000, columns: 4, rows: 3 },
  "Box#6": { cost: 500000, columns: 5, rows: 3 },
  "Box#7": { cost: 1000000, columns: 5, rows: 3 },
  "Box#8": { cost: 5000000, columns: 5, rows: 4 },
  "Box#9": { cost: 25000000, columns: 6, rows: 4 },
  "Box#10": { cost: 100000000, columns: 6, rows: 5 }
});

const MAX_STAT_LEVELS = Object.freeze({
  wealth: 100,
  luck: 100,
  tempo: 100
});

const MAX_PRESTIGE_LEVEL = 1000;
const MAX_SKILL_POINTS = 50; // 20 wohlstand + 20 glueck + 10 effizienz

module.exports = {
  BOX_CONFIGS,
  MAX_STAT_LEVELS,
  MAX_PRESTIGE_LEVEL,
  MAX_SKILL_POINTS
};
