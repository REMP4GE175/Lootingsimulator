// ======= Zustandsvariablen =======
// Items, die der Spieler bereits entdeckt hat
const discoveredItems = new Set();
// Items, die in der letzten Öffnung gezogen wurden (für Hervorhebung in Sammlung)
let lastPulledItems = new Set();

// Reihenfolge der Raritäten (wird beim Ziehen verwendet)
const rarities = ["Common", "Rare", "Epic", "Legendary", "Mythisch"];

// Farbdefinitionen pro Rarität (RGBA für einfache CSS-Nutzung)
const colors = {
  Common: "rgba(204, 204, 204, 1)",
  Rare: "rgba(74, 144, 226, 1)",
  Epic: "rgba(155, 89, 182, 1)",
  Legendary: "rgba(241, 196, 15, 1)",
  Mythisch: "rgba(231, 76, 60, 1)"
};

// Glow-Stärken pro Rarität (0.0 - 1.0). Wird als CSS-Variable --glow-opacity auf das Item gesetzt.
const glowStrength = {
  Common: 0.20,
  Rare: 0.40,
  Epic: 0.60,
  Legendary: 0.80,
  Mythisch: 1.00
};

// ======= Level & Skill System =======
let playerLevel = 1;
let playerXP = 0;
let skillPoints = 0;

// Skill-Tree: 3 Zweige mit jeweils maximal 20/20/10 Punkten
const skills = {
  wohlstand: 0,   // Jeder Punkt: +5% Item-Wert (max 20 = +100%)
  glueck: 0,      // Jeder Punkt: erhöht Chancen auf seltene Items (max 20)
  effizienz: 0    // Jeder Punkt: -5% Untersuchungszeit (max 10 = -50%)
};

// ======= Statistik-Tracking =======
const stats = {
  totalBoxesOpened: 0,
  totalItemsPulled: 0,
  totalGoldEarned: 0,
  mostValuableItem: { name: '', value: 0, rarity: '' },
  boxOpenCounts: {
    'Box#1': 0, 'Box#2': 0, 'Box#3': 0, 'Box#4': 0,
    'Box#5': 0, 'Box#6': 0, 'Box#7': 0
  }
};

// Titel-System: Level → Titel
const titles = [
  { level: 1, title: "Anfänger" },
  { level: 5, title: "Sammler" },
  { level: 10, title: "Schatzsucher" },
  { level: 15, title: "Glücksritter" },
  { level: 20, title: "Veteran" },
  { level: 25, title: "Meister" },
  { level: 30, title: "Champion" },
  { level: 40, title: "Legende" },
  { level: 50, title: "Bäutebaron" }
];

// Berechnet benötigte XP für nächstes Level (exponentielle Kurve)
function getXPForLevel(level) {
  // Stretched XP curve: higher base and exponent for slower early levels
  return Math.floor(800 * Math.pow(1.22, level - 1));
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
    { name: "Rusty Coin", icon: "rusty coin.png", value: 15, description: "Ein alter, wertloser Münzfund." },
    { name: "Holzbrett", icon: "broken_stick.png", value: 20, description: "Nicht mal als Waffe zu gebrauchen." },
  { name: "benutztes Taschentuch", icon: "common_1.png", value: 18, description: "Ein gebrauchtes Stück Stoff." },
    { name: "Streichhölzer", icon: "common_1.png", value: 25, description: "Beschreibung Common_1." },
    { name: "bottle cap", icon: "common_1.png", value: 22, description: "Beschreibung Common_1." },
    { name: "fischgräte", icon: "gräte.png", value: 30, description: "Beschreibung Common_1." },
    { name: "Eichel", icon: "common_1.png", value: 28, description: "Beschreibung Common_1." },
    { name: "Göffel", icon: "common_1.png", value: 35, description: "Beschreibung Common_1." },
  // Falls ein Item keinen Namen hat, verwenden wir einen Platzhalter.
  { name: "Unbekannter Gegenstand", icon: "common_1.png", value: 40, description: "Ein unbekannter Fund." },
    { name: "Dennis", icon: "Dennis.png", value: 32, description: "Beschreibung Common_1." }

  ],
  Rare: [
    { name: "Silver Ring", icon: "silver_ring.png", value: 120, description: "Ein hübscher Ring mit leichtem Glanz." },
    { name: "Traveler's Map", icon: "map.png", value: 250, description: "Zeigt vergessene Wege." }
  ],
  Epic: [
    { name: "Enchanted Scroll", icon: "scroll.png", value: 600, description: "Ein Zauber, der nur einmal wirkt." },
    { name: "Phoenix Feather", icon: "feather.png", value: 1200, description: "Glüht leicht in deiner Hand." }
  ],
  Legendary: [
    { name: "Dragon Scale", icon: "dragon_scale.png", value: 6000, description: "Unzerstörbar und selten." },
    { name: "Celestial Orb", icon: "orb.png", value: 12000, description: "Ein Relikt aus einer anderen Welt." }
  ],
  Mythisch: [
    { name: "Mystic Blade", icon: "mystic_blade.png", value: 80000, description: "Eine legendäre Klinge mit uralter Macht." },
    { name: "Time Crystal", icon: "time_crystal.png", value: 250000, description: "Manipuliert die Zeit für einen Moment." }
  ]
};

// Box-Typen mit Qualität (Wahrscheinlichkeiten in Prozent)
const boxConfigs = {
  "Box#1": {
    cost: 0,
    columns: 2,
    rows: 2,
    weights: {
      Common: 85,
      Rare: 12,
      Epic: 2.5,
      Legendary: 0.49,
      Mythisch: 0.01
    }
  },
  "Box#2": {
    cost: 1000,
    columns: 3,
    rows: 2,
    weights: {
      Common: 60,
      Rare: 28,
      Epic: 10,
      Legendary: 1.99,
      Mythisch: 0.01
    }
  },
  "Box#3": {
    cost: 10000,
    columns: 4,
    rows: 2,
    weights: {
      Common: 30,
      Rare: 35,
      Epic: 30,
      Legendary: 4.98,
      Mythisch: 0.02
    }
  },
  "Box#4": {
    cost: 100000,
    columns: 4,
    rows: 3,
    weights: {
      Common: 5,
      Rare: 25,
      Epic: 55,
      Legendary: 14.75,
      Mythisch: 0.25
    }
  },
  "Box#5": {
    cost: 250000,
    columns: 5,
    rows: 3,
    weights: {
      Common: 0,
      Rare: 10,
      Epic: 50,
      Legendary: 39,
      Mythisch: 1
    }
  },
  "Box#6": {
    cost: 500000,
    columns: 6,
    rows: 3,
    weights: {
      Common: 0,
      Rare: 0,
      Epic: 40,
      Legendary: 58,
      Mythisch: 2
    }
  },
  "Box#7": {
    cost: 1000000,
    columns: 6,
    rows: 4,
    weights: {
      Common: 0,
      Rare: 0,
      Epic: 25,
      Legendary: 70,
      Mythisch: 5
    }
  }
};

// Konstanten
const SLOT_SIZE_PX = 100;

// Aktueller gewählter Box-Typ und Kontostand
let boxType = "Box#1";
let balance = 5000000;
// Öffnungszustand, um Layout-Jumps beim Box-Wechsel während des Öffnens zu vermeiden
let isOpening = false;
let pendingBoxType = null; // gewünschter Box-Wechsel, der nach Öffnung angewendet wird

// Box-Reihenfolge für Progression
const boxOrder = ["Box#1", "Box#2", "Box#3", "Box#4", "Box#5", "Box#6", "Box#7"];

// Anzeigenamen für die Boxen
const boxDisplayNames = {
  "Box#1": "Schublade",
  "Box#2": "Sporttasche",
  "Box#3": "Koffer",
  "Box#4": "Holzkiste",
  "Box#5": "Militärkoffer",
  "Box#6": "Safe",
  "Box#7": "Tresor"
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
    "Box#7": "🏦"
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
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toString();
}

// Tracking für freigeschaltete Boxen (Set speichert Namen der unlocked Boxen)
const unlockedBoxes = new Set(["Box#1"]); // Box#1 ist von Anfang an freigeschaltet

// ======= Hilfsfunktionen =======
// Kurze sleep-Funktion für Verzögerungen
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Liefert ein zufälliges Element aus einem Array
const sample = arr => arr[Math.floor(Math.random() * arr.length)];

// ======= Skill-System Hilfsfunktionen =======
// Berechnet den Wert-Multiplikator basierend auf Wohlstand-Skills
function getValueMultiplier() {
  return 1 + (skills.wohlstand * 0.05); // +5% pro Punkt
}

// Modifiziert die Drop-Gewichte basierend auf Glück-Skills
function applyLuckBonus(weights) {
  if (skills.glueck === 0) return weights;
  
  // Glück verschiebt Gewichte nach oben (seltenere Items werden wahrscheinlicher)
  const modifiedWeights = { ...weights };
  const luckBonus = skills.glueck * 0.5; // 0.5% shift pro Punkt
  
  // Verschiebe Gewicht von Common zu Rare, von Rare zu Epic, etc.
  if (modifiedWeights.Common > 0) {
    const shift = Math.min(modifiedWeights.Common, luckBonus * 2);
    modifiedWeights.Common -= shift;
    modifiedWeights.Rare = (modifiedWeights.Rare || 0) + shift;
  }
  if (modifiedWeights.Rare > 0) {
    const shift = Math.min(modifiedWeights.Rare, luckBonus * 1.5);
    modifiedWeights.Rare -= shift;
    modifiedWeights.Epic = (modifiedWeights.Epic || 0) + shift;
  }
  if (modifiedWeights.Epic > 0) {
    const shift = Math.min(modifiedWeights.Epic, luckBonus);
    modifiedWeights.Epic -= shift;
    modifiedWeights.Legendary = (modifiedWeights.Legendary || 0) + shift;
  }
  if (modifiedWeights.Legendary > 0) {
    const shift = Math.min(modifiedWeights.Legendary, luckBonus * 0.5);
    modifiedWeights.Legendary -= shift;
    modifiedWeights.Mythisch = (modifiedWeights.Mythisch || 0) + shift;
  }
  
  return modifiedWeights;
}

// Berechnet Tempo-Multiplikator für Animationen (reduziert Zeit)
function getTempoMultiplier() {
  return 1 - (skills.effizienz * 0.05); // -5% Zeit pro Punkt (max -50% bei 10 Punkten)
}

// 🎯 Item aus Pool basierend auf Rarität
// Wählt ein Item basierend auf den Gewichten der Raritäten aus.
// Diese Funktion skaliert korrekt, auch wenn die Gewichte nicht genau 100 ergeben.
function getRandomItem(boxType) {
  const baseWeights = boxConfigs[boxType].weights;
  const weights = applyLuckBonus(baseWeights); // Glück-Skill anwenden
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
      const pool = itemPools[rarity] || itemPools.Common;
      const item = sample(pool);
      // Item-Wert mit Wohlstand-Multiplikator anwenden
      const modifiedItem = { 
        ...item, 
        rarity,
        value: Math.floor(item.value * getValueMultiplier())
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
function getWeightedItemCount(boxType) {
  const columns = boxConfigs[boxType].columns || 4;
  const rows = boxConfigs[boxType].rows || 3;
  const totalSlots = columns * rows;
  
  // Bestimme Füllrate-Ziel basierend auf Box-Typ
  // Box 1-3: 70% Durchschnitt, Box 4-5: 60%, Box 6-7: 70%
  const boxNumber = parseInt(boxType.replace('Box#', ''));
  const targetFillRate = (boxNumber <= 3 || boxNumber >= 6) ? 0.7 : 0.6;
  
  // Normalverteilung um den Zielwert herum, begrenzt auf 20-100%
  // Verwende Box-Muller-Transformation für Normalverteilung
  const u1 = Math.random();
  const u2 = Math.random();
  const z0 = Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  
  // z0 ist normalverteilt mit mean=0, stddev=1
  // Skaliere auf mean=targetFillRate, stddev=15%
  let fillRate = targetFillRate + (z0 * 0.15);
  
  // Begrenze auf 20-100%
  fillRate = Math.max(0.2, Math.min(1.0, fillRate));
  
  // Berechne Anzahl Items
  const itemCount = Math.max(1, Math.floor(totalSlots * fillRate));
  
  return itemCount;
}

// Setzt den aktuellen Box-Typ (wird auch von HTML onclick benutzt)
function selectBox(type) {
  // Wenn gerade eine Öffnung läuft, wende den Wechsel nur visuell an
  // und verschiebe den tatsächlichen Box-Wechsel bis nach der Animation.
  if (isOpening) {
    // Visuelle Auswahl aktualisieren
    for (let i = 1; i <= 7; i++) {
      const btn = document.getElementById(`boxBtn${i}`);
      if (btn) btn.classList.remove('selected');
    }
    const boxNumberTemp = type.replace('Box#', '');
    const selectedBtnTemp = document.getElementById(`boxBtn${boxNumberTemp}`);
    if (selectedBtnTemp) selectedBtnTemp.classList.add('selected');
    // Merke gewünschte Box und beende hier
    pendingBoxType = type;
    return;
  }

  boxType = type;
  
  // Entferne "selected" Klasse von allen Buttons
  for (let i = 1; i <= 7; i++) {
    const btn = document.getElementById(`boxBtn${i}`);
    if (btn) btn.classList.remove('selected');
  }
  
  // Füge "selected" Klasse zum gewählten Button hinzu
  const boxNumber = type.replace('Box#', '');
  const selectedBtn = document.getElementById(`boxBtn${boxNumber}`);
  if (selectedBtn) selectedBtn.classList.add('selected');
  
  // Grid neu erstellen mit den Dimensionen der neuen Box
  createEmptyGrid();
  
  // Aktualisiere Info-Fenster, falls es offen ist
  if (dom.boxInfoModal && dom.boxInfoModal.style.display === 'block') {
    populateBoxInfo();
  }
}

// Exponiere selectBox global (vorerst kompatibel)
window.selectBox = selectBox;

// Wire box button clicks via JS (statt inline onclick)
for (let i = 1; i <= 7; i++) {
  const btn = document.getElementById(`boxBtn${i}`);
  if (btn) {
    btn.addEventListener('click', () => selectBox(`Box#${i}`));
  }
}

// Versucht, die Kosten für die aktuelle Box vom Guthaben abzuziehen.
// Gibt true zurück, wenn erfolgreich, ansonsten false.
function deductBalanceForBox() {
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
  upgradeEffizienz: document.getElementById('upgradeEffizienz')
};

// Aktiviert/Deaktiviert temporär die Box-Auswahl-Buttons
function setBoxSelectionEnabled(enabled) {
  for (let i = 1; i <= 7; i++) {
    const btn = document.getElementById(`boxBtn${i}`);
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

// ======= Item-Tracker (Persistenz) =======
const STORAGE_KEY = 'lootsim_itemCounts_v1';
// Objekt: { [itemName]: count }
let itemCounts = {};

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

// Load persisted counts on startup
loadCounts();

// Helper: Erzeugt Slots im Container und gibt Array zurück
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
  // Markiere, dass eine Öffnung läuft
  isOpening = true;
  // Button deaktivieren und ausgrauen
  dom.openBtn.disabled = true;
  dom.openBtn.style.opacity = '0.5';
  // Box-Auswahl temporär deaktivieren
  setBoxSelectionEnabled(false);

  if (!deductBalanceForBox()) {
    // Bei Fehler wieder aktivieren
    dom.openBtn.disabled = false;
    dom.openBtn.style.opacity = '1';
    setBoxSelectionEnabled(true);
    isOpening = false;
    return;
  }
  // Box-Konfiguration zum Start der Öffnung einfrieren
  const openBoxType = boxType;
  const columns = boxConfigs[openBoxType].columns || 4;
  const rows = boxConfigs[openBoxType].rows || 3;
  const totalSlots = columns * rows;
  const itemCount = getWeightedItemCount(openBoxType);
  let roundValue = 0;
  
  // Container leeren und Grid neu aufbauen
  dom.lootContainer.innerHTML = '';
  dom.lootContainer.style.gridTemplateColumns = `repeat(${columns}, ${SLOT_SIZE_PX}px)`;
  dom.lootContainer.style.gridTemplateRows = `repeat(${rows}, ${SLOT_SIZE_PX}px)`;
  
  // Overlay-Größe passend setzen und anzeigen
  dom.overlay.style.width = `${columns * SLOT_SIZE_PX}px`;
  dom.overlay.style.height = `${rows * SLOT_SIZE_PX}px`;
  dom.overlay.style.display = 'block';

  // Slots bauen (mit Helper)
  const slots = buildSlots(dom.lootContainer, totalSlots);

  await sleep(500);
  dom.overlay.style.display = 'none';

  // Ziehe Items für die ersten itemCount Slots
  const revealSlots = slots.slice(0, itemCount);
  const pulledNamesThisRound = new Set();

  // Statistiken aktualisieren
  stats.totalBoxesOpened++;
  stats.boxOpenCounts[openBoxType]++;
  stats.totalItemsPulled += itemCount;

  for (let i = 0; i < revealSlots.length; i++) {
    const { item } = revealSlots[i];
  const pulledItem = getRandomItem(openBoxType);
    const name = pulledItem.name || 'Unbekannter Gegenstand';
    const isNew = !discoveredItems.has(name);

    // Zustand updaten
  discoveredItems.add(name);
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
  // Kein Fragezeichen mehr: stattdessen sichtbares, gestreiftes Vorab-Feld
  item.classList.add('pre-reveal');
  item.style.border = '1px solid gray';

    revealSlots[i].pulledItem = pulledItem;
    revealSlots[i].isNew = isNew;
  }

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
      floatingLupe.style.zIndex = '150';
      
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
        floatingLupe.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
        floatingLupe._raf = requestAnimationFrame(orbit);
      }
      floatingLupe._raf = requestAnimationFrame(orbit);
    } catch (e) {
      console.warn('Floating lupe creation failed', e);
    }

    const baseDelay = 480; // Basis-Delay (0.3x für Testzwecke: 1600 * 0.3 = 480ms)
    await sleep(baseDelay * getTempoMultiplier()); // Mit Tempo-Skill anpassen

  // Entferne vorläufige Platzhalter-Anzeige und zeige stattdessen das Icon
  // Vorab-Klasse entfernen, dann Rarity-Farbe setzen
  item.classList.remove('pre-reveal');
  item.style.backgroundColor = colors[pulledItem.rarity] || '#999';
  // Inhalt leeren (sicherstellen)
  item.textContent = '';
    // Erzeuge Icon-Element für die Loot-Ansicht
    const iconImg = document.createElement('img');
    // Verwende den Projektordner Itembilder (gleich wie in Sammlung)
    iconImg.src = `Itembilder/${pulledItem.icon}`;
    iconImg.alt = pulledItem.name || '';
    // Fallback: eingebettetes SVG-Placeholder
    iconImg.onerror = () => {
      iconImg.onerror = null;
      iconImg.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='100%' height='100%' fill='%23444' /><text x='50%' y='50%' fill='white' font-size='32' text-anchor='middle' dominant-baseline='central'>?</text></svg>";
    };

    // keine Tooltip-Listener im Reveal-Flow (native title wurde entfernt)
    item.appendChild(iconImg);

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

    // kein sofortiger Tooltip-Check mehr

    roundValue += pulledItem.value || 0;
  }

  // Guthaben aktualisieren und UI zurücksetzen
  balance += roundValue;
  
  // Statistik: Gold tracken
  stats.totalGoldEarned += roundValue;
  
  // XP hinzufügen (Verkaufswert = XP)
  addXP(roundValue);
  
  updateBalance();
  
  // Button wieder aktivieren
  dom.openBtn.disabled = false;
  dom.openBtn.style.opacity = '1';
  // Box-Auswahl wieder aktivieren
  setBoxSelectionEnabled(true);

  // Öffnung ist beendet
  isOpening = false;

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
  
  // Level-Up prüfen
  let xpNeeded = getXPForLevel(playerLevel);
  while (playerXP >= xpNeeded) {
    playerXP -= xpNeeded;
    playerLevel++;
    skillPoints++;
    xpNeeded = getXPForLevel(playerLevel);
    
    // Level-Up Benachrichtigung
    showLevelUpNotification();
  }
  
  updateLevelUI();
  
  // Info-Modal aktualisieren falls geöffnet
  if (dom.boxInfoModal && dom.boxInfoModal.style.display === 'block') {
    populateBoxInfo();
  }
}

// Zeigt Level-Up Notification
function showLevelUpNotification() {
  const notification = document.createElement('div');
  notification.className = 'level-up-notification';
  notification.innerHTML = `
    <div class="level-up-content">
      <h2>🎉 Level Up!</h2>
      <p>Level ${playerLevel} erreicht!</p>
      <p class="level-up-title">Neuer Titel: ${getCurrentTitle()}</p>
      <p class="level-up-skill">+1 Skillpunkt verfügbar!</p>
    </div>
  `;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.classList.add('fade-out');
    setTimeout(() => notification.remove(), 500);
  }, 3000);
}

// Aktualisiert die Balance-Anzeige
function updateBalance() {
  dom.balance.textContent = `💰: ${formatNumber(balance)}`;
  updateBoxAvailability();
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
      
      // Anzeigename und Kosten
      const displayName = boxDisplayNames[boxName] || boxName;
      const costText = formatCost(boxCost);
      const icon = getBoxIcon(boxName);
      // Zeige Icon und Namen, bei Free ohne Geld-Emoji
      const newHTML = (boxCost === 0)
        ? `${icon} ${displayName} (${costText})`
        : `${icon} ${displayName} (${costText} 💰)`;
      
      // Nur innerHTML ändern, wenn es sich wirklich geändert hat (verhindert Layout thrash)
      if (btn.innerHTML !== newHTML) {
        btn.innerHTML = newHTML;
      }
    } else {
      // Box ist noch gesperrt (nur die nächste wird angezeigt)
      btn.classList.add('locked');
      btn.classList.remove('affordable');
      btn.disabled = true;
      // Zeige Schloss-Icon und Kosten auf gesperrten Buttons
      const newHTML = `🔒 ${formatCost(boxCost)} 💰`;
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

// Funktionen für Box-Info Modal
function computeRarityStats(forBoxType) {
  const baseWeights = (boxConfigs[forBoxType] && boxConfigs[forBoxType].weights) || {};
  const weights = applyLuckBonus(baseWeights); // Glück-Bonus einberechnen
  const total = rarities.reduce((s, r) => s + (weights[r] || 0), 0) || 0;
  const stats = rarities.map(rarity => {
    const w = weights[rarity] || 0;
    const chance = total > 0 ? (w / total) * 100 : 0;
    const pool = itemPools[rarity] || [];
    // Basis-Durchschnitt berechnen
    const baseAvgValue = pool.length ? Math.round(pool.reduce((a,b)=>a+(b.value||0),0)/pool.length) : 0;
    // Mit Wohlstand-Multiplikator anwenden
    const avgValue = Math.round(baseAvgValue * getValueMultiplier());
    return { rarity, weight: w, chance, avgValue, poolCount: pool.length };
  });
  return stats;
}

function populateBoxInfo() {
  const content = dom.boxInfoContent;
  if (!content) return;
  const stats = computeRarityStats(boxType);
  
  // Skill-Boni anzeigen
  const valueBonus = ((getValueMultiplier() - 1) * 100).toFixed(0);
  const tempoBonus = ((1 - getTempoMultiplier()) * 100).toFixed(0);
  
  let html = '<div class="info-header">Gewählte Box: <strong>' + (boxType||'') + '</strong></div>';
  
  // Skill-Boni anzeigen wenn vorhanden
  if (skills.wohlstand > 0 || skills.glueck > 0 || skills.effizienz > 0) {
    html += '<div class="skill-bonus-info">';
    html += '<strong>🎯 Aktive Skill-Boni:</strong><br>';
    if (skills.wohlstand > 0) {
      html += `💰 Wohlstand: +${valueBonus}% Item-Wert (+5% pro Punkt)<br>`;
    }
    if (skills.glueck > 0) {
      html += `🍀 Glück: Erhöhte Rarity-Chancen (${skills.glueck} Punkte)<br>`;
    }
    if (skills.effizienz > 0) {
      html += `⚡ Tempo: -${tempoBonus}% Untersuchungszeit (-5% pro Punkt)<br>`;
    }
    html += '</div>';
  }
  
  html += '<table class="info-table"><thead><tr><th>Rarität</th><th>Ø Wert</th><th>Dropchance</th></tr></thead><tbody>';
  for (const s of stats) {
    html += `<tr><td class="rarity-name" style="color:${colors[s.rarity]||'#fff'}">${s.rarity}</td><td>${s.avgValue} 💰</td><td>${s.chance.toFixed(2)} %</td></tr>`;
  }
  html += '</tbody></table>';
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
  infoClose.addEventListener('click', () => {
    dom.boxInfoModal.style.display = 'none';
  });
}
// close on ESC
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && dom.boxInfoModal && dom.boxInfoModal.style.display === 'block') {
    dom.boxInfoModal.style.display = 'none';
  }
});
// close clicking outside content
if (dom.boxInfoModal) {
  dom.boxInfoModal.addEventListener('click', (e) => {
    if (e.target === dom.boxInfoModal) dom.boxInfoModal.style.display = 'none';
  });
}

// Sammlung-Button
dom.collectionBtn.addEventListener('click', showCollection);

function showCollection() {
  const grid = dom.collectionGrid;
  grid.innerHTML = '';

  for (const rarity of rarities) {
    // Abschnitt für jede Rarität
    const section = document.createElement('div');
    section.classList.add('rarity-section');

    const sectionTitle = document.createElement('h2');
    sectionTitle.textContent = rarity;
    sectionTitle.style.color = colors[rarity] || '#fff';
    section.appendChild(sectionTitle);

    const rarityContainer = document.createElement('div');
    rarityContainer.classList.add('grid');

    for (const item of itemPools[rarity] || []) {
      const div = document.createElement('div');
      div.classList.add('item');

  const img = document.createElement('img');
  // Bilder liegen im Ordner "Itembilder" (Projektstruktur).
  // Früher wurde `icons/` verwendet – das führt zu fehlenden Bildern.
      img.src = `Itembilder/${item.icon}`;
      // Alt-Text für Barrierefreiheit
      img.alt = item.name || '';
      // Fallback: falls die Datei fehlt, setze ein eingebettetes SVG-Placeholder (kein 404)
      img.onerror = () => {
        // Einfaches SVG mit Fragezeichen als Data-URL
        img.onerror = null; // Verhindere Loop, falls SVG wider Erwarten auch nicht lädt
        img.src = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='64' height='64'><rect width='100%' height='100%' fill='%23444' /><text x='50%' y='50%' fill='white' font-size='32' text-anchor='middle' dominant-baseline='central'>?</text></svg>";
      };

      // keine Tooltip-Events am Icon

      if (discoveredItems.has(item.name)) {
        img.style.backgroundColor = colors[rarity];
        div.appendChild(img);
        const label = document.createElement('div');
        label.textContent = item.name;
        div.appendChild(label);

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
      }

      // keine Tooltip-Listener mehr am Wrapper

      rarityContainer.appendChild(div);
    }

    section.appendChild(rarityContainer);
    grid.appendChild(section);
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

document.getElementById("closeCollectionBtn").addEventListener("click", closeCollection);

function closeCollection() {
  dom.collectionOverlay.style.display = 'none';
}

// ======= Statistik-Overlay =======
dom.statsBtn.addEventListener('click', showStats);
dom.closeStatsBtn.addEventListener('click', closeStats);

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
        <span class="stat-label">Geöffnete Boxen:</span>
        <span class="stat-value">${stats.totalBoxesOpened.toLocaleString('de-DE')}</span>
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
      <h3>📊 Boxen pro Typ</h3>
      ${boxOrder.map(boxName => `
        <div class="stat-item">
          <span class="stat-label">${boxName}:</span>
          <span class="stat-value">${stats.boxOpenCounts[boxName].toLocaleString('de-DE')}x</span>
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
  const xpPercent = (playerXP / xpNeeded) * 100;
  
  dom.playerLevel.textContent = `Level ${playerLevel}`;
  dom.playerTitle.textContent = getCurrentTitle();
  dom.xpBar.style.width = `${xpPercent}%`;
  dom.xpText.textContent = `${playerXP} / ${xpNeeded} XP`;
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
    
    // Info-Modal aktualisieren falls geöffnet
    if (dom.boxInfoModal && dom.boxInfoModal.style.display === 'block') {
      populateBoxInfo();
    }
  }
});

// Initial UI Update
updateLevelUI();

