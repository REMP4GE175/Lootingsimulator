// ======= Zustandsvariablen =======
// App Version (für Update-Check)
const APP_VERSION = '0.75';

// Items, die der Spieler bereits entdeckt hat
const discoveredItems = new Set();
// Items, die in der letzten Öffnung gezogen wurden (für Hervorhebung in Sammlung)
let lastPulledItems = new Set();

// Reihenfolge der Raritäten (wird beim Ziehen verwendet)
// Reihenfolge der Raritäten (von häufig nach extrem selten)
// Hinweis: Schlüssel-System unterstützt nur die ersten fünf (bis Mythisch)
const rarities = ["Common", "Rare", "Epic", "Legendary", "Mythisch", "Aetherisch"];

// Farbdefinitionen pro Rarität (RGBA für einfache CSS-Nutzung)
const colors = {
  Common: "rgba(204, 204, 204, 1)",
  Rare: "rgba(74, 144, 226, 1)",
  Epic: "rgba(155, 89, 182, 1)",
  Legendary: "rgba(241, 196, 15, 1)",
  Mythisch: "rgba(231, 76, 60, 1)",
  Aetherisch: "rgba(20, 184, 166, 1)" // kräftiges Türkis
};

// Glow-Stärken pro Rarität (0.0 - 1.0). Wird als CSS-Variable --glow-opacity auf das Item gesetzt.
const glowStrength = {
  Common: 0.20,
  Rare: 0.40,
  Epic: 0.60,
  Legendary: 0.80,
  Mythisch: 1.00,
  Aetherisch: 1.05
};

// Bildpfad-Hilfen: Ab sofort liegen die Itembilder in Unterordnern je Rarität
// Struktur: Itembilder/<Rarität-Ordner>/{Dateiname}
// Mapping der Ingame-Raritäten (EN/DE gemischt) zu Ordnernamen (DE):
//  - Common   -> Common
//  - Rare     -> Selten
//  - Epic     -> Episch
//  - Legendary-> Legendär
//  - Mythisch -> Mythisch
const RARITY_FOLDER_MAP = {
  Common: 'Common',
  Rare: 'Selten',
  Epic: 'Episch',
  Legendary: 'Legendär',
  Mythisch: 'Mythisch',
  // Für Aetherisch (neue Stufe) werden bis zur Bereitstellung eigener Assets Mythisch-Icons wiederverwendet
  Aetherisch: 'Mythisch'
};

function getItemImagePath(iconFileName, rarity) {
  // Erlaube absolute/komplette Pfade (z. B. für Schlüssel-Icons aus Common-Ordner)
  if (typeof iconFileName === 'string') {
    const s = iconFileName;
    if (s.startsWith('http') || s.startsWith('data:')) {
      return s; // HTTP-URLs oder Data-URLs unverändert
    }
    if (s.startsWith('Itembilder/')) {
      // Vollständiger Pfad - Segmente einzeln encoden
      const parts = s.split('/');
      return parts.map((part, idx) => idx === 0 ? part : encodeURIComponent(part)).join('/');
    }
    if (s.startsWith('Saisonale items LS/')) {
      // Saisonale Items - Pfad bereits vollständig, nur encoden
      const parts = s.split('/');
      return parts.map((part, idx) => idx === 0 ? part : encodeURIComponent(part)).join('/');
    }
  }
  const folder = RARITY_FOLDER_MAP[rarity] || 'Common';
  // Encode einzelne Segmente, damit Umlaute/Leerzeichen funktionieren
  const encodedFolder = encodeURIComponent(folder);
  const encodedFile = encodeURIComponent(iconFileName || '');
  return `Itembilder/${encodedFolder}/${encodedFile}`;
}

// Liefert alternative Dateinamen-Varianten, falls kleine Abweichungen existieren
function getAlternateIconNames(iconFileName) {
  const name = String(iconFileName || '');
  const alts = [];
  // Ermittle Basename und Extension
  const m = name.match(/\.(png|jpg|jpeg|gif|webp)$/i);
  const ext = m ? m[0] : '';
  const base = m ? name.slice(0, -ext.length) : name;

  // 1) Trailing Spaces vor Dateiendung entfernen: "...  .png" -> "....png"
  alts.push(name.replace(/\s+\.(png|jpg|jpeg|gif|webp)$/i, '.$1'));

  // 2) Variante MIT einem Space vor der Extension (für Files wie "Einzelner Socke .png")
  if (ext && !/\s$/.test(base)) {
    alts.push(base + ' ' + ext);
  }

  // 3) Spaces zu Unterstrichen
  if (ext) {
    alts.push(base.replace(/\s+/g, '_') + ext);
  } else {
    alts.push(name.replace(/\s+/g, '_'));
  }

  // 4) Ohne jegliche Spaces
  if (ext) {
    alts.push(base.replace(/\s+/g, '') + ext);
  } else {
    alts.push(name.replace(/\s+/g, ''));
  }

  // 5) Komplett in Kleinbuchstaben
  alts.push(name.toLowerCase());

  // 6) Kombinationen der obigen Varianten in Kleinbuchstaben
  const trimmedLower = name.replace(/\s+\.(png|jpg|jpeg|gif|webp)$/i, '.$1').toLowerCase();
  alts.push(trimmedLower);
  if (ext) {
    alts.push((base + ' ' + ext).toLowerCase());
    alts.push((base.replace(/\s+/g, '_') + ext).toLowerCase());
    alts.push((base.replace(/\s+/g, '') + ext).toLowerCase());
  }

  // Nur eindeutige Varianten zurückgeben, die sich vom Original unterscheiden
  const uniq = [];
  const seen = new Set([name]);
  for (const a of alts) {
    if (!seen.has(a)) { uniq.push(a); seen.add(a); }
  }
  return uniq;
}

// ======= Level & Skill System =======
let playerLevel = 0;
let playerXP = 0;
let totalXPEarned = 0; // Gesamte XP über alle Level hinweg
let skillPoints = 0;

// Prestige-System: globale, dauerhafte Meta-Progression
// Jede Prestige-Stufe verleiht: +5% Itemwert additiv (stackt) und +1 Glück (stackt)
let prestigeState = {
  level: 0,
  // Anzahl geöffneter Boxen seit dem letzten Prestige (für die 200er-Bedingung)
  runBoxesOpened: 0
};

// Skill-Tree: 3 Zweige mit jeweils maximal 20/20/10 Punkten
const skills = {
  wohlstand: 0,   // Jeder Punkt: +3% Item-Wert (max 20 = +60%)
  glueck: 0,      // Jeder Punkt: erhöht Chancen auf seltene Items (max 20)
  effizienz: 0    // Jeder Punkt: -3,5% Untersuchungszeit (max 10 = -35%)
};

// ======= Statistik-Tracking =======
const stats = {
  totalBoxesOpened: 0,
  totalItemsPulled: 0,
  totalGoldEarned: 0,
  mostValuableItem: { name: '', value: 0, rarity: '' },
  boxOpenCounts: {
    'Box#1': 0, 'Box#2': 0, 'Box#3': 0, 'Box#4': 0,
    'Box#5': 0, 'Box#6': 0, 'Box#7': 0, 'Box#8': 0,
    'Box#9': 0, 'Box#10': 0
  },
  // Kumulativ gefundene Schlüssel (nicht Inventarbestand)
  keysFoundCounts: { Common: 0, Rare: 0, Epic: 0, Legendary: 0, Mythisch: 0 },
  // Lifetime-Counter für entdeckte Items pro Rarität (über Prestige hinaus)
  lifetimeDiscovered: { Common: 0, Rare: 0, Epic: 0, Legendary: 0, Mythisch: 0, Aetherisch: 0 }
};

// Sicherstellen, dass neue Boxen-Schlüssel in alten Saves existieren
function ensureBoxOpenCountsKeys() {
  try {
    if (!stats.boxOpenCounts || typeof stats.boxOpenCounts !== 'object') {
      stats.boxOpenCounts = {};
    }
    for (const name of boxOrder) {
      if (!Object.prototype.hasOwnProperty.call(stats.boxOpenCounts, name)) {
        stats.boxOpenCounts[name] = 0;
      }
    }
    
    // Stelle sicher dass lifetimeDiscovered existiert
    if (!stats.lifetimeDiscovered || typeof stats.lifetimeDiscovered !== 'object') {
      stats.lifetimeDiscovered = { Common: 0, Rare: 0, Epic: 0, Legendary: 0, Mythisch: 0, Aetherisch: 0 };
    }
    // Initialisiere mit aktuellen Entdeckungen falls noch nicht vorhanden
    for (const rarity of rarities) {
      if (!stats.lifetimeDiscovered[rarity]) {
        stats.lifetimeDiscovered[rarity] = getDiscoveredCountByRarity(rarity);
      }
    }
  } catch (_) { /* ignore */ }
}

// Erfolge: Kategorien und Meilensteine
const BOX_MILESTONES = [50, 100, 200, 1000];
const GOLD_MILESTONES = [1000, 10000, 100000, 1000000];
const COLLECTION_MILESTONES_PCT = [25, 50, 75, 100]; // Prozent der Items je Rarität
// Schlüssel-Erfolge: nur einmal finden pro Rarität
const KEY_MILESTONES = [1];

// Zustand: welche Meilensteine je Kategorie wurden bereits "gesehen"
let achievementsState = {
  seen: {
    boxes: 0,                // höchster erreichten Box-Meilenstein (Anzahl)
    gold: 0,                 // höchster erreichten Gold-Meilenstein (Betrag)
    collection: {            // pro Rarität: höchster Prozent-Meilenstein (0/25/50/75/100)
      Common: 0, Rare: 0, Epic: 0, Legendary: 0, Mythisch: 0, Aetherisch: 0
    },
    // pro Rarität: höchster erreichten Schlüssel-Meilenstein (Anzahl)
    keys: { Common: 0, Rare: 0, Epic: 0, Legendary: 0, Mythisch: 0 }
  }
};

// Titel-System: Level → Titel
const titles = [
  { level: 0, title: "little Timmy" },
  { level: 5, title: "Anfänger" },
  { level: 10, title: "Sammler" },
  { level: 15, title: "Lootgoblin" },
  { level: 20, title: "Bäutebaron" },
  { level: 25, title: "Trüffelschweinchen" },
  { level: 30, title: "Meister" },
  { level: 40, title: "Champion" },
  { level: 50, title: "Legende" }
];

const MAX_LEVEL = 50;

// ======= Shop System =======
// Ausrüstung (permanent, einzelne Gegenstände)
const shopItems = {
  // Temporäre Boosts
  tempValueBoost: {
    name: "Glücksanhänger",
    description: "Nächste 5 Öffnungen: +50% Item-Wert",
    icon: "🍀",
    cost: 5000,
    type: "temp",
    effect: { type: "valueBoost", value: 0.5, uses: 5 }
  },
  tempRarityBoost: {
    name: "Vierblättriges Kleeblatt",
    description: "Nächste 5 Öffnungen: Erhöhte Rare+ Chancen",
    icon: "🌿",
    cost: 5000,
    type: "temp",
    effect: { type: "rarityBoost", value: 0.15, uses: 5 }
  },
  tempXPBoost: {
    name: "Wissenselixier",
    description: "Nächste 5 Öffnungen: +100% XP",
    icon: "📚",
    cost: 5000,
    type: "temp",
    effect: { type: "xpBoost", value: 1.0, uses: 5 }
  },
  
  // Permanente Upgrades
  permSlotIncrease: {
    name: "Flinke Handschuhe",
    description: "dauerhaft +10% schnelleres Durchsuchen",
    icon: "🧤",
    cost: 25000,
    type: "perm",
    effect: { type: "permTempoBoost", value: 0.10 }
  },
  permValueBoost: {
    name: "Händler-Lizenz",
    description: "dauerhaft +10% erhöhter Item-Wert",
    icon: "💼",
    cost: 50000,
    type: "perm",
    effect: { type: "permValueBoost", value: 0.1 }
  },
  permXPBoost: {
    name: "Erfahrungs-Amulett",
    description: "dauerhaft +25% erhöhter XP-Gewinn",
    icon: "⚡",
    cost: 40000,
    type: "perm",
    effect: { type: "permXPBoost", value: 0.25 }
  },
  permPotionBelt: {
    name: "Trankgürtel",
    description: "+1 Aufladung pro Kauf. +Quickslots außerhalb des Shops.",
    icon: "🧪",
    cost: 30000,
    type: "perm",
    effect: { type: "permPotionBelt", value: 1 }
  },
  permAutoClicker: {
    name: "Auto-Öffner",
    description: "Öffnet automatisch Boxen alle 3 Sekunden (wenn genug Geld vorhanden)",
    icon: "🤖",
    cost: 100000,
    type: "perm",
    effect: { type: "permAutoClicker", value: 1 }
  },
  permAutoClickerSpeed1: {
    name: "Auto-Öffner",
    description: "Upgrade: Reduziert Wartezeit auf 2 Sekunden (benötigt Auto-Öffner)",
    icon: "🤖⚡",
    cost: 250000,
    type: "perm",
    effect: { type: "permAutoClickerSpeed1", value: 1 }
  },
  permAutoClickerSpeed2: {
    name: "Auto-Öffner",
    description: "Upgrade: Reduziert Wartezeit auf 1 Sekunde (benötigt vorheriges Upgrade)",
    icon: "🤖⚡⚡",
    cost: 500000,
    type: "perm",
    effect: { type: "permAutoClickerSpeed2", value: 1 }
  }
};

// Stackbare Status-Upgrades (ähnlich Skilltree, aber mit 💰 kaufbar und steigenden Kosten)
const shopStatUpgrades = {
  wealth: {
    name: 'Wertsteigerung',
    icon: '💹',
    description: '+2% Item-Wert pro Stufe (stackbar)',
    baseCost: 5000,
    costFactor: 1.6, // Kosten steigen multiplicativ je Stufe
    perLevel: { type: 'wealth', value: 0.02 }
  },
  luck: {
    name: 'Glückstraining',
    icon: '🍀',
    description: '+1 Glückspunkt pro Stufe (stackbar)',
    baseCost: 5000,
    costFactor: 1.6,
    perLevel: { type: 'luck', value: 1 }
  },
  tempo: {
    name: 'Effizienz-Training',
    icon: '⚡',
    description: '-2% Untersuchungszeit pro Stufe (stackbar)',
    baseCost: 5000,
    costFactor: 1.6,
    perLevel: { type: 'tempo', value: 0.02 }
  }
};

// Fortschritt/Levelstände der stackbaren Status-Upgrades
let statUpgradesLevels = {
  wealth: 0,
  luck: 0,
  tempo: 0
};

function getStatUpgradeCost(key) {
  const cfg = shopStatUpgrades[key];
  const lvl = statUpgradesLevels[key] || 0;
  if (!cfg) return Infinity;
  return Math.round(cfg.baseCost * Math.pow(cfg.costFactor, lvl));
}

// Aktive temporäre Boosts
let activeBoosts = {
  valueBoost: 0,
  rarityBoost: 0,
  xpBoost: 0,
  valueBoostUses: 0,
  rarityBoostUses: 0,
  xpBoostUses: 0
};

// Permanente Upgrades (Zähler)
let permanentUpgrades = {
  permTempoBoost: 0,
  permValueBoost: 0,
  permXPBoost: 0,
  permPotionBelt: 0,
  permAutoClicker: 0,
  permAutoClickerSpeed1: 0,
  permAutoClickerSpeed2: 0
};

// Background-System
let unlockedBackgrounds = new Set(['default']); // Freigeschaltete Hintergründe
let activeBackground = 'default'; // Aktuell aktiver Hintergrund

// Hintergrund-Definitionen
const backgrounds = {
  default: {
    name: 'Standard',
    description: 'Der klassische Hintergrund',
    unlocked: true,
    type: 'image',
    value: 'Backgroundbilder/Abandoned Building.png',
    fallbackColor: '#134e5e'
  },
  // Gradient Hintergründe
  ocean: {
    name: 'Ozean',
    description: 'Tiefblaue Meerestiefen',
    unlockCondition: 'prestige1',
    type: 'image',
    value: 'Backgroundbilder/Ocean.png',
    fallbackColor: '#134e5e'
  },
  forest: {
    name: 'Wald',
    description: 'Waldlichtung',
    unlockCondition: 'prestige10',
    type: 'image',
    value: 'Backgroundbilder/Wald.png',
    fallbackColor: '#134e5e'
  },
  aurora: {
    name: 'Nordlicht',
    description: 'Schillernde Polarlichter',
    unlockCondition: 'prestige20',
    type: 'image',
    value: 'Backgroundbilder/Nordlicht.png',
    fallbackColor: '#134e5e'
  },
  volcano: {
    name: 'Vulkan',
    description: 'Glühende Lava',
    unlockCondition: 'prestige30',
    type: 'image',
    value: 'Backgroundbilder/Vulkan.png',
    fallbackColor: '#134e5e'
  },
  galaxy: {
    name: 'Galaxie',
    description: 'Sternenwirbel',
    unlockCondition: 'mythic100',
    type: 'image',
    value: 'Backgroundbilder/Galaxie.png',
    fallbackColor: '#1a0033'
  },
  aether: {
    name: 'Äther',
    description: 'Ätherische Dimensionen',
    unlockCondition: 'aetheric10',
    type: 'gradient',
    value: 'linear-gradient(135deg, #8e2de2 0%, #4a00e0 100%)'
  },
  // Saisonale Hintergründe
  christmas: {
    name: 'Weihnachten',
    description: 'Winterliche Schneelandschaft',
    unlockCondition: 'seasonal_christmas',
    type: 'image',
    value: 'Backgroundbilder/Weihnachten.png',
    fallbackColor: '#e8f4f8',
    seasonal: true,
    event: 'christmas'
  }
};

// Auto-Clicker Toggle State (unabhängig vom Upgrade)
let autoClickerEnabled = false; // Default: AUS
let autoClickerCanRun = false; // Erlaubt Auto-Clicks erst nach manuellem Öffnen
let autoClickerSpeed = 3; // Default: 3 Sekunden (3s → 2s → 1s)

// Gekaufte Items (für "Ausverkauft"-Status bei Einmal-Items)
let purchasedItems = new Set();

// ======= Schlüssel-System (pro Rarität) =======
// Inventar der Schlüssel pro Rarität
let keysInventory = {
  Common: 0,
  Rare: 0,
  Epic: 0,
  Legendary: 0,
  Mythisch: 0
};
// Nur diese Raritäten besitzen Schlüssel (nicht: Aetherisch)
const KEYS_RARITIES = ['Common','Rare','Epic','Legendary','Mythisch'];
// Einmal-Flag, um die nächste Öffnung kostenlos zu machen (durch Schlüssel)
let __nextOpenIsFree = false;

// Berechnet benötigte XP für nächstes Level (exponentielle Kurve)
function getXPForLevel(level) {
  // Ziel: Gesamtsumme 0→50 ≈ 25.000.000 XP
  // Beibehaltene Basis: 500, Wachstumsfaktor feinjustiert auf ~1.203
  // Summe S ≈ 500 * (1.203^50 - 1) / (1.203 - 1) ≈ 25.1 Mio (ohne floor)
  // Hinweis: floor() pro Stufe reduziert die reale Summe leicht Richtung 25 Mio.
  if (level > MAX_LEVEL) return Infinity;
  const BASE_XP = 500;
  const GROWTH = 1.203; // vorher 1.21
  return Math.floor(BASE_XP * Math.pow(GROWTH, level));
}

// Gibt aktuellen Titel basierend auf Level zurück
function getCurrentTitle() {
  let currentTitle = titles[0].title;
  for (let i = 0; i < titles.length; i++) {
    if (playerLevel >= titles[i].level) {
      currentTitle = titles[i].title;
    }
  }
  return currentTitle;
}

// Item-Pool pro Rarität
// ======= Item-Pools =======
// Jedes Item sollte mindestens name, icon, value und description haben.
const itemPools = {
  Common: [
    // Schlüssel (Common) – sehr selten innerhalb der Common-Rarität
  { name: "Schlüssel: Gewöhnlich", icon: "Itembilder/Common/common schlüssel.png", value: 0, description: "Öffnet einen gewöhnlichen Raum mit Common-lastigen Loot.", isKey: true, dropWeight: 0.75, gridSize: {width: 1, height: 1} },
    { name: "Rostige Münze", icon: "Itembilder/Common/rusty coin.png", value: 15, description: "Ein alter, wertloser Münzfund.", gridSize: {width: 1, height: 1} },
    { name: "Holzbrett", icon: "Itembilder/Common/Holzbrett.png", value: 40, description: "Nichts weiter als ein altes Holzbrett.", gridSize: {width: 1, height: 2} },
    { name: "Taschentuch", icon: "Itembilder/Common/Taschentuch.png", value: 18, description: "Eine fast leere Packung Taschentücher.", gridSize: {width: 1, height: 1} },
    { name: "Streichhölzer", icon: "Itembilder/Common/Streichholz.png", value: 25, description: "Eine Schachtel alte Streichhölzer.", gridSize: {width: 1, height: 1} },
    { name: "Kronkorken", icon: "Itembilder/Common/bottle cap.png", value: 22, description: "Ein Verschluss von einer Flasche.", gridSize: {width: 1, height: 1} },
    { name: "Fischgräte", icon: "Itembilder/Common/Gräte.png", value: 30, description: "Überreste einer längst verzehrten Mahlzeit.", gridSize: {width: 1, height: 1} },
    { name: "Eichel", icon: "Itembilder/Common/Eichel.png", value: 28, description: "Eine Frucht vom Eichenbaum.", gridSize: {width: 1, height: 1} },
    { name: "Göffel", icon: "Itembilder/Common/Göffel.png", value: 35, description: "Eine Mischung aus Gabel und Löffel.", gridSize: {width: 1, height: 1} },
    { name: "Leere Karte", icon: "Itembilder/Common/LeereKarte.png", value: 32, description: "Ein Stück unbeschriebenes Pergament.", gridSize: {width: 1, height: 1} },
    { name: "Kaputte Brille", icon: "Itembilder/Common/kaputte Brille.png", value: 24, description: "Eine Brille die schonmal bessere Tage gesehen hat...", gridSize: {width: 1, height: 1} },
    { name: "Knopf", icon: "Itembilder/Common/Knopf.png", value: 16, description: "Ein einzelner Knopf von einem Hemd.", gridSize: {width: 1, height: 1} },
    { name: "Korken", icon: "Itembilder/Common/Korken.png", value: 19, description: "Ein alter Flaschenkorken.", gridSize: {width: 1, height: 1} },
    { name: "Seil", icon: "Itembilder/Common/Seil.png", value: 26, description: "Ein kurzes, ausgefranstes Seil.", gridSize: {width: 1, height: 1} },
    { name: "Stofflappen", icon: "Itembilder/Common/Stofflappen.png", value: 17, description: "Ein schmutziger Lappen.", gridSize: {width: 1, height: 1} },
    { name: "Metallschrott", icon: "Itembilder/Common/Metallschrott.png", value: 29, description: "Ein altes Stück Metall.", gridSize: {width: 1, height: 1} },
    { name: "Alte Dose", icon: "Itembilder/Common/Dose.png", value: 21, description: "Eine zerbeulte, leere Dose.", gridSize: {width: 1, height: 1} },
    { name: "Einzelne Socke", icon: "Itembilder/Common/Einzelner Socke.png", value: 20, description: "Wo ist der andere hin?", gridSize: {width: 1, height: 1} },
    { name: "Gummiband", icon: "Itembilder/Common/Gummiband.png", value: 18, description: "Ein ausgeleiertes Haargummi.", gridSize: {width: 1, height: 1} },
    { name: "Alter Schlüssel", icon: "Itembilder/Common/alter Schlüssel.png", value: 23, description: "Passt nirgendwo rein.", gridSize: {width: 1, height: 1} },
    { name: "Alte Eintrittskarte", icon: "Itembilder/Common/Kinoticket.png", value: 19, description: "Freier Eintritt! ...für ein längst vergangenes Event.", gridSize: {width: 1, height: 1} },
    { name: "Briefumschlag", icon: "Itembilder/Common/Briefumschlag.png", value: 17, description: "Leer und vergilbt.", gridSize: {width: 1, height: 1} },
    { name: "Stempel", icon: "Itembilder/Common/Stempel.png", value: 27, description: "Ein alter Bürostempel.", gridSize: {width: 1, height: 1} },
    { name: "Schere", icon: "Itembilder/Common/Schere.png", value: 31, description: "Stumpf und verrostet.", gridSize: {width: 1, height: 1} },
    { name: "Stift", icon: "Itembilder/Common/Stift.png", value: 20, description: "Schreibt nicht mehr.", gridSize: {width: 1, height: 1} },
    { name: "Schraube", icon: "Itembilder/Common/Schraube.png", value: 22, description: "Eine einzelne Schraube.", gridSize: {width: 1, height: 1} },
    { name: "Mutter & Bolzen", icon: "Itembilder/Common/Muttern und Bolzen.png", value: 25, description: "Alt und verrostet.", gridSize: {width: 1, height: 1} },
    { name: "Draht", icon: "Itembilder/Common/Draht.png", value: 24, description: "Ein Stück Draht.", gridSize: {width: 1, height: 1} },
    { name: "Schraubendreher", icon: "Itembilder/Common/Schraubendreher.png", value: 35, description: "Schlecht für die Leber.", gridSize: {width: 1, height: 2} },
    { name: "Leerer Milchkarton", icon: "Itembilder/Common/Milchkarton.png", value: 18, description: "Riecht leicht säuerlich.", gridSize: {width: 1, height: 1} },
    { name: "Plastikflasche", icon: "Itembilder/Common/Plastikflasche.png", value: 19, description: "Eine leere Wasserflasche.", gridSize: {width: 1, height: 1} },
    { name: "Zigarettenstummel", icon: "Itembilder/Common/Zigarettenstummel.png", value: 15, description: "Eklig und nutzlos.", gridSize: {width: 1, height: 1} },
    { name: "Kaffeefilter", icon: "Itembilder/Common/Kaffeefilter.png", value: 17, description: "Gebraucht und fleckig.", gridSize: {width: 1, height: 1} },
    { name: "Teebeutel", icon: "Itembilder/Common/Teebeutel.png", value: 16, description: "Längst durchgezogen.", gridSize: {width: 1, height: 1} },
    { name: "Wäscheklammer", icon: "Itembilder/Common/Wäscheklammer.png", value: 8, description: "Eine einzelne Wäscheklammer.", gridSize: {width: 1, height: 1} },
    { name: "Plastiktüte", icon: "Itembilder/Common/Plastiktüte.png", value: 4, description: "Vom Supermarkt, mehrfach verwendet.", gridSize: {width: 1, height: 1} },
    { name: "Büroklammer", icon: "Itembilder/Common/Büroklammer.png", value: 6, description: "Eine kleine aber feine Klammer.", gridSize: {width: 1, height: 1} },
    { name: "Radiergummi", icon: "Itembilder/Common/Radiergummi.png", value: 9, description: "Hart und brüchig geworden.", gridSize: {width: 1, height: 1} },
    { name: "Reißzwecke", icon: "Itembilder/Common/Reißzwecke.png", value: 6, description: "Immer noch spitz.", gridSize: {width: 1, height: 1} },
    { name: "Zahnstocher", icon: "Itembilder/Common/Zahnstocher.png", value: 3, description: "Ein Zahnstocher sie alle zu knechten.", gridSize: {width: 1, height: 1} },
  ],
  Rare: [
    // Rare slot Value ~ 150
    { name: "Schlüssel: Selten", icon: "Itembilder/Selten/seltener Schlüssel.png", value: 0, description: "Öffnet einen seltenen Raum mit Rare-lastigen Loot.", isKey: true, dropWeight: 0.6, gridSize: {width: 1, height: 1} },
    { name: "Silber Ring", icon: "Itembilder/Selten/Silber Ring.png", value: 150, description: "Ein hübscher Ring mit leichtem Glanz.", gridSize: {width: 1, height: 1} },
    { name: "Schatzkarte", icon: "Itembilder/Selten/Map.png", value: 250, description: "Zeigt vergessene Wege.", gridSize: {width: 1, height: 1} },
    { name: "Schachtel Zigaretten", icon: "Itembilder/Selten/zigaretten.png", value: 180, description: "\"Mit dem Rauchen aufzuhören ist kinderleicht. Ich habe es schon hundert Mal gemacht.\"", quoteAuthor: "Mark Twain" },
    { name: "Kartenspiel", icon: "Itembilder/Selten/Kartenspiel.png", value: 150, description: "Ein klassisches Deck.", gridSize: {width: 1, height: 1} },
    { name: "Vintage-Feuerzeug", icon: "Itembilder/Selten/Feuerzeug.png", value: 160, description: "Ein altes Zippo.", gridSize: {width: 1, height: 1} },
    { name: "Alte Armbanduhr", icon: "Itembilder/Selten/Armbanduhr.png", value: 200, description: "Mechanisch, läuft noch präzise.", gridSize: {width: 1, height: 1} },
    { name: "Lederbrieftasche", icon: "Itembilder/Selten/Brieftasche.png", value: 160, description: "Hochwertig verarbeitet, leicht abgenutzt.", gridSize: {width: 1, height: 1} },
    { name: "Schweizer Taschenmesser", icon: "Itembilder/Selten/Taschenmesser.png", value: 180, description: "Mit allen wichtigen Werkzeugen.", gridSize: {width: 1, height: 1} },
    { name: "Briefmarken-Sammlung", icon: "Itembilder/Selten/Briefmarken.png", value: 750, description: "Seltene Exemplare aus den 1950ern.", gridSize: {width: 2, height: 2} },
    { name: "Silbermünze", icon: "Itembilder/Selten/Silbermünze.png", value: 190, description: "\"Mein erster Groschen!.\"", quoteAuthor: "Eugene H. Krabs" },
    { name: "Digitalkamera", icon: "Itembilder/Selten/Kamera.png", value: 600, description: "Alte Profi-Kamera, funktioniert noch.", gridSize: {width: 2, height: 2} },
    { name: "Taschenlampe (LED)", icon: "Itembilder/Selten/Taschenlampe.png", value: 450, description: "Extrem hell.", gridSize: {width: 2, height: 1} },
    { name: "Multimeter", icon: "Itembilder/Selten/Multimeter.png", value: 420, description: "Für allerlei elektronischen Messungen.", gridSize: {width: 1, height: 2} },
    { name: "Taschenuhr", icon: "Itembilder/Selten/Taschenuhr.png", value: 260, description: "Goldüberzogen, mit Kette.", gridSize: {width: 1, height: 1} },
    { name: "Silberkette", icon: "Itembilder/Selten/Silberkette.png", value: 180, description: "Fein gearbeitet, leicht angelaufen.", gridSize: {width: 1, height: 1} },
    { name: "Netzteil", icon: "Itembilder/Selten/Netzteil.png", value: 170, description: "Universalnetzteil, liefert zuverlässig Strom.", gridSize: {width: 1, height: 1} },
    { name: "Brosche", icon: "Itembilder/Selten/Brosche.png", value: 160, description: "Mit kleinem Edelstein verziert.", gridSize: {width: 1, height: 1} },
    { name: "Holz-Spielzeug", icon: "Itembilder/Selten/Holz-Spielzeug.png", value: 200, description: "Ein Andenken an einfachere Zeiten.", gridSize: {width: 1, height: 1} },
    { name: "Postkarten-Sammlung", icon: "Itembilder/Selten/Postkarten.png", value: 180, description: "Aus aller Welt, teilweise frankiert.", gridSize: {width: 1, height: 1} },
    { name: "Comic Heft", icon: "Itembilder/Selten/Comic.png", value: 550, description: "Erste Ausgabe, leicht vergilbt.", gridSize: {width: 1, height: 2} },
    { name: "USB-Stick", icon: "Itembilder/Selten/USB.png", value: 160, description: "Ein 8GB Stick, was da wohl drauf ist?", gridSize: {width: 1, height: 1} },
    { name: "Kopfhörer", icon: "Itembilder/Selten/Kopfhörer.png", value: 690, description: "Over-Ear, noch funktionsfähig.", gridSize: {width: 2, height: 2} },
    { name: "Wecker (Analog)", icon: "Itembilder/Selten/Wecker.png", value: 140, description: "Mit lautem Klingeln.", gridSize: {width: 1, height: 1} },
    { name: "Taschenrechner", icon: "Itembilder/Selten/Taschenrechner.png", value: 160, description: "Besitzt nichtmal ein Pluszeichen...", gridSize: {width: 1, height: 1} },
    { name: "Zange", icon: "Itembilder/Selten/Zange.png", value: 340, description: "Kombinationszange in gutem Zustand.", gridSize: {width: 2, height: 1} },
    { name: "Hammer", icon: "Itembilder/Selten/Hammer.png", value: 350, description: "Kleiner Schlosserhammer.", gridSize: {width: 1, height: 2} },
    { name: "Maßband", icon: "Itembilder/Selten/Maßband.png", value: 160, description: "5 Meter, etwas ausgeleiert.", gridSize: {width: 1, height: 1} },
    { name: "Schraubenschlüssel", icon: "Itembilder/Selten/Schraubenschlüssel.png", value: 340, description: "Leicht rostig.", gridSize: {width: 1, height: 2} },
    { name: "Sonnenbrille", icon: "Itembilder/Selten/Sonnenbrille.png", value: 380, description: "UV-Strahlen hassen diesen Trick...", gridSize: {width: 2, height: 1} },
    { name: "Geldbeutel", icon: "Itembilder/Selten/Geldbeutel.png", value: 190, description: "Leder, mit initialen Prägung.", gridSize: {width: 1, height: 1} }
  ],
  Epic: [
    // Epic slot Value ~ 1500
    { name: "Schlüssel: Episch", icon: "Itembilder/Episch/epischer Schlüssel.png", value: 0, description: "Öffnet einen epischen Raum mit Epic-lastigen Loot.", isKey: true, dropWeight: 0.45, gridSize: {width: 1, height: 2} },
    { name: "Verzauberte Schriftrolle", icon: "Itembilder/Episch/Scroll.png", value: 7500, description: "Ein Zauber, der nur einmal wirkt.", gridSize: {width: 2, height: 2} },
    { name: "Phönixfeder", icon: "Itembilder/Episch/Phoenix Feder.png", value: 3500, description: "Glüht leicht in deiner Hand.", gridSize: {width: 1, height: 2} },
    { name: "Perlenkette", icon: "Itembilder/Episch/Perlenkette.png", value: 1550, description: "Echte Süßwasserperlen.", gridSize: {width: 1, height: 1} },
    { name: "Bernsteinanhänger", icon: "Itembilder/Episch/Bernstein.png", value: 1500, description: "Mit eingeschlossenem Insekt.", gridSize: {width: 1, height: 1} },
    { name: "Antike Schreibfeder", icon: "Itembilder/Episch/Schreibfeder.png", value: 1750, description: "liegt schwungvoll in der Hand.", gridSize: {width: 1, height: 2} },
    { name: "Goldkette", icon: "Itembilder/Episch/Goldkette.png", value: 1400, description: "Schwere 18-Karat-Goldkette.", gridSize: {width: 1, height: 1} },
    { name: "Diamantring", icon: "Itembilder/Episch/Diamantring.png", value: 1600, description: "Kleiner, aber echter Diamant.", gridSize: {width: 1, height: 1} },
    { name: "Smaragd-Ohrringe", icon: "Itembilder/Episch/Smaragd-Ohrringe.png", value: 1450, description: "Facettierte grüne Edelsteine.", gridSize: {width: 1, height: 1} },
    { name: "Rubinanhänger", icon: "Itembilder/Episch/Rubinanhänger.png", value: 1500, description: "Tiefrotes Juwel in Goldfassung.", gridSize: {width: 1, height: 1} },
    { name: "Sextant", icon: "Itembilder/Episch/Sextant.png", value: 6900, description: "Navigationsgerät aus Messing.", gridSize: {width: 2, height: 2} },
    { name: "Antike Taschenuhr", icon: "Itembilder/Episch/Taschenuhr_antik.png", value: 2900, description: "Mit aufwendiger Gravur, funktioniert noch.", gridSize: {width: 1, height: 2} },
    { name: "Porzellanfigur", icon: "Itembilder/Episch/Porzellanfigur.png", value: 6850, description: "Meißener Porzellan, feiner Riss.", gridSize: {width: 2, height: 2} },
    { name: "Alte Bibel", icon: "Itembilder/Episch/Bibel.png", value: 6666, description: "Ledereinband, handgeschrieben, aus dem 19. Jahrhundert.", gridSize: {width: 2, height: 2} },
    { name: "Signierte Schallplatte", icon: "Itembilder/Episch/signierte Schallplatte.png", value: 6800, description: "Erstausgabe mit Autogramm.", gridSize: {width: 2, height: 2} },
    { name: "Vintage-Kamera", icon: "Itembilder/Episch/vintage_kamera.png", value: 6850, description: "Leica aus den 60ern, funktionsfähig.", gridSize: {width: 2, height: 2} },
    { name: "Röhrenradio", icon: "Itembilder/Episch/röhrenradio.png", value: 6900, description: "Retro-Radio aus Holz, spielt noch.", gridSize: {width: 2, height: 2} },
    { name: "Schreibmaschine", icon: "Itembilder/Episch/schreibmaschine.png", value: 6850, description: "Mechanische Underwood, alle Tasten funktionieren.", gridSize: {width: 2, height: 2} },
    { name: "Ölgemälde", icon: "Itembilder/Episch/oelgemaelde.png", value: 6000, description: "Signiertes Landschaftsbild, Rahmen vergoldet.", gridSize: {width: 2, height: 2} },
    { name: "Marmor-Statue", icon: "Itembilder/Episch/marmorstatue.png", value: 11500, description: "Eine edle Figur, schwer und detailreich.", gridSize: {width: 2, height: 3} },
    { name: "Kristall-Vase", icon: "Itembilder/Episch/kristall_vase.png", value: 9000, description: "Handgeschliffen, böhmisches Glas.", gridSize: {width: 2, height: 2} },
    { name: "Dolch (Antik)", icon: "Itembilder/Episch/dolch.png", value: 3800, description: "Zeremoniendolch mit Verzierungen.", gridSize: {width: 1, height: 2} },
    { name: "Militärkompass", icon: "Itembilder/Episch/militaerkompass.png", value: 700, description: "Aus dem 2. Weltkrieg, funktioniert noch.", gridSize: {width: 1, height: 1} },
    { name: "Orden & Medaille", icon: "Itembilder/Episch/orden.png", value: 950, description: "Militärische Auszeichnung mit Band.", gridSize: {width: 1, height: 1} },
    { name: "Pelzmantel", icon: "Itembilder/Episch/pelzmantel.png", value: 12500, description: "Vintage, ethisch fragwürdig, aber wertvoll.", gridSize: {width: 2, height: 3} },
    
  ],
  Legendary: [
    // Legendary slot Value ~ 10000
  { name: "Schlüssel: Legendär", icon: "Itembilder/Legendär/legendärer Schlüssel.png", value: 0, description: "Öffnet einen legendären Raum mit Legendary-lastigen Loot.", isKey: true, dropWeight: 0.3, gridSize: {width: 1, height: 1} },
    { name: "Drachenschuppe", icon: "Itembilder/Legendär/Drachenschuppe.png", value: 39000, description: "Unzerstörbar und selten.", gridSize: {width: 2, height: 2} },
    { name: "Goldblock", icon: "Itembilder/Legendär/Goldblock.png", value: 18000, description: "Ein massiver Block aus reinem Gold.", gridSize: {width: 1, height: 2} },
    { name: "Golduhr", icon: "Itembilder/Legendär/Golduhr.png", value: 9500, description: "Eine prächtige Uhr aus Gold und Diamanten.", gridSize: {width: 1, height: 1} },
    { name: "Kronjuwel", icon: "Itembilder/Legendär/Kronjuwel.png", value: 31500, description: "Ein seltener Edelstein aus königlichem Besitz.", gridSize: {width: 2, height: 2} },
    { name: "Platinbarren", icon: "Itembilder/Legendär/Platinbarren.png", value: 19500, description: "Schwer, selten und äußerst wertvoll.", gridSize: {width: 1, height: 2} },
    { name: "Ritterrüstung (Antik)", icon: "Itembilder/Legendär/Ritterrüstung.png", value: 58000, description: "Vollplatte, musealer Zustand.", gridSize: {width: 2, height: 3} },
    { name: "Meisterwerk-Gemälde", icon: "Itembilder/Legendär/Meisterwerk.png", value: 37000, description: "Ein signiertes Original eines Meisters.", gridSize: {width: 2, height: 2} },
    { name: "Schwarze Perle", icon: "Itembilder/Legendär/Schwarze Perle.png", value: 9800, description: "Seltene Perle mit tiefschwarzem Glanz.", gridSize: {width: 1, height: 1} },
    { name: "Kristallschädel", icon: "Itembilder/Legendär/Kristallschädel.png", value: 38400, description: "Mysteriöses Artefakt aus Kristall.", gridSize: {width: 2, height: 2} },
    { name: "Königszepter", icon: "Itembilder/Legendär/Königszepter.png", value: 35000, description: "Symbol königlicher Macht, reich verziert.", gridSize: {width: 1, height: 2} },
    { name: "Runenstein", icon: "Itembilder/Legendär/Runenstein.png", value: 28600, description: "Antiker Stein mit leuchtenden Runen.", gridSize: {width: 2, height: 2} }
  ],
  Mythisch: [
    // Mythisch slot Value ~ 50000
  { name: "Schlüssel: Mythisch", icon: "Itembilder/Mythisch/Schlüssel Mythisch.png", value: 0, description: "Öffnet einen mythischen Raum mit hochwertigem Loot.", isKey: true, dropWeight: 0.15, gridSize: {width: 1, height: 1} },
    { name: "Mystische Klinge", icon: "Itembilder/Mythisch/mystic_blade.png", value: 180000, description: "Eine legendäre Klinge mit uralter Macht.", gridSize: {width: 2, height: 3} },
    { name: "Goldener Löwe", icon: "Itembilder/Mythisch/Goldener Löwe.png", value: 250000, description: "Ein goldenes Abbild von Stärke, Mut und Tapferkeit.", gridSize: {width: 2, height: 3} },
    { name: "Vergoldete Statue", icon: "Itembilder/Mythisch/Vergoldete Statue.png", value: 190000, description: "Eine Majestätische Figur aus Marmor und Gold.", gridSize: {width: 2, height: 3} },
    { name: "Philosophenstein", icon: "Itembilder/Mythisch/philosophenstein.png", value: 210000, description: "Verwandelt das Gewöhnliche in Gold.", gridSize: {width: 2, height: 2} },
    { name: "Singularitätskern", icon: "Itembilder/Mythisch/singularitaetskern.png", value: 240000, description: "Komprimierte Raumzeit in einer Kapsel.", gridSize: {width: 2, height: 2} },
    { name: "Ewige Flamme", icon: "Itembilder/Mythisch/Ewige Flamme1.png", value: 170000, description: "Brennt ohne jede Quelle weiter.", gridSize: {width: 2, height: 3} },
    { name: "Ätherisches Grimoire", icon: "Itembilder/Mythisch/aetherisches_grimoire.png", value: 175000, description: "Die Seiten ändern sich bei jedem Öffnen.", gridSize: {width: 2, height: 2} },
    { name: "Königsrüstung", icon: "Itembilder/Mythisch/Königsrüstung.png", value: 160000, description: "Findet Wege zwischen Dimensionen.", gridSize: {width: 2, height: 3} },
    { name: "Schattenmantel", icon: "Itembilder/Mythisch/Schattenmantel.png", value: 190000, description: "Lässt dich im Dunkel verschwinden.", gridSize: {width: 2, height: 3} },
    { name: "Zeitreisekompass", icon: "Itembilder/Mythisch/zeitkompass.png", value: 190000, description: "Zeigt nicht Norden, sondern Morgen.", gridSize: {width: 2, height: 2} }
  ]
  ,
  Aetherisch: [
    { name: "Floki", icon: "Itembilder/Aetherisch/Floki.jpg", value: 500000, description: "Floki, Schlächter von Dreamies und besetzer der Kartons.", gridSize: {width: 2, height: 3} },
    { name: "Biene", icon: "Itembilder/Aetherisch/Biene.jpg", value: 500000, description: "Biene, Träger des Fluffs und besetzerin von Höhlen.", gridSize: {width: 3, height: 2} },
    { name: "Simba", icon: "Itembilder/Aetherisch/Simba.jpg", value: 500000, description: "Simba, König des Türkisen Stuhls.", gridSize: {width: 2, height: 3} }
  ]
};

// Sortiere alle Itemlisten pro Kategorie alphabetisch nach Namen (de-DE, Groß/Kleinschreibung ignoriert)
try {
  for (const rarityKey of Object.keys(itemPools)) {
    const arr = itemPools[rarityKey] || [];
    arr.sort((a, b) => (a?.name || '').localeCompare(b?.name || '', 'de', { sensitivity: 'base' }));
  }
} catch (e) {
  console.warn('Alphabetische Sortierung der Item-Pools fehlgeschlagen:', e);
}

// ======= SAISONALE ITEMS =======
// Saisonale Items werden zeitbasiert zu den normalen Item-Pools hinzugefügt
const seasonalItems = {
  christmas: {
    name: "Weihnachten",
    startDate: { month: 11, day: 19 },      // 19. November
    endDate: { month: 1, day: 6 },         // 6. Januar (Dreikönigstag)
    dropChance: 0.25,                       // 25% Chance auf saisonales Item statt normalem
    items: {
      Common: [
        { name: "Kohle", icon: "Saisonale items LS/Weihnachten/Common/Kohle.png", value: 15, description: "Für die ungezogenen Kinder.", seasonal: true, gridSize: {width: 1, height: 1} },
        { name: "Zuckerstange", icon: "Saisonale items LS/Weihnachten/Common/Zuckerstange.png", value: 25, description: "Rot-weiß gestreift und lecker.", seasonal: true, gridSize: {width: 1, height: 1} },
        { name: "Weihnachtsmütze", icon: "Saisonale items LS/Weihnachten/Common/Weihnachtsmütze.png", value: 30, description: "Ho ho ho!", seasonal: true, gridSize: {width: 1, height: 1} },
        { name: "Mistelzweig", icon: "Saisonale items LS/Weihnachten/Common/Mistelzweig.png", value: 35, description: "Für romantische Momente.", seasonal: true, gridSize: {width: 1, height: 1} },
        { name: "Milch und Kekse", icon: "Saisonale items LS/Weihnachten/Common/Milch und Kekse.png", value: 40, description: "Für den Weihnachtsmann.", seasonal: true, gridSize: {width: 1, height: 1} },
        { name: "Glöckchen", icon: "Saisonale items LS/Weihnachten/Common/Glökchen.png", value: 28, description: "Läutet die Weihnachtszeit ein.", seasonal: true, gridSize: {width: 1, height: 1} },
        { name: "Tannennadeln", icon: "Saisonale items LS/Weihnachten/Common/Tannennadeln.png", value: 18, description: "Vom Weihnachtsbaum gefallen.", seasonal: true, gridSize: {width: 1, height: 1} },
        { name: "Nussknacker", icon: "Saisonale items LS/Weihnachten/Common/Nussknacker.png", value: 32, description: "Knackt Nüsse wie ein Profi.", seasonal: true, gridSize: {width: 1, height: 2} },
        { name: "Weihnachtskugel", icon: "Saisonale items LS/Weihnachten/Common/Weihnachtskugel.png", value: 38, description: "Glänzender Baumschmuck.", seasonal: true, gridSize: {width: 1, height: 1} }
      ],
      Rare: [
        { name: "Lebkuchenmännchen", icon: "Saisonale items LS/Weihnachten/Selten/Lebkuchenmännchen.png", value: 120, description: "Frisch gebacken mit Zuckerguss.", seasonal: true, gridSize: {width: 1, height: 1} },
        { name: "Geschenk", icon: "Saisonale items LS/Weihnachten/Selten/Geschenk.png", value: 550, description: "Liebevoll verpackt.", seasonal: true, gridSize: {width: 2, height: 2} },
        { name: "Adventskranz", icon: "Saisonale items LS/Weihnachten/Selten/Adventskranz.png", value: 580, description: "Frohen Advent!", seasonal: true, gridSize: {width: 2, height: 2} },
        { name: "Engelsfigur", icon: "Saisonale items LS/Weihnachten/Selten/Engelsfigur.png", value: 165, description: "Wacht über das Fest.", seasonal: true, gridSize: {width: 1, height: 1} },
        { name: "Lebkuchenhaus", icon: "Saisonale items LS/Weihnachten/Selten/Lebkuchenhaus.png", value: 595, description: "Mit Zuckerguss verziert.", seasonal: true, gridSize: {width: 2, height: 2} },
        { name: "Spieluhr", icon: "Saisonale items LS/Weihnachten/Selten/Spieluhr.png", value: 210, description: "Spielt 'Stille Nacht'.", seasonal: true, gridSize: {width: 1, height: 1} },
        { name: "Weihnachtsstern", icon: "Saisonale items LS/Weihnachten/Selten/Weihnachtsstern.png", value: 155, description: "Pflanze in voller Blüte.", seasonal: true, gridSize: {width: 1, height: 1} }
      ],
      Epic: [
        { name: "Schneekugel", icon: "Saisonale items LS/Weihnachten/Episch/Schneekugel.png", value: 2850, description: "Schüttel sie und es schneit.", seasonal: true, gridSize: {width: 1, height: 1} },
        { name: "Schneeflocke", icon: "Saisonale items LS/Weihnachten/Episch/Schneeflocke.png", value: 2950, description: "Jede ist einzigartig.", seasonal: true, gridSize: {width: 1, height: 1} },
        { name: "Königlicher Nussknacker", icon: "Saisonale items LS/Weihnachten/Episch/Königlicher Nussknacker.png", value: 4150, description: "Bewacht das Wohnzimmer.", seasonal: true, gridSize: {width: 1, height: 2} },
        { name: "Weihnachtspyramide", icon: "Saisonale items LS/Weihnachten/Episch/Weihnachtspyramide.png", value: 6300, description: "Dreht sich durch Kerzenwärme.", seasonal: true, gridSize: {width: 2, height: 2} }
      ],
      Legendary: [
        { name: "Weihnachtsbaum", icon: "Saisonale items LS/Weihnachten/Legendär/Weihnachtsbaum.png", value: 48500, description: "Festlich geschmückt für ein besinnliches Fest.", seasonal: true, gridSize: {width: 2, height: 3} },
        { name: "Schneemann", icon: "Saisonale items LS/Weihnachten/Legendär/Schneemann.png", value: 49200, description: "Frosty höchstpersönlich.", seasonal: true, gridSize: {width: 2, height: 3} },
        { name: "Rentierfigur", icon: "Saisonale items LS/Weihnachten/Legendär/Rentierfigur.png", value: 49800, description: "Rudolphs kleiner Bruder.", seasonal: true, gridSize: {width: 2, height: 2} }
      ],
      Mythisch: [
        { name: "Schlitten", icon: "Saisonale items LS/Weihnachten/Mythisch/Schlitten.png", value: 195000, description: "Der Schlitten des Weihnachtsmanns.", seasonal: true, gridSize: {width: 3, height: 2} }
      ],
      Aetherisch: [
        { name: "Polarstern", icon: "Saisonale items LS/Weihnachten/Aetherisch/Polarstern.png", value: 520000, description: "Leitet die Weisen zum Stall.", seasonal: true, gridSize: {width: 3, height: 3} }
      ]
    }
  }
  // Weitere Events können hier hinzugefügt werden:
  // halloween: { ... },
  // easter: { ... },
  // etc.
};

// Prüft ob ein saisonales Event aktuell aktiv ist
function getActiveSeasonalEvent() {
  const now = new Date();
  const currentMonth = now.getMonth() + 1; // JavaScript: 0-11, wir wollen 1-12
  const currentDay = now.getDate();
  
  for (const [key, event] of Object.entries(seasonalItems)) {
    const { startDate, endDate } = event;
    
    // Event überspannt Jahreswechsel (z.B. Dez - Jan)
    if (startDate.month > endDate.month) {
      // Prüfe ob wir im Start-Jahr sind (nach Start-Datum)
      if (currentMonth > startDate.month || (currentMonth === startDate.month && currentDay >= startDate.day)) {
        return event;
      }
      // Prüfe ob wir im End-Jahr sind (vor End-Datum)
      if (currentMonth < endDate.month || (currentMonth === endDate.month && currentDay <= endDate.day)) {
        return event;
      }
    } else {
      // Normales Event innerhalb eines Jahres
      const afterStart = currentMonth > startDate.month || (currentMonth === startDate.month && currentDay >= startDate.day);
      const beforeEnd = currentMonth < endDate.month || (currentMonth === endDate.month && currentDay <= endDate.day);
      
      if (afterStart && beforeEnd) {
        return event;
      }
    }
  }
  
  // Kein Event aktiv - Reset der Event-Flags
  localStorage.removeItem('hasSeenSeasonalBackground_christmas');
  
  return null; // Kein aktives Event
}

// Erstellt kombinierte Item-Pools mit saisonalen Items
function getCombinedItemPools() {
  const activeEvent = getActiveSeasonalEvent();
  
  // Kein Event aktiv - normale Pools zurückgeben
  if (!activeEvent) {
    return itemPools;
  }
  
  // Event aktiv - kombiniere normale und saisonale Items
  const combined = {};
  
  for (const rarity of rarities) {
    const normalItems = itemPools[rarity] || [];
    const seasonalItemsForRarity = (activeEvent.items && activeEvent.items[rarity]) || [];
    
    // Kombiniere beide Arrays
    combined[rarity] = [...normalItems, ...seasonalItemsForRarity];
  }
  
  return combined;
}

// Modifizierte Hilfsfunktion für saisonale Item-Auswahl
function shouldDropSeasonalItem() {
  const activeEvent = getActiveSeasonalEvent();
  if (!activeEvent) return false;
  
  return Math.random() < activeEvent.dropChance;
}

// Box-Typen mit Qualität (Wahrscheinlichkeiten in Prozent)
const boxConfigs = {
  "Box#1": {
    cost: 0,
    columns: 2,
    rows: 2,
    weights: {
      Common: 75.00,
      Rare: 20.00,
      Epic: 5.00,
      Legendary: 0.00,
      Mythisch: 0.00
    }
  },
  "Box#8": {
    cost: 250000,
    columns: 6,
    rows: 4,
    weights: {
      Common: 10.0,
      Rare: 21.0,
      Epic: 59.5,
      Legendary: 9.0,
      Mythisch: 0.5,
      Aetherisch: 0.0
    }
  },
  "Box#9": {
    cost: 500000,
    columns: 6,
    rows: 4,
    weights: {
      Common: 7.0,
      Rare: 17.0,
      Epic: 61.85,
      Legendary: 12.85,
      Mythisch: 1.0,
      Aetherisch: 0.15
    }
  },
  "Box#10": {
    cost: 1000000,
    columns: 6,
    rows: 5,
    weights: {
      Common: 4.0,
      Rare: 12.0,
      Epic: 64.2,
      Legendary: 18.45,
      Mythisch: 1.3,
      Aetherisch: 0.25
    }
  },
  "Box#2": {
    cost: 500,
    columns: 3,
    rows: 2,
    weights: {
      Common: 66.00,
      Rare: 25.00,
      Epic: 7.55,
      Legendary: 0.50,
      Mythisch: 0.05
    }
  },
  "Box#3": {
    cost: 1000,
    columns: 4,
    rows: 2,
    weights: {
      Common: 57.00,
      Rare: 28.00,
      Epic: 11.15,
      Legendary: 1.00,
      Mythisch: 0.15
    }
  },
  "Box#4": {
    cost: 15000,
    columns: 4,
    rows: 3,
    weights: {
      Common: 46.00,
      Rare: 35.00,
      Epic: 16.00,
      Legendary: 1.75,
      Mythisch: 0.25
    }
  },
  "Box#5": {
    cost: 30000,
    columns: 5,
    rows: 3,
    weights: {
      Common: 35.00,
      Rare: 35.00,
      Epic: 21.10,
      Legendary: 2.75,
      Mythisch: 0.35
    }
  },
  "Box#6": {
    cost: 50000,
    columns: 6,
    rows: 3,
    weights: {
      Common: 25.00,
      Rare: 30.00,
      Epic: 34.20,
      Legendary: 3.75,
      Mythisch: 0.45
    }
  },
  "Box#7": {
    cost: 100000,
    columns: 6,
    rows: 4,
    weights: {
      Common: 15.00,
      Rare: 25.00,
      Epic: 55.00,
      Legendary: 4.50,
      Mythisch: 0.50
    }
  },
  // Schlüssel-Räume: spezielle Räume, die nur über Schlüssel zugänglich sind
  "KeyRoom_Common": {
    cost: 0,
    columns: 4,
    rows: 3,
    weights: {
      Common: 85,
      Rare: 14,
      Epic: 1,
      Legendary: 0,
      Mythisch: 0
    }
  },
  "KeyRoom_Rare": {
    cost: 0,
    columns: 4,
    rows: 3,
    weights: {
      Common: 50,
      Rare: 40,
      Epic: 9.75,
      Legendary: 0.25,
      Mythisch: 0
    }
  },
  "KeyRoom_Epic": {
    cost: 0,
    columns: 4,
    rows: 3,
    weights: {
      Common: 30,
      Rare: 40,
      Epic: 29.0,
      Legendary: 0.95,
      Mythisch: 0.05
    }
  },
  "KeyRoom_Legendary": {
    cost: 0,
    columns: 5,
    rows: 4,
    weights: {
      Common: 10,
      Rare: 30,
      Epic: 52.5,
      Legendary: 7.0,
      Mythisch: 0.5
    }
  },
  "KeyRoom_Mythisch": {
    cost: 0,
    columns: 6,
    rows: 5,
    weights: {
      Common: 0,
      Rare: 20,
      Epic: 60.0,
      Legendary: 14.9,
      Mythisch: 5.0,
      Aetherisch: 0.1
    }
  }
};

// Konstanten
// Slot-Größe responsiv an Bildschirmbreite anpassen
function computeSlotSize() {
  try {
    const w = Math.min(window.innerWidth || 0, document.documentElement.clientWidth || 9999) || window.innerWidth || 9999;
    if (w <= 360) return 64;
    if (w <= 480) return 72;
    if (w <= 768) return 84;
    return 100;
  } catch (_) { return 100; }
}
let SLOT_SIZE_PX = computeSlotSize();

// Item-Größen Konfiguration basierend auf Rarität
const ITEM_SIZES = {
  Common: { width: 1, height: 1 },      // 1x1
  Rare: { width: 1, height: 1 },        // 1x1
  Epic: { width: 2, height: 1 },        // 2x1 (breit)
  Legendary: { width: 2, height: 2 },   // 2x2 (groß)
  Mythisch: { width: 2, height: 2 },    // 2x2 (groß)
  Aetherisch: { width: 1, height: 2 }   // 1x2 (hoch)
};

// Aktueller gewählter Box-Typ und Kontostand
let boxType = "Box#1";
let balance = 500;
// Öffnungszustand, um Layout-Jumps beim Box-Wechsel während des Öffnens zu vermeiden
let isOpening = false;
let isPrestiging = false; // Verhindert mehrfaches Prestige
let pendingBoxType = null; // gewünschter Box-Wechsel, der nach Öffnung angewendet wird

// Box-Reihenfolge für Progression
const boxOrder = ["Box#1", "Box#2", "Box#3", "Box#4", "Box#5", "Box#6", "Box#7", "Box#8", "Box#9", "Box#10"];

// Anzeigenamen für die Boxen
const boxDisplayNames = {
  "Box#1": "Schublade",
  "Box#2": "Sporttasche",
  "Box#3": "Koffer",
  "Box#4": "Holzkiste",
  "Box#5": "Militärkoffer",
  "Box#6": "Safe",
  "Box#7": "Tresor",
  "Box#8": "Hochsicherheitstresor",
  "Box#9": "Geheimdepot",
  "Box#10": "Artefaktkammer",
  "KeyRoom_Common": "Gewöhnlicher Raum",
  "KeyRoom_Rare": "Seltener Raum",
  "KeyRoom_Epic": "Epischer Raum",
  "KeyRoom_Legendary": "Legendärer Raum",
  "KeyRoom_Mythisch": "Mythischer Raum"
};

// Icons für die Boxen
function getBoxIcon(boxName) {
  const icons = {
    "Box#1": "🗄️",
    "Box#2": "🎒",
    "Box#3": "💼",
    "Box#4": "📦",
    "Box#5": "🎖️",
    "Box#6": "🔒",
    "Box#7": "🏦",
    "Box#8": "🏛️",
    "Box#9": "🧰",
    "Box#10": "🗝️",
    "KeyRoom_Common": "🚪",
    "KeyRoom_Rare": "🚪",
    "KeyRoom_Epic": "🚪",
    "KeyRoom_Legendary": "🚪",
    "KeyRoom_Mythisch": "🚪"
  };
  return icons[boxName] || "📦";
}

// Hilfsfunktion zum Kürzen von Zahlen
function formatCost(cost) {
  if (cost === 0) return 'Free';
  if (cost >= 1000000) return (cost / 1000000) + 'M';
  if (cost >= 1000) return (cost / 1000) + 'K';
  return cost.toString();
}

// Formatierung für größere Zahlen (Kontostand etc.)
function formatNumber(num) {
  // Vollständige Zahlen mit Tausender-Trennzeichen
  return num.toLocaleString('de-DE');
}

// Tracking für freigeschaltete Boxen (Set speichert Namen der unlocked Boxen)
const unlockedBoxes = new Set(["Box#1"]); // Box#1 ist von Anfang an freigeschaltet

// ======= Hilfsfunktionen =======
// Kurze sleep-Funktion für Verzögerungen
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Liefert ein zufälliges Element aus einem Array
const sample = arr => arr[Math.floor(Math.random() * arr.length)];

// Gewichtetes Sampling innerhalb eines Rarität-Pools über item.dropWeight (Default 1)
function weightedSampleByDropWeight(pool) {
  if (!Array.isArray(pool) || pool.length === 0) return null;
  let total = 0;
  const weights = pool.map(it => {
    const w = (typeof it.dropWeight === 'number' && it.dropWeight >= 0) ? it.dropWeight : 1;
    total += w;
    return w;
  });
  if (total <= 0) {
    return sample(pool);
  }
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    const w = weights[i];
    if (r < w) return pool[i];
    r -= w;
  }
  return pool[pool.length - 1];
}

// ======= Skill-System Hilfsfunktionen =======
// Berechnet den Wert-Multiplikator basierend auf Wohlstand-Skills + permanenten Shop-Upgrades
function getValueMultiplier() {
  // Alle Boni werden additiv berechnet und dann als Multiplikator (1 + total) angewendet
  let totalBonus = 0;
  
  totalBonus += skills.wohlstand * 0.03; // +3% pro Skill-Punkt
  
  const permVBCount = Math.min(1, (permanentUpgrades.permValueBoost || 0));
  totalBonus += permVBCount * 0.1; // max einmal +10%
  
  totalBonus += (statUpgradesLevels.wealth || 0) * 0.02; // +2% pro Stufe (Shop-Stat)
  
  if (activeBoosts.valueBoostUses > 0) {
    totalBonus += activeBoosts.valueBoost; // temporärer Boost
  }
  
  totalBonus += prestigeState.level * 0.05; // +5% pro Prestige-Stufe
  
  return 1 + totalBonus;
}

// Modifiziert die Drop-Gewichte basierend auf Glück-Skills + temporären Shop-Boosts
function applyLuckBonus(weights, boxType) {
  // Ziel: Mythisch-Chance bleibt je Box aufsteigend (Box1 < ... < Box7), auch mit Glück.
  // Ansatz: Proportionale Verschiebung – ein prozentualer Anteil jeder Rarität fließt in die nächst-seltenere.
  // Dadurch wächst der Zuwachs bei Mythisch mit dem vorhandenen Legendary-Anteil der jeweiligen Box und bewahrt die Rangfolge.
  let g = (skills.glueck || 0) + (statUpgradesLevels.luck || 0) + (prestigeState.level || 0);
  
  // Temporärer Rarity-Boost aus Shop
  if (activeBoosts.rarityBoostUses > 0) {
    g = g * (1 + activeBoosts.rarityBoost); // z.B. 1.5x Multiplikator
  }
  
  if (g === 0) return weights;

  const modifiedWeights = { ...weights };

  // Box-spezifischer Multiplikator: absteigend von Box 1 bis Box 7
  // Box 1: Faktor 1.0, Box 2: 0.9, Box 3: 0.8, Box 4: 0.7, Box 5: 0.6, Box 6: 0.5, Box 7: 0.4
  const boxNumber = parseInt((boxType || 'Box#1').replace(/[^\d]/g, '')) || 1;
  let boxMultiplier = 1.0;
  if (boxNumber >= 1 && boxNumber <= 7) {
    boxMultiplier = 1.1 - (boxNumber * 0.1); // Box 1: 1.0, Box 2: 0.9, ..., Box 7: 0.4
  } else if (boxNumber === 8) {
    boxMultiplier = 0.35;
  } else if (boxNumber === 9) {
    boxMultiplier = 0.30;
  } else if (boxNumber >= 10) {
    boxMultiplier = 0.25;
  }

  // REDUZIERTE Pro-Punkt-Raten mit harten Caps zur Verhinderung extremer Verschiebungen
  // Cap: Maximal 40% einer Rarität kann verschoben werden
  const crRate = Math.min(0.40, 0.0055 * g * boxMultiplier);    // von Common -> Rare (+10%)
  const reRate = Math.min(0.40, 0.0044 * g * boxMultiplier);    // von Rare -> Epic (+10%)
  const elRate = Math.min(0.40, 0.0033 * g * boxMultiplier);    // von Epic -> Legendary (+10%)
  const lmRate = Math.min(0.40, 0.00165 * g * boxMultiplier);   // Legendary -> Mythisch (+10%)

  // Common -> Rare
  if (modifiedWeights.Common && modifiedWeights.Common > 0) {
    const shiftCR = modifiedWeights.Common * crRate;
    modifiedWeights.Common -= shiftCR;
    modifiedWeights.Rare = (modifiedWeights.Rare || 0) + shiftCR;
  }

  // Rare -> Epic
  if (modifiedWeights.Rare && modifiedWeights.Rare > 0) {
    const shiftRE = modifiedWeights.Rare * reRate;
    modifiedWeights.Rare -= shiftRE;
    modifiedWeights.Epic = (modifiedWeights.Epic || 0) + shiftRE;
  }

  // Epic -> Legendary
  if (modifiedWeights.Epic && modifiedWeights.Epic > 0) {
    const shiftEL = modifiedWeights.Epic * elRate;
    modifiedWeights.Epic -= shiftEL;
    modifiedWeights.Legendary = (modifiedWeights.Legendary || 0) + shiftEL;
  }

  // Legendary -> Mythisch
  if (modifiedWeights.Legendary && modifiedWeights.Legendary > 0) {
    const shiftLM = modifiedWeights.Legendary * lmRate;
    modifiedWeights.Legendary -= shiftLM;
    modifiedWeights.Mythisch = (modifiedWeights.Mythisch || 0) + shiftLM;
  }

  // Kein automatischer Shift in Aetherisch (ultra-rare bleibt unverändert)
  return modifiedWeights;
}

// Berechnet Tempo-Multiplikator für Animationen (reduziert Zeit)
function getTempoMultiplier() {
  // -3,5% Zeit pro Skill-Punkt, -2% pro Shop-Tempo-Stufe, -10% pro permanentem Handschuh
  const skillReduce = (skills.effizienz || 0) * 0.035;
  const shopReduce = (statUpgradesLevels.tempo || 0) * 0.02;
  const permTempoCount = Math.min(1, (permanentUpgrades.permTempoBoost || 0));
  const permReduce = permTempoCount * 0.10; // max einmal -10%
  // Prestige-Bonus: -2% Untersuchungszeit pro Prestige-Stufe
  const prestigeReduce = (prestigeState.level || 0) * 0.02;
  const raw = 1 - (skillReduce + shopReduce + permReduce + prestigeReduce);
  // Minimale Zeit: 1% (maximal 99% Reduktion)
  return Math.max(0.01, Math.min(1, raw));
}

// Berechnet die Anzahl der Items basierend auf Slot-Füllrate (20-100%, Peak bei 50%) + permanente Shop-Upgrades
function getWeightedItemCount(boxType) {
  const columns = boxConfigs[boxType].columns || 4;
  const rows = boxConfigs[boxType].rows || 3;
  const totalSlots = columns * rows;
  
  // Bestimme Füllrate-Ziel basierend auf Box-Typ
  // Reduziert: Box 1-3: 40% Durchschnitt, Box 4-5: 35%, Box 6-7: 45%
  const isKR = isKeyRoom(boxType);
  const boxNumber = isKR ? NaN : parseInt((boxType || '').replace('Box#', ''));
  // KeyRooms sollen tendenziell voller sein
  const targetFillRate = isKR
    ? 0.5
    : ((boxNumber <= 3) ? 0.4 : (boxNumber <= 5) ? 0.35 : 0.45);
  
  // Glücksbonus: +1.65% Füllrate pro Glückspunkt (inkl. Boosts) - erhöht um 10%
  let g = (skills.glueck || 0) + (statUpgradesLevels.luck || 0) + (prestigeState.level || 0);
  if (activeBoosts.rarityBoostUses > 0) {
    g = g * (1 + activeBoosts.rarityBoost);
  }
  const luckFillBonus = 0.0165 * g; // +1.65% pro Glückspunkt (wirkt auch in KeyRooms)

  // Normalverteilung um den Zielwert herum, begrenzt auf 20-100%
  // Verwende Box-Muller-Transformation für Normalverteilung
  const u1 = Math.random();
  const u2 = Math.random();
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);

  // z0 ist normalverteilt mit mean=0, stddev=1
  // Skaliere auf mean=targetFillRate, stddev=12% (geringere Streuung)
  let fillRate = targetFillRate + luckFillBonus + (z0 * 0.12);

  // Begrenze auf 20-100% (KeyRooms minimal etwas höher)
  const minFill = isKR ? 0.3 : 0.2;
  fillRate = Math.max(minFill, Math.min(1.0, fillRate));

  // Berechne Anzahl Items
  let itemCount = Math.max(1, Math.floor(totalSlots * fillRate));

  // Zusatzeffekt durch Glück: kleine Chance auf +1 Item
  // +2% pro Glückspunkt (inkl. Shop/Boosts), gedeckelt bei 40% - reduziert von 3% und 50%
  const extraChance = Math.min(0.4, 0.02 * g);
  if (Math.random() < extraChance) {
    itemCount += 1;
  }

  // Maximal alle Slots füllen
  itemCount = Math.min(itemCount, totalSlots);

  return itemCount;
}
// Wählt ein Item basierend auf den Gewichten der Raritäten aus.
// Diese Funktion skaliert korrekt, auch wenn die Gewichte nicht genau 100 ergeben.
function getRandomItem(boxType) {
  const baseWeights = boxConfigs[boxType].weights;
  const weights = applyLuckBonus(baseWeights, boxType); // Glück-Skill anwenden (mit boxType)

  const totalWeight = rarities.reduce((sum, r) => sum + (weights[r] || 0), 0);
  if (totalWeight <= 0) {
    // Fallback, falls fehlerhafte Konfiguration
    const fallback = itemPools.Common[0];
    return { ...fallback, rarity: 'Common' };
  }

  let rand = Math.random() * totalWeight;
  for (const rarity of rarities) {
    const w = weights[rarity] || 0;
    if (rand < w) {
      // Saisonale Items: Prüfe ob ein Event aktiv ist und ob ein saisonales Item droppen soll
      const activeEvent = getActiveSeasonalEvent();
      let pool = itemPools[rarity] || itemPools.Common;
      
      if (activeEvent && shouldDropSeasonalItem()) {
        // Nutze saisonale Items für diese Rarität (falls vorhanden)
        const seasonalPool = (activeEvent.items && activeEvent.items[rarity]) || [];
        if (seasonalPool.length > 0) {
          pool = seasonalPool;
        }
      }
      
      const item = weightedSampleByDropWeight(pool);
      // Item-Wert mit Wohlstand-Multiplikator anwenden
      const baseValue = item.value;
      const multiplier = getValueMultiplier();
      const modifiedItem = { 
        ...item, 
        rarity,
        baseValue: baseValue,
        value: Math.floor(baseValue * multiplier)
      };
      return modifiedItem;
    }
    rand -= w;
  }

  // Sollte niemals erreicht werden, aber sicherheitshalber Fallback
  const fallback = itemPools.Common[0];
  return { ...fallback, rarity: 'Common' };
}

// 🎲 Gewichtete Itemanzahl abhängig vom Box-Typ
// Wählt anhand der konfigurierten Bereiche eine zufällige Item-Anzahl (gewichteter Pool)
// Berechnet die Anzahl der Items basierend auf Slot-Füllrate (20-100%, Peak bei 50%)
// (Entfernt) Duplikat – die Version oben mit Glücksbonus und Extra-Chance wird verwendet

// Setzt den aktuellen Box-Typ (wird auch von HTML onclick benutzt)
function selectBox(type) {
  // Wenn der User manuell eine normale Box auswählt, Schlüssel-Modus abbrechen
  if (!type.startsWith('KeyRoom_')) {
    pendingKeyOpen = null;
  }
  
  // Auto-Clicker: Box-Wechsel pausiert Auto-Öffnen (erfordert manuellen Impuls)
  autoClickerCanRun = false;
  
  // Wenn gerade eine Öffnung läuft, wende den Wechsel nur visuell an
  // und verschiebe den tatsächlichen Box-Wechsel bis nach der Animation.
  if (isOpening) {
    // Visuelle Auswahl aktualisieren
    for (let i = 0; i < boxOrder.length; i++) {
      const btn = document.getElementById(`boxBtn${i + 1}`);
      if (btn) btn.classList.remove('selected');
    }
    const idxTemp = boxOrder.indexOf(type);
    const selectedBtnTemp = document.getElementById(`boxBtn${idxTemp + 1}`);
    if (selectedBtnTemp) selectedBtnTemp.classList.add('selected');
    // Merke gewünschte Box und beende hier
    pendingBoxType = type;
    // Kisten-Theme sofort visuell anpassen
    updateChestTheme(type);
    return;
  }

  boxType = type;
  
  // Smooth Transition beim Box-Wechsel
  const container = document.getElementById('lootContainer');
  if (container) {
    // Fade out
    container.classList.add('box-switching');
    
    // Nach Fade-out: Grid neu erstellen und Fade in
    setTimeout(() => {
      // Kisten-Theme anpassen
      updateChestTheme(type);
      
      // Grid neu erstellen mit den Dimensionen der neuen Box
      createEmptyGrid();
      
      // Fade in
      setTimeout(() => {
        container.classList.remove('box-switching');
      }, 50);
    }, 300);
  } else {
    // Fallback ohne Animation
    updateChestTheme(type);
    createEmptyGrid();
  }
  
  // Entferne "selected" Klasse von allen Buttons
  for (let i = 0; i < boxOrder.length; i++) {
    const btn = document.getElementById(`boxBtn${i + 1}`);
    if (btn) btn.classList.remove('selected');
  }
  
  // Füge "selected" Klasse zum gewählten Button hinzu
  const idx = boxOrder.indexOf(type);
  const selectedBtn = document.getElementById(`boxBtn${idx + 1}`);
  if (selectedBtn) selectedBtn.classList.add('selected');
  
  // Aktualisiere Info-Fenster, falls es offen ist
  if (dom.boxInfoModal && dom.boxInfoModal.style.display === 'block') {
    populateBoxInfo();
  }
  // Öffnen-Button-Icon aktualisieren (Box-Emoji oder Schlüssel)
  updateOpenBtnIcon();
}

// Exponiere selectBox global (vorerst kompatibel)
window.selectBox = selectBox;

// Erzeuge fehlende Box-Buttons dynamisch und wire Clicks
function ensureBoxButtons() {
  const sel = document.getElementById('boxSelection');
  if (!sel) return;
  for (let i = 0; i < boxOrder.length; i++) {
    const id = `boxBtn${i + 1}`;
    let btn = document.getElementById(id);
    if (!btn) {
      btn = document.createElement('button');
      btn.id = id;
      btn.dataset.box = boxOrder[i];
      sel.appendChild(btn);
    }
    // Stelle sicher, dass der Klick-Handler gesetzt ist (einmalig)
    if (!btn.__wired) {
      btn.addEventListener('click', () => selectBox(boxOrder[i]));
      btn.__wired = true;
    }
  }
}

ensureBoxButtons();

// Versucht, die Kosten für die aktuelle Box vom Guthaben abzuziehen.
// Gibt true zurück, wenn erfolgreich, ansonsten false.
function deductBalanceForBox() {
  // Einmaliger kostenloser Öffnungsvorgang (durch Schlüssel) erlaubt das Überspringen der Kosten
  if (__nextOpenIsFree) {
    __nextOpenIsFree = false;
    return true;
  }
  const cost = boxConfigs[boxType].cost || 0;
  if (balance < cost) {
    alert('Nicht genug 💰 für diese Box!');
    return false;
  }
  balance -= cost;
  updateBalance();
  return true;
}

// ======= DOM-Caching =======
const dom = {
  openBtn: document.getElementById('openBtn'),
  lootContainer: document.getElementById('lootContainer'),
  overlay: document.getElementById('overlay'),
  balance: document.getElementById('balance'),
  // selectedContainer removed (unused)
  collectionBtn: document.getElementById('collectionBtn'),
  collectionOverlay: document.getElementById('collectionOverlay'),
  collectionGrid: document.getElementById('collectionGrid'),
  closeCollectionBtn: document.getElementById('closeCollectionBtn'),
  statsBtn: document.getElementById('statsBtn'),
  statsOverlay: document.getElementById('statsOverlay'),
  statsContent: document.getElementById('statsContent'),
  closeStatsBtn: document.getElementById('closeStatsBtn'),
  // Leaderboard UI
  leaderboardBtn: document.getElementById('leaderboardBtn'),
  leaderboardModal: document.getElementById('leaderboardModal'),
  closeLeaderboardBtn: document.getElementById('closeLeaderboardBtn'),
  leaderboardContent: document.getElementById('leaderboardContent'),
  displayNameInput: document.getElementById('displayNameInput'),
  saveNameBtn: document.getElementById('saveNameBtn'),
  // Achievements UI
  achievementsBtn: document.getElementById('achievementsBtn'),
  achievementsOverlay: document.getElementById('achievementsOverlay'),
  achievementsContent: document.getElementById('achievementsContent'),
  closeAchievementsBtn: document.getElementById('closeAchievementsBtn'),
  resetBtn: document.getElementById('resetBtn'),
  // Level & Skills UI
  playerLevel: document.getElementById('playerLevel'),
  playerTitle: document.getElementById('playerTitle'),
  xpBar: document.getElementById('xpBar'),
  xpText: document.getElementById('xpText'),
  skillPointsDisplay: document.getElementById('skillPointsDisplay'),
  skillsBtn: document.getElementById('skillsBtn'),
  skillModal: document.getElementById('skillModal'),
  closeSkillBtn: document.getElementById('closeSkillBtn'),
  availablePoints: document.getElementById('availablePoints'),
  wohlstandLevel: document.getElementById('wohlstandLevel'),
  glueckLevel: document.getElementById('glueckLevel'),
  effizienzLevel: document.getElementById('effizienzLevel'),
  upgradeWohlstand: document.getElementById('upgradeWohlstand'),
  upgradeGlueck: document.getElementById('upgradeGlueck'),
  upgradeEffizienz: document.getElementById('upgradeEffizienz'),
  // Shop UI
  shopBtn: document.getElementById('shopBtn'),
  shopModal: document.getElementById('shopModal'),
  closeShopBtn: document.getElementById('closeShopBtn'),
  shopBalance: document.getElementById('shopBalance'),
  shopContent: document.getElementById('shopContent')
};

// Prestige DOM
dom.prestigeBtn = document.getElementById('prestigeBtn');
dom.prestigeStarNum = (function(){
  const btn = document.getElementById('prestigeBtn');
  return btn ? btn.querySelector('.prestige-star .num') : null;
})();
dom.prestigeModal = document.getElementById('prestigeModal');
dom.closePrestigeBtn = document.getElementById('closePrestigeBtn');
dom.confirmPrestigeBtn = document.getElementById('confirmPrestigeBtn');
dom.prestigeInfo = document.getElementById('prestigeInfo');

// ======= Quickslots (Trankgürtel) =======
function ensureQuickslotsContainer() {
  const parent = document.getElementById('actionButtons');
  if (!parent) return null;
  // Stelle sicher, dass es einen linken Wrapper gibt, der Quickslots und Shop-Button enthält
  let leftWrap = document.getElementById('leftActions');
  if (!leftWrap) {
    leftWrap = document.createElement('div');
    leftWrap.id = 'leftActions';
    leftWrap.className = 'left-actions';
    if (dom.shopBtn && dom.shopBtn.parentElement === parent) {
      parent.insertBefore(leftWrap, dom.shopBtn);
    } else {
      parent.prepend(leftWrap);
    }
  }
  // Shop-Button in den Wrapper verschieben (links), falls noch nicht
  if (dom.shopBtn && dom.shopBtn.parentElement !== leftWrap) {
    leftWrap.appendChild(dom.shopBtn);
  }
  let qs = document.getElementById('quickslots');
  if (!qs) {
    qs = document.createElement('div');
    qs.id = 'quickslots';
    qs.className = 'quickslots';
    // Standardposition: links vom Shop-Button, beide im gleichen Wrapper
    if (dom.shopBtn && dom.shopBtn.parentElement === leftWrap) {
      leftWrap.insertBefore(qs, dom.shopBtn);
    } else {
      leftWrap.prepend(qs);
    }
  }
  return qs;
}

function quickBuyPotion(itemId) {
  // Safety: nur bekannte Tränke erlauben
  if (!shopItems[itemId] || shopItems[itemId].type !== 'temp') return;
  // Während einer laufenden Öffnung keine Trankkäufe zulassen
  if (isOpening) {
    alert('Während des Öffnens von Boxen können keine Tränke gekauft werden.');
    return;
  }
  purchaseShopItem(itemId);
}

// Neues, sauberes Trank-Icon als Inline-SVG (skalierbar, ohne Emoji)
let __potionSvgId = 0;
function renderPotionIconHTML(iconChar) {
  // Farbauswahl nach "Art" des Tranks (abgeleitet von bisherigem Emoji)
  const key = String(iconChar || '').trim();
  /**
   * Farbvariante:
   *  - 🍀 (Wert): gold/gelb
   *  - 🌿 (Rarity): violett
   *  - 📚 (XP): blau/türkis
   *  - default: türkis
   */
  let c1 = '#2dd4bf', c2 = '#0ea5a4'; // default teal gradient
  if (key === '🍀') { c1 = '#f1c40f'; c2 = '#e67e22'; }
  else if (key === '🌿') { c1 = '#b372e8'; c2 = '#8e44ad'; }
  else if (key === '📚') { c1 = '#5fb3ff'; c2 = '#1f7dd6'; }

  const id = ++__potionSvgId;
  // SVG: runder Flaschenbauch, Hals, Stopfen, Flüssigkeit mit Schaumkrone + Bläschen
  // ViewBox 0 0 64 64; wird per CSS in .potion-icon skaliert
  return `
    <span class="potion-icon" role="img" aria-label="Trank">
      <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" focusable="false" aria-hidden="true">
        <defs>
          <linearGradient id="pot-grad-${id}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${c1}"/>
            <stop offset="100%" stop-color="${c2}"/>
          </linearGradient>
          <filter id="pot-shadow-${id}" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="1" stdDeviation="1.2" flood-color="#000" flood-opacity="0.35"/>
          </filter>
          <filter id="pot-imp-${id}" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0.5" stdDeviation="0.6" flood-color="#000" flood-opacity="0.55"/>
          </filter>
        </defs>
        <!-- Flasche -->
        <g filter="url(#pot-shadow-${id})" stroke="#e6f3ff" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">
          <!-- Bauch -->
          <path d="M18,28 C14,28 10,36 10,42 C10,52 18,58 32,58 C46,58 54,52 54,42 C54,36 50,28 46,28 Z" fill="#1b2636"/>
          <!-- Hals -->
          <path d="M27,10 L37,10 C38.5,10 40,11.5 40,13 L40,22 C40,24 42,26 46,28 L18,28 C22,26 24,24 24,22 L24,13 C24,11.5 25.5,10 27,10 Z" fill="#1b2636"/>
          <!-- Stopfen -->
          <rect x="26" y="6" width="12" height="6" rx="2" ry="2" fill="#a07855" stroke="#e6f3ff"/>
        </g>
        <!-- Flüssigkeit (mit Schaumkante) -->
        <g>
          <!-- Füllhöhe -->
          <path d="M14,42 C14,48 20,54 32,54 C44,54 50,48 50,42 C50,40 49,38 47,36 L17,36 C15,38 14,40 14,42 Z" fill="url(#pot-grad-${id})"/>
          <!-- Schaum-/Glanzkante -->
          <path d="M16,36 C20,34 28,33 32,33 C36,33 44,34 48,36" fill="none" stroke="rgba(255,255,255,0.85)" stroke-width="2" stroke-linecap="round"/>
          <!-- Bläschen -->
          <circle cx="28" cy="43" r="2" fill="rgba(255,255,255,0.9)"/>
          <circle cx="36" cy="46" r="1.6" fill="rgba(255,255,255,0.85)"/>
          <circle cx="40" cy="41" r="1.2" fill="rgba(255,255,255,0.8)"/>
        </g>
        <!-- Aufdruck (altes Icon) zentriert auf dem Flaschenbauch -->
        ${key ? `<text x="32" y="44" text-anchor="middle" dominant-baseline="middle" font-size="14" filter="url(#pot-imp-${id})" style="pointer-events:none;">${key.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</text>` : ''}
        <!-- Glanz auf Flasche -->
        <path d="M22,30 C22,30 26,24 30,22" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="3" stroke-linecap="round"/>
      </svg>
    </span>`;
}

function renderQuickslots() {
  try {
    const owned = (permanentUpgrades.permPotionBelt || 0) >= 1;
    let qs = document.getElementById('quickslots');
    if (!owned) {
      if (qs && qs.parentElement) qs.parentElement.removeChild(qs);
      return;
    }
    qs = ensureQuickslotsContainer();
    if (!qs) return;
    // Inhalte neu rendern
    qs.innerHTML = '';
    const mapping = [
      { id: 'tempValueBoost', usesKey: 'valueBoostUses' },
      { id: 'tempRarityBoost', usesKey: 'rarityBoostUses' },
      { id: 'tempXPBoost', usesKey: 'xpBoostUses' }
    ];
    for (const m of mapping) {
      const item = shopItems[m.id];
      if (!item) continue;
      const btn = document.createElement('button');
      btn.className = 'quickslot-btn';
  const beltNote = (permanentUpgrades.permPotionBelt || 0) >= 1 ? `\n+1 Aufladung pro Kauf` : '';
      btn.title = `${item.icon} ${item.name}\n${item.description}\nPreis: ${formatNumber(item.cost)} 💰${beltNote}`;
      btn.innerHTML = renderPotionIconHTML(item.icon);
  const canAfford = balance >= item.cost;
  // Während einer Öffnung keine Trankkäufe zulassen
  btn.disabled = !canAfford || isOpening;
      btn.addEventListener('click', () => quickBuyPotion(m.id));
      // Uses-Badge
      const uses = activeBoosts[m.usesKey] || 0;
      if (uses > 0) {
        const badge = document.createElement('span');
        badge.className = 'quickslot-badge';
        badge.textContent = String(uses);
        btn.appendChild(badge);
      }
      qs.appendChild(btn);
    }
  } catch (e) {
    console.warn('renderQuickslots failed', e);
  }
}

// ======= Sound System =======
let searchingSound = null;
let isMuted = false;
let globalVolume = 0.5; // Standard: 50%

// Lade Sound-Settings aus localStorage
function loadSoundSettings() {
  try {
    const saved = localStorage.getItem('soundSettings');
    if (saved) {
      const settings = JSON.parse(saved);
      isMuted = settings.muted || false;
      globalVolume = settings.volume !== undefined ? settings.volume : 0.5;
    }
  } catch (e) {
    console.warn('Fehler beim Laden der Sound-Settings', e);
  }
}

// Speichere Sound-Settings in localStorage
function saveSoundSettings() {
  try {
    localStorage.setItem('soundSettings', JSON.stringify({
      muted: isMuted,
      volume: globalVolume
    }));
  } catch (e) {
    console.warn('Fehler beim Speichern der Sound-Settings', e);
  }
}

// Aktualisiere Lautstärke für alle Sounds
function updateSoundVolume() {
  const effectiveVolume = isMuted ? 0 : globalVolume;
  if (searchingSound) {
    searchingSound.volume = effectiveVolume;
  }
  try {
    if (__masterGain && __audioCtx) {
      __masterGain.gain.setValueAtTime(effectiveVolume, __audioCtx.currentTime);
    }
  } catch (_) { /* ignore */ }
}

// Suche-Animation: spielt Sound beim Durchsuchen ab
function setSearchingState(active) {
  if (active) {
    // Starte Sound
    if (!searchingSound) {
      searchingSound = new Audio('Sounds/searching.mp3');
      searchingSound.loop = false; // Kein Loop, spielt nur einmal
    }
    searchingSound.volume = isMuted ? 0 : globalVolume;
    searchingSound.currentTime = 0; // Von vorne starten
    searchingSound.play().catch(e => console.warn('Sound konnte nicht abgespielt werden:', e));
  } else {
    // Stoppe Sound
    if (searchingSound) {
      searchingSound.pause();
      searchingSound.currentTime = 0;
    }
  }
}
function updateChestTheme(forBoxType) { /* no-op */ }
function createRummageParticle() { /* no-op */ }
function startRummageParticles() { /* no-op */ }
function stopRummageParticles() { /* no-op */ }

// ======= Tooltip-System (Custom Hover-Popup) =======
let __lootTooltipEl = null;
function initLootTooltip() {
  if (__lootTooltipEl) return;
  const tip = document.createElement('div');
  tip.className = 'loot-tooltip';
  tip.style.setProperty('--tip-accent', '#888');
  tip.style.display = 'none';
  tip.setAttribute('role', 'tooltip');
  document.body.appendChild(tip);
  __lootTooltipEl = tip;
}

function setTooltipContent({ name = '', value = null, baseValue = null, description = '', rarity = 'Common', quoteAuthor = '' }) {
  if (!__lootTooltipEl) return;
  __lootTooltipEl.style.setProperty('--tip-accent', colors[rarity] || '#888');
  __lootTooltipEl.innerHTML = '';
  const nameEl = document.createElement('div');
  nameEl.className = 'tip-name';
  nameEl.textContent = name || '';
  const rarityEl = document.createElement('div');
  rarityEl.className = 'tip-rarity';
  rarityEl.textContent = displayRarityName(rarity);
  const valueEl = document.createElement('div');
  valueEl.className = 'tip-value';
  
  // Zeige Gesamtwert (Basis + Bonus) falls Bonus vorhanden
  if (value != null && baseValue != null && baseValue > 0) {
    const bonus = value - baseValue;
    if (bonus > 0) {
      valueEl.innerHTML = `${Number(value).toLocaleString('de-DE')} 💰 <span style="color: #888; font-size: 0.9em;">(${Number(baseValue).toLocaleString('de-DE')} + <span style="color: #0f0;">${Number(bonus).toLocaleString('de-DE')}</span>)</span>`;
    } else {
      valueEl.textContent = `${Number(value).toLocaleString('de-DE')} 💰`;
    }
  } else {
    valueEl.textContent = value != null ? `${Number(value || 0).toLocaleString('de-DE')} 💰` : 'Wert unbekannt';
  }
  
  let descEl = null;
  if (description) {
    if (quoteAuthor) {
      // Schöne Zitatdarstellung mit Autor
      const block = document.createElement('blockquote');
      block.className = 'tip-quote';
      const p = document.createElement('p');
      p.textContent = description;
      const author = document.createElement('span');
      author.className = 'tip-quote-author';
      author.textContent = `— ${quoteAuthor}`;
      block.appendChild(p);
      block.appendChild(author);
      descEl = block;
    } else {
      const div = document.createElement('div');
      div.className = 'tip-desc';
      div.textContent = description;
      descEl = div;
    }
  }
  __lootTooltipEl.appendChild(nameEl);
  __lootTooltipEl.appendChild(rarityEl);
  __lootTooltipEl.appendChild(valueEl);
  if (descEl) __lootTooltipEl.appendChild(descEl);
}

function positionTooltip(x, y) {
  if (!__lootTooltipEl) return;
  const margin = 14;
  const tipRect = __lootTooltipEl.getBoundingClientRect();
  let left = x + margin;
  let top = y + margin;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  if (left + tipRect.width > vw - 8) left = x - tipRect.width - margin;
  if (top + tipRect.height > vh - 8) top = y - tipRect.height - margin;
  __lootTooltipEl.style.left = `${Math.max(0, left)}px`;
  __lootTooltipEl.style.top = `${Math.max(0, top)}px`;
}

function showTooltip(evt, data) {
  initLootTooltip();
  setTooltipContent(data);
  __lootTooltipEl.style.display = 'block';
  positionTooltip(evt.clientX, evt.clientY);
}

function moveTooltip(evt) {
  if (!__lootTooltipEl || __lootTooltipEl.style.display === 'none') return;
  positionTooltip(evt.clientX, evt.clientY);
}

function hideTooltip() {
  if (!__lootTooltipEl) return;
  __lootTooltipEl.style.display = 'none';
}

function attachTooltip(el, dataProvider) {
  // dataProvider can be object or function returning object
  const getData = () => (typeof dataProvider === 'function' ? dataProvider() : dataProvider);
  el.addEventListener('mouseenter', (e) => showTooltip(e, getData()));
  el.addEventListener('mousemove', moveTooltip);
  el.addEventListener('mouseleave', hideTooltip);
}

// ======= Rarity Reveal Effects (Visual + Audio) =======
let __audioCtx = null;
let __masterGain = null;
function ensureAudioCtx() {
  try {
    if (!__audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        __audioCtx = new AudioCtx();
        try {
          __masterGain = __audioCtx.createGain();
          __masterGain.gain.setValueAtTime((isMuted ? 0 : globalVolume), __audioCtx.currentTime);
          __masterGain.connect(__audioCtx.destination);
        } catch (_) { __masterGain = null; }
      }
    }
  } catch (e) {
    // ignore
  }
  return __audioCtx;
}

function playRaritySound(rarity) {
  const ctx = ensureAudioCtx();
  if (!ctx) return;
  if (isMuted) return;
  const now = ctx.currentTime;
  const duration = rarity === 'Mythisch' ? 0.35 : 0.22;
  const baseFreq = rarity === 'Mythisch' ? 1046.5 : 880; // C6 vs A5
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = rarity === 'Mythisch' ? 'triangle' : 'sine';
  osc.frequency.setValueAtTime(baseFreq, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.12, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  if (__masterGain) {
    osc.connect(gain).connect(__masterGain);
  } else {
    osc.connect(gain).connect(ctx.destination);
  }
  osc.start(now);
  osc.stop(now + duration + 0.02);

  // Optional small chime for Mythisch (a fifth above)
  if (rarity === 'Mythisch') {
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(baseFreq * 1.5, now + 0.03);
    gain2.gain.setValueAtTime(0.0001, now + 0.03);
    gain2.gain.linearRampToValueAtTime(0.08, now + 0.08);
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + duration + 0.08);
    if (__masterGain) {
      osc2.connect(gain2).connect(__masterGain);
    } else {
      osc2.connect(gain2).connect(ctx.destination);
    }
    osc2.start(now + 0.03);
    osc2.stop(now + duration + 0.12);
  }
}

function triggerRarityEffect(targetEl, rarity) {
  try {
    const flare = document.createElement('div');
    flare.className = 'rarity-flare ' + (rarity === 'Mythisch' ? 'mythic-flare' : 'legendary-flare');
    targetEl.appendChild(flare);
    // remove after animation
    setTimeout(() => {
      if (flare.parentElement) flare.parentElement.removeChild(flare);
    }, 1400);
  } catch (e) {
    // ignore effect errors
  }
  // sound
  playRaritySound(rarity);

  // Additional screen vignette for Mythisch for extra drama
  if (rarity === 'Mythisch') {
    try {
      const vignette = document.createElement('div');
      vignette.className = 'screen-vignette';
      document.body.appendChild(vignette);
      setTimeout(() => {
        if (vignette.parentElement) vignette.parentElement.removeChild(vignette);
      }, 900);
    } catch (_) { /* ignore */ }
  }
}

function displayRarityName(rarity) {
  switch (rarity) {
    case 'Common': return 'Gewöhnlich';
    case 'Rare': return 'Selten';
    case 'Epic': return 'Episch';
    case 'Legendary': return 'Legendär';
    case 'Mythisch': return 'Mythisch';
    case 'Aetherisch': return 'Ätherisch';
    default: return rarity || '—';
  }
}

// Aktiviert/Deaktiviert temporär die Box-Auswahl-Buttons
function setBoxSelectionEnabled(enabled) {
  for (let i = 0; i < boxOrder.length; i++) {
    const btn = document.getElementById(`boxBtn${i + 1}`);
    if (!btn) continue;
    if (!enabled) {
      btn.disabled = true; // verhindert Klicks, inkl. inline onclick
      btn.classList.add('temp-disabled');
    } else {
      btn.classList.remove('temp-disabled');
    }
  }
  if (enabled) {
    // Stelle korrekte Enabled/Locked-States wieder her
    updateBoxAvailability();
  }
}

// NOTE: Glow-Effekte wurden entfernt — floatingGlowLayer deaktiviert.
// Die Lupe wird weiterhin an document.body gehängt.

// --- Info-Button und Modal (dynamisch per JS eingefügt, kein HTML-Edit nötig) ---
// Erzeuge einen kleinen Info-Button neben der Box-Auswahl
const boxInfoBtn = document.createElement('button');
boxInfoBtn.id = 'boxInfoBtn';
boxInfoBtn.className = 'box-info-btn';
boxInfoBtn.type = 'button';
boxInfoBtn.title = 'Box-Informationen';
boxInfoBtn.innerHTML = 'ℹ️';
try {
  const iconButtons = document.getElementById('iconButtons');
  if (iconButtons) {
    iconButtons.appendChild(boxInfoBtn);
  } else {
    document.body.appendChild(boxInfoBtn);
  }
} catch (e) {
  console.warn('Failed to insert box info button', e);
}
dom.boxInfoBtn = boxInfoBtn;

// Erzeuge Modal (hidden) und Anker für Inhalte
const boxInfoModal = document.createElement('div');
boxInfoModal.id = 'boxInfoModal';
boxInfoModal.className = 'info-modal';
boxInfoModal.style.display = 'none';
boxInfoModal.innerHTML = `<div class="info-content"><button class="info-close" aria-label="Schließen">✖</button><h3>Box Information</h3><div id="boxInfoContent"></div></div>`;
document.body.appendChild(boxInfoModal);
dom.boxInfoModal = boxInfoModal;
dom.boxInfoContent = boxInfoModal.querySelector('#boxInfoContent');

// kein custom tooltip mehr — native title/tooltips wurden entfernt auf Nutzerwunsch

// Globaler Maus-Tracker (letzte bekannte client-Koordinaten)
// kein globaler Maus-Tracker mehr

// ======= Schlüssel-Manager UI =======
function getKeyTargetBox(rarity) {
  // Feste Zuordnung: Schlüssel der Rarität öffnet einen "Raum" (spezielle Box-Konfiguration)
  const map = {
    Common: 'KeyRoom_Common',
    Rare: 'KeyRoom_Rare',
    Epic: 'KeyRoom_Epic',
    Legendary: 'KeyRoom_Legendary',
    Mythisch: 'KeyRoom_Mythisch'
  };
  const target = map[rarity];
  return boxConfigs[target] ? target : null;
}

let __keysBtn = null;
// Keys modal removed
// Vormerkung: nächste Öffnung mit Schlüssel (ohne sofort zu öffnen)
let pendingKeyOpen = null; // { rarity: 'Epic', targetBox: 'KeyRoom_Epic' }
// Pfeil im Schlüssel-Button und Zustand für eingeklappte Vorschau (Badges)
let __keysBtnArrow = null;
const KEYS_BADGES_COLLAPSE_KEY = 'lootsim_keysBadgesCollapsed_v1';
let __keysBadgesCollapsed = false;
function loadKeysBadgesCollapsed() {
  try { __keysBadgesCollapsed = localStorage.getItem(KEYS_BADGES_COLLAPSE_KEY) === '1'; } catch (_) { __keysBadgesCollapsed = false; }
}
function saveKeysBadgesCollapsed() {
  try { localStorage.setItem(KEYS_BADGES_COLLAPSE_KEY, __keysBadgesCollapsed ? '1' : '0'); } catch (_) {}
}
function setKeysBtnNotify(visible) {
  if (!__keysBtn) return;
  let dot = __keysBtn.querySelector('.keys-notify-dot');
  if (visible) {
    if (!dot) {
      dot = document.createElement('span');
      dot.className = 'keys-notify-dot';
      __keysBtn.appendChild(dot);
    }
  } else {
    if (dot && dot.parentElement) dot.parentElement.removeChild(dot);
  }
}
function setKeysBadgesCollapsed(collapsed) {
  __keysBadgesCollapsed = !!collapsed;
  saveKeysBadgesCollapsed();
  if (__keysBtnArrow) __keysBtnArrow.textContent = __keysBadgesCollapsed ? '▸' : '▾';
  renderKeysButtonBadges();
  // Beim Ausklappen (Badges sichtbar) Benachrichtigungspunkt entfernen
  if (!__keysBadgesCollapsed) setKeysBtnNotify(false);
}
function toggleKeysBadges() { setKeysBadgesCollapsed(!__keysBadgesCollapsed); }

// Hilfsfunktion: Rarität aus KeyRoom-Boxnamen ermitteln
function getRarityForKeyRoom(name) {
  switch (name) {
    case 'KeyRoom_Common': return 'Common';
    case 'KeyRoom_Rare': return 'Rare';
    case 'KeyRoom_Epic': return 'Epic';
    case 'KeyRoom_Legendary': return 'Legendary';
    case 'KeyRoom_Mythisch': return 'Mythisch';
    default: return null;
  }
}

function isKeyRoom(name) {
  return typeof name === 'string' && name.startsWith('KeyRoom_');
}

// Stellt sicher, dass der Öffnen-Button ein Icon-Container-Span besitzt
function ensureOpenBtnIconSpan() {
  const btn = dom.openBtn;
  if (!btn) return null;
  let span = btn.querySelector('.open-btn-icon');
  if (!span) {
    // Stelle sicher, dass die Beschriftung "Öffnen" gesetzt ist
    const label = 'Öffnen';
    const hasLabel = btn.textContent && btn.textContent.trim().startsWith('Öffnen');
    btn.innerHTML = hasLabel ? btn.textContent.replace('🔑', '').trim().replace(/Öffnen.*/, 'Öffnen') : label;
    // Hänge Icon-Container an
    span = document.createElement('span');
    span.className = 'open-btn-icon';
    btn.appendChild(span);
  }
  return span;
}

// Gibt den korrekten Schlüssel-Icon-Pfad für eine Rarität zurück
function getKeyIconPath(rarity) {
  const keyIcons = {
    Common: 'Itembilder/Common/common schlüssel.png',
    Rare: 'Itembilder/Selten/seltener Schlüssel.png',
    Epic: 'Itembilder/Episch/epischer Schlüssel.png',
    Legendary: 'Itembilder/Legendär/legendärer Schlüssel.png',
    Mythisch: 'Itembilder/Mythisch/Schlüssel Mythisch.png'
  };
  return keyIcons[rarity] || 'Itembilder/Common/common schlüssel.png';
}

// Aktualisiert das Icon hinter dem "Öffnen"-Text:
//  - Standard: Box-Icon der aktuell gewählten Box
//  - Schlüssel-Icon, wenn:
//      a) pendingKeyOpen aktiv ist, ODER
//      b) wir uns in einem KeyRoom befinden UND mindestens 1 passender Schlüssel vorhanden ist
function updateOpenBtnIcon() {
  const span = ensureOpenBtnIconSpan();
  if (!span) return;
  // Leeren
  span.innerHTML = '';
  // Prüfe Key-Icon-Bedingungen
  let rarityForKeyIcon = null;
  let rarityForDisabledKey = null;
  if (pendingKeyOpen && pendingKeyOpen.rarity) {
    rarityForKeyIcon = pendingKeyOpen.rarity;
  } else {
    const roomRarity = getRarityForKeyRoom(boxType);
    if (roomRarity && (keysInventory[roomRarity] || 0) > 0) {
      rarityForKeyIcon = roomRarity;
    } else if (roomRarity) {
      // In einem KeyRoom, aber keine Schlüssel mehr → ausgegrautes Schlüssel-Icon anzeigen
      rarityForDisabledKey = roomRarity;
    }
  }

  if (rarityForKeyIcon) {
    span.classList.add('key-mode');
    span.classList.remove('disabled');
    span.style.backgroundColor = colors[rarityForKeyIcon] || 'rgba(0,0,0,0.6)';
    const img = document.createElement('img');
    img.src = getKeyIconPath(rarityForKeyIcon);
    img.alt = '';
    span.appendChild(img);
  } else if (rarityForDisabledKey) {
    span.classList.add('key-mode', 'disabled');
    // Neutraler Hintergrund für deaktivierten Zustand
    span.style.backgroundColor = '#555';
    const img = document.createElement('img');
    img.src = getKeyIconPath(rarityForDisabledKey);
    img.alt = '';
    span.appendChild(img);
  } else {
    span.classList.remove('key-mode');
    span.classList.remove('disabled');
    span.style.backgroundColor = '';
    const icon = (typeof getBoxIcon === 'function') ? (getBoxIcon(boxType) || '') : '';
    span.textContent = icon;
  }
}

function setOpenBtnKeyIndicator(rarity) {
  const el = dom.openBtn;
  if (!el) return;
  // Entferne alten Indikator
  const old = el.querySelector('.open-key-indicator');
  if (old) old.remove();
  if (!rarity) return; // kein Indikator
  const span = document.createElement('span');
  span.className = 'open-key-indicator';
  // Rahmenfarbe nach Rarität
  span.style.borderColor = colors[rarity] || '#f1c40f';
  // Hintergrundfarbe nach Rarität
  span.style.backgroundColor = colors[rarity] || 'rgba(0,0,0,0.6)';
  // Icon
  const img = document.createElement('img');
  img.src = getKeyIconPath(rarity);
  img.alt = 'Schlüssel';
  span.appendChild(img);
  el.appendChild(span);
}

function ensureKeysButton() {
  const actionRow = document.getElementById('actionButtons');
  if (!actionRow || __keysBtn) return;
  const btn = document.createElement('button');
  btn.id = 'keysBtn';
  btn.className = 'box-info-btn';
  btn.type = 'button';
  btn.title = 'Schlüssel verwalten';
  btn.innerHTML = '🔑';
  // Platziere links vom Öffnen-Button, falls vorhanden
  const open = dom.openBtn;
  if (open && open.parentElement === actionRow) {
    const after = open.nextSibling;
    if (after) {
      actionRow.insertBefore(btn, after);
    } else {
      actionRow.appendChild(btn);
    }
  } else {
    actionRow.appendChild(btn);
  }
  __keysBtn = btn;
  // Pfeil zum Auf-/Zuklappen der Schlüsselvorschau einfügen
  __keysBtnArrow = document.createElement('span');
  __keysBtnArrow.className = 'keys-toggle-arrow';
  __keysBtnArrow.title = 'Schlüsselvorschau umschalten';
  __keysBtnArrow.setAttribute('aria-label', 'Schlüsselvorschau umschalten');
  __keysBtnArrow.textContent = __keysBadgesCollapsed ? '▸' : '▾';
  btn.appendChild(__keysBtnArrow);
  __keysBtnArrow.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleKeysBadges();
  });

  renderKeysButtonBadges();
  btn.addEventListener('click', (e) => {
    // Hauptfunktion: Toggle der Schlüsselleiste
    toggleKeysBadges();
    // Öffnen gilt als gesehen → Punkt entfernen
    setKeysBtnNotify(false);
  });
}

function renderKeysButtonBadges() {
  if (!__keysBtn) return;
  // Entferne alte Badges
  const old = __keysBtn.querySelector('.key-badges');
  if (old) old.remove();
  const wrap = document.createElement('span');
  wrap.className = 'key-badges';
  const abbrev = { Common: 'C', Rare: 'R', Epic: 'E', Legendary: 'L', Mythisch: 'M' };
  for (const r of KEYS_RARITIES) {
    const count = keysInventory[r] || 0;
    const b = document.createElement('span');
    b.className = `key-badge key-${r}`;
    b.setAttribute('aria-label', `Schlüssel ${displayRarityName(r)}: ${count}`);
    // Hover-Glow-Farbe je Rarität
    try { b.style.setProperty('--kb-glow', colors[r] || 'rgba(255,255,255,0.6)'); } catch (_) {}

    // Bild + Zähler
    const iconWrap = document.createElement('span');
    iconWrap.className = 'kb-icon-wrap';
    iconWrap.style.borderColor = colors[r] || '#777';
    const img = document.createElement('img');
    img.src = getKeyIconPath(r);
    img.alt = '';
    iconWrap.appendChild(img);
    const cBadge = document.createElement('span');
    cBadge.className = 'kb-count';
    cBadge.textContent = String(count);
    iconWrap.appendChild(cBadge);
    b.appendChild(iconWrap);

    // Schwarzes Icon, solange diese Schlüssel-Rarität noch nie gefunden wurde
    const isDiscovered = discoveredKeyRarities.has(r) || (count > 0);
    if (!isDiscovered) {
      b.classList.add('unknown');
    }

    if (count <= 0) {
      b.classList.add('disabled');
      b.title = `${displayRarityName(r)} – keine Schlüssel`;
    } else {
      b.title = `Mit ${displayRarityName(r)}-Schlüssel vormerken`;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isOpening) return; // während Öffnung ignorieren
        openWithKey(r);
        setKeysBtnNotify(false);
      });
    }
    wrap.appendChild(b);
  }
  if (wrap.childElementCount > 0) {
    if (!__keysBadgesCollapsed) {
      __keysBtn.appendChild(wrap);
    }
  }
}

// Keys modal removed - all key functions removed

function renderKeyTargetInfo(rarity, container) {
  // Function removed - keys modal deleted
}

function openWithKey(rarity) {
  const target = getKeyTargetBox(rarity);
  if (!target) return;
  if ((keysInventory[rarity] || 0) <= 0) return;
  
  // Nur vormerken, nicht sofort öffnen
  pendingKeyOpen = { rarity, targetBox: target };
  
  // UI: Box auswählen (visuell) und Öffnen-Button mit Schlüssel kennzeichnen
  selectBox(target);
  updateOpenBtnIcon();
}

// ======= Item-Tracker (Persistenz) =======
const STORAGE_KEY = 'lootsim_itemCounts_v1';
const PROGRESS_KEY = 'lootsim_progress_v1';
const KEY_DISCOVERY_KEY = 'lootsim_keyDiscovery_v1';
const ITEMS_KEY = 'lootsim_itemCounts_v1';
const DISCOVERED_KEY = 'lootsim_discovered_v1';
const UNLOCKED_BACKGROUNDS_KEY = 'lootsim_unlockedBackgrounds_v1';

// Objekt: { [itemName]: count }
let itemCounts = {};

// Entdeckte Schlüssel-Raritäten (für schwarze Icons bis zum ersten Fund)
let discoveredKeyRarities = new Set(); // Werte: 'Common' | 'Rare' | 'Epic' | 'Legendary' | 'Mythisch'

function loadKeyDiscovery() {
  try {
    const raw = localStorage.getItem(KEY_DISCOVERY_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) discoveredKeyRarities = new Set(arr);
    }
  } catch (_) { /* ignore */ }
  // Migration/Fallback: markiere Raritäten mit vorhandenem Bestand als entdeckt
  try {
    for (const r of KEYS_RARITIES) {
      if ((keysInventory[r] || 0) > 0) discoveredKeyRarities.add(r);
    }
  } catch (_) { /* ignore */ }
}

function saveKeyDiscovery() {
  try { localStorage.setItem(KEY_DISCOVERY_KEY, JSON.stringify(Array.from(discoveredKeyRarities))); } catch (_) {}
}

function loadCounts() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      itemCounts = parsed;
      // Gefundene Items basierend auf den gespeicherten Zählern markieren
      for (const name of Object.keys(itemCounts)) {
        if (itemCounts[name] > 0) discoveredItems.add(name);
      }
    }
  } catch (e) {
    console.warn('Failed to load item counts', e);
  }
}

function saveCounts() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(itemCounts));
  } catch (e) {
    console.warn('Failed to save item counts', e);
  }
}

// Speichere und lade kompletten Fortschritt
let saveProgressTimeout = null;
let lastFirebaseSync = 0;
const FIREBASE_SYNC_COOLDOWN = 3000; // 3 Sekunden Cooldown

function saveProgress() {
  try {
    const progress = {
      balance,
      playerLevel,
      playerXP,
      totalXPEarned,
      skillPoints,
      skills: { ...skills },
      boxType,
      unlockedBoxes: Array.from(unlockedBoxes),
      stats: { ...stats },
      achievementsState: { ...achievementsState },
      activeBoosts: { ...activeBoosts },
      permanentUpgrades: { ...permanentUpgrades },
      purchasedItems: Array.from(purchasedItems),
      statUpgradesLevels: { ...statUpgradesLevels },
      keysInventory: { ...keysInventory },
      prestigeState: { ...prestigeState },
      unlockedBackgrounds: Array.from(unlockedBackgrounds),
      activeBackground
    };
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
    
    // Firebase Cloud Sync mit Debounce
    clearTimeout(saveProgressTimeout);
    saveProgressTimeout = setTimeout(() => {
      syncToFirebase(progress);
    }, 1000); // 1 Sekunde Debounce für häufige Saves
  } catch (e) {
    console.warn('Failed to save progress', e);
  }
}

// Sync game data to Firebase
function syncToFirebase(progress) {
  try {
    if (!window.firebaseApi || typeof window.firebaseApi.syncUserData !== 'function') {
      return;
    }
    
    // Cooldown-Check: Nicht öfter als alle 3 Sekunden syncen
    const now = Date.now();
    if (now - lastFirebaseSync < FIREBASE_SYNC_COOLDOWN) {
      return;
    }
    lastFirebaseSync = now;
    
    // Count mythics and aetherics using safe helper function
    let mythicsFound = 0;
    let aethericsFound = 0;
    try {
      mythicsFound = getDiscoveredCountByRarity('Mythisch') || 0;
      aethericsFound = getDiscoveredCountByRarity('Aetherisch') || 0;
    } catch (e) {
      console.warn('Could not count mythics/aetherics:', e);
    }
    
    // Lade Item-Daten aus localStorage
    let itemCounts = {};
    let discoveredItems = [];
    let unlockedBgs = ['default'];
    try {
      const itemsRaw = localStorage.getItem(ITEMS_KEY);
      if (itemsRaw) itemCounts = JSON.parse(itemsRaw);
      const discoveredRaw = localStorage.getItem(DISCOVERED_KEY);
      if (discoveredRaw) discoveredItems = JSON.parse(discoveredRaw);
      const bgsRaw = localStorage.getItem(UNLOCKED_BACKGROUNDS_KEY);
      if (bgsRaw) unlockedBgs = JSON.parse(bgsRaw);
    } catch (e) {
      console.warn('Could not load item data for sync:', e);
    }
    
    const userData = {
      displayName: localStorage.getItem('playerDisplayName') || 'Anonym',
      totalXPEarned: progress.totalXPEarned,
      totalBoxesOpened: progress.stats.totalBoxesOpened || 0,
      mythicsFound,
      aethericsFound,
      balance: progress.balance,
      playerLevel: progress.playerLevel,
      playerXP: progress.playerXP,
      skillPoints: progress.skillPoints,
      skills: progress.skills,
      prestigeLevel: progress.prestigeState?.level || 0,
      runBoxesOpened: progress.prestigeState?.runBoxesOpened || 0,
      activeBoosts: progress.activeBoosts,
      permanentUpgrades: progress.permanentUpgrades,
      purchasedItems: progress.purchasedItems,
      statUpgradesLevels: progress.statUpgradesLevels,
      keysInventory: progress.keysInventory,
      boxType: progress.boxType,
      unlockedBoxes: progress.unlockedBoxes,
      stats: progress.stats,
      itemCounts,
      discoveredItems,
      unlockedBackgrounds: unlockedBgs,
      activeBackground: progress.activeBackground
    };
    
    // Non-blocking sync - wait for Firebase ready
    window.firebaseApi.ready().then(() => {
      return window.firebaseApi.syncUserData(userData);
    }).then(() => {
      // Sync successful
    }).catch(err => {
      console.warn('Firebase sync failed:', err);
      lastFirebaseSync = 0; // Reset bei Fehler, damit Retry möglich
    });
  } catch (err) {
    console.warn('Firebase sync error:', err);
    lastFirebaseSync = 0; // Reset bei Fehler
  }
}

// Kompletter Firebase-Sync ohne Cooldown (für Account-Linking)
async function syncToFirebaseComplete() {
  try {
    if (!window.firebaseApi || typeof window.firebaseApi.syncUserData !== 'function') {
      throw new Error('Firebase API nicht verfügbar');
    }
    
    await window.firebaseApi.ready();
    
    const progress = {
      balance,
      playerLevel,
      playerXP,
      totalXPEarned,
      skillPoints,
      skills: { ...skills },
      boxType,
      unlockedBoxes: Array.from(unlockedBoxes),
      stats: { ...stats },
      achievementsState: { ...achievementsState },
      activeBoosts: { ...activeBoosts },
      permanentUpgrades: { ...permanentUpgrades },
      purchasedItems: Array.from(purchasedItems),
      statUpgradesLevels: { ...statUpgradesLevels },
      keysInventory: { ...keysInventory },
      prestigeState: { ...prestigeState },
      unlockedBackgrounds: Array.from(unlockedBackgrounds),
      activeBackground
    };
    
    let mythicsFound = 0;
    let aethericsFound = 0;
    try {
      mythicsFound = getDiscoveredCountByRarity('Mythisch') || 0;
      aethericsFound = getDiscoveredCountByRarity('Aetherisch') || 0;
    } catch (e) {
      console.warn('Could not count mythics/aetherics:', e);
    }
    
    let itemCounts = {};
    let discoveredItems = [];
    let unlockedBgs = ['default'];
    try {
      const itemsRaw = localStorage.getItem(ITEMS_KEY);
      if (itemsRaw) itemCounts = JSON.parse(itemsRaw);
      const discoveredRaw = localStorage.getItem(DISCOVERED_KEY);
      if (discoveredRaw) discoveredItems = JSON.parse(discoveredRaw);
      const bgsRaw = localStorage.getItem(UNLOCKED_BACKGROUNDS_KEY);
      if (bgsRaw) unlockedBgs = JSON.parse(bgsRaw);
    } catch (e) {
      console.warn('Could not load item data for sync:', e);
    }
    
    const userData = {
      displayName: localStorage.getItem('playerDisplayName') || 'Anonym',
      totalXPEarned: progress.totalXPEarned,
      totalBoxesOpened: progress.stats.totalBoxesOpened || 0,
      mythicsFound,
      aethericsFound,
      balance: progress.balance,
      playerLevel: progress.playerLevel,
      playerXP: progress.playerXP,
      skillPoints: progress.skillPoints,
      skills: progress.skills,
      prestigeLevel: progress.prestigeState?.level || 0,
      runBoxesOpened: progress.prestigeState?.runBoxesOpened || 0,
      activeBoosts: progress.activeBoosts,
      permanentUpgrades: progress.permanentUpgrades,
      purchasedItems: progress.purchasedItems,
      statUpgradesLevels: progress.statUpgradesLevels,
      keysInventory: progress.keysInventory,
      boxType: progress.boxType,
      unlockedBoxes: progress.unlockedBoxes,
      stats: progress.stats,
      itemCounts,
      discoveredItems,
      unlockedBackgrounds: unlockedBgs,
      activeBackground: progress.activeBackground
    };
    
    await window.firebaseApi.syncUserData(userData);
    console.log('✅ Kompletter Spielstand zu Firebase hochgeladen');
    return true;
  } catch (err) {
    console.error('Complete Firebase sync failed:', err);
    throw err;
  }
}

function loadProgress() {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (!raw) return;
    const progress = JSON.parse(raw);
    
    if (progress.balance !== undefined) balance = progress.balance;
    if (progress.playerLevel !== undefined) playerLevel = progress.playerLevel;
    if (progress.playerXP !== undefined) playerXP = progress.playerXP;
    if (progress.totalXPEarned !== undefined) {
      totalXPEarned = progress.totalXPEarned;
    } else {
      // Migration: Berechne totalXPEarned aus Level + aktuellem XP
      let calculatedTotal = playerXP;
      for (let lvl = 1; lvl < playerLevel; lvl++) {
        calculatedTotal += getXPForLevel(lvl);
      }
      totalXPEarned = calculatedTotal;
    }
    if (progress.skillPoints !== undefined) skillPoints = progress.skillPoints;
    if (progress.skills) {
      skills.wohlstand = progress.skills.wohlstand || 0;
      skills.glueck = progress.skills.glueck || 0;
      skills.effizienz = progress.skills.effizienz || 0;
    }
    if (progress.boxType) boxType = progress.boxType;
    if (progress.unlockedBoxes) {
      unlockedBoxes.clear();
      progress.unlockedBoxes.forEach(box => unlockedBoxes.add(box));
    }
    if (progress.stats) {
      Object.assign(stats, progress.stats);
    }
    // Nach dem Laden: fehlende Box-Zähler ergänzen (Migration für Box#8-#10)
    ensureBoxOpenCountsKeys();
    if (progress.achievementsState) {
      // Migration: altes seenMax -> neues Schema
      if (typeof progress.achievementsState.seenMax === 'number') {
        achievementsState.seen = achievementsState.seen || { boxes: 0, gold: 0, collection: { Common:0,Rare:0,Epic:0,Legendary:0,Mythisch:0 }, keys: { Common:0,Rare:0,Epic:0,Legendary:0,Mythisch:0 } };
        achievementsState.seen.boxes = Math.max(achievementsState.seen.boxes || 0, progress.achievementsState.seenMax || 0);
      }
      if (progress.achievementsState.seen) {
        const seen = progress.achievementsState.seen;
        achievementsState.seen = achievementsState.seen || { boxes: 0, gold: 0, collection: { Common:0,Rare:0,Epic:0,Legendary:0,Mythisch:0 }, keys: { Common:0,Rare:0,Epic:0,Legendary:0,Mythisch:0 } };
        if (typeof seen.boxes === 'number') achievementsState.seen.boxes = seen.boxes;
        if (typeof seen.gold === 'number') achievementsState.seen.gold = seen.gold;
        if (seen.collection && typeof seen.collection === 'object') {
          achievementsState.seen.collection = { Common:0,Rare:0,Epic:0,Legendary:0,Mythisch:0, ...seen.collection };
        }
        if (seen.keys && typeof seen.keys === 'object') {
          achievementsState.seen.keys = { Common:0,Rare:0,Epic:0,Legendary:0,Mythisch:0, ...seen.keys };
        }
      }
    }
    if (progress.activeBoosts) {
      Object.assign(activeBoosts, progress.activeBoosts);
    }
    if (progress.permanentUpgrades) {
      Object.assign(permanentUpgrades, progress.permanentUpgrades);
      // Migration: alte "slotIncrease" Käufe werden zu permTempoBoost konvertiert
      if (typeof progress.permanentUpgrades.slotIncrease === 'number' && progress.permanentUpgrades.slotIncrease > 0) {
        const add = progress.permanentUpgrades.slotIncrease;
        permanentUpgrades.permTempoBoost = (permanentUpgrades.permTempoBoost || 0) + add;
      }
      // Einmalige Ausrüstung clampen (max 1 wirksam)
      if (permanentUpgrades.permTempoBoost > 1) permanentUpgrades.permTempoBoost = 1;
      if (permanentUpgrades.permValueBoost > 1) permanentUpgrades.permValueBoost = 1;
      if (permanentUpgrades.permXPBoost > 1) permanentUpgrades.permXPBoost = 1;
      if (permanentUpgrades.permPotionBelt > 1) permanentUpgrades.permPotionBelt = 1;
      if (permanentUpgrades.permAutoClicker > 1) permanentUpgrades.permAutoClicker = 1;
      if (permanentUpgrades.permAutoClickerSpeed1 > 1) permanentUpgrades.permAutoClickerSpeed1 = 1;
      if (permanentUpgrades.permAutoClickerSpeed2 > 1) permanentUpgrades.permAutoClickerSpeed2 = 1;
    }
    if (progress.purchasedItems) {
      purchasedItems.clear();
      progress.purchasedItems.forEach(item => purchasedItems.add(item));
    }
    if (progress.statUpgradesLevels) {
      Object.assign(statUpgradesLevels, progress.statUpgradesLevels);
    }
    if (progress.keysInventory) {
      Object.assign(keysInventory, progress.keysInventory);
    }
    if (progress.prestigeState) {
      // robust merge; ensure level is a non-negative integer
      try {
        const lvl = parseInt(progress.prestigeState.level, 10);
        prestigeState.level = isFinite(lvl) && lvl >= 0 ? lvl : 0;
      } catch (_) {
        prestigeState.level = 0;
      }
      // Run-Box-Zähler laden (falls vorhanden)
      try {
        const rbo = parseInt(progress.prestigeState.runBoxesOpened, 10);
        prestigeState.runBoxesOpened = isFinite(rbo) && rbo >= 0 ? rbo : (prestigeState.runBoxesOpened || 0);
      } catch (_) {
        // falls altes Save ohne Feld: bisherigen Wert beibehalten (Default 0)
        prestigeState.runBoxesOpened = prestigeState.runBoxesOpened || 0;
      }
      
      // Migration: Wenn runBoxesOpened 0 ist aber totalBoxesOpened > 0, initialisiere mit totalBoxesOpened
      if ((prestigeState.runBoxesOpened || 0) === 0 && (progress.stats?.totalBoxesOpened || 0) > 0) {
        prestigeState.runBoxesOpened = progress.stats.totalBoxesOpened;
      }
    }
    // Hintergründe laden
    if (progress.unlockedBackgrounds && Array.isArray(progress.unlockedBackgrounds)) {
      unlockedBackgrounds = new Set(progress.unlockedBackgrounds);
    }
    if (progress.activeBackground && backgrounds[progress.activeBackground]) {
      activeBackground = progress.activeBackground;
      applyBackground(activeBackground);
    }
  } catch (e) {
    console.warn('Failed to load progress', e);
  }
}

// Load persisted data on startup
loadCounts();
loadProgress();
// Falls ohne Save gestartet: ebenfalls sicherstellen
ensureBoxOpenCountsKeys();
// Zustand für eingeklappte Schlüssel-Badges laden
loadKeysBadgesCollapsed();
// Entdeckte Schlüssel-Raritäten laden (abhängig vom geladenen keysInventory)
loadKeyDiscovery();
// Initial Quickslots-Render (falls Gürtel bereits vorhanden)
renderQuickslots();
// Initial: Achievements-Benachrichtigung prüfen
updateAchievementsNotify();

// Helper: Erzeugt Slots im Container und gibt Array zurück
// Hilfsfunktion: Prüft ob ein Item an Position (row, col) platziert werden kann
function canPlaceItem(grid, rows, cols, row, col, itemWidth, itemHeight) {
  // Prüfe ob Item außerhalb des Grids wäre
  if (row + itemHeight > rows || col + itemWidth > cols) {
    return false;
  }
  // Prüfe ob alle benötigten Zellen frei sind
  for (let r = row; r < row + itemHeight; r++) {
    for (let c = col; c < col + itemWidth; c++) {
      if (grid[r][c] !== null) {
        return false; // Zelle bereits belegt
      }
    }
  }
  return true;
}

// Hilfsfunktion: Platziert ein Item im Grid
function placeItemInGrid(grid, row, col, itemWidth, itemHeight, itemIndex) {
  for (let r = row; r < row + itemHeight; r++) {
    for (let c = col; c < col + itemWidth; c++) {
      grid[r][c] = itemIndex;
    }
  }
}

// Findet eine freie Position für ein Item mit gegebener Größe
function findFreePosition(grid, rows, cols, itemWidth, itemHeight) {
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (canPlaceItem(grid, rows, cols, row, col, itemWidth, itemHeight)) {
        return { row, col };
      }
    }
  }
  return null; // Keine freie Position gefunden
}

// Lädt Spielstand von Firebase und überschreibt lokalen Spielstand
async function loadProgressFromFirebase() {
  try {
    if (!window.firebaseApi) {
      throw new Error('Firebase API nicht verfügbar');
    }
    
    // Warte bis Firebase bereit ist
    await window.firebaseApi.ready();
    
    // Prüfe ob User eingeloggt ist
    const uid = window.firebaseApi.getCurrentUid();
    if (!uid) {
      throw new Error('Kein User eingeloggt');
    }
    
    console.log('Lade Spielstand von Firebase für User:', uid);
    
    // Spielstand vom Server abrufen
    const serverData = await window.firebaseApi.getUserData();
    
    if (!serverData) {
      console.log('Kein Spielstand auf dem Server gefunden (serverData ist null/undefined)');
      return false;
    }
    
    console.log('Server-Daten erhalten:', serverData);
    
    if (!serverData.gameData) {
      console.log('Kein gameData vorhanden - neuer Account?');
      return false;
    }
    
    // Server-Daten in localStorage speichern
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(serverData.gameData));
    localStorage.setItem(ITEMS_KEY, JSON.stringify(serverData.itemCounts || {}));
    localStorage.setItem(DISCOVERED_KEY, JSON.stringify(serverData.discoveredItems || []));
    localStorage.setItem(UNLOCKED_BACKGROUNDS_KEY, JSON.stringify(serverData.unlockedBackgrounds || ['default']));
    
    if (serverData.activeBackground) {
      localStorage.setItem('activeBackground', serverData.activeBackground);
    }
    
    // Spielstand neu laden
    loadProgress();
    loadCounts();
    loadDiscovered();
    loadUnlockedBackgrounds();
    
    console.log('Spielstand erfolgreich von Firebase geladen');
    return true;
  } catch (error) {
    console.error('Firebase sync failed:', error);
    // Zeige nur kritische Fehler, NetworkError kann z.B. bei neuen Accounts normal sein
    if (error.message.includes('NetworkError') || error.message.includes('fetch')) {
      console.warn('Network-Fehler beim Laden - eventuell kein Spielstand auf Server');
      return false;
    }
    throw error;
  }
}

// === GRID PLACEMENT HELPER FUNCTIONS ===

// Prüft ob ein Item an Position (row, col) im Grid platziert werden kann
function canPlaceItemInGrid(grid, rows, cols, row, col, itemWidth, itemHeight) {
  // Prüfe ob Item außerhalb des Grids wäre
  if (row + itemHeight > rows || col + itemWidth > cols) {
    return false;
  }
  // Prüfe ob alle benötigten Zellen frei sind
  for (let r = row; r < row + itemHeight; r++) {
    for (let c = col; c < col + itemWidth; c++) {
      if (grid[r][c] !== null) {
        return false; // Zelle bereits belegt
      }
    }
  }
  return true;
}

// Markiert Grid-Zellen als belegt
function placeItemInGrid(grid, row, col, itemWidth, itemHeight, itemIndex) {
  for (let r = row; r < row + itemHeight; r++) {
    for (let c = col; c < col + itemWidth; c++) {
      grid[r][c] = itemIndex;
    }
  }
}

// === MULTI-SIZE GRID HELPER FUNCTIONS ===
function canPlaceItemInGrid(grid, rows, cols, startRow, startCol, itemWidth, itemHeight) {
  // Prüfe ob Item außerhalb des Grids wäre
  if (startRow + itemHeight > rows || startCol + itemWidth > cols) {
    return false;
  }
  // Prüfe ob alle benötigten Zellen frei sind
  for (let r = startRow; r < startRow + itemHeight; r++) {
    for (let c = startCol; c < startCol + itemWidth; c++) {
      if (grid[r][c] !== null) {
        return false; // Zelle bereits belegt
      }
    }
  }
  return true;
}

function placeItemInGrid(grid, startRow, startCol, itemWidth, itemHeight, itemIndex) {
  // Markiere alle Zellen als belegt
  for (let r = startRow; r < startRow + itemHeight; r++) {
    for (let c = startCol; c < startCol + itemWidth; c++) {
      grid[r][c] = itemIndex;
    }
  }
}

function buildSlots(container, totalSlots) {
  const slots = [];
  for (let i = 0; i < totalSlots; i++) {
    const slot = document.createElement('div');
    slot.classList.add('slot');

    const item = document.createElement('div');
    item.classList.add('item');
    item.dataset.revealed = 'false';
    item.style.backgroundColor = '#222';
    item.textContent = '';

    slot.appendChild(item);
    container.appendChild(slot);
    slots.push({ slot, item });
  }
  return slots;
}

// Erstellt das leere Grid mit Slots
function createEmptyGrid() {
  const columns = boxConfigs[boxType].columns || 4;
  const rows = boxConfigs[boxType].rows || 3;
  const totalSlots = columns * rows;

  // Leere den Container und setze Grid-Layout
  dom.lootContainer.innerHTML = '';
  dom.lootContainer.style.gridTemplateColumns = `repeat(${columns}, ${SLOT_SIZE_PX}px)`;
  dom.lootContainer.style.gridTemplateRows = `repeat(${rows}, ${SLOT_SIZE_PX}px)`;

  // Overlay-Größe an Grid anpassen (initial versteckt)
  dom.overlay.style.width = `${columns * SLOT_SIZE_PX}px`;
  dom.overlay.style.height = `${rows * SLOT_SIZE_PX}px`;
  dom.overlay.style.display = 'none';

  // Erstelle leere Slots
  buildSlots(dom.lootContainer, totalSlots);
}

// Event-Handler für den Öffnen-Button
dom.openBtn.addEventListener('click', async () => {
  // Blockiere Box-Öffnung während Prestige läuft
  if (isPrestiging) {
    alert('Bitte warte, bis der Prestige-Vorgang abgeschlossen ist.');
    return;
  }
  
  // Auto-Clicker: Erlaube Auto-Runs nach manuellem Öffnen
  if (autoClickerEnabled && (permanentUpgrades.permAutoClicker || 0) >= 1) {
    autoClickerCanRun = true;
  }
  
  // Markiere, dass eine Öffnung läuft
  isOpening = true;
  // Button deaktivieren und ausgrauen
  dom.openBtn.disabled = true;
  dom.openBtn.style.opacity = '0.5';
  // Box-Auswahl temporär deaktivieren
  setBoxSelectionEnabled(false);
  // Während der Öffnung: Quickslots/Shop-UI aktualisieren (Tränke sperren)
  try {
    renderQuickslots();
    if (dom.shopModal && dom.shopModal.style.display === 'block') {
      showShop();
    }
  } catch (_) { /* ignore */ }
  // Tracke, ob für diese Öffnung bereits ein Schlüssel verbraucht wurde,
  // um doppelten Verbrauch (Vormerkung + Auto-Verbrauch im KeyRoom) zu vermeiden
  let __consumedKeyThisOpen = false;

  // Prüfe ob ein Schlüssel-Vormerkung aktiv ist und bereite kostenfreie Öffnung vor
  if (pendingKeyOpen) {
    try {
      // Stelle sicher, dass die richtige Ziel-Box geöffnet wird
      if (boxType !== pendingKeyOpen.targetBox) {
        boxType = pendingKeyOpen.targetBox; // direkt setzen (wir befinden uns bereits in der Öffnung)
        updateChestTheme(boxType);
      }
      // Schlüsselverbrauch prüfen und anwenden
      const r = pendingKeyOpen.rarity;
      if ((keysInventory[r] || 0) > 0) {
        keysInventory[r] = (keysInventory[r] || 0) - 1;
        saveProgress();
        renderKeysButtonBadges();
        __nextOpenIsFree = true; // nächste Öffnung ist kostenlos
        __consumedKeyThisOpen = true; // Merken, dass bereits ein Schlüssel genutzt wurde
      }
    } finally {
      // Inline-Icon aktualisieren und Vormerkung zurücksetzen – unabhängig vom Ergebnis
      pendingKeyOpen = null;
      updateOpenBtnIcon();
    }
  }

  // Falls keine Vormerkung aktiv ist, aber wir uns in einem KeyRoom befinden:
  // versuche automatisch einen passenden Schlüssel zu verbrauchen, oder breche mit Meldung ab.
  // Nur automatisch konsumieren, wenn bisher kein Schlüssel für diese Öffnung genutzt wurde
  if (!__consumedKeyThisOpen) {
    const autoRarity = getRarityForKeyRoom(boxType);
    if (autoRarity) {
      if ((keysInventory[autoRarity] || 0) > 0) {
        keysInventory[autoRarity] = (keysInventory[autoRarity] || 0) - 1;
        saveProgress();
        renderKeysButtonBadges();
        __nextOpenIsFree = true; // Öffnung im Raum ist durch Schlüssel "autorisiert"
        // Icon nach Verbrauch aktualisieren (bleibt Schlüssel, wenn weitere vorhanden sind)
        updateOpenBtnIcon();
        __consumedKeyThisOpen = true;
      } else {
        alert(`Keine Schlüssel mehr für ${displayRarityName(autoRarity)}!`);
        // UI zurücksetzen und Öffnung abbrechen
        dom.openBtn.disabled = false;
        dom.openBtn.style.opacity = '1';
        setBoxSelectionEnabled(true);
        isOpening = false;
        setSearchingState(false);
        // Quickslots/Shop wieder freigeben
        try {
          renderQuickslots();
          if (dom.shopModal && dom.shopModal.style.display === 'block') showShop();
        } catch (_) { /* ignore */ }
        return;
      }
    }
  }

  if (!deductBalanceForBox()) {
    // Bei Fehler wieder aktivieren
    dom.openBtn.disabled = false;
    dom.openBtn.style.opacity = '1';
    setBoxSelectionEnabled(true);
    isOpening = false;
    setSearchingState(false);
    // Quickslots/Shop wieder freigeben
    try {
      renderQuickslots();
      if (dom.shopModal && dom.shopModal.style.display === 'block') showShop();
    } catch (_) { /* ignore */ }
    return;
  }
  // Starte Such-Animation
  setSearchingState(true);
  // Box-Konfiguration zum Start der Öffnung einfrieren
  const openBoxType = boxType;
  const columns = boxConfigs[openBoxType].columns || 4;
  const rows = boxConfigs[openBoxType].rows || 3;
  const totalSlots = columns * rows;
  const itemCount = getWeightedItemCount(openBoxType);
  const desiredRarities = null;
  let roundValue = 0;
  
  // Container leeren und Grid neu aufbauen
  dom.lootContainer.innerHTML = '';
  dom.lootContainer.style.gridTemplateColumns = `repeat(${columns}, ${SLOT_SIZE_PX}px)`;
  dom.lootContainer.style.gridTemplateRows = `repeat(${rows}, ${SLOT_SIZE_PX}px)`;
  
  // Overlay-Größe passend setzen und anzeigen
  dom.overlay.style.width = `${columns * SLOT_SIZE_PX}px`;
  dom.overlay.style.height = `${rows * SLOT_SIZE_PX}px`;
  dom.overlay.style.display = 'block';

  // === OPTIMIERTE MULTI-SIZE GRID LOGIK ===
  // Grid-Array initialisieren (2D)
  const grid = Array(rows).fill(null).map(() => Array(columns).fill(null));

  // Erstelle zuerst alle leeren Hintergrund-Slots
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const emptySlot = document.createElement('div');
      emptySlot.classList.add('slot', 'background-slot');
      emptySlot.style.gridColumn = `${col + 1}`;
      emptySlot.style.gridRow = `${row + 1}`;
      dom.lootContainer.appendChild(emptySlot);
    }
  }

  // Dynamische Item-Generierung: Generiere Items bis Ziel-Füllrate erreicht ist
  const placedItems = [];
  const targetItemCount = itemCount;
  let itemsGenerated = 0;
  let consecutiveFailures = 0;
  const maxConsecutiveFailures = 15; // Nach 15 Fehlversuchen aufhören
  
  // Hilfsfunktion: Berechne verfügbare Slots im Grid
  function countAvailableSlots(grid) {
    let count = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) {
        if (grid[r][c] === null) count++;
      }
    }
    return count;
  }
  
  // Hilfsfunktion: Finde größtmögliche freie Fläche
  function getLargestFreeArea(grid) {
    let maxWidth = 0;
    let maxHeight = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) {
        if (grid[r][c] === null) {
          // Prüfe maximale Breite ab dieser Position
          let w = 0;
          while (c + w < columns && grid[r][c + w] === null) w++;
          maxWidth = Math.max(maxWidth, w);
          
          // Prüfe maximale Höhe ab dieser Position
          let h = 0;
          while (r + h < rows && grid[r + h][c] === null) h++;
          maxHeight = Math.max(maxHeight, h);
        }
      }
    }
    return { maxWidth, maxHeight };
  }
  
  while (itemsGenerated < targetItemCount && consecutiveFailures < maxConsecutiveFailures) {
    const availableSlots = countAvailableSlots(grid);
    if (availableSlots === 0) break; // Grid komplett voll
    
    // Generiere neues Item
    let pulledItem = getRandomItem(openBoxType);
    let itemWidth = pulledItem.gridSize?.width || 1;
    let itemHeight = pulledItem.gridSize?.height || 1;
    
    // Intelligente Größenanpassung wenn Platz knapp wird
    const { maxWidth, maxHeight } = getLargestFreeArea(grid);
    if (itemWidth > maxWidth || itemHeight > maxHeight) {
      // Item ist zu groß - versuche kleineres Item zu generieren (max 3 Versuche)
      let attempts = 0;
      while (attempts < 3 && (itemWidth > maxWidth || itemHeight > maxHeight)) {
        pulledItem = getRandomItem(openBoxType);
        itemWidth = pulledItem.gridSize?.width || 1;
        itemHeight = pulledItem.gridSize?.height || 1;
        attempts++;
      }
      
      // Wenn immer noch zu groß, überspringe dieses Item
      if (itemWidth > maxWidth || itemHeight > maxHeight) {
        consecutiveFailures++;
        continue;
      }
    }

    // Versuche Item zu platzieren
    let placed = false;
    for (let row = 0; row < rows && !placed; row++) {
      for (let col = 0; col < columns && !placed; col++) {
        if (canPlaceItemInGrid(grid, rows, columns, row, col, itemWidth, itemHeight)) {
          // Markiere Grid-Zellen als belegt
          placeItemInGrid(grid, row, col, itemWidth, itemHeight, itemsGenerated);

          // Erstelle Slot Element
          const slot = document.createElement('div');
          slot.classList.add('slot');
          slot.style.gridColumn = `${col + 1} / span ${itemWidth}`;
          slot.style.gridRow = `${row + 1} / span ${itemHeight}`;

          // Erstelle Item Element
          const item = document.createElement('div');
          item.classList.add('item');
          item.dataset.revealed = 'false';
          item.style.backgroundColor = '#222';
          item.textContent = '';
          item.classList.add('pre-reveal');

          slot.appendChild(item);
          dom.lootContainer.appendChild(slot);

          placedItems.push({ slot, item, pulledItem, row, col, width: itemWidth, height: itemHeight });
          placed = true;
          itemsGenerated++;
          consecutiveFailures = 0; // Reset bei Erfolg
        }
      }
    }
    
    if (!placed) {
      consecutiveFailures++;
    }
  }

  // Verwende placedItems statt slots
  const revealSlots = placedItems;
  const pulledNamesThisRound = new Set();

  await sleep(500);
  dom.overlay.style.display = 'none';

  // Statistiken aktualisieren
  stats.totalBoxesOpened++;
  // Run-Zähler: Boxen seit letztem Prestige
  prestigeState.runBoxesOpened = (prestigeState.runBoxesOpened || 0) + 1;
  // Sofort persistieren, damit der Zähler einen Reload übersteht
  try { saveProgress(); } catch (_) {}
  stats.boxOpenCounts[openBoxType] = (stats.boxOpenCounts[openBoxType] || 0) + 1;
  stats.totalItemsPulled += revealSlots.length; // Tatsächlich platzierte Items
  // Prüfe auf neue (ungesehene) Erfolge
  updateAchievementsNotify();

  for (let i = 0; i < revealSlots.length; i++) {
    const { item, pulledItem } = revealSlots[i];
    const name = pulledItem.name || 'Unbekannter Gegenstand';
    const isNew = !discoveredItems.has(name);

    // Zustand updaten
  discoveredItems.add(name);
  
  // Lifetime-Counter bei jedem gefundenen Item erhöhen
  if (pulledItem.rarity) {
    if (!stats.lifetimeDiscovered[pulledItem.rarity]) {
      stats.lifetimeDiscovered[pulledItem.rarity] = 0;
    }
    stats.lifetimeDiscovered[pulledItem.rarity]++;
  }
  
  // Tracking: Anzahl erhöhen
  itemCounts[name] = (itemCounts[name] || 0) + 1;
  saveCounts();
    pulledNamesThisRound.add(name);

  // Wertvollstes Item tracken
  if (pulledItem.value > stats.mostValuableItem.value) {
    stats.mostValuableItem = { 
      name: pulledItem.name, 
      value: pulledItem.value,
      rarity: pulledItem.rarity 
    };
  }

  // DOM-Datenattribute füllen (für mögliche spätere Detail-Views)
  item.dataset.rarity = pulledItem.rarity;
  item.dataset.name = name;
  item.dataset.icon = pulledItem.icon || '';
  item.dataset.description = pulledItem.description || '';

    revealSlots[i].isNew = isNew;
  }

  // Preload aller Item-Bilder bevor die Reveal-Animation startet
  const preloadPromises = revealSlots.map(({ pulledItem }) => {
    return new Promise((resolve) => {
      const iconPath = getItemImagePath(pulledItem.icon || '', pulledItem.rarity || 'Common');
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => resolve(); // Auch bei Fehler weitermachen
      img.src = iconPath;
    });
  });
  
  // Warte bis alle Bilder geladen sind (oder Timeout nach 2 Sekunden)
  await Promise.race([
    Promise.all(preloadPromises),
    sleep(2000) // Max. 2 Sekunden warten
  ]);

  // Reveal-Animation: nacheinander aufdecken
  for (let i = 0; i < revealSlots.length; i++) {
    const { slot, item, pulledItem } = revealSlots[i];

    // Erzeuge die Lupe als Kind des Slots, sodass sie beim Scrollen mitbewegt wird
    let floatingLupe = null;
    try {
      const rectLupe = item.getBoundingClientRect();
      const slotRect = slot.getBoundingClientRect();
      
      // Erzeuge Lupe als absolutes Element innerhalb des Slots
      floatingLupe = document.createElement('div');
      floatingLupe.classList.add('floating-lupe');
      floatingLupe.textContent = '🔍';
      floatingLupe.style.position = 'absolute';
      floatingLupe.style.pointerEvents = 'none';
      floatingLupe.style.zIndex = '2600';
      
      // Relativ zur Slot-Mitte positionieren
      const centerX = (item.offsetWidth / 2);
      const centerY = (item.offsetHeight / 2);
      floatingLupe.style.left = `${centerX}px`;
      floatingLupe.style.top = `${centerY}px`;
      floatingLupe.style.willChange = 'transform';
      
      // Hänge die Lupe an den Slot (nicht an body)
      slot.style.position = 'relative'; // Damit absolute positioning funktioniert
      slot.appendChild(floatingLupe);

      // Animations-Loop: kreisförmige Bewegung um den Slot-Mittelpunkt
      // Radius-Faktor: wie weit vom Zentrum die Lupe kreist (0.0 - 0.5)
      const RADIUS_FACTOR = 0.20; // kleinerer Wert = näher am Zentrum
      const radius = Math.max(8, Math.min(item.offsetWidth, item.offsetHeight) * RADIUS_FACTOR);
      const basePeriod = 1170; // Basis-Millisekunden pro Umdrehung
      const period = basePeriod * getTempoMultiplier(); // Mit Tempo-Skill anpassen
      let start = performance.now();
      function orbit(now) {
        const t = now - start;
        const angle = ((t % period) / period) * Math.PI * 2;
        const offsetX = Math.cos(angle) * radius;
        const offsetY = Math.sin(angle) * radius;
        // translate(-50%, -50%) zentriert die Lupe, dann offset für Orbit
        floatingLupe.style.transform = `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px))`;
        floatingLupe._raf = requestAnimationFrame(orbit);
      }
      floatingLupe._raf = requestAnimationFrame(orbit);
    } catch (e) {
      console.warn('Floating lupe creation failed', e);
    }

    const baseDelay = 1600; // Basis-Delay für Untersuchungszeit pro Item
    
    // Rarität-basierter Multiplikator für Untersuchungszeit
    const rarityDelayMultipliers = {
      'Common': 1.0,
      'Rare': 1.2,
      'Epic': 1.4,
      'Legendary': 1.6,
      'Mythisch': 2.0,
      'Aetherisch': 2.5
    };
    const rarityMultiplier = rarityDelayMultipliers[pulledItem.rarity] || 1.0;
    
    await sleep(baseDelay * rarityMultiplier * getTempoMultiplier()); // Mit Rarität und Tempo-Skill anpassen

  // Entferne vorläufige Platzhalter-Anzeige und zeige stattdessen das Icon
  // Vorab-Klasse entfernen, dann Rarity-Farbe setzen
  item.classList.remove('pre-reveal');
  item.style.backgroundColor = colors[pulledItem.rarity] || '#999';
  // Inhalt leeren (sicherstellen)
  item.textContent = '';
    // Erzeuge Icon-Element für die Loot-Ansicht
    const iconImg = document.createElement('img');
    iconImg.style.width = '100%';
    iconImg.style.height = '100%';
    iconImg.style.objectFit = 'contain';
    
    // Verwende den Projektordner Itembilder mit Unterordner pro Rarität
    iconImg.src = getItemImagePath(pulledItem.icon, pulledItem.rarity);
    iconImg.alt = ''; // Leerer alt-Text verhindert Text-Anzeige während des Ladens
    iconImg.setAttribute('aria-label', pulledItem.name || ''); // Barrierefreiheit über aria-label
    // Fallback: eingebettetes SVG-Placeholder
    {
      const alternates = getAlternateIconNames(pulledItem.icon);
      let altIdx = 0;
      iconImg.onerror = () => {
        if (altIdx < alternates.length) {
          // Versuche alternative Schreibweise
          const nextIcon = alternates[altIdx++];
          iconImg.src = getItemImagePath(nextIcon, pulledItem.rarity);
        } else {
          iconImg.onerror = null;
          // Nutze Leere Karte als Platzhalter (ohne Leerzeichen im Dateinamen für Server-Kompatibilität)
          iconImg.src = getItemImagePath('LeereKarte.png', 'Common');
        }
      };
    }

    // Icon einfügen
    item.appendChild(iconImg);

    // Schöner Tooltip im Lootfenster: Name + Wert (Basis + Bonus) + Beschreibung
    attachTooltip(item, {
      name: pulledItem.name,
      value: pulledItem.value,
      baseValue: pulledItem.baseValue,
      description: pulledItem.description || '',
      rarity: pulledItem.rarity || 'Common',
      quoteAuthor: pulledItem.quoteAuthor || ''
    });

    item.classList.add('revealed');
    // Füge den Glow abhängig von der Seltenheit hinzu (einmalige Animation)
    try {
      const rarity = pulledItem.rarity || 'Common';
      item.classList.add('glow-base', `glow-${rarity}`);
      const strength = (glowStrength[rarity] != null) ? glowStrength[rarity] : 0.3;
      item.style.setProperty('--glow-opacity', strength);
      // Glow nach 1 Sekunde wieder entfernen
      setTimeout(() => {
        item.classList.remove('glow-base', `glow-${rarity}`);
        item.style.removeProperty('--glow-opacity');
      }, 1000);

      // Entferne die Glow-Klassen nachdem die einmalige Animation beendet ist
      const onAnimEnd = (ev) => {
        // nur reagieren, wenn unsere glowPulse-Animation endet
        if (ev.animationName === 'glowPulse') {
          try {
            item.classList.remove('glow-base', `glow-${rarity}`);
            item.style.removeProperty('--glow-opacity');
          } catch (err) {
            // ignore
          }
          item.removeEventListener('animationend', onAnimEnd);
        }
      };
      item.addEventListener('animationend', onAnimEnd);
    } catch (e) {
      // Falls irgendwas schiefgeht, ignoriere das Glow-Setzen
      console.warn('Failed to set glow on item', e);
    }
    // Unique Effekt für Legendär, Mythisch & Aetherisch
    if (pulledItem.rarity === 'Legendary' || pulledItem.rarity === 'Mythisch' || pulledItem.rarity === 'Aetherisch') {
      triggerRarityEffect(item, pulledItem.rarity);
    }
    if (revealSlots[i].isNew) {
      // previously highlighted newly discovered items; glow removed
      item.classList.add('newly-discovered');
    }

    item.dataset.revealed = 'true';
    // Entferne die Floating-Lupe (und stoppe ggf. die Animation)
    if (floatingLupe) {
      if (floatingLupe._raf) cancelAnimationFrame(floatingLupe._raf);
      if (floatingLupe.parentElement) floatingLupe.parentElement.removeChild(floatingLupe);
    }

    // Wenn es ein Schlüssel ist: in Inventar buchen, Statistik erhöhen und UI aktualisieren (nach Reveal)
    if (pulledItem.isKey) {
      const r = pulledItem.rarity || 'Common';
      // Kumulativen Schlüssel-Fund zählen
      try {
        if (!stats.keysFoundCounts) stats.keysFoundCounts = { Common: 0, Rare: 0, Epic: 0, Legendary: 0, Mythisch: 0 };
        stats.keysFoundCounts[r] = (stats.keysFoundCounts[r] || 0) + 1;
      } catch (_) { /* ignore */ }
      keysInventory[r] = (keysInventory[r] || 0) + 1;
      saveProgress();
      // Schlüssel-Rarität als entdeckt markieren
      try { discoveredKeyRarities.add(r); saveKeyDiscovery(); } catch (_) {}
      renderKeysButtonBadges();
      // Wenn Badges eingeklappt sind, roten Hinweispunkt anzeigen
      if (__keysBadgesCollapsed) setKeysBtnNotify(true);
      // Effekte: gelber Floating-Text und kurzes Badge-Glühen
      showKeyFoundEffect(1);
      // leicht verzögern, damit Badge sicher im DOM ist
      setTimeout(() => flashKeyBadge(r), 50);
    }

    // kein sofortiger Tooltip-Check mehr

    roundValue += pulledItem.value || 0;
  }

  // Guthaben aktualisieren und UI zurücksetzen
  balance += roundValue;
  
  // Statistik: Gold tracken
  stats.totalGoldEarned += roundValue;
  
  // XP hinzufügen (Verkaufswert = XP)
  // Berücksichtige permanente XP-Boosts und temporäre Boosts aus dem Shop
  let xpGain = roundValue;
  const permXPCount = Math.min(1, (permanentUpgrades.permXPBoost || 0));
  const permXPMult = 1 + (permXPCount * 0.25); // max einmal +25%
  const tempXPMult = (activeBoosts.xpBoostUses > 0) ? (1 + activeBoosts.xpBoost) : 1; // temporärer Boost
  xpGain = Math.floor(xpGain * permXPMult * tempXPMult);
  
  addXP(xpGain);
  
  // Reduziere temporäre Boost-Uses und zeige Animation
  const boostsUsed = [];
  if (activeBoosts.valueBoostUses > 0) {
    activeBoosts.valueBoostUses--;
    boostsUsed.push('valueBoost');
  }
  if (activeBoosts.rarityBoostUses > 0) {
    activeBoosts.rarityBoostUses--;
    boostsUsed.push('rarityBoost');
  }
  if (activeBoosts.xpBoostUses > 0) {
    activeBoosts.xpBoostUses--;
    boostsUsed.push('xpBoost');
  }
  
  // Zeige Potion-Use-Effekt wenn Tränke verbraucht wurden
  if (boostsUsed.length > 0) {
    showPotionUseEffects(boostsUsed);
  }
  
  updateBalance();
  // Quickslots-Badges refreshen
  renderQuickslots();
  
  // Zeige visuellen Geld-Effekt
  showEarnedMoneyEffect(roundValue);
  
  // Button wieder aktivieren
  dom.openBtn.disabled = false;
  dom.openBtn.style.opacity = '1';
  // Box-Auswahl wieder aktivieren
  setBoxSelectionEnabled(true);
  // Suche-Animation beenden
  setSearchingState(false);

  // Öffnung ist beendet
  isOpening = false;
  
  // Auto-Clicker: Setze Zeitstempel für Ende der Öffnung (Start der 3s Wartezeit)
  autoClickerLastOpen = Date.now();
  
  // Quickslots/Shop nach Abschluss wieder freigeben (erneut rendern, jetzt wo isOpening=false)
  try {
    renderQuickslots();
    if (dom.shopModal && dom.shopModal.style.display === 'block') {
      showShop();
    }
  } catch (_) { /* ignore */ }

  // Icon am Ende nochmals aktualisieren (falls Schlüsselanzahl sich geändert hat)
  updateOpenBtnIcon();
  // Nach Abschluss erneut prüfen, falls während der Öffnung weitere Boxen gezählt wurden
  updateAchievementsNotify();
  // Nach jedem Öffnen: Prestige-Bedingungen erneut prüfen (Glow)
  try { updatePrestigeUI(); } catch (_) {}

  // Firebase: Stats synchronisieren nach jedem Öffnen
  try {
    if (window.firebaseApi && typeof window.firebaseApi.updateStats === 'function') {
      const mythCount = Math.max(0, getDiscoveredCountByRarity('Mythisch') || 0);
      const aetherCount = Math.max(0, getDiscoveredCountByRarity('Aetherisch') || 0);
      const payload = {
        totalXP: Number(totalXPEarned || 0),
        mythicsFound: Number(mythCount || 0),
        aethericsFound: Number(aetherCount || 0),
        totalBoxesOpened: Number((stats && stats.totalBoxesOpened) || 0),
        displayName: localStorage.getItem('playerDisplayName') || undefined,
        prestigeLevel: Number(prestigeState.level || 0)
      };
      // Nicht blockierend - Fire and forget
      window.firebaseApi.updateStats(payload).catch(err => {
        console.warn('Failed to sync stats to Firebase:', err);
      });
    }
  } catch (err) {
    console.warn('Firebase sync error:', err);
  }

  // Falls während der Öffnung eine andere Box gewählt wurde, jetzt anwenden
  if (pendingBoxType) {
    const applyType = pendingBoxType;
    pendingBoxType = null;
    // Setze logischen Typ und erstelle das neue Grid
    boxType = applyType;
    createEmptyGrid();
    // Modal ggf. aktualisieren
    if (dom.boxInfoModal && dom.boxInfoModal.style.display === 'block') {
      populateBoxInfo();
    }
  }

  // Letzte gezogenen Items speichern (für Sammlungshighlight)
  lastPulledItems = pulledNamesThisRound;
});

// ======= Level & XP System =======
// Fügt XP hinzu und prüft auf Level-Up
function addXP(amount) {
  playerXP += amount;
  totalXPEarned += amount; // Tracke Gesamt-XP
  
  // Zeige XP-Gain-Effekt
  showXPGainEffect(amount);
  
  // Level-Up prüfen (mit Level-Cap bei 50)
  let xpNeeded = getXPForLevel(playerLevel);
  let leveledUp = false;
  while (playerXP >= xpNeeded && playerLevel < MAX_LEVEL) {
    playerXP -= xpNeeded;
    playerLevel++;
    skillPoints++;
    xpNeeded = getXPForLevel(playerLevel);
    leveledUp = true;
  }
  
  // Bei Max-Level überschüssige XP verwerfen
  if (playerLevel >= MAX_LEVEL) {
    playerXP = 0;
  }
  
  updateLevelUI();
  // Prestige-UI ggf. aktualisieren (Glow, wenn Bedingungen erfüllt)
  try { updatePrestigeUI(); } catch (_) {}
  saveProgress(); // Speichere bei Level/XP-Änderung
  
  // Info-Modal aktualisieren falls geöffnet
  if (dom.boxInfoModal && dom.boxInfoModal.style.display === 'block') {
    populateBoxInfo();
  }
  
  // Level-Up Benachrichtigung sofort anzeigen
  if (leveledUp) {
    showLevelUpNotification();
  }
}

// Zeigt Level-Up Notification
function showLevelUpNotification() {
  // Prüfe ob ein neuer Titel freigeschaltet wurde
  const currentTitle = getCurrentTitle();
  const hasNewTitle = titles.some(t => t.level === playerLevel);
  
  const notification = document.createElement('div');
  notification.className = 'level-up-notification';
  
  let titleHTML = '';
  if (hasNewTitle) {
    titleHTML = `<p class="level-up-title">Neuer Titel: ${currentTitle}</p>`;
  }
  
  notification.innerHTML = `
    <div class="level-up-content">
      <h2>🎉 Level Up!</h2>
      <p>Level ${playerLevel} erreicht!</p>
      ${titleHTML}
      <p class="level-up-skill">+1 Skillpunkt verfügbar!</p>
    </div>
  `;
  document.body.appendChild(notification);
  
  // Click zum Schließen - schließt ALLE Level-up Fenster
  notification.style.cursor = 'pointer';
  notification.addEventListener('click', () => {
    const allNotifications = document.querySelectorAll('.level-up-notification');
    allNotifications.forEach(n => {
      n.classList.add('fade-out');
      setTimeout(() => n.remove(), 500);
    });
  });
  
  // Auto-Close nach 3 Sekunden
  setTimeout(() => {
    if (notification.parentNode) {
      notification.classList.add('fade-out');
      setTimeout(() => notification.remove(), 500);
    }
  }, 3000);
}

// Aktualisiert die Balance-Anzeige
function updateBalance() {
  dom.balance.textContent = `💰: ${formatNumber(balance)}`;
  
  // Dynamische Styling-Klassen basierend auf Geldmenge
  dom.balance.classList.remove('balance-poor', 'balance-modest', 'balance-rich', 'balance-wealthy', 'balance-millionaire', 'balance-billionaire');
  
  if (balance >= 1000000000) {
    dom.balance.classList.add('balance-billionaire');
  } else if (balance >= 1000000) {
    dom.balance.classList.add('balance-millionaire');
  } else if (balance >= 100000) {
    dom.balance.classList.add('balance-wealthy');
  } else if (balance >= 10000) {
    dom.balance.classList.add('balance-rich');
  } else if (balance >= 1000) {
    dom.balance.classList.add('balance-modest');
  } else {
    dom.balance.classList.add('balance-poor');
  }
  
  updateBoxAvailability();
  saveProgress(); // Speichere bei Balance-Änderung
  // Quickslots (Affordability) aktualisieren
  renderQuickslots();
}

// Zeigt einen animierten "+Wert" Effekt beim Verdienen von Geld
function showEarnedMoneyEffect(amount) {
  const balanceElement = dom.balance;
  const rect = balanceElement.getBoundingClientRect();
  
  const moneyEffect = document.createElement('div');
  moneyEffect.className = 'money-earned-effect';
  moneyEffect.textContent = `+${formatNumber(amount)}`;
  
  // Position relativ zum Kontostand
  moneyEffect.style.left = `${rect.left + rect.width / 2}px`;
  moneyEffect.style.top = `${rect.top}px`;
  
  document.body.appendChild(moneyEffect);
  
  // Entfernen nach Animation
  setTimeout(() => {
    moneyEffect.remove();
  }, 2000);
}

function showXPGainEffect(amount) {
  const xpBarElement = document.getElementById('xpBarContainer');
  if (!xpBarElement) return;
  
  const rect = xpBarElement.getBoundingClientRect();
  
  const xpEffect = document.createElement('div');
  xpEffect.className = 'xp-gained-effect';
  xpEffect.textContent = `+${formatNumber(amount)} XP`;
  
  // Position relativ zur XP-Bar
  xpEffect.style.left = `${rect.left + rect.width / 2}px`;
  xpEffect.style.top = `${rect.top}px`;
  
  document.body.appendChild(xpEffect);
  
  // Entfernen nach Animation
  setTimeout(() => {
    xpEffect.remove();
  }, 2000);
}

function showPotionUseEffects(boostsUsed) {
  const owned = (permanentUpgrades.permPotionBelt || 0) >= 1;
  
  // Mapping von Boost-Typ zu Quickslot-Index
  const boostToIndex = {
    'valueBoost': 0,
    'rarityBoost': 1,
    'xpBoost': 2
  };
  
  boostsUsed.forEach((boostType, idx) => {
    const slotIndex = boostToIndex[boostType];
    let sourceElement = null;
    
    // Wenn Trankgürtel gekauft: Animation von Quickslot
    if (owned) {
      const quickslots = document.getElementById('quickslots');
      if (quickslots) {
        const buttons = quickslots.querySelectorAll('.quickslot-btn');
        if (buttons[slotIndex]) {
          sourceElement = buttons[slotIndex];
          
          // Badge rot flashen
          const badge = sourceElement.querySelector('.quickslot-badge');
          if (badge) {
            badge.classList.add('flash-red');
            setTimeout(() => {
              badge.classList.remove('flash-red');
            }, 300);
          }
        }
      }
    }
    
    // Fallback: Shop-Button wenn kein Trankgürtel
    if (!sourceElement) {
      sourceElement = document.getElementById('shopBtn');
    }
    
    if (!sourceElement) return;
    
    const rect = sourceElement.getBoundingClientRect();
    
    const potionEffect = document.createElement('div');
    potionEffect.className = 'potion-use-effect';
    potionEffect.textContent = `-1`;
    
    // Position relativ zum Source-Element (zentriert)
    potionEffect.style.left = `${rect.left + rect.width / 2}px`;
    potionEffect.style.top = `${rect.top}px`;
    
    document.body.appendChild(potionEffect);
    
    // Entfernen nach Animation
    setTimeout(() => {
      potionEffect.remove();
    }, 2000);
  });
}

// Zeigt eine gelbe "+Schlüssel"-Animation in der Nähe des Schlüssel-Buttons (Fallback: beim Kontostand)
function showKeyFoundEffect(amount) {
  const anchor = (typeof __keysBtn !== 'undefined' && __keysBtn) ? __keysBtn : dom.balance;
  if (!anchor) return;
  const rect = anchor.getBoundingClientRect();
  const fx = document.createElement('div');
  fx.className = 'key-found-effect';
  const txt = `+${amount} 🔑`;
  fx.textContent = txt;
  fx.style.left = `${rect.left + rect.width / 2}px`;
  fx.style.top = `${rect.top}px`;
  document.body.appendChild(fx);
  setTimeout(() => { if (fx.parentNode) fx.remove(); }, 2000);
}

// Lässt den Badge der betroffenen Rarität kurz glühen
function flashKeyBadge(rarity) {
  if (!__keysBtn) return;
  const badge = __keysBtn.querySelector(`.key-badge.key-${rarity}`);
  if (!badge) return;
  badge.classList.add('key-badge-glow');
  // nach Animation wieder entfernen
  setTimeout(() => { badge.classList.remove('key-badge-glow'); }, 950);
}

// Prüft und aktualisiert die Verfügbarkeit der Box-Buttons basierend auf balance
function updateBoxAvailability() {
  // Prüfe zuerst alle Boxen ob sie freigeschaltet werden können
  for (let i = 0; i < boxOrder.length; i++) {
    const boxName = boxOrder[i];
    const boxCost = boxConfigs[boxName].cost;
    
    if (balance >= boxCost && !unlockedBoxes.has(boxName)) {
      unlockedBoxes.add(boxName);
    }
  }
  
  // Finde die nächste gesperrte Box (die nach der letzten freigeschalteten)
  let nextLockedIndex = -1;
  for (let i = 0; i < boxOrder.length; i++) {
    if (!unlockedBoxes.has(boxOrder[i])) {
      nextLockedIndex = i;
      break;
    }
  }
  
  for (let i = 0; i < boxOrder.length; i++) {
    const boxName = boxOrder[i];
    const boxCost = boxConfigs[boxName].cost;
    const btn = document.getElementById(`boxBtn${i + 1}`);
    
    if (!btn) continue;
    
    const isUnlocked = unlockedBoxes.has(boxName);
    const canAfford = balance >= boxCost;
    
    // Verstecke alle Boxen außer freigeschalteten und der nächsten gesperrten
    if (!isUnlocked && i !== nextLockedIndex) {
      btn.style.display = 'none';
      continue;
    } else {
      btn.style.display = '';
    }
    
  // Anzeigename, Icon und Kosten-Text (vorab, wird in beiden Zweigen genutzt)
  const displayName = boxDisplayNames[boxName] || boxName;
  const costText = formatCost(boxCost);
  const icon = getBoxIcon(boxName);

    if (isUnlocked) {
      // Box ist permanent freigeschaltet
      btn.classList.remove('locked');
      btn.disabled = false;
      
      // Zeige visuell ob wir sie uns leisten können
      if (canAfford) {
        btn.classList.add('affordable');
      } else {
        btn.classList.remove('affordable');
      }
      
      // Zweizeilig: Icon + Titel oben, Preis unten in Klammern
      const newHTML = (boxCost === 0)
        ? `${icon} ${displayName}<br><small>(${costText})</small>`
        : `${icon} ${displayName}<br><small>(${costText} 💰)</small>`;
      
      // Nur innerHTML ändern, wenn es sich wirklich geändert hat (verhindert Layout thrash)
      if (btn.innerHTML !== newHTML) {
        btn.innerHTML = newHTML;
      }
    } else {
      // Box ist noch gesperrt (nur die nächste wird angezeigt)
      btn.classList.add('locked');
      btn.classList.remove('affordable');
      btn.disabled = true;
      // Gesperrt: nur Schloss-Symbol in Zeile 1, Preis bleibt in Zeile 2
      const newHTML = `🔒<br><small>(${costText} 💰)</small>`;
      if (btn.innerHTML !== newHTML) {
        btn.innerHTML = newHTML;
      }
    }
  }
}

// Initialisierung: UI-Status setzen
updateBalance();
selectBox('Box#1');
createEmptyGrid(); // Zeigt leeres Grid beim Start

// Reagiere auf Größenänderungen: passe Slot-Größe an und rendere leeres Grid neu, wenn nicht geöffnet wird
try {
  window.addEventListener('resize', (() => {
    let last = SLOT_SIZE_PX;
    let raf = null;
    return function onResize() {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const ns = computeSlotSize();
        if (ns !== last) {
          last = ns;
          SLOT_SIZE_PX = ns;
          if (!isOpening) {
            try { createEmptyGrid(); } catch (_) {}
          }
        }
      });
    };
  })());
} catch (_) { /* ignore */ }
// Schlüssel-Button einfügen
ensureKeysButton();
// Entferne standardmäßiges 🔑 aus dem Öffnen-Button-Label, falls im HTML vorhanden
try {
  if (dom.openBtn) {
      dom.openBtn.innerHTML = 'Öffnen <span class="open-btn-icon"></span>';
      updateOpenBtnIcon();
  }
} catch (_) { /* ignore */ }

// Funktionen für Box-Info Modal
function computeRarityStats(forBoxType) {
  const cfg = boxConfigs[forBoxType] || {};
  const baseWeights = (cfg && cfg.weights) || {};
  const weights = applyLuckBonus(baseWeights, forBoxType); // Glück-Bonus einberechnen (mit boxType)
  const total = rarities.reduce((s, r) => s + (weights[r] || 0), 0) || 0;

  // Rarity row stats
  const rows = rarities.map(rarity => {
    const w = weights[rarity] || 0;
    const chance = total > 0 ? (w / total) * 100 : 0;
    const pool = itemPools[rarity] || [];
    const baseAvgValue = pool.length ? Math.round(pool.reduce((a,b)=>a+(b.value||0),0)/pool.length) : 0;
    const avgValue = Math.round(baseAvgValue * getValueMultiplier());
    return { rarity, weight: w, chance, avgValue, poolCount: pool.length };
  });

  // Erwartete Item-Anzahl pro Öffnung (deterministische Annäherung): Slots * Ziel-Füllrate
  const columns = cfg.columns || 4;
  const rowsCount = cfg.rows || 3;
  const totalSlots = columns * rowsCount;
  const boxNumber = parseInt((forBoxType || '').replace('Box#',''));
  const targetFillRate = (forBoxType === 'Testbox')
    ? (rarities.length / Math.max(1, totalSlots))
    : ((boxNumber <= 3 || boxNumber >= 6) ? 0.6 : 0.5);
  const expectedItems = Math.max(1, totalSlots * targetFillRate);

  // Erwarteter Wert pro Item und pro Öffnung
  const expectedValuePerItem = rows.reduce((sum, r) => sum + (r.chance/100) * r.avgValue, 0);
  const expectedValuePerOpen = expectedItems * expectedValuePerItem;

  // Erwartete Anzahl Legendär/Mythisch pro Öffnung
  const chanceLegendary = rows.find(r => r.rarity === 'Legendary')?.chance || 0;
  const chanceMythic = rows.find(r => r.rarity === 'Mythisch')?.chance || 0;
  const expectedLegendaryPerOpen = expectedItems * (chanceLegendary/100);
  const expectedMythicPerOpen = expectedItems * (chanceMythic/100);

  return {
    rows,
    expectedItems,
    expectedValuePerItem,
    expectedValuePerOpen,
    expectedLegendaryPerOpen,
    expectedMythicPerOpen
  };
}

function populateBoxInfo() {
  const content = dom.boxInfoContent;
  if (!content) return;
  const info = computeRarityStats(boxType);
  const stats = info.rows;
  
  // Verwende benutzerfreundlichen Box-Namen
  const displayName = boxDisplayNames[boxType] || boxType;
  const boxIcon = getBoxIcon(boxType);
  
  let html = '<div class="info-header">Gewählte Box: <strong>' + boxIcon + ' ' + displayName + '</strong></div>';
  
  // Berechne alle Boni-Komponenten
  const totalValueMult = getValueMultiplier();
  const totalValueBonus = ((totalValueMult - 1) * 100).toFixed(1);
  const totalTempoMult = getTempoMultiplier();
  const totalTempoBonus = ((1 - totalTempoMult) * 100).toFixed(1);
  const totalLuck = (skills.glueck || 0) + (statUpgradesLevels.luck || 0) + (prestigeState.level || 0);
  
  // Einzelne Boni-Komponenten für Value
  const valueFromSkills = (skills.wohlstand || 0) * 3;
  const valueFromShop = (statUpgradesLevels.wealth || 0) * 2;
  const valueFromPerm = (permanentUpgrades.permValueBoost || 0) > 0 ? 10 : 0;
  const valueFromPrestige = (prestigeState.level || 0) * 5;
  const valueFromTemp = activeBoosts.valueBoostUses > 0 ? (activeBoosts.valueBoost * 100) : 0;
  
  // Einzelne Boni-Komponenten für Tempo
  const tempoFromSkills = (skills.effizienz || 0) * 3.5;
  const tempoFromShop = (statUpgradesLevels.tempo || 0) * 2;
  const tempoFromPerm = (permanentUpgrades.permTempoBoost || 0) > 0 ? 10 : 0;
  const tempoFromPrestige = (prestigeState.level || 0) * 2;
  
  // Einzelne Boni-Komponenten für Luck
  const luckFromSkills = skills.glueck || 0;
  const luckFromShop = statUpgradesLevels.luck || 0;
  const luckFromPrestige = prestigeState.level || 0;
  const luckTempMult = activeBoosts.rarityBoostUses > 0 ? (activeBoosts.rarityBoost * 100) : 0;
  
  // Zeige Stat-Boni wenn vorhanden
  const hasAnyBoni = totalValueBonus > 0 || totalTempoBonus > 0 || totalLuck > 0;
  
  if (hasAnyBoni) {
    html += '<div class="skill-bonus-info">';
    html += '<strong>📊 Aktive Stat-Boni (Gesamt):</strong><br>';
    
    // VALUE BONUS
    if (totalValueBonus > 0) {
      html += `<br>💰 <strong>Item-Wert: +${totalValueBonus}%</strong><br>`;
      html += '<div style="margin-left: 1.5em; font-size: 0.9em; color: #aaa;">';
      if (valueFromSkills > 0) html += `• Skills: +${valueFromSkills.toFixed(0)}% (${skills.wohlstand} Punkte Wohlstand)<br>`;
      if (valueFromShop > 0) html += `• Shop-Upgrades: +${valueFromShop.toFixed(0)}% (${statUpgradesLevels.wealth} Stufen Wealth)<br>`;
      if (valueFromPerm > 0) html += `• Permanente Upgrades: +${valueFromPerm}% (Goldene Handschuhe)<br>`;
      if (valueFromPrestige > 0) html += `• Prestige: +${valueFromPrestige.toFixed(0)}% (Level ${prestigeState.level})<br>`;
      if (valueFromTemp > 0) html += `• Tränke: +${valueFromTemp.toFixed(0)}% (temporär)<br>`;
      html += '</div>';
    }
    
    // TEMPO BONUS
    if (totalTempoBonus > 0) {
      html += `<br>⚡ <strong>Untersuchungszeit: -${totalTempoBonus}%</strong><br>`;
      html += '<div style="margin-left: 1.5em; font-size: 0.9em; color: #aaa;">';
      if (tempoFromSkills > 0) html += `• Skills: -${tempoFromSkills.toFixed(1)}% (${skills.effizienz} Punkte Effizienz)<br>`;
      if (tempoFromShop > 0) html += `• Shop-Upgrades: -${tempoFromShop.toFixed(0)}% (${statUpgradesLevels.tempo} Stufen Tempo)<br>`;
      if (tempoFromPerm > 0) html += `• Permanente Upgrades: -${tempoFromPerm}% (Magie-Handschuhe)<br>`;
      if (tempoFromPrestige > 0) html += `• Prestige: -${tempoFromPrestige.toFixed(0)}% (Level ${prestigeState.level})<br>`;
      html += '</div>';
    }
    
    // LUCK BONUS
    if (totalLuck > 0) {
      html += `<br>🍀 <strong>Glück: ${totalLuck} Punkte gesamt</strong><br>`;
      html += '<div style="margin-left: 1.5em; font-size: 0.9em; color: #aaa;">';
      if (luckFromSkills > 0) html += `• Skills: ${luckFromSkills} Punkte<br>`;
      if (luckFromShop > 0) html += `• Shop-Upgrades: ${luckFromShop} Stufen<br>`;
      if (luckFromPrestige > 0) html += `• Prestige: ${luckFromPrestige} Level<br>`;
      if (luckTempMult > 0) html += `• Tränke: ${luckTempMult.toFixed(0)}% Multiplikator (temporär)<br>`;
      html += '• <em>Effekt: Verschiebt Chancen zu selteneren Raritäten + mehr Items pro Box</em><br>';
      html += '</div>';
    }
    
    html += '</div>';
  }
  
  html += '<table class="info-table"><thead><tr><th>Rarität</th><th>Ø Wert</th><th>Dropchance</th></tr></thead><tbody>';
  for (const s of stats) {
    html += `<tr><td class="rarity-name" style="color:${colors[s.rarity]||'#fff'}">${s.rarity}</td><td>${s.avgValue} 💰</td><td>${s.chance.toFixed(2)} %</td></tr>`;
  }
  html += '</tbody></table>';

  // ROI/EV Abschnitt – nur im DEV-Modus anzeigen
  if (typeof devMode !== 'undefined' && devMode) {
    const cost = (boxConfigs[boxType] && boxConfigs[boxType].cost) || 0;
    const evItems = info.expectedItems;
    const evPerItem = info.expectedValuePerItem;
    const evPerOpen = info.expectedValuePerOpen;
    const netPerOpen = evPerOpen - cost;
    const expLeg = info.expectedLegendaryPerOpen;
    const expMyth = info.expectedMythicPerOpen;

    const netColor = netPerOpen >= 0 ? '#2ecc71' : '#e74c3c';
    html += '<div class="stats-section">';
    html += '<h3>📈 Erwartungswerte (DEV)</h3>';
    html += `<div class="stat-item"><span class="stat-label">Ø Items pro Öffnung:</span><span class="stat-value">${evItems.toFixed(1)}</span></div>`;
    html += `<div class="stat-item"><span class="stat-label">Ø Wert pro Item:</span><span class="stat-value">${Math.round(evPerItem).toLocaleString('de-DE')} 💰</span></div>`;
    html += `<div class="stat-item"><span class="stat-label">Ø Wert pro Öffnung:</span><span class="stat-value">${Math.round(evPerOpen).toLocaleString('de-DE')} 💰</span></div>`;
    if (cost > 0) {
      html += `<div class="stat-item"><span class="stat-label">Netto pro Öffnung (nach Kosten):</span><span class="stat-value" style="color:${netColor}">${Math.round(netPerOpen).toLocaleString('de-DE')} 💰</span></div>`;
    }
    html += `<div class="stat-item"><span class="stat-label">Ø Legendär pro Öffnung:</span><span class="stat-value">${expLeg.toFixed(2)}</span></div>`;
    html += `<div class="stat-item"><span class="stat-label">Ø Mythisch pro Öffnung:</span><span class="stat-value">${expMyth.toFixed(2)}</span></div>`;
    html += '</div>';
  }
  content.innerHTML = html;
}

// Event-Handler öffnen/schließen Modal
if (dom.boxInfoBtn) {
  dom.boxInfoBtn.addEventListener('click', () => {
    // Toggle: Wenn offen, schließen; wenn geschlossen, öffnen
    if (dom.boxInfoModal.style.display === 'block') {
      dom.boxInfoModal.style.display = 'none';
    } else {
      populateBoxInfo();
      dom.boxInfoModal.style.display = 'block';
    }
  });
}

const infoClose = dom.boxInfoModal && dom.boxInfoModal.querySelector('.info-close');
if (infoClose) {
  infoClose.addEventListener('click', (e) => {
    e.stopPropagation(); // Verhindere Bubble zum Modal
    dom.boxInfoModal.style.setProperty('display', 'none', 'important');
  });
}
// close on ESC
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && dom.boxInfoModal && dom.boxInfoModal.style.display === 'block') {
    dom.boxInfoModal.style.setProperty('display', 'none', 'important');
  }
});
// close clicking outside content
if (dom.boxInfoModal) {
  const infoContent = dom.boxInfoModal.querySelector('.info-content');
  
  dom.boxInfoModal.addEventListener('click', (e) => {
    // Schließen wenn NICHT auf die Content-Box geklickt wurde
    if (infoContent && !infoContent.contains(e.target)) {
      dom.boxInfoModal.style.setProperty('display', 'none', 'important');
    }
  });
}

// Sammlung-Button
dom.collectionBtn.addEventListener('click', showCollection);
dom.closeCollectionBtn.addEventListener('click', closeCollection);
dom.collectionOverlay.addEventListener('click', (e) => {
  if (e.target === dom.collectionOverlay) closeCollection();
});
// Achievements-Button
if (dom.achievementsBtn) dom.achievementsBtn.addEventListener('click', showAchievements);
if (dom.closeAchievementsBtn) dom.closeAchievementsBtn.addEventListener('click', closeAchievements);

// Shop-Button: wie Skills-Overlay toggeln (auf/zu)
dom.shopBtn.addEventListener('click', () => {
  if (!dom.shopModal) return;
  if (dom.shopModal.style.display === 'block') {
    closeShop();
  } else {
    showShop();
  }
});
dom.closeShopBtn.addEventListener('click', closeShop);

function showShop() {
  if (!dom.shopModal || !dom.shopContent || !dom.shopBalance) return;
  
  // Aktualisiere Guthaben-Anzeige
  dom.shopBalance.textContent = formatNumber(balance);
  
  // Shop-Inhalt aufbauen (in Kategorien)
  dom.shopContent.innerHTML = '';

  const makeSection = (title) => {
    const sec = document.createElement('div');
    sec.className = 'shop-section';
    const h = document.createElement('h3');
    h.textContent = title;
    sec.appendChild(h);
    const grid = document.createElement('div');
    grid.className = 'shop-grid';
    sec.appendChild(grid);
    dom.shopContent.appendChild(sec);
    return grid;
  };

  // 1) Ausrüstung
  const equipGrid = makeSection('Ausrüstung');
  
  // Auto-Clicker Upgrade-Status prüfen
  const hasAutoClicker = (permanentUpgrades.permAutoClicker || 0) >= 1;
  const hasSpeed1 = (permanentUpgrades.permAutoClickerSpeed1 || 0) >= 1;
  const hasSpeed2 = (permanentUpgrades.permAutoClickerSpeed2 || 0) >= 1;
  
  for (const [itemId, item] of Object.entries(shopItems).filter(([, it]) => it.type === 'perm')) {
    // Auto-Clicker Upgrade-Logik: Nur das nächste verfügbare anzeigen (außer Speed2, bleibt immer sichtbar)
    if (itemId === 'permAutoClicker' && hasAutoClicker) continue; // Basis bereits gekauft
    if (itemId === 'permAutoClickerSpeed1' && (!hasAutoClicker || hasSpeed1)) continue; // Basis fehlt oder Speed1 bereits gekauft
    if (itemId === 'permAutoClickerSpeed2' && !hasSpeed1) continue; // Speed1 fehlt -> Speed2 nicht zeigen
    
    const branch = document.createElement('div');
    branch.className = 'skill-branch';
    const canAfford = balance >= item.cost;
    // Besitz-Info (einmalig kaufbar)
    const effectType = item.effect.type;
    const owned = ((permanentUpgrades[effectType] || 0) >= 1) || purchasedItems.has(itemId);
    const priceHTML = !owned ? `<span class=\"price ${!canAfford ? 'unaffordable' : ''}\">${formatNumber(item.cost)} 💰</span>` : '';
    const btnLabel = owned ? '✔️ Gekauft' : `${priceHTML}`;
    const btnClass = `upgrade-btn shop-buy-btn${(canAfford && !owned) ? ' affordable' : ''}${owned ? ' purchased' : ''}`;
    branch.innerHTML = `
      <h3>${item.icon} ${item.name}</h3>
      <p class=\"skill-description\">${item.description}</p>
      <button class=\"${btnClass}\" data-item-id=\"${itemId}\" ${(owned || !canAfford) ? 'disabled' : ''}>${btnLabel}</button>
    `;
    equipGrid.appendChild(branch);
  }

  // 2) Stats
  const statGrid = makeSection('Stats');
  for (const [key, cfg] of Object.entries(shopStatUpgrades)) {
    const branch = document.createElement('div');
    branch.className = 'skill-branch';
    const lvl = statUpgradesLevels[key] || 0;
    const cost = getStatUpgradeCost(key);
    const canAfford = balance >= cost;
    const effectLine = (() => {
      if (cfg.perLevel.type === 'wealth') return `Aktueller Bonus: +${(lvl * 2).toFixed(0)}% Wert`;
      if (cfg.perLevel.type === 'luck') return `Aktueller Bonus: +${lvl} Glück`;
      if (cfg.perLevel.type === 'tempo') return `Aktueller Bonus: -${(lvl * 2).toFixed(0)}% Zeit`;
      return '';
    })();
    const priceHTML = `<span class=\"price ${!canAfford ? 'unaffordable' : ''}\">${formatNumber(cost)} 💰</span>`;
    const btnClass = `upgrade-btn shop-stat-buy${canAfford ? ' affordable' : ''}`;
    branch.innerHTML = `
      <h3>${cfg.icon} ${cfg.name}</h3>
      <p class=\"skill-description\">${cfg.description}<br><span style=\"color:#9b59b6;\">Stufe ${lvl}</span><br><span>${effectLine}</span></p>
      <button class=\"${btnClass}\" data-stat-key=\"${key}\" ${!canAfford ? 'disabled' : ''}>${priceHTML}</button>
    `;
    statGrid.appendChild(branch);
  }

  // 3) Tränke
  const tempGrid = makeSection('Tränke');
  for (const [itemId, item] of Object.entries(shopItems).filter(([, it]) => it.type === 'temp')) {
    const branch = document.createElement('div');
    branch.className = 'skill-branch';
    const canAfford = balance >= item.cost;
    // Aktive Uses anzeigen
    const boostType = item.effect.type;
    const usesKey = boostType + 'Uses';
    const activeUses = activeBoosts[usesKey] || 0;
    const usesText = activeUses > 0 ? `<br><span style=\"color:#2ecc71;\">Aktiv: ${activeUses} Öffnungen übrig</span>` : '';
    const iconHTML = renderPotionIconHTML(item.icon);
  const beltNote = (permanentUpgrades.permPotionBelt || 0) >= 1 ? `<br><span style=\"color:#f1c40f;\">+1 Aufladung pro Kauf</span>` : '';
    const priceHTML = `<span class=\"price ${!canAfford ? 'unaffordable' : ''}\">${formatNumber(item.cost)} 💰</span>`;
    const disabled = !canAfford || isOpening; // Während Öffnung gesperrt
    const btnClass = `upgrade-btn shop-buy-btn${(!disabled && canAfford) ? ' affordable' : ''}`;
    branch.innerHTML = `
      <h3>${iconHTML} ${item.name}</h3>
      <p class=\"skill-description\">${item.description}${usesText}${beltNote}</p>
      <button class=\"${btnClass}\" data-item-id=\"${itemId}\" ${disabled ? 'disabled' : ''}>${priceHTML}</button>
    `;
    tempGrid.appendChild(branch);
  }

  // Button-Handler
  dom.shopContent.querySelectorAll('.shop-buy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const itemId = btn.dataset.itemId;
      purchaseShopItem(itemId);
    });
  });
  dom.shopContent.querySelectorAll('.shop-stat-buy').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.statKey;
      purchaseStatUpgrade(key);
    });
  });

  dom.shopModal.style.display = 'block';
}

function purchaseShopItem(itemId) {
  const item = shopItems[itemId];
  if (!item) return;
  // Tränke (temporäre Boosts) sind während einer laufenden Öffnung gesperrt
  if (item.type === 'temp' && isOpening) {
    alert('Während des Öffnens von Boxen können keine Tränke gekauft werden.');
    return;
  }
  
  // Prüfe ob genug Geld vorhanden
  if (balance < item.cost) {
    alert('Nicht genug Geld!');
    return;
  }
  
  // Ziehe Kosten ab
  balance -= item.cost;
  updateBalance();
  
  // Wende Effekt an
  const effect = item.effect;
  
  if (item.type === 'temp') {
    // Temporäre Boosts: addiere Uses
    const usesKey = effect.type + 'Uses';
    const valueKey = effect.type;
    const hasBelt = (permanentUpgrades.permPotionBelt || 0) >= 1;
    const bonus = hasBelt ? 1 : 0;
    activeBoosts[usesKey] = (activeBoosts[usesKey] || 0) + effect.uses + bonus;
    activeBoosts[valueKey] = effect.value;
  } else if (item.type === 'perm') {
    // Permanente Ausrüstung: nur einmal kaufbar
    if ((permanentUpgrades[effect.type] || 0) >= 1 || purchasedItems.has(itemId)) {
      // bereits vorhanden – rückerstatte vorsichtshalber und zeige Meldung
      balance += item.cost;
      updateBalance();
      alert('Dieses Ausrüstungsitem wurde bereits gekauft.');
      return;
    }
    permanentUpgrades[effect.type] = 1; // genau einmal
    purchasedItems.add(itemId);
    
    // Auto-Clicker aktivieren falls gekauft
    if (effect.type === 'permAutoClicker') {
      checkAutoClicker();
    }
    // Auto-Clicker Speed Upgrades
    if (effect.type === 'permAutoClickerSpeed1' || effect.type === 'permAutoClickerSpeed2') {
      // Nur Speed wechseln wenn bereits aktiviert
      if (autoClickerEnabled) {
        if (effect.type === 'permAutoClickerSpeed2') {
          autoClickerSpeed = 1;
        } else if (effect.type === 'permAutoClickerSpeed1') {
          autoClickerSpeed = 2;
        }
      }
      updateAutoClickerUI();
    }
  }
  
  // Speichere Fortschritt
  saveProgress();
  
  // Aktualisiere Shop-Anzeige nur, wenn sie offen ist
  if (dom.shopModal && dom.shopModal.style.display === 'block') {
    showShop();
  }
  // Nach Käufen UI-Quickslots aktualisieren
  renderQuickslots();
}

function purchaseStatUpgrade(key) {
  const cfg = shopStatUpgrades[key];
  if (!cfg) return;
  const cost = getStatUpgradeCost(key);
  if (balance < cost) {
    alert('Nicht genug Geld!');
    return;
  }
  balance -= cost;
  statUpgradesLevels[key] = (statUpgradesLevels[key] || 0) + 1;
  updateBalance();
  saveProgress();
  showShop();
}

function closeShop() {
  if (!dom.shopModal) return;
  dom.shopModal.style.display = 'none';
}

// Shop-Overlay: Klick auf Hintergrund schließt, wie beim Skills-Overlay
if (dom.shopModal) {
  dom.shopModal.addEventListener('click', (e) => {
    if (e.target === dom.shopModal) {
      closeShop();
    }
  });
}

// Reset-Button
dom.resetBtn.addEventListener('click', () => {
  if (confirm('Möchtest du deinen gesamten Fortschritt zurücksetzen? Dies kann nicht rückgängig gemacht werden!')) {
    resetProgress();
    // Stats schließen nach dem Reset
    closeStats();
  }
});

function resetProgress() {
  // Sammlung & Items zurücksetzen
  discoveredItems.clear();
  lastPulledItems.clear();
  for (let key in itemCounts) {
    delete itemCounts[key];
  }
  
  // LocalStorage löschen
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(PROGRESS_KEY);
  } catch (e) {
    console.warn('Failed to clear localStorage', e);
  }
  
  // Level & Skills zurücksetzen
  playerLevel = 0;
  playerXP = 0;
  totalXPEarned = 0; // Gesamt-XP zurücksetzen
  skillPoints = 0;
  skills.wohlstand = 0;
  skills.glueck = 0;
  skills.effizienz = 0;
  
  // Shop-Daten zurücksetzen
  activeBoosts = {
    valueBoost: 0,
    rarityBoost: 0,
    xpBoost: 0,
    valueBoostUses: 0,
    rarityBoostUses: 0,
    xpBoostUses: 0
  };
  permanentUpgrades = {
    permTempoBoost: 0,
    permValueBoost: 0,
    permXPBoost: 0
  };
  purchasedItems.clear();
  // Schlüssel-Inventar zurücksetzen
  keysInventory = { Common: 0, Rare: 0, Epic: 0, Legendary: 0, Mythisch: 0 };
  // Stackbare Status-Upgrades zurücksetzen
  statUpgradesLevels = { wealth: 0, luck: 0, tempo: 0 };
  
  // Balance & Box zurücksetzen
  balance = 500;
  boxType = "Box#1";
  unlockedBoxes.clear();
  unlockedBoxes.add("Box#1");
  
  // Statistiken zurücksetzen
  stats.totalBoxesOpened = 0;
  stats.totalItemsPulled = 0;
  stats.totalGoldEarned = 0;
  stats.mostValuableItem = { name: '', value: 0, rarity: '' };
  for (let key in stats.boxOpenCounts) {
    stats.boxOpenCounts[key] = 0;
  }
  // Schlüssel-Fundstatistiken zurücksetzen
  stats.keysFoundCounts = { Common: 0, Rare: 0, Epic: 0, Legendary: 0, Mythisch: 0 };
  // Erfolge zurücksetzen
  achievementsState = {
    seen: {
      boxes: 0,
      gold: 0,
      collection: { Common: 0, Rare: 0, Epic: 0, Legendary: 0, Mythisch: 0 },
      keys: { Common: 0, Rare: 0, Epic: 0, Legendary: 0, Mythisch: 0 }
    }
  };
  
  // UI aktualisieren
  updateLevelUI();
  updateBalance();
  updateSkillDisplay();
  selectBox("Box#1");
  updateAchievementsNotify();
  
  // Firebase: Vollständiger Reset über Cloud Function
  try {
    if (window.firebaseApi && typeof window.firebaseApi.resetUserData === 'function') {
      const displayName = localStorage.getItem('playerDisplayName') || 'Anonym';
      // Nicht blockierend
      window.firebaseApi.resetUserData(displayName).catch(err => {
        console.warn('Failed to reset data in Firebase:', err);
      });
    }
  } catch (err) {
    console.warn('Firebase reset error:', err);
  }
  
  // Sammlung schließen (falls geöffnet)
  if (dom.collectionOverlay) {
    dom.collectionOverlay.style.display = 'none';
  }
  
  alert('Fortschritt wurde zurückgesetzt!');
}

function showCollection() {
  const grid = dom.collectionGrid;
  grid.innerHTML = '';
  
  // Deutsche Übersetzungen für Raritäten
  const rarityNames = {
    'Common': 'Gewöhnlich',
    'Rare': 'Selten',
    'Epic': 'Episch',
    'Legendary': 'Legendär',
    'Mythisch': 'Mythisch',
    'Ätherisch': 'Ätherisch'
  };

  // Normale Items anzeigen
  for (const rarity of rarities) {
    // Abschnitt für jede Rarität
    const section = document.createElement('div');
    section.classList.add('rarity-section');

    // Zähle entdeckte Items dieser Rarität (nur normale Items)
    const normalItems = (itemPools[rarity] || []).filter(item => !item.seasonal);
    const totalItems = normalItems.length;
    const discoveredCount = normalItems.filter(item => discoveredItems.has(item.name)).length;

    const sectionTitle = document.createElement('h2');
    sectionTitle.textContent = `${rarityNames[rarity] || rarity} (${discoveredCount}/${totalItems})`;
    sectionTitle.style.color = colors[rarity] || '#fff';
    section.appendChild(sectionTitle);

    const rarityContainer = document.createElement('div');
    rarityContainer.classList.add('grid');

    for (const item of normalItems) {
      const div = document.createElement('div');
      div.classList.add('item');

  const img = document.createElement('img');
  // Bilder liegen im Ordner "Itembilder" (Projektstruktur).
  // Früher wurde `icons/` verwendet – das führt zu fehlenden Bildern.
      img.src = getItemImagePath(item.icon, rarity);
      // Alt-Text für Barrierefreiheit
      img.alt = item.name || '';
      // Fallback: falls die Datei fehlt, setze ein eingebettetes SVG-Placeholder (kein 404)
      {
        const alternates = getAlternateIconNames(item.icon);
        let altIdx = 0;
        img.onerror = () => {
          if (altIdx < alternates.length) {
            const nextIcon = alternates[altIdx++];
            img.src = getItemImagePath(nextIcon, rarity);
          } else {
            // Einfaches SVG mit Fragezeichen als Data-URL
            img.onerror = null; // Verhindere Loop
            // Leere Karte als Platzhalter (ohne Leerzeichen im Dateinamen für Server-Kompatibilität)
            img.src = getItemImagePath('LeereKarte.png', 'Common');
          }
        };
      }

  // Tooltip in der Sammlung: Name + Wert + Beschreibung (oder unbekannt)

      if (discoveredItems.has(item.name)) {
        img.style.backgroundColor = colors[rarity];
        div.appendChild(img);
        const label = document.createElement('div');
        label.textContent = item.name;
        div.appendChild(label);
        // Tooltip für bekannte Items (schön formatiert)
        attachTooltip(div, {
          name: item.name,
          value: item.value,
          description: item.description || '',
          rarity,
          quoteAuthor: item.quoteAuthor || ''
        });

        // Anzeigen des Sammelzählers als kleines Badge
        const count = itemCounts[item.name] || 0;
        const badge = document.createElement('div');
        badge.classList.add('item-count-badge');
        badge.textContent = count;
        div.appendChild(badge);

        // Highlight für Items aus der letzten Öffnung (Glow entfernt)
        if (lastPulledItems && lastPulledItems.has(item.name)) {
          // optional: keep a subtle border/outline for last-pulled items instead of glow
          div.classList.add('last-pulled');
        }
      } else {
        img.classList.add('locked');
        div.appendChild(img);
        const label = document.createElement('div');
        label.textContent = '???';
        div.appendChild(label);
        // Tooltip für unbekannte Items
        attachTooltip(div, {
          name: '???',
          value: null,
          description: 'Noch unbekannt.',
          rarity
        });
      }

      // Tooltip wird über die Custom-Tooltip-Komponente bereitgestellt

      rarityContainer.appendChild(div);
    }

    section.appendChild(rarityContainer);
    grid.appendChild(section);
  }

  // Saisonale Items-Sektion (falls verfügbar)
  const activeEvent = getActiveSeasonalEvent();
  if (activeEvent) {
    // Trennlinie
    const divider = document.createElement('div');
    divider.style.width = '100%';
    divider.style.height = '2px';
    divider.style.background = 'linear-gradient(to right, transparent, #555, transparent)';
    divider.style.margin = '30px 0';
    grid.appendChild(divider);

    // Event-Titel
    const eventHeader = document.createElement('h1');
    eventHeader.textContent = `🎄 ${activeEvent.name} 🎄`;
    eventHeader.style.textAlign = 'center';
    eventHeader.style.color = '#f1c40f';
    eventHeader.style.marginBottom = '20px';
    eventHeader.style.fontSize = '24px';
    grid.appendChild(eventHeader);

    // Zeige saisonale Items pro Rarität
    for (const rarity of rarities) {
      const seasonalItemsForRarity = (activeEvent.items && activeEvent.items[rarity]) || [];
      if (seasonalItemsForRarity.length === 0) continue;

      const section = document.createElement('div');
      section.classList.add('rarity-section');

      const discoveredCount = seasonalItemsForRarity.filter(item => discoveredItems.has(item.name)).length;
      const totalItems = seasonalItemsForRarity.length;

      const sectionTitle = document.createElement('h2');
      sectionTitle.textContent = `${rarityNames[rarity] || rarity} (${discoveredCount}/${totalItems})`;
      sectionTitle.style.color = colors[rarity] || '#fff';
      section.appendChild(sectionTitle);

      const rarityContainer = document.createElement('div');
      rarityContainer.classList.add('grid');

      for (const item of seasonalItemsForRarity) {
        const div = document.createElement('div');
        div.classList.add('item', 'seasonal-item');

        const img = document.createElement('img');
        img.src = item.icon; // Saisonale Items haben bereits vollständigen Pfad
        img.alt = item.name || '';
        img.onerror = () => {
          img.onerror = null;
          img.src = getItemImagePath('LeereKarte.png', 'Common');
        };

        if (discoveredItems.has(item.name)) {
          img.style.backgroundColor = colors[rarity];
          div.appendChild(img);
          const label = document.createElement('div');
          label.textContent = item.name;
          div.appendChild(label);

          attachTooltip(div, {
            name: item.name,
            value: item.value,
            description: item.description || '',
            rarity,
            quoteAuthor: item.quoteAuthor || ''
          });

          const count = itemCounts[item.name] || 0;
          const badge = document.createElement('div');
          badge.classList.add('item-count-badge');
          badge.textContent = count;
          div.appendChild(badge);

          if (lastPulledItems && lastPulledItems.has(item.name)) {
            div.classList.add('last-pulled');
          }
        } else {
          img.classList.add('locked');
          div.appendChild(img);
          const label = document.createElement('div');
          label.textContent = '???';
          div.appendChild(label);

          attachTooltip(div, {
            name: '???',
            value: null,
            description: 'Noch unbekannt.',
            rarity
          });
        }

        rarityContainer.appendChild(div);
      }

      section.appendChild(rarityContainer);
      grid.appendChild(section);
    }
  }

  // Stelle sicher, dass das Overlay als letztes Kind im <body> liegt
  try {
    if (dom.collectionOverlay.parentElement !== document.body) {
      document.body.appendChild(dom.collectionOverlay);
    }
  } catch (e) {
    console.warn('Failed to append collection overlay to body', e);
  }
  dom.collectionOverlay.style.display = 'block';
}

dom.closeCollectionBtn.addEventListener("click", closeCollection);

function closeCollection() {
  dom.collectionOverlay.style.display = 'none';
}

// ======= Achievements (Erfolge) =======
function boxesMaxMilestoneReached() {
  const opened = stats.totalBoxesOpened || 0;
  let max = 0;
  for (const m of BOX_MILESTONES) { if (opened >= m && m > max) max = m; }
  return max;
}

function goldMaxMilestoneReached() {
  const earned = stats.totalGoldEarned || 0;
  let max = 0;
  for (const m of GOLD_MILESTONES) { if (earned >= m && m > max) max = m; }
  return max;
}

function collectionPercentForRarity(rarity) {
  const total = (itemPools[rarity] || []).length;
  const count = (itemPools[rarity] || []).filter(it => discoveredItems.has(it.name)).length;
  if (total <= 0) return 0;
  return Math.floor((count / total) * 100);
}

function collectionMaxMilestoneReached(rarity) {
  const pct = collectionPercentForRarity(rarity);
  let max = 0;
  for (const p of COLLECTION_MILESTONES_PCT) { if (pct >= p && p > max) max = p; }
  return max;
}

function keysMaxMilestoneReachedForRarity(rarity) {
  const count = (stats.keysFoundCounts && typeof stats.keysFoundCounts[rarity] === 'number')
    ? stats.keysFoundCounts[rarity]
    : 0;
  let max = 0;
  for (const m of KEY_MILESTONES) { if (count >= m && m > max) max = m; }
  return max;
}

function setAchievementsNotify(active) {
  const btn = dom.achievementsBtn;
  if (!btn) return;
  let dot = btn.querySelector('.ach-notify-dot');
  if (active) {
    if (!dot) {
      dot = document.createElement('span');
      dot.className = 'ach-notify-dot';
      btn.appendChild(dot);
    }
  } else {
    if (dot && dot.parentElement) dot.parentElement.removeChild(dot);
  }
}

function updateAchievementsNotify() {
  try {
    const seen = achievementsState?.seen || { boxes: 0, gold: 0, collection: {}, keys: {} };
    const boxMax = boxesMaxMilestoneReached();
    const goldMax = goldMaxMilestoneReached();
    const colMaxes = rarities.map(r => collectionMaxMilestoneReached(r));
    const colSeen = rarities.map(r => (seen.collection?.[r] || 0));
    const anyColUnseen = colMaxes.some((m, idx) => m > colSeen[idx]);
    const keyMaxes = rarities.map(r => keysMaxMilestoneReachedForRarity(r));
    const keySeen = rarities.map(r => ((seen.keys && seen.keys[r]) || 0));
    const anyKeyUnseen = keyMaxes.some((m, idx) => m > keySeen[idx]);
    const unseen = (boxMax > (seen.boxes || 0)) || (goldMax > (seen.gold || 0)) || anyColUnseen || anyKeyUnseen;
    setAchievementsNotify(unseen);
  } catch (_) {
    // Fallback: nur Boxen prüfen
    const boxMax = boxesMaxMilestoneReached();
    const seenMaxCompat = achievementsState.seenMax || 0;
    setAchievementsNotify(boxMax > seenMaxCompat);
  }
}

function showAchievements() {
  if (!dom.achievementsOverlay || !dom.achievementsContent) return;

  // Persistente Ein-/Ausklapp-States
  const ACH_COLLAPSE_KEY = 'lootsim_achCollapse_v1';
  let achCollapse = { boxes: false, collection: false, gold: false, keys: false };
  function loadAchCollapse() {
    try {
      const raw = localStorage.getItem(ACH_COLLAPSE_KEY);
      if (raw) {
        const obj = JSON.parse(raw);
        if (obj && typeof obj === 'object') achCollapse = { ...achCollapse, ...obj };
      }
    } catch (_) { /* ignore */ }
  }
  function saveAchCollapse() {
    try { localStorage.setItem(ACH_COLLAPSE_KEY, JSON.stringify(achCollapse)); } catch (_) {}
  }
  loadAchCollapse();

  // Kategorie: Boxen
  const opened = stats.totalBoxesOpened || 0;
  const boxMaxTarget = BOX_MILESTONES[BOX_MILESTONES.length - 1] || 1;
  const boxPctOverall = Math.min(100, Math.round((opened / boxMaxTarget) * 100));
  const boxItems = BOX_MILESTONES.map(m => {
    const done = opened >= m;
    const progressPct = Math.min(100, Math.round((opened / m) * 100));
    return `
      <div class="stat-item">
        <span class="stat-label">Öffne ${m.toLocaleString('de-DE')} Boxen</span>
        <span class="stat-value">${done ? '✅ Erreicht' : `${opened.toLocaleString('de-DE')} / ${m.toLocaleString('de-DE')}`}</span>
      </div>
      <div class="progress-bar-container"><div class="progress-bar" style="width:${progressPct}%"></div></div>
    `;
  }).join('');

  // Kategorie: Sammlung (pro Rarität)
  const totalItemsAll = rarities.reduce((sum, r) => sum + ((itemPools[r] || []).length), 0);
  const discoveredCountAll = rarities.reduce((sum, r) => sum + ((itemPools[r] || []).filter(it => discoveredItems.has(it.name)).length), 0);
  const collectionPctOverall = totalItemsAll > 0 ? Math.round((discoveredCountAll / totalItemsAll) * 100) : 0;
  const collectionSection = rarities.map(r => {
    const pct = collectionPercentForRarity(r);
    return `
      <div class="stat-item">
        <span class="stat-label">${displayRarityName(r)}</span>
        <span class="stat-value">${pct}%</span>
      </div>
      <div class="progress-bar-container"><div class="progress-bar" style="width:${pct}%"></div></div>
    `;
  }).join('');

  // Kategorie: Gold
  const earned = stats.totalGoldEarned || 0;
  const goldMaxTarget = GOLD_MILESTONES[GOLD_MILESTONES.length - 1] || 1;
  const goldPctOverall = Math.min(100, Math.round((earned / goldMaxTarget) * 100));
  const goldItems = GOLD_MILESTONES.map(m => {
    const done = earned >= m;
    const progressPct = Math.min(100, Math.round((earned / m) * 100));
    return `
      <div class="stat-item">
        <span class="stat-label">Verdiene ${m.toLocaleString('de-DE')} 💰</span>
        <span class="stat-value">${done ? '✅ Erreicht' : `${earned.toLocaleString('de-DE')} / ${m.toLocaleString('de-DE')} 💰`}</span>
      </div>
      <div class="progress-bar-container"><div class="progress-bar" style="width:${progressPct}%"></div></div>
    `;
  }).join('');

  // Kategorie: Schlüssel (pro Rarität)
  const keysSection = rarities.map(r => {
    const count = (stats.keysFoundCounts && stats.keysFoundCounts[r]) || 0;
    const entries = KEY_MILESTONES.map(m => {
      const done = count >= m;
      const progressPct = Math.min(100, Math.round((count / m) * 100));
      return `
        <div class="stat-item">
          <span class="stat-label">${displayRarityName(r)}: ${m.toLocaleString('de-DE')} Schlüssel</span>
          <span class="stat-value">${done ? '✅ Erreicht' : `${count.toLocaleString('de-DE')} / ${m.toLocaleString('de-DE')}`}</span>
        </div>
        <div class="progress-bar-container"><div class="progress-bar" style="width:${progressPct}%"></div></div>
      `;
    }).join('');
    return entries;
  }).join('');
  const keysCompletedRarities = rarities.filter(r => ((stats.keysFoundCounts && stats.keysFoundCounts[r]) || 0) >= 1).length;
  const keysPctOverall = Math.round((keysCompletedRarities / Math.max(1, rarities.length)) * 100);

  dom.achievementsContent.innerHTML = `
    <div class="stats-section" data-sec="boxes">
      <h3 class="ach-section-header" data-sec="boxes"><button class="ach-toggle" aria-label="Ein-/ausklappen">▾</button> 📦 Boxen <span class="ach-percent">${boxPctOverall}%</span></h3>
      <div class="ach-section-body" data-sec="boxes">${boxItems}</div>
    </div>
    <div class="stats-section" data-sec="collection">
      <h3 class="ach-section-header" data-sec="collection"><button class="ach-toggle" aria-label="Ein-/ausklappen">▾</button> 📚 Sammlung (pro Rarität) <span class="ach-percent">${collectionPctOverall}%</span></h3>
      <div class="ach-section-body" data-sec="collection">${collectionSection}</div>
    </div>
    <div class="stats-section" data-sec="gold">
      <h3 class="ach-section-header" data-sec="gold"><button class="ach-toggle" aria-label="Ein-/ausklappen">▾</button> 💰 Gold <span class="ach-percent">${goldPctOverall}%</span></h3>
      <div class="ach-section-body" data-sec="gold">${goldItems}</div>
    </div>
    <div class="stats-section" data-sec="keys">
      <h3 class="ach-section-header" data-sec="keys"><button class="ach-toggle" aria-label="Ein-/ausklappen">▾</button> 🔑 Schlüssel <span class="ach-percent">${keysPctOverall}%</span></h3>
      <div class="ach-section-body" data-sec="keys">${keysSection}</div>
    </div>
  `;

  // Collapse-Handler einrichten
  function applyCollapseState(secId) {
    const body = dom.achievementsContent.querySelector(`.ach-section-body[data-sec="${secId}"]`);
    const headerBtn = dom.achievementsContent.querySelector(`.ach-section-header[data-sec="${secId}"] .ach-toggle`);
    const collapsed = !!achCollapse[secId];
    if (body) body.style.display = collapsed ? 'none' : '';
    if (headerBtn) headerBtn.textContent = collapsed ? '▸' : '▾';
  }
  ['boxes','collection','gold','keys'].forEach(sec => applyCollapseState(sec));
  dom.achievementsContent.querySelectorAll('.ach-section-header').forEach(h => {
    h.addEventListener('click', () => {
      const sec = h.getAttribute('data-sec');
      achCollapse[sec] = !achCollapse[sec];
      saveAchCollapse();
      applyCollapseState(sec);
    });
  });

  dom.achievementsOverlay.style.display = 'block';

  // Als gesehen markieren (höchsten erreichten Meilensteine in allen Kategorien)
  try {
    const seen = achievementsState.seen || { boxes: 0, gold: 0, collection: {}, keys: {} };
    const boxMax = boxesMaxMilestoneReached();
    const goldMax = goldMaxMilestoneReached();
    const colSeen = seen.collection || {};
    const newColSeen = { ...colSeen };
    for (const r of rarities) {
      const m = collectionMaxMilestoneReached(r);
      newColSeen[r] = Math.max(m, newColSeen[r] || 0);
    }
    const keySeen = seen.keys || {};
    const newKeySeen = { Common: 0, Rare: 0, Epic: 0, Legendary: 0, Mythisch: 0, ...keySeen };
    for (const r of rarities) {
      const km = keysMaxMilestoneReachedForRarity(r);
      newKeySeen[r] = Math.max(newKeySeen[r] || 0, km);
    }
    achievementsState.seen = {
      boxes: Math.max(seen.boxes || 0, boxMax),
      gold: Math.max(seen.gold || 0, goldMax),
      collection: newColSeen,
      keys: newKeySeen
    };
  } catch (_) {
    // Kompatibilität mit alten Saves
    const compat = boxesMaxMilestoneReached();
    if (compat > (achievementsState.seenMax || 0)) achievementsState.seenMax = compat;
  }
  saveProgress();
  updateAchievementsNotify();
}

function closeAchievements() {
  if (!dom.achievementsOverlay) return;
  dom.achievementsOverlay.style.display = 'none';
}

// ======= Statistik-Overlay =======
dom.statsBtn.addEventListener('click', showStats);
dom.closeStatsBtn.addEventListener('click', closeStats);
dom.statsOverlay.addEventListener('click', (e) => {
  if (e.target === dom.statsOverlay) closeStats();
});

// ======= Background-Selector =======
const backgroundBtn = document.getElementById('backgroundBtn');
if (backgroundBtn) {
  backgroundBtn.addEventListener('click', openBackgroundSelector);
}

// ======= Account Management =======
const accountBtn = document.getElementById('accountBtn');
const accountModal = document.getElementById('accountModal');
const closeAccountBtn = document.getElementById('closeAccountBtn');

if (accountBtn) {
  accountBtn.addEventListener('click', openAccountModal);
}
if (closeAccountBtn) {
  closeAccountBtn.addEventListener('click', () => {
    accountModal.style.display = 'none';
  });
}
if (accountModal) {
  accountModal.addEventListener('click', (e) => {
    if (e.target === accountModal) accountModal.style.display = 'none';
  });
}

function openAccountModal() {
  if (!accountModal) return;
  
  const accountStatus = document.getElementById('accountStatus');
  const accountActions = document.getElementById('accountActions');
  
  const isAnon = window.firebaseApi?.isAnonymous() || false;
  const email = window.firebaseApi?.getUserEmail() || null;
  const uid = window.firebaseApi?.getCurrentUid() || 'Unbekannt';
  
  // Status anzeigen
  if (isAnon) {
    accountStatus.innerHTML = `
      <p><strong>Status:</strong> <span style="color: #f39c12;">Anonymer Gast-Account</span></p>
      <p><strong>User ID:</strong> <code style="font-size:0.85em;">${uid}</code></p>
      <p style="margin-top:15px; color: #e74c3c; font-weight: bold;">⚠️ Achtung:</p>
      <p>Dein Spielstand ist nur in diesem Browser gespeichert. Wenn du den Browser-Cache löschst oder das Gerät wechselst, gehen deine Daten verloren!</p>
      <p style="margin-top:10px; color: #2ecc71;">✅ Empfehlung:</p>
      <p>Verknüpfe deinen Account mit Email und Passwort, um deinen Spielstand dauerhaft zu sichern.</p>
    `;
    
    accountActions.innerHTML = `
      <h3 style="margin-bottom:10px;">Account upgraden</h3>
      <input type="email" id="linkEmail" placeholder="Email-Adresse" style="width:100%; padding:10px; margin-bottom:10px; border:1px solid #ccc; border-radius:5px; font-size:14px;">
      <input type="password" id="linkPassword" placeholder="Passwort (mind. 6 Zeichen)" style="width:100%; padding:10px; margin-bottom:10px; border:1px solid #ccc; border-radius:5px; font-size:14px;">
      <button id="linkAccountBtn" class="upgrade-btn" style="width:100%; padding:12px; font-size:16px;">🔗 Account verknüpfen</button>
      <p id="linkStatus" style="margin-top:10px; font-size:0.9em;"></p>
      
      <hr style="margin: 25px 0; border: 1px solid #444;">
      
      <h3 style="margin-bottom:10px;">Bereits verknüpft? Anmelden</h3>
      <input type="email" id="loginEmail" placeholder="Email-Adresse" style="width:100%; padding:10px; margin-bottom:10px; border:1px solid #ccc; border-radius:5px; font-size:14px;">
      <input type="password" id="loginPassword" placeholder="Passwort" style="width:100%; padding:10px; margin-bottom:10px; border:1px solid #ccc; border-radius:5px; font-size:14px;">
      <button id="loginBtn" class="upgrade-btn" style="width:100%; padding:12px; font-size:16px; background: linear-gradient(135deg, #3498db, #2980b9);">🔑 Anmelden</button>
      <p id="loginStatus" style="margin-top:10px; font-size:0.9em;"></p>
    `;
    
    // Event Listener für Link-Button
    setTimeout(() => {
      const linkBtn = document.getElementById('linkAccountBtn');
      if (linkBtn) {
        linkBtn.addEventListener('click', async () => {
          const emailInput = document.getElementById('linkEmail');
          const passwordInput = document.getElementById('linkPassword');
          const statusP = document.getElementById('linkStatus');
          
          const email = emailInput.value.trim();
          const password = passwordInput.value;
          
          if (!email || !password) {
            statusP.innerHTML = '<span style="color:#e74c3c;">❌ Bitte Email und Passwort eingeben</span>';
            return;
          }
          
          if (password.length < 6) {
            statusP.innerHTML = '<span style="color:#e74c3c;">❌ Passwort muss mindestens 6 Zeichen lang sein</span>';
            return;
          }
          
          try {
            linkBtn.disabled = true;
            statusP.innerHTML = '<span style="color:#3498db;">⏳ Verknüpfe Account...</span>';
            
            await window.firebaseApi.linkAccountWithEmail(email, password);
            
            statusP.innerHTML = '<span style="color:#2ecc71;">✅ Account verknüpft! Lade Spielstand hoch...</span>';
            
            // Spielstand sofort hochladen nach Account-Linking
            setTimeout(async () => {
              try {
                await saveProgress(); // Speichert lokal
                await syncToFirebaseComplete(); // Synchronisiert komplett zu Firebase
                statusP.innerHTML = '<span style="color:#2ecc71;">✅ Spielstand erfolgreich gesichert!</span>';
                setTimeout(() => {
                  openAccountModal();
                }, 2000);
              } catch (syncError) {
                console.error('Sync after link failed:', syncError);
                statusP.innerHTML = '<span style="color:#f39c12;">⚠️ Account verknüpft, aber Spielstand konnte nicht hochgeladen werden.</span>';
                setTimeout(() => {
                  openAccountModal();
                }, 2000);
              }
            }, 500);
          } catch (error) {
            console.error('Link error:', error);
            let errorMsg = error.message;
            if (errorMsg.includes('email-already-in-use')) {
              errorMsg = 'Diese Email wird bereits verwendet. Bitte verwende eine andere Email.';
            } else if (errorMsg.includes('invalid-email')) {
              errorMsg = 'Ungültige Email-Adresse.';
            } else if (errorMsg.includes('weak-password')) {
              errorMsg = 'Passwort ist zu schwach. Mindestens 6 Zeichen erforderlich.';
            }
            statusP.innerHTML = `<span style="color:#e74c3c;">❌ Fehler: ${errorMsg}</span>`;
            linkBtn.disabled = false;
          }
        });
      }
    }, 100);
    
    // Event Listener für Login-Button
    setTimeout(() => {
      const loginBtn = document.getElementById('loginBtn');
      if (loginBtn) {
        loginBtn.addEventListener('click', async () => {
          const emailInput = document.getElementById('loginEmail');
          const passwordInput = document.getElementById('loginPassword');
          const statusP = document.getElementById('loginStatus');
          
          const email = emailInput.value.trim();
          const password = passwordInput.value;
          
          if (!email || !password) {
            statusP.innerHTML = '<span style="color:#e74c3c;">❌ Bitte Email und Passwort eingeben</span>';
            return;
          }
          
          try {
            loginBtn.disabled = true;
            statusP.innerHTML = '<span style="color:#3498db;">⏳ Melde an...</span>';
            
            await window.firebaseApi.signInWithEmail(email, password);
            
            statusP.innerHTML = '<span style="color:#2ecc71;">✅ Erfolgreich angemeldet! Lade Spielstand...</span>';
            
            // Spielstand laden mit etwas mehr Wartezeit für Firebase
            setTimeout(async () => {
              try {
                const loaded = await loadProgressFromFirebase();
                if (loaded) {
                  statusP.innerHTML = '<span style="color:#2ecc71;">✅ Spielstand geladen! Seite wird neu geladen...</span>';
                  setTimeout(() => {
                    location.reload();
                  }, 1500);
                } else {
                  // Kein Spielstand auf Server, aber Login erfolgreich
                  statusP.innerHTML = '<span style="color:#2ecc71;">✅ Angemeldet! Du startest mit einem neuen Spielstand.</span>';
                  setTimeout(() => {
                    location.reload();
                  }, 1500);
                }
              } catch (error) {
                console.error('Load progress error:', error);
                // Login war erfolgreich, nur Spielstand-Sync hat Problem
                statusP.innerHTML = '<span style="color:#2ecc71;">✅ Angemeldet! Seite wird neu geladen...</span>';
                setTimeout(() => {
                  location.reload();
                }, 1500);
              }
            }, 1000);
          } catch (error) {
            console.error('Login error:', error);
            let errorMsg = error.message;
            if (errorMsg.includes('user-not-found') || errorMsg.includes('wrong-password') || errorMsg.includes('invalid-credential')) {
              errorMsg = 'Email oder Passwort falsch.';
            } else if (errorMsg.includes('invalid-email')) {
              errorMsg = 'Ungültige Email-Adresse.';
            } else if (errorMsg.includes('too-many-requests')) {
              errorMsg = 'Zu viele fehlgeschlagene Versuche. Bitte warte einen Moment.';
            }
            statusP.innerHTML = `<span style="color:#e74c3c;">❌ Fehler: ${errorMsg}</span>`;
            loginBtn.disabled = false;
          }
        });
      }
    }, 100);
    
  } else {
    accountStatus.innerHTML = `
      <p><strong>Status:</strong> <span style="color: #2ecc71;">✅ Registrierter Account</span></p>
      <p><strong>Email:</strong> ${email || 'Keine Email hinterlegt'}</p>
      <p><strong>User ID:</strong> <code style="font-size:0.85em;">${uid}</code></p>
      <p style="margin-top:15px; color: #2ecc71;">Dein Spielstand ist dauerhaft gesichert und über alle Geräte synchronisiert.</p>
    `;
    
    accountActions.innerHTML = `
      <button id="syncNowBtn" class="upgrade-btn" style="width:100%; padding:12px; font-size:16px; background: linear-gradient(135deg, #2ecc71, #27ae60); margin-bottom:15px;">
        🔄 Spielstand jetzt hochladen
      </button>
      <p id="syncStatus" style="margin-top:10px; font-size:0.9em; text-align:center;"></p>
      <p style="font-size:0.85em; color:#aaa; margin-top:15px; font-style:italic;">
        Dein Spielstand wird automatisch alle paar Sekunden synchronisiert. Dieser Button lädt sofort alle Daten hoch.
      </p>
      
      <hr style="margin: 25px 0; border: 1px solid #444;">
      
      <button id="logoutBtn" class="upgrade-btn" style="width:100%; padding:12px; font-size:16px; background: linear-gradient(135deg, #e74c3c, #c0392b);">
        🚪 Abmelden
      </button>
      <p style="font-size:0.85em; color:#aaa; margin-top:10px; text-align:center;">
        Du wirst automatisch als anonymer Gast angemeldet. Dein Spielstand bleibt auf dem Server gesichert.
      </p>
    `;
    
    // Event Listener für Sync-Button
    setTimeout(() => {
      const syncBtn = document.getElementById('syncNowBtn');
      const syncStatus = document.getElementById('syncStatus');
      if (syncBtn) {
        syncBtn.addEventListener('click', async () => {
          try {
            syncBtn.disabled = true;
            syncStatus.innerHTML = '<span style="color:#3498db;">⏳ Lade Spielstand hoch...</span>';
            
            await saveProgress(); // Speichert lokal
            await syncToFirebaseComplete(); // Synchronisiert komplett zu Firebase
            
            syncStatus.innerHTML = '<span style="color:#2ecc71;">✅ Spielstand erfolgreich hochgeladen!</span>';
            setTimeout(() => {
              syncStatus.innerHTML = '';
              syncBtn.disabled = false;
            }, 3000);
          } catch (error) {
            console.error('Manual sync failed:', error);
            syncStatus.innerHTML = '<span style="color:#e74c3c;">❌ Fehler beim Hochladen. Bitte versuche es erneut.</span>';
            syncBtn.disabled = false;
          }
        });
      }
    }, 100);
    
    // Event Listener für Logout-Button
    setTimeout(() => {
      const logoutBtn = document.getElementById('logoutBtn');
      if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
          const confirmed = confirm('Möchtest du dich wirklich abmelden? Dein Spielstand bleibt auf dem Server gesichert.');
          if (!confirmed) return;
          
          try {
            logoutBtn.disabled = true;
            await window.firebaseApi.signOut();
            alert('Erfolgreich abgemeldet! Die Seite wird neu geladen.');
            location.reload();
          } catch (error) {
            console.error('Logout error:', error);
            alert('Fehler beim Abmelden: ' + error.message);
            logoutBtn.disabled = false;
          }
        });
      }
    }, 100);
  }
  
  accountModal.style.display = 'flex';
}

// ======= Leaderboard =======
if (dom.leaderboardBtn) {
  dom.leaderboardBtn.addEventListener('click', showLeaderboard);
}
if (dom.closeLeaderboardBtn) {
  dom.closeLeaderboardBtn.addEventListener('click', closeLeaderboard);
}
if (dom.saveNameBtn) {
  dom.saveNameBtn.addEventListener('click', saveDisplayName);
}

async function showLeaderboard() {
  const leaderboardDisplay = document.getElementById('leaderboardDisplay');
  
  // Toggle visibility
  if (leaderboardDisplay.style.display === 'block') {
    leaderboardDisplay.style.display = 'none';
    return;
  }
  
  leaderboardDisplay.style.display = 'block';
  
  // Lade gespeicherten Namen
  const savedName = localStorage.getItem('playerDisplayName') || '';
  dom.displayNameInput.value = savedName;
  
  // Lade Leaderboard
  dom.leaderboardContent.innerHTML = '<p style="text-align:center;">Lade Leaderboard...</p>';
  
  try {
    const leaderboard = await window.firebaseApi.fetchGlobalLeaderboard(50);
    
    if (!leaderboard || leaderboard.length === 0) {
      dom.leaderboardContent.innerHTML = '<p style="text-align:center;">Noch keine Einträge vorhanden.</p>';
      return;
    }
    
    let html = '<table style="width:100%; border-collapse:collapse;">';
    html += '<thead><tr style="border-bottom:2px solid #ccc;">';
    html += '<th style="padding:8px; text-align:center;">Rang</th>';
    html += '<th style="padding:8px; text-align:left;">Name</th>';
    html += '<th style="padding:8px; text-align:center;">XP</th>';
    html += '<th style="padding:8px; text-align:center;">⭐</th>';
    html += '</tr></thead><tbody>';
    
    const currentUid = window.firebaseApi.getCurrentUid();
    
    leaderboard.forEach((entry, index) => {
      const isCurrentUser = entry.uid === currentUid;
      const rowStyle = isCurrentUser ? 'background-color: rgba(241, 196, 15, 0.2); font-weight: bold;' : '';
      
      // Medaillen für Top 3
      let rankDisplay;
      if (index === 0) {
        rankDisplay = '🥇'; // Gold
      } else if (index === 1) {
        rankDisplay = '🥈'; // Silber
      } else if (index === 2) {
        rankDisplay = '🥉'; // Bronze
      } else {
        rankDisplay = index + 1;
      }
      
      html += `<tr style="${rowStyle}">`;
      html += `<td style="padding:8px; text-align:center; font-size:${index < 3 ? '20px' : '14px'};">${rankDisplay}</td>`;
      html += `<td style="padding:8px; text-align:left;">${entry.displayName}</td>`;
      html += `<td style="padding:8px; text-align:center;">${(entry.totalXP || 0).toLocaleString('de-DE')}</td>`;
      html += `<td style="padding:8px; text-align:center;">${entry.prestigeLevel || 0}</td>`;
      html += '</tr>';
    });
    
    html += '</tbody></table>';
    dom.leaderboardContent.innerHTML = html;
  } catch (error) {
    console.error('Error loading leaderboard:', error);
    dom.leaderboardContent.innerHTML = '<p style="text-align:center; color:red;">Fehler beim Laden des Leaderboards.</p>';
  }
}

function closeLeaderboard() {
  const leaderboardDisplay = document.getElementById('leaderboardDisplay');
  if (leaderboardDisplay) {
    leaderboardDisplay.style.display = 'none';
  }
}

async function saveDisplayName() {
  const name = dom.displayNameInput.value.trim();
  
  if (!name) {
    alert('Bitte gib einen Namen ein.');
    return;
  }
  
  if (name.length > 20) {
    alert('Name darf maximal 20 Zeichen lang sein.');
    return;
  }
  
  try {
    await window.firebaseApi.setDisplayName(name);
    alert('Name gespeichert!');
    // Leaderboard neu laden
    showLeaderboard();
  } catch (error) {
    console.error('Error saving display name:', error);
    alert('Fehler beim Speichern des Namens: ' + error.message);
  }
}

function showStats() {
  const content = dom.statsContent;
  content.innerHTML = '';
  
  // Sammlungs-Fortschritt berechnen
  const totalItems = rarities.reduce((sum, rarity) => sum + (itemPools[rarity] || []).length, 0);
  const discoveredCount = discoveredItems.size;
  const collectionPercent = ((discoveredCount / totalItems) * 100).toFixed(1);
  
  const statsHTML = `
    <div class="stats-section">
      <h3>📦 Box-Statistiken</h3>
      <div class="stat-item">
        <span class="stat-label">Geöffnete Boxen (Gesamt):</span>
        <span class="stat-value">${stats.totalBoxesOpened.toLocaleString('de-DE')}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Aktueller Run:</span>
        <span class="stat-value" style="color: #4CAF50">${(prestigeState.runBoxesOpened || 0).toLocaleString('de-DE')}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Gezogene Items:</span>
        <span class="stat-value">${stats.totalItemsPulled.toLocaleString('de-DE')}</span>
      </div>
    </div>
    
    <div class="stats-section">
      <h3>💰 Gold-Statistiken</h3>
      <div class="stat-item">
        <span class="stat-label">Total verdient:</span>
        <span class="stat-value">${stats.totalGoldEarned.toLocaleString('de-DE')} 💰</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Wertvollstes Item:</span>
        <span class="stat-value" style="color: ${colors[stats.mostValuableItem.rarity] || '#fff'}">
          ${stats.mostValuableItem.name || 'Noch keins'} 
          ${stats.mostValuableItem.value > 0 ? `(${stats.mostValuableItem.value.toLocaleString('de-DE')} 💰)` : ''}
        </span>
      </div>
    </div>
    
    <div class="stats-section">
      <h3>📚 Sammlungs-Fortschritt</h3>
      <div class="stat-item">
        <span class="stat-label">Entdeckt:</span>
        <span class="stat-value">${discoveredCount} / ${totalItems} (${collectionPercent}%)</span>
      </div>
      <div class="progress-bar-container">
        <div class="progress-bar" style="width: ${collectionPercent}%"></div>
      </div>
    </div>
    
    <div class="stats-section">
      <h3>🌟 Lifetime Items (Alle Runs)</h3>
      <div class="stat-item">
        <span class="stat-label" style="color: #b0b0b0">⚪ Common:</span>
        <span class="stat-value">${(stats.lifetimeDiscovered.Common || 0).toLocaleString('de-DE')}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label" style="color: #4a90e2">🔵 Selten:</span>
        <span class="stat-value">${(stats.lifetimeDiscovered.Rare || 0).toLocaleString('de-DE')}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label" style="color: #9b59b6">🟣 Episch:</span>
        <span class="stat-value">${(stats.lifetimeDiscovered.Epic || 0).toLocaleString('de-DE')}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label" style="color: #f39c12">🟠 Legendär:</span>
        <span class="stat-value">${(stats.lifetimeDiscovered.Legendary || 0).toLocaleString('de-DE')}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label" style="color: #e74c3c">🔴 Mythisch:</span>
        <span class="stat-value">${(stats.lifetimeDiscovered.Mythisch || 0).toLocaleString('de-DE')}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label" style="color: #8e44ad">🟣 Ätherisch:</span>
        <span class="stat-value">${(stats.lifetimeDiscovered.Aetherisch || 0).toLocaleString('de-DE')}</span>
      </div>
    </div>
    
    <div class="stats-section">
      <h3>📊 Boxen pro Typ</h3>
      ${boxOrder.map(boxName => `
        <div class="stat-item">
          <span class="stat-label">${boxDisplayNames[boxName] || boxName}:</span>
          <span class="stat-value">${Number(stats.boxOpenCounts[boxName] || 0).toLocaleString('de-DE')}x</span>
        </div>
      `).join('')}
    </div>
  `;
  
  content.innerHTML = statsHTML;
  dom.statsOverlay.style.display = 'block';
}

function closeStats() {
  dom.statsOverlay.style.display = 'none';
}

// ======= Level & Skills UI Functions =======
function updateLevelUI() {
  const xpNeeded = getXPForLevel(playerLevel);
  const xpPercent = (playerLevel >= MAX_LEVEL) ? 100 : (playerXP / xpNeeded) * 100;
  
  dom.playerLevel.textContent = `Level ${playerLevel}`;
  dom.playerTitle.textContent = getCurrentTitle();
  dom.xpBar.style.width = `${xpPercent}%`;
  
  if (playerLevel >= MAX_LEVEL) {
    dom.xpText.textContent = `MAX LEVEL`;
  } else {
    dom.xpText.textContent = `${playerXP} / ${xpNeeded} XP`;
  }
  
  dom.skillPointsDisplay.textContent = skillPoints;
  dom.availablePoints.textContent = skillPoints;
  
  // Skill-Levels aktualisieren
  dom.wohlstandLevel.textContent = skills.wohlstand;
  dom.glueckLevel.textContent = skills.glueck;
  dom.effizienzLevel.textContent = skills.effizienz;
  
  // Buttons aktivieren/deaktivieren
  dom.upgradeWohlstand.disabled = (skillPoints === 0 || skills.wohlstand >= 20);
  dom.upgradeGlueck.disabled = (skillPoints === 0 || skills.glueck >= 20);
  dom.upgradeEffizienz.disabled = (skillPoints === 0 || skills.effizienz >= 10);
  
  // Skills-Button hervorheben wenn Punkte verfügbar
  if (skillPoints > 0) {
    dom.skillsBtn.classList.add('has-points');
  } else {
    dom.skillsBtn.classList.remove('has-points');
  }
}

// Skills Modal öffnen/schließen
dom.skillsBtn.addEventListener('click', () => {
  // Toggle: Wenn offen, schließen; wenn geschlossen, öffnen
  if (dom.skillModal.style.display === 'block') {
    dom.skillModal.style.display = 'none';
  } else {
    dom.skillModal.style.display = 'block';
    updateLevelUI();
  }
});

dom.closeSkillBtn.addEventListener('click', () => {
  dom.skillModal.style.display = 'none';
});

dom.skillModal.addEventListener('click', (e) => {
  if (e.target === dom.skillModal) {
    dom.skillModal.style.display = 'none';
  }
});

// Skill-Upgrade Buttons
dom.upgradeWohlstand.addEventListener('click', () => {
  if (skillPoints > 0 && skills.wohlstand < 20) {
    skills.wohlstand++;
    skillPoints--;
    updateLevelUI();
    saveProgress(); // Speichere bei Skill-Änderung
    
    // Info-Modal aktualisieren falls geöffnet
    if (dom.boxInfoModal && dom.boxInfoModal.style.display === 'block') {
      populateBoxInfo();
    }
  }
});

dom.upgradeGlueck.addEventListener('click', () => {
  if (skillPoints > 0 && skills.glueck < 20) {
    skills.glueck++;
    skillPoints--;
    updateLevelUI();
    saveProgress(); // Speichere bei Skill-Änderung
    
    // Info-Modal aktualisieren falls geöffnet
    if (dom.boxInfoModal && dom.boxInfoModal.style.display === 'block') {
      populateBoxInfo();
    }
  }
});

dom.upgradeEffizienz.addEventListener('click', () => {
  if (skillPoints > 0 && skills.effizienz < 10) {
    skills.effizienz++;
    skillPoints--;
    updateLevelUI();
    saveProgress(); // Speichere bei Skill-Änderung
    
    // Info-Modal aktualisieren falls geöffnet
    if (dom.boxInfoModal && dom.boxInfoModal.style.display === 'block') {
      populateBoxInfo();
    }
  }
});

// Initial UI Update
updateLevelUI();

// ======= Prestige System =======
function getDiscoveredCountByRarity(rarity) {
  try {
    // Normale Items aus dem Pool
    const pool = itemPools[rarity] || [];
    const names = new Set(pool.map(it => it.name));
    
    // Füge saisonale Items hinzu
    for (const [eventKey, event] of Object.entries(seasonalItems)) {
      const seasonalItemsForRarity = (event.items && event.items[rarity]) || [];
      for (const item of seasonalItemsForRarity) {
        if (item.name) names.add(item.name);
      }
    }
    
    // Zähle entdeckte Items
    let count = 0;
    for (const name of discoveredItems) {
      if (names.has(name)) count++;
    }
    return count;
  } catch (_) {
    return 0;
  }
}

// Dynamische Prestige-Anforderung je aktueller Prestige-Stufe
function getPrestigeRarityRequirement(level) {
  const lvl = Number(level || 0);
  if (lvl < 10) return { type: 'Mythisch', needed: 5 };
  if (lvl < 20) return { type: 'Aetherisch', needed: 1 };
  if (lvl < 30) return { type: 'Aetherisch', needed: 2 };
  return { type: 'Aetherisch', needed: 3 };
}

function canPrestige() {
  const hasLevel = playerLevel >= MAX_LEVEL;
  const req = getPrestigeRarityRequirement(prestigeState.level || 0);
  let hasRarity = false;
  if (req.type === 'Mythisch') {
    hasRarity = getDiscoveredCountByRarity('Mythisch') >= req.needed;
  } else {
    hasRarity = getDiscoveredCountByRarity('Aetherisch') >= req.needed;
  }
  // Bedingung: 200 Boxen seit letztem Prestige
  const hasBoxes = (prestigeState.runBoxesOpened || 0) >= 200;
  return hasLevel && hasRarity && hasBoxes;
}

function updatePrestigeUI() {
  try {
    if (dom.prestigeStarNum) {
      dom.prestigeStarNum.textContent = String(prestigeState.level || 0);
    }
    if (dom.prestigeBtn) {
      dom.prestigeBtn.disabled = false; // immer klickbar, Modal zeigt Bedingungen
      dom.prestigeBtn.title = canPrestige()
        ? 'Meta-Boni & Reset'
        : `Erreiche Level ${MAX_LEVEL} (Meta-Boni & Reset)`;
      try { dom.prestigeBtn.classList.toggle('prestige-ready', !!canPrestige()); } catch (_) {}
    }
    if (dom.prestigeInfo) {
      const nextLvl = (prestigeState.level || 0) + 1;
      const currBonusValue = (prestigeState.level * 5) || 0;
      const currBonusLuck = prestigeState.level || 0;
      const nextBonusValue = currBonusValue + 5;
      const nextBonusLuck = currBonusLuck + 1;
      const cLevel = playerLevel >= MAX_LEVEL;
      const req = getPrestigeRarityRequirement(prestigeState.level || 0);
      const mythCount = Math.max(0, getDiscoveredCountByRarity('Mythisch') || 0);
      const aetherCount = Math.max(0, getDiscoveredCountByRarity('Aetherisch') || 0);
      const reqLabel = req.type === 'Mythisch' ? 'Mythische' : 'Ätherische';
      const haveCount = req.type === 'Mythisch' ? mythCount : aetherCount;
      const cRarity = haveCount >= req.needed;
      const runBoxes = Math.max(0, prestigeState.runBoxesOpened || 0);
      const cBoxes = runBoxes >= 200;
      dom.prestigeInfo.innerHTML = `
        <h3>Bedingungen</h3>
        <ul class="prestige-conds">
          <li class="${cLevel ? 'ok' : 'fail'}">- Level ${MAX_LEVEL} ${cLevel ? '✓' : ''}</li>
          <li class="${cRarity ? 'ok' : 'fail'}">- ${req.needed} ${reqLabel} Items <span style="opacity:0.85">(${Math.min(haveCount, req.needed)}/${req.needed})</span> ${cRarity ? '✓' : ''}</li>
          <li class="${cBoxes ? 'ok' : 'fail'}">- 200 Boxen geöffnet <span style="opacity:0.85">(${Math.min(runBoxes,200)}/200)</span> ${cBoxes ? '✓' : ''}</li>
        </ul>
        <h3>Auswirkungen</h3>
        <p>Run-Reset:</p>
        <ul>
          <li>Level, XP, Skills, Shop-Upgrades, Guthaben</li>
          <li>Entdeckungen und Schlüssel-Inventar</li>
        </ul>
        <p>Bleibt bestehen:</p>
        <ul>
          <li>Statistiken und Erfolge</li>
        </ul>
        <p><strong>Dauerhafte Boni je Stufe:</strong></p>
        <ul>
          <li>+5% Item-Wert additiv (aktuell: +${currBonusValue}%)</li>
          <li>+1 Punkt Glück (aktuell: +${currBonusLuck})</li>
          <li>-2% Untersuchungszeit (aktuell: -${(prestigeState.level||0)*2}%)</li>
        </ul>
        <p>Nächste Stufe (${nextLvl}): +${nextBonusValue}% Wert, +${nextBonusLuck} Glück, -2% Zeit</p>
        <p style="opacity:${canPrestige()?1:0.7}"><em>${canPrestige() ? 'Bereit zum Prestigen.' : 'Bedingungen noch nicht erfüllt.'}</em></p>
      `;
    }
    if (dom.confirmPrestigeBtn) {
      dom.confirmPrestigeBtn.disabled = !canPrestige();
      dom.confirmPrestigeBtn.title = canPrestige() ? 'Prestige jetzt durchführen' : `Erreiche Level ${MAX_LEVEL}`;
    }
  } catch (_) { /* ignore */ }
}

if (dom.prestigeBtn) {
  dom.prestigeBtn.addEventListener('click', () => {
    if (!dom.prestigeModal) return;
    updatePrestigeUI();
    dom.prestigeModal.style.display = 'block';
  });
}
if (dom.closePrestigeBtn) {
  dom.closePrestigeBtn.addEventListener('click', () => {
    if (dom.prestigeModal) dom.prestigeModal.style.display = 'none';
  });
}
if (dom.prestigeModal) {
  dom.prestigeModal.addEventListener('click', (e) => {
    if (e.target === dom.prestigeModal) dom.prestigeModal.style.display = 'none';
  });
}

async function doPrestige() {
  if (isOpening) {
    alert('Bitte warte, bis die Box-Öffnung abgeschlossen ist.');
    return;
  }
  
  // Blockiere Prestige wenn Auto-Clicker aktiv ist
  if (autoClickerEnabled) {
    alert('Bitte deaktiviere den Auto-Clicker, bevor du Prestige durchführst.');
    return;
  }
  
  // Verhindere mehrfache Prestige-Aufrufe
  if (isPrestiging) {
    console.warn('Prestige bereits in Bearbeitung');
    return;
  }
  
  if (!canPrestige()) {
    // Zeige detaillierte Fehlermeldung
    const hasLevel = playerLevel >= MAX_LEVEL;
    const req = getPrestigeRarityRequirement(prestigeState.level || 0);
    const hasRarity = req.type === 'Mythisch' 
      ? getDiscoveredCountByRarity('Mythisch') >= req.needed
      : getDiscoveredCountByRarity('Aetherisch') >= req.needed;
    const hasBoxes = (prestigeState.runBoxesOpened || 0) >= 200;
    
    let msg = 'Prestige-Bedingungen noch nicht erfüllt:\n';
    if (!hasLevel) msg += `\n❌ Level ${MAX_LEVEL} erreichen (aktuell: ${playerLevel})`;
    if (!hasRarity) {
      const count = req.type === 'Mythisch' ? getDiscoveredCountByRarity('Mythisch') : getDiscoveredCountByRarity('Aetherisch');
      msg += `\n❌ ${req.needed} ${req.type}e Items finden (aktuell: ${count})`;
    }
    if (!hasBoxes) msg += `\n❌ 200 Boxen öffnen (aktuell: ${prestigeState.runBoxesOpened || 0})`;
    
    alert(msg);
    return;
  }
  // Sicherheitsabfrage
  if (!confirm('Prestige durchführen? Dein Run wird zurückgesetzt, dauerhafte Boni bleiben.')) {
    return;
  }

  // Setze Lock
  isPrestiging = true;

  // Vor dem Server-Call: ALLE Daten inkl. runBoxesOpened synchronisieren
  try {
    if (window.firebaseApi && typeof window.firebaseApi.syncUserData === 'function') {
      // Force sync ignorieren des Cooldowns
      lastFirebaseSync = 0;
      
      const progress = {
        balance,
        playerLevel,
        playerXP,
        totalXPEarned,
        skillPoints,
        skills: { ...skills },
        boxType,
        unlockedBoxes: Array.from(unlockedBoxes),
        stats: { ...stats },
        achievementsState: { ...achievementsState },
        activeBoosts: { ...activeBoosts },
        permanentUpgrades: { ...permanentUpgrades },
        purchasedItems: Array.from(purchasedItems),
        statUpgradesLevels: { ...statUpgradesLevels },
        keysInventory: { ...keysInventory },
        prestigeState: { ...prestigeState }
      };
      
      // Sync erzwingen
      syncToFirebase(progress);
      
      // Kurz warten damit Server die Daten hat
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      try {
        const resEl = document.getElementById('syncResult');
        if (resEl) { resEl.textContent = '✔ Daten synchronisiert'; resEl.style.color = '#2ecc71'; setTimeout(()=>{ resEl.textContent=''; }, 3000); }
      } catch(_){}
    }
  } catch (err) { 
    console.warn('Pre-prestige sync failed:', err);
    isPrestiging = false; // Unlock bei Fehler
  }

  // Server-seitige Prestige-Erhöhung (Cloud Function)
  try {
    if (window.firebaseApi && typeof window.firebaseApi.callPrestige === 'function') {
      // block UI minimal, optional: add spinner later
      const res = window.firebaseApi.callPrestige();
      // await result synchron synchronously before mutating local state
      return Promise.resolve(res).then(({ prestigeLevel }) => {
        prestigeState.level = Number(prestigeLevel || ((prestigeState.level||0)+1));
        // Danach lokalen Reset durchführen
        proceedAfterPrestige();
        isPrestiging = false; // Unlock nach Erfolg
      }).catch((e)=>{
        isPrestiging = false; // Unlock bei Fehler
        try {
          const code = (e && (e.code||e.error?.code)) || '';
          if (code.includes('unauth')) {
            alert('Du bist nicht angemeldet. Bitte die Seite neu laden.');
          } else if (code.includes('failed-precondition')) {
            // Versuche, genauere Begründung aus Nachricht zu lesen
            const msg = (e && (e.message || e.error?.message || '')).toLowerCase();
            if (msg.includes('aetheric')) {
              alert('Prestige abgelehnt: Du brauchst mehr ätherische Funde (siehe Bedingungen).');
            } else if (msg.includes('mythic')) {
              alert('Prestige abgelehnt: Du brauchst mindestens 5 mythische Funde (siehe Bedingungen).');
            } else if (msg.includes('boxes')) {
              alert('Prestige abgelehnt: Du brauchst 200 geöffnete Boxen seit dem letzten Prestige.');
            } else {
              alert('Prestige abgelehnt: Bedingungen laut Server noch nicht erfüllt.');
            }
          } else if (code.includes('resource-exhausted')) {
            alert('Zu viele Anfragen – bitte kurz warten und erneut versuchen.');
          } else {
            alert('Prestige fehlgeschlagen (Server). Bitte später erneut versuchen.');
          }
        } catch (_) {
          alert('Prestige fehlgeschlagen (Server). Bitte später erneut versuchen.');
        }
        console.warn('Prestige server failed', e);
      });
    } else {
      isPrestiging = false; // Unlock wenn API nicht verfügbar
      // Fallback zu lokalem Prestige (offline-Modus)
      prestigeState.level = (prestigeState.level || 0) + 1;
      proceedAfterPrestige();
    }
  } catch (err) {
    isPrestiging = false; // Unlock bei Fehler
    console.error('Prestige error:', err);
    alert('Prestige fehlgeschlagen. Bitte später erneut versuchen.');
  }
}

function proceedAfterPrestige() {
  // Zähler für "seit letztem Prestige" zurücksetzen
  prestigeState.runBoxesOpened = 0;

  // Reset: Progress und Run-bezogene Strukturen
  balance = 500;
  playerLevel = 0;
  playerXP = 0;
  totalXPEarned = 0; // Gesamt-XP zurücksetzen bei Prestige
  skillPoints = 0;
  skills.wohlstand = 0;
  skills.glueck = 0;
  skills.effizienz = 0;

  // Shop/Upgrades zurücksetzen
  activeBoosts = { valueBoost: 0, rarityBoost: 0, xpBoost: 0, valueBoostUses: 0, rarityBoostUses: 0, xpBoostUses: 0 };
  permanentUpgrades = { permTempoBoost: 0, permValueBoost: 0, permXPBoost: 0, permPotionBelt: 0, permAutoClicker: 0, permAutoClickerSpeed1: 0, permAutoClickerSpeed2: 0 };
  statUpgradesLevels = { wealth: 0, luck: 0, tempo: 0 };
  purchasedItems = new Set();
  
  // Auto-Clicker stoppen und Reset
  autoClickerCanRun = false;
  autoClickerEnabled = false;
  saveAutoClickerState();
  stopAutoClicker();

  // Boxen/Inventar
  unlockedBoxes.clear();
  unlockedBoxes.add('Box#1');
  boxType = 'Box#1';
  keysInventory = { Common: 0, Rare: 0, Epic: 0, Legendary: 0, Mythisch: 0 };
  // Schlüssel-UI sofort aktualisieren
  pendingKeyOpen = null; // evtl. Vormerkung aufheben
  try {
    renderKeysButtonBadges();
    setKeysBtnNotify(false);
    // Keys modal removed
  } catch (_) { /* ignore */ }

  // Items/Entdeckungen: zurücksetzen
  itemCounts = {};
  discoveredItems.clear();
  discoveredKeyRarities = new Set();
  saveKeyDiscovery();
  saveCounts();

  // Stats behalten wir als Lifetime; optional könnte man Run-Stats separat führen

  // UI & Persistenz
  updateBalance();
  updateBoxAvailability();
  createEmptyGrid();
  updateOpenBtnIcon();
  renderQuickslots();
  updateLevelUI();
  updatePrestigeUI();
  saveProgress();

  // Firebase: Stats mit neuem Prestige-Level synchronisieren
  try {
    if (window.firebaseApi && typeof window.firebaseApi.updateStats === 'function') {
      const mythCount = Math.max(0, getDiscoveredCountByRarity('Mythisch') || 0);
      const aetherCount = Math.max(0, getDiscoveredCountByRarity('Aetherisch') || 0);
      const payload = {
        totalXP: Number(totalXPEarned || 0),
        mythicsFound: Number(mythCount || 0),
        aethericsFound: Number(aetherCount || 0),
        totalBoxesOpened: Number((stats && stats.totalBoxesOpened) || 0),
        displayName: localStorage.getItem('playerDisplayName') || undefined,
        prestigeLevel: Number(prestigeState.level || 0)
      };
      window.firebaseApi.updateStats(payload).catch(err => {
        console.warn('Failed to sync prestige stats to Firebase:', err);
      });
    }
  } catch (err) {
    console.warn('Firebase prestige sync error:', err);
  }

  // Schließe Modal und zeige kleines Feedback
  if (dom.prestigeModal) dom.prestigeModal.style.display = 'none';
  try {
    const n = document.createElement('div');
    n.className = 'level-up-notification';
    n.innerHTML = '<div class="level-up-content"><h2>✨ Prestige!</h2><p>Dauerhafte Boni verbessert.</p></div>';
    document.body.appendChild(n);
    setTimeout(() => { n.classList.add('fade-out'); setTimeout(() => n.remove(), 500); }, 1800);
  } catch (_) { /* ignore */ }
}

if (dom.confirmPrestigeBtn) {
  dom.confirmPrestigeBtn.addEventListener('click', () => {
    // Blockiere Button während Box-Öffnung
    if (isOpening) {
      alert('Bitte warte, bis die Box-Öffnung abgeschlossen ist.');
      return;
    }
    doPrestige();
  });
}

// Initial Prestige-UI Sync
updatePrestigeUI();

// Wire "Sync jetzt" button in prestige modal after content render
document.addEventListener('click', async (e) => {
  const t = e.target;
  if (t && t.id === 'syncStatsBtn') {
    try {
      if (window.firebaseApi && typeof window.firebaseApi.updateStats === 'function') {
        const mythCount = Math.max(0, getDiscoveredCountByRarity('Mythisch') || 0);
        const aetherCount = Math.max(0, getDiscoveredCountByRarity('Aetherisch') || 0);
        const payload = {
          totalXP: Number(playerXP || 0),
          mythicsFound: Number(mythCount || 0),
          aethericsFound: Number(aetherCount || 0),
          totalBoxesOpened: Number((stats && stats.totalBoxesOpened) || 0),
        };
        await window.firebaseApi.updateStats(payload);
        const resEl = document.getElementById('syncResult');
        if (resEl) { resEl.textContent = '✔ Server synchronisiert'; resEl.style.color = '#2ecc71'; setTimeout(()=>{ resEl.textContent=''; }, 3000); }
      }
    } catch (err) {
      const resEl = document.getElementById('syncResult');
      if (resEl) { resEl.textContent = 'Fehler beim Sync'; resEl.style.color = '#e74c3c'; setTimeout(()=>{ resEl.textContent=''; }, 3000); }
      console.warn('Manual sync failed', err);
    }
  }
});

// ======= App-Version laden und anzeigen + Update-Checker =======
(function setupVersioning() {
  const VERSION_URL = 'version.json';
  const POLL_MS = 90000; // 90s
  let currentVersion = null;
  let bannerShownFor = null;

  function setVersionBadge(ver) {
    try {
      const el = document.querySelector('.app-version-inline');
      if (el && ver) {
        el.textContent = 'v' + ver;
        el.setAttribute('aria-label', 'Version ' + ver);
      }
    } catch (_) { /* ignore */ }
  }

  async function fetchVersionNoStore() {
    try {
      const res = await fetch(VERSION_URL, { cache: 'no-store' });
      if (!res.ok) return null;
      const data = await res.json();
      return (data && (data.version || data.appVersion || data.v)) || null;
    } catch (_) {
      return null;
    }
  }

  function ensureUpdateBanner(newVer) {
    if (bannerShownFor && bannerShownFor === newVer) return; // schon gezeigt
    let banner = document.getElementById('updateBanner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'updateBanner';
      banner.innerHTML = `
        <div class="ub-inner">
          <span class="ub-text">Neue Version verfügbar</span>
          <button class="ub-reload" type="button" aria-label="Neu laden">Neu laden</button>
        </div>`;
      document.body.appendChild(banner);
      const btn = banner.querySelector('.ub-reload');
      if (btn) btn.addEventListener('click', () => {
        // Einfacher Reload – Loader hängt ?v=<version> an und lädt frisch
        location.reload();
      });
    }
    const text = banner.querySelector('.ub-text');
    if (text && newVer) text.textContent = `Neue Version v${newVer} verfügbar`;
    banner.style.display = 'block';
    bannerShownFor = newVer || 'unknown';
  }

  async function init() {
    const ver = await fetchVersionNoStore();
    if (ver) {
      currentVersion = ver;
      try { window.__appVersion = ver; } catch (_) {}
      setVersionBadge(ver);
      
      // Sofort prüfen ob Update nötig (bei Seitenladung)
      if (APP_VERSION && ver !== APP_VERSION) {
        console.log(`Version mismatch: Client=${APP_VERSION}, Server=${ver}`);
        ensureUpdateBanner(ver);
      }
    }
    // Poll auf neue Version
    setInterval(async () => {
      const latest = await fetchVersionNoStore();
      if (!latest) return;
      if (!currentVersion) {
        currentVersion = latest;
        setVersionBadge(latest);
        return;
      }
      if (latest !== currentVersion) {
        ensureUpdateBanner(latest);
      }
    }, POLL_MS);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

// ======= Sound Control UI =======
(function initSoundControls() {
  const soundBtn = document.getElementById('soundBtn');
  const volumeSlider = document.getElementById('volumeSlider');
  const volumeRange = document.getElementById('volumeRange');
  const volumePercent = document.getElementById('volumePercent');

  if (!soundBtn || !volumeSlider || !volumeRange || !volumePercent) {
    console.warn('Sound-Control-Elemente nicht gefunden');
    return;
  }

  // Lade gespeicherte Settings
  loadSoundSettings();

  // Aktualisiere UI basierend auf gespeicherten Werten
  function updateSoundUI() {
    // Button-Icon und Klasse
    if (isMuted) {
      soundBtn.textContent = '🔇';
      soundBtn.classList.add('muted');
      soundBtn.title = 'Sound an';
    } else {
      soundBtn.textContent = '🔊';
      soundBtn.classList.remove('muted');
      soundBtn.title = 'Sound aus';
    }
    
    // Slider-Wert
    const volumePercValue = Math.round(globalVolume * 100);
    volumeRange.value = volumePercValue;
    volumePercent.textContent = `${volumePercValue}%`;
    
    // Slider-Gradient (visuell zeigen wo der Wert ist)
    const percentage = volumePercValue;
    volumeRange.style.background = `linear-gradient(to right, #4CAF50 0%, #4CAF50 ${percentage}%, #333 ${percentage}%, #333 100%)`;
    
    // Sound-Lautstärke aktualisieren
    updateSoundVolume();
  }

  // Initiales UI-Update
  updateSoundUI();

  // Mute/Unmute beim Klick auf Button
  soundBtn.addEventListener('click', () => {
    isMuted = !isMuted;
    updateSoundUI();
    saveSoundSettings();
  });

  // Slider anzeigen beim Hover über den Sound-Button
  soundBtn.addEventListener('mouseenter', () => {
    volumeSlider.style.display = 'flex';
  });

  // Slider verstecken, wenn Maus beide Elemente verlässt
  const hideSliderTimeout = { id: null };
  
  function scheduleHideSlider() {
    clearTimeout(hideSliderTimeout.id);
    hideSliderTimeout.id = setTimeout(() => {
      volumeSlider.style.display = 'none';
    }, 300);
  }

  function cancelHideSlider() {
    clearTimeout(hideSliderTimeout.id);
  }

  soundBtn.addEventListener('mouseleave', scheduleHideSlider);
  volumeSlider.addEventListener('mouseenter', cancelHideSlider);
  volumeSlider.addEventListener('mouseleave', scheduleHideSlider);

  // Lautstärke-Änderung
  volumeRange.addEventListener('input', (e) => {
    const value = parseInt(e.target.value) || 0;
    globalVolume = value / 100;
    updateSoundUI();
    saveSoundSettings();
  });

  // Optional: bei Klick auf den Slider auch unmute
  volumeRange.addEventListener('mousedown', () => {
    if (isMuted) {
      isMuted = false;
      updateSoundUI();
      saveSoundSettings();
    }
  });
})();

// ======= Auto-Clicker System =======
let autoClickerInterval = null;
let autoClickerLastOpen = 0; // Zeitstempel der letzten Öffnung

function startAutoClicker() {
  if (autoClickerInterval) return; // Bereits aktiv
  if (!autoClickerEnabled) return; // User hat deaktiviert
  
  autoClickerInterval = setInterval(() => {
    const hasAutoClicker = (permanentUpgrades.permAutoClicker || 0) >= 1;
    if (!hasAutoClicker || !autoClickerEnabled || !autoClickerCanRun) {
      // Stoppe nicht sofort, nur pausieren wenn canRun false
      if (!hasAutoClicker || !autoClickerEnabled) {
        stopAutoClicker();
      }
      return;
    }
    
    // Blockiere Auto-Clicker während Prestige läuft
    if (isPrestiging) {
      return;
    }
    
    // Prüfe ob genug Zeit seit letzter Öffnung vergangen ist (abhängig von Speed-Upgrade)
    const now = Date.now();
    const requiredDelay = autoClickerSpeed * 1000; // 3s, 2s oder 1s
    const elapsed = now - autoClickerLastOpen;
    if (elapsed < requiredDelay) {
      return; // Noch in Wartezeit
    }
    
    // Nur öffnen wenn nicht bereits eine Öffnung läuft
    if (!isOpening && dom.openBtn && !dom.openBtn.disabled) {
      // Prüfe ob Ressourcen vorhanden sind (Geld oder Schlüssel)
      const isKR = isKeyRoom(boxType);
      
      // Wenn im Key-Mode: Prüfe Schlüssel, sonst Geld
      if (isKR) {
        // Extrahiere Rarität aus KeyRoom_XXX
        const rarity = boxType.replace('KeyRoom_', '');
        const hasKey = rarity && keysInventory[rarity] > 0;
        
        if (hasKey) {
          dom.openBtn.click();
        } else {
          // Keine Schlüssel mehr -> Auto-Clicker pausieren
          autoClickerCanRun = false;
          return;
        }
      } else {
        const cost = boxConfigs[boxType]?.cost || 0;
        if (balance >= cost) {
          dom.openBtn.click();
        } else {
          // Kein Geld mehr -> Auto-Clicker pausieren und auf manuellen Input warten
          autoClickerCanRun = false;
          return;
        }
      }
    }
  }, 500); // Prüfe alle 500ms (reagiert schneller, aber öffnet nur nach 3s Pause)
}

function stopAutoClicker() {
  if (autoClickerInterval) {
    clearInterval(autoClickerInterval);
    autoClickerInterval = null;
  }
}

function toggleAutoClicker() {
  const hasSpeed1 = (permanentUpgrades.permAutoClickerSpeed1 || 0) >= 1;
  const hasSpeed2 = (permanentUpgrades.permAutoClickerSpeed2 || 0) >= 1;
  
  // Cycle: AUS -> 3s -> 2s (if owned) -> 1s (if owned) -> AUS
  if (!autoClickerEnabled) {
    // AUS -> 3s AN
    autoClickerEnabled = true;
    autoClickerSpeed = 3;
  } else if (autoClickerEnabled && autoClickerSpeed === 3) {
    // Von 3s weiter
    if (hasSpeed1) {
      autoClickerSpeed = 2; // 3s -> 2s
    } else {
      // Keine weiteren Upgrades -> zurück zu AUS
      autoClickerEnabled = false;
      autoClickerSpeed = 3;
      autoClickerCanRun = false;
    }
  } else if (autoClickerEnabled && autoClickerSpeed === 2) {
    // Von 2s weiter
    if (hasSpeed2) {
      autoClickerSpeed = 1; // 2s -> 1s
    } else {
      // Kein Speed2 -> zurück zu AUS
      autoClickerEnabled = false;
      autoClickerSpeed = 3;
      autoClickerCanRun = false;
    }
  } else if (autoClickerEnabled && autoClickerSpeed === 1) {
    // Von 1s -> AUS
    autoClickerEnabled = false;
    autoClickerSpeed = 3;
    autoClickerCanRun = false;
  }
  
  saveAutoClickerState();
  updateAutoClickerUI();
  
  // Kurz "BEREIT" anzeigen wenn aktiviert
  if (autoClickerEnabled) {
    const statusSpan = document.getElementById('autoClickerStatus');
    if (statusSpan) {
      statusSpan.textContent = 'BEREIT';
      setTimeout(() => {
        if (autoClickerEnabled) {
          statusSpan.textContent = `${autoClickerSpeed}s`;
        }
      }, 800);
    }
    // Erlaubt sofortiges Öffnen nach manueller Aktivierung (wenn delay erfüllt)
    if (autoClickerCanRun) {
      autoClickerLastOpen = Date.now() - (autoClickerSpeed * 1000);
    }
    checkAutoClicker(); // Intervall starten
  } else {
    stopAutoClicker();
  }
}

function updateAutoClickerUI() {
  const toggleBtn = document.getElementById('autoClickerToggle');
  const statusSpan = document.getElementById('autoClickerStatus');
  const hasAutoClicker = (permanentUpgrades.permAutoClicker || 0) >= 1;
  
  if (!toggleBtn) return;
  
  // Toggle class on open button for cut-off style
  if (dom.openBtn) {
    if (hasAutoClicker) {
      dom.openBtn.classList.add('has-autoclicker');
    } else {
      dom.openBtn.classList.remove('has-autoclicker');
    }
  }
  
  // Button nur anzeigen wenn Upgrade gekauft
  if (hasAutoClicker) {
    toggleBtn.style.display = '';
    if (statusSpan) {
      statusSpan.textContent = autoClickerEnabled ? `${autoClickerSpeed}s` : 'AUS';
    }
    // Dynamische Farben: Matching gradient (AN) / Gedimmt (AUS)
    if (autoClickerEnabled) {
      toggleBtn.style.background = 'linear-gradient(135deg, #2ecc71 0%, #27ae60 100%)';
      toggleBtn.style.borderColor = '#27ae60';
      toggleBtn.style.boxShadow = '0 4px 15px rgba(46, 204, 113, 0.4), inset 0 -3px 10px rgba(0,0,0,0.2)';
      toggleBtn.style.opacity = '1';
    } else {
      toggleBtn.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
      toggleBtn.style.borderColor = '#9f7aea';
      toggleBtn.style.boxShadow = '0 4px 15px rgba(102, 126, 234, 0.4), inset 0 -3px 10px rgba(0,0,0,0.2)';
      toggleBtn.style.opacity = '0.7';
    }
  } else {
    toggleBtn.style.display = 'none';
  }
}

function saveAutoClickerState() {
  try {
    localStorage.setItem('autoClickerEnabled', JSON.stringify(autoClickerEnabled));
    localStorage.setItem('autoClickerSpeed', JSON.stringify(autoClickerSpeed));
  } catch (e) {
    console.warn('Failed to save auto-clicker state', e);
  }
}

function loadAutoClickerState() {
  try {
    const savedEnabled = localStorage.getItem('autoClickerEnabled');
    if (savedEnabled !== null) {
      autoClickerEnabled = JSON.parse(savedEnabled);
    }
    const savedSpeed = localStorage.getItem('autoClickerSpeed');
    if (savedSpeed !== null) {
      autoClickerSpeed = JSON.parse(savedSpeed);
    }
  } catch (e) {
    console.warn('Failed to load auto-clicker state', e);
  }
}

// Auto-Clicker starten wenn Upgrade gekauft
function checkAutoClicker() {
  const hasAutoClicker = (permanentUpgrades.permAutoClicker || 0) >= 1;
  updateAutoClickerUI();
  
  if (hasAutoClicker && autoClickerEnabled) {
    startAutoClicker();
  } else {
    stopAutoClicker();
  }
}

// Toggle-Button Event Listener
setTimeout(() => {
  const toggleBtn = document.getElementById('autoClickerToggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', toggleAutoClicker);
  }
}, 100);

// Load state und initial check nach Laden
loadAutoClickerState();
setTimeout(checkAutoClicker, 1000);

// ======= Background-System =======
function applyBackground(bgKey) {
  const bg = backgrounds[bgKey];
  
  if (bgKey === 'custom') {
    // Custom Color
    const customColor = localStorage.getItem('customBackgroundColor') || '#1a1a1a';
    document.body.style.background = customColor;
    activeBackground = 'custom';
    localStorage.setItem('activeBackground', 'custom');
    return;
  }
  
  if (!bg) return;
  
  if (bg.type === 'image') {
    // Bild als Hintergrund - cover stellt sicher, dass das Bild immer den gesamten Bereich abdeckt
    document.body.style.background = `url('${bg.value}') center/cover no-repeat fixed`;
    document.body.style.backgroundColor = bg.fallbackColor || '#1a1a2e';
  } else if (bg.type === 'solid') {
    // Einfarbiger Hintergrund
    document.body.style.background = bg.value;
  } else {
    // Gradient als Hintergrund
    document.body.style.background = bg.value;
  }
  
  activeBackground = bgKey;
  localStorage.setItem('activeBackground', bgKey);
}

function checkBackgroundUnlocks() {
  const prestige = prestigeState.level || 0;
  const mythicCount = stats.lifetimeDiscovered?.Mythisch || 0;
  const aethericCount = stats.lifetimeDiscovered?.Aetherisch || 0;
  const activeEvent = getActiveSeasonalEvent();
  
  for (const [key, bg] of Object.entries(backgrounds)) {
    if (bg.unlocked || unlockedBackgrounds.has(key)) {
      unlockedBackgrounds.add(key);
      continue;
    }
    
    // Prüfe Unlock-Bedingungen
    let unlocked = false;
    if (bg.unlockCondition) {
      if (bg.unlockCondition.startsWith('prestige')) {
        const required = parseInt(bg.unlockCondition.replace('prestige', ''));
        unlocked = prestige >= required;
      } else if (bg.unlockCondition.startsWith('mythic')) {
        const required = parseInt(bg.unlockCondition.replace('mythic', ''));
        unlocked = mythicCount >= required;
      } else if (bg.unlockCondition.startsWith('aetheric')) {
        const required = parseInt(bg.unlockCondition.replace('aetheric', ''));
        unlocked = aethericCount >= required;
      } else if (bg.unlockCondition.startsWith('seasonal_')) {
        // Saisonale Hintergründe - freigeschaltet wenn Event aktiv ist
        const eventKey = bg.unlockCondition.replace('seasonal_', '');
        unlocked = activeEvent && seasonalItems[eventKey] !== undefined;
      }
    }
    
    if (unlocked && !unlockedBackgrounds.has(key)) {
      unlockedBackgrounds.add(key);
      // Optional: Notification anzeigen
      console.log(`🎨 Neuer Hintergrund freigeschaltet: ${bg.name}`);
    }
  }
}

function openBackgroundSelector() {
  checkBackgroundUnlocks(); // Prüfe Unlocks
  
  let modal = document.getElementById('backgroundModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'backgroundModal';
    modal.className = 'info-modal';
    modal.innerHTML = `
      <div class="info-content">
        <button class="info-close" aria-label="Schließen">✖</button>
        <h3>🎨 Hintergrund wählen</h3>
        <div id="backgroundGrid"></div>
      </div>
    `;
    document.body.appendChild(modal);
    
    modal.querySelector('.info-close').addEventListener('click', () => {
      modal.style.display = 'none';
    });
    
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.style.display = 'none';
    });
  }
  
  // Erstelle Grid
  const grid = modal.querySelector('#backgroundGrid');
  grid.innerHTML = '';
  grid.style.cssText = 'display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 15px; margin-top: 15px;';
  
  // Custom Color Picker Card hinzufügen
  const customCard = document.createElement('div');
  const currentCustomColor = localStorage.getItem('customBackgroundColor') || '#1a1a1a';
  const isCustomActive = activeBackground === 'custom';
  
  customCard.style.cssText = `
    background: ${currentCustomColor};
    border: 3px solid ${isCustomActive ? '#ffd700' : '#444'};
    border-radius: 10px;
    padding: 15px;
    cursor: pointer;
    transition: all 0.3s;
    position: relative;
    min-height: 120px;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
  `;
  
  customCard.innerHTML = `
    <div style="background: rgba(0,0,0,0.7); padding: 8px; border-radius: 5px;">
      <div style="font-weight: bold; margin-bottom: 3px;">Eigene Farbe${isCustomActive ? ' ✓' : ''}</div>
      <div style="font-size: 0.85em; opacity: 0.9;">Wähle deine Farbe</div>
      <input type="color" id="customColorPicker" value="${currentCustomColor}" 
             style="width: 100%; height: 30px; margin-top: 8px; cursor: pointer; border: 2px solid #666; border-radius: 5px;">
    </div>
  `;
  
  customCard.addEventListener('mouseenter', () => {
    if (!isCustomActive) customCard.style.border = '3px solid #888';
  });
  
  customCard.addEventListener('mouseleave', () => {
    if (!isCustomActive) customCard.style.border = '3px solid #444';
  });
  
  const colorPicker = customCard.querySelector('#customColorPicker');
  colorPicker.addEventListener('click', (e) => {
    e.stopPropagation(); // Verhindert Card-Click
  });
  
  colorPicker.addEventListener('input', (e) => {
    const color = e.target.value;
    customCard.style.background = color;
    localStorage.setItem('customBackgroundColor', color);
  });
  
  colorPicker.addEventListener('change', (e) => {
    const color = e.target.value;
    document.body.style.background = color;
    activeBackground = 'custom';
    localStorage.setItem('activeBackground', 'custom');
    localStorage.setItem('customBackgroundColor', color);
    openBackgroundSelector(); // Refresh
  });
  
  customCard.addEventListener('click', (e) => {
    if (e.target !== colorPicker) {
      document.body.style.background = currentCustomColor;
      activeBackground = 'custom';
      localStorage.setItem('activeBackground', 'custom');
      openBackgroundSelector(); // Refresh
    }
  });
  
  grid.appendChild(customCard);
  
  for (const [key, bg] of Object.entries(backgrounds)) {
    // Saisonale Hintergründe nur während des Events anzeigen
    if (bg.seasonal) {
      const activeEvent = getActiveSeasonalEvent();
      const isEventActive = activeEvent && bg.event && seasonalItems[bg.event];
      if (!isEventActive) {
        continue; // Überspringe saisonale Hintergründe wenn Event nicht aktiv
      }
    }
    
    const isUnlocked = bg.unlocked || unlockedBackgrounds.has(key);
    const isActive = activeBackground === key;
    
    const card = document.createElement('div');
    // Gesperrte Hintergründe zeigen nur schwarzen Hintergrund mit Fragezeichen-Muster
    const cardBackground = isUnlocked 
      ? (bg.type === 'image' 
          ? `${bg.fallbackColor || '#1a1a1a'} url('${bg.value}') center/cover no-repeat`
          : bg.value)
      : 'linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)';
    
    card.style.cssText = `
      background: ${cardBackground};
      border: 3px solid ${isActive ? '#ffd700' : (isUnlocked ? '#444' : '#222')};
      border-radius: 10px;
      padding: 15px;
      cursor: ${isUnlocked ? 'pointer' : 'not-allowed'};
      transition: all 0.3s;
      position: relative;
      min-height: 120px;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
    `;
    
    // Saisonaler Indikator (Schneeflocke für Weihnachten)
    const seasonalIcon = bg.seasonal ? `<div style="position: absolute; top: 8px; right: 8px; font-size: 24px;">❄️</div>` : '';
    
    // Gesperrte Hintergründe zeigen Fragezeichen-Icon
    const lockedOverlay = !isUnlocked ? `<div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size: 48px; opacity: 0.3;">🔒</div>` : '';
    
    // Fortschrittsanzeige für gesperrte Hintergründe
    let progressBar = '';
    if (!isUnlocked && bg.unlockCondition) {
      let current = 0;
      let required = 0;
      let label = '';
      
      if (bg.unlockCondition.startsWith('prestige')) {
        required = parseInt(bg.unlockCondition.replace('prestige', ''));
        current = prestigeState.level || 0;
        label = 'Prestige';
      } else if (bg.unlockCondition.startsWith('mythic')) {
        required = parseInt(bg.unlockCondition.replace('mythic', ''));
        current = stats.lifetimeDiscovered?.Mythisch || 0;
        label = 'Mythische Items';
      } else if (bg.unlockCondition.startsWith('aetheric')) {
        required = parseInt(bg.unlockCondition.replace('aetheric', ''));
        current = stats.lifetimeDiscovered?.Aetherisch || 0;
        label = 'Ätherische Items';
      }
      
      if (required > 0) {
        const percentage = Math.min(100, Math.floor((current / required) * 100));
        progressBar = `
          <div style="margin-top: 8px;">
            <div style="font-size: 0.75em; margin-bottom: 3px; color: #aaa;">${current}/${required} ${label}</div>
            <div style="background: rgba(0,0,0,0.5); border-radius: 10px; height: 6px; overflow: hidden;">
              <div style="background: linear-gradient(90deg, #4a90e2, #50c878); width: ${percentage}%; height: 100%; border-radius: 10px; transition: width 0.3s;"></div>
            </div>
          </div>
        `;
      }
    }
    
    card.innerHTML = `
      ${seasonalIcon}
      ${lockedOverlay}
      <div style="background: rgba(0,0,0,0.7); padding: 8px; border-radius: 5px;">
        <div style="font-weight: bold; margin-bottom: 3px;">${bg.name}${isActive ? ' ✓' : ''}</div>
        <div style="font-size: 0.85em; opacity: 0.9;">${bg.description}</div>
        ${!isUnlocked ? `<div style="font-size: 0.8em; color: #ff6b6b; margin-top: 5px;">🔒 ${getUnlockText(bg.unlockCondition)}</div>` : ''}
        ${progressBar}
      </div>
    `;
    
    if (isUnlocked) {
      card.addEventListener('click', () => {
        applyBackground(key);
        openBackgroundSelector(); // Refresh
      });
      
      card.addEventListener('mouseenter', () => {
        if (!isActive) card.style.border = '3px solid #888';
      });
      
      card.addEventListener('mouseleave', () => {
        if (!isActive) card.style.border = '3px solid #444';
      });
    }
    
    grid.appendChild(card);
  }
  
  modal.style.display = 'block';
}

function getUnlockText(condition) {
  if (!condition) return 'Gesperrt';
  if (condition.startsWith('prestige')) {
    const num = condition.replace('prestige', '');
    return `Prestige ${num}+`;
  }
  if (condition.startsWith('mythic')) {
    const num = condition.replace('mythic', '');
    return `${num} Mythische Items`;
  }
  if (condition.startsWith('aetheric')) {
    const num = condition.replace('aetheric', '');
    return `${num} Ätherische Items`;
  }
  if (condition.startsWith('seasonal_')) {
    const eventKey = condition.replace('seasonal_', '');
    const event = seasonalItems[eventKey];
    if (event) {
      return `Nur während ${event.name}`;
    }
  }
  return 'Gesperrt';
}

// Initial Background laden
setTimeout(() => {
  const saved = localStorage.getItem('activeBackground');
  const activeEvent = getActiveSeasonalEvent();
  
  // Prüfe ob ein saisonales Event aktiv ist und ob der Nutzer das erste Mal lädt
  const hasSeenSeasonalBackground = localStorage.getItem('hasSeenSeasonalBackground_christmas');
  
  // Prüfe ob aktueller Hintergrund saisonal ist und Event nicht aktiv
  if (saved && backgrounds[saved]) {
    const savedBg = backgrounds[saved];
    if (savedBg.seasonal) {
      const isEventActive = activeEvent && savedBg.event && seasonalItems[savedBg.event];
      if (!isEventActive) {
        // Event nicht mehr aktiv - wechsle zu Standard
        applyBackground('default');
        checkBackgroundUnlocks();
        return;
      }
    }
  }
  
  if (activeEvent && activeEvent.name === 'Weihnachten' && !hasSeenSeasonalBackground) {
    // Erstes Mal während Weihnachten - wähle Schneehintergrund automatisch
    checkBackgroundUnlocks();
    if (unlockedBackgrounds.has('christmas') || backgrounds.christmas.unlocked) {
      applyBackground('christmas');
      localStorage.setItem('hasSeenSeasonalBackground_christmas', 'true');
    } else if (saved && backgrounds[saved]) {
      applyBackground(saved);
    } else {
      applyBackground('default');
    }
  } else if (saved && backgrounds[saved]) {
    applyBackground(saved);
  } else {
    applyBackground('default');
  }
  
  // Prüfe Unlocks initial
  checkBackgroundUnlocks();
}, 100);

// Saisonales Logo-System
function updateSeasonalLogo() {
  const logo = document.getElementById('gameLogo');
  if (!logo) return;
  
  const activeEvent = getActiveSeasonalEvent();
  
  if (activeEvent && activeEvent.name === 'Weihnachten') {
    logo.src = "Logo's/Logo Weihnachten.png";
  } else {
    logo.src = "Logo's/Logo.png";
  }
}

// Logo beim Laden aktualisieren
setTimeout(updateSeasonalLogo, 50);

// Force sync before page unload
window.addEventListener('beforeunload', () => {
  // Force immediate sync (ignore cooldown)
  lastFirebaseSync = 0;
  clearTimeout(saveProgressTimeout);
  
  try {
    const progress = {
      balance,
      playerLevel,
      playerXP,
      totalXPEarned,
      skillPoints,
      skills: { ...skills },
      boxType,
      unlockedBoxes: Array.from(unlockedBoxes),
      stats: { ...stats },
      achievementsState: { ...achievementsState },
      activeBoosts: { ...activeBoosts },
      permanentUpgrades: { ...permanentUpgrades },
      purchasedItems: Array.from(purchasedItems),
      statUpgradesLevels: { ...statUpgradesLevels },
      keysInventory: { ...keysInventory },
      prestigeState: { ...prestigeState }
    };
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
    syncToFirebase(progress);
  } catch (e) {
    console.warn('Failed to save on unload', e);
  }
});

// (Export/Import entfernt)

