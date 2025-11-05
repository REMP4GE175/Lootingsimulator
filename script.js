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
  Mythisch: 'Mythisch'
};

function getItemImagePath(iconFileName, rarity) {
  // Erlaube absolute/komplette Pfade (z. B. für Schlüssel-Icons aus Common-Ordner)
  if (typeof iconFileName === 'string') {
    const s = iconFileName;
    if (s.startsWith('Itembilder/') || s.startsWith('http') || s.startsWith('data:')) {
      return s; // bereits vollständiger Pfad oder Data-URL
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
let skillPoints = 0;

// Prestige-System: globale, dauerhafte Meta-Progression
// Jede Prestige-Stufe verleiht: +5% Itemwert (stackt) und +1 Glück (stackt)
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
    'Box#5': 0, 'Box#6': 0, 'Box#7': 0
  },
  // Kumulativ gefundene Schlüssel (nicht Inventarbestand)
  keysFoundCounts: { Common: 0, Rare: 0, Epic: 0, Legendary: 0, Mythisch: 0 }
};

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
      Common: 0, Rare: 0, Epic: 0, Legendary: 0, Mythisch: 0
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
    description: "Nächste 3 Öffnungen: Erhöhte Rare+ Chancen",
    icon: "🌿",
    cost: 8000,
    type: "temp",
    effect: { type: "rarityBoost", value: 0.15, uses: 3 }
  },
  tempXPBoost: {
    name: "Wissenselixier",
    description: "Nächste 10 Öffnungen: +100% XP",
    icon: "📚",
    cost: 3000,
    type: "temp",
    effect: { type: "xpBoost", value: 1.0, uses: 10 }
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
  permPotionBelt: 0
};

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
    { name: "Schlüssel: Gewöhnlich", icon: "Itembilder/Common/Schlüssel.png", value: 0, description: "Öffnet einen gewöhnlichen Raum mit Common-lastigen Loot.", isKey: true, dropWeight: 0.75 },
    { name: "Rostige Münze", icon: "Itembilder/Common/rusty coin.png", value: 15, description: "Ein alter, wertloser Münzfund." },
    { name: "Holzbrett", icon: "Itembilder/Common/Holzbrett.png", value: 20, description: "Nicht mal als Waffe zu gebrauchen." },
    { name: "Taschentuch", icon: "Itembilder/Common/Taschentuch.png", value: 18, description: "Ein gebrauchtes Stück Stoff." },
    { name: "Streichhölzer", icon: "Itembilder/Common/Streichholz.png", value: 25, description: "Eine Schachtel alte Streichhölzer." },
    { name: "Kronkorken", icon: "Itembilder/Common/bottle cap.png", value: 22, description: "Ein Verschluss von einer Flasche." },
    { name: "Fischgräte", icon: "Itembilder/Common/Gräte.png", value: 30, description: "Überreste einer längst verzehrten Mahlzeit." },
    { name: "Eichel", icon: "Itembilder/Common/Eichel.png", value: 28, description: "Eine Frucht vom Eichenbaum." },
    { name: "Göffel", icon: "Itembilder/Common/Göffel.png", value: 35, description: "Eine Mischung aus Gabel und Löffel." },
    { name: "Leere Karte", icon: "Itembilder/Common/LeereKarte.png", value: 32, description: "Ein unbeschriebenes Kartenblatt." },
    { name: "Kaputte Brille", icon: "Itembilder/Common/kaputte Brille.png", value: 24, description: "Eine kaputte Brille ohne Gläser." },
    { name: "Knopf", icon: "Itembilder/Common/Knopf.png", value: 16, description: "Ein einzelner Knopf von einem Hemd." },
    { name: "Korken", icon: "Itembilder/Common/Korken.png", value: 19, description: "Ein alter Flaschenkorken." },
    { name: "Seil", icon: "Itembilder/Common/Seil.png", value: 26, description: "Ein kurzes, ausgefranstes Seil." },
    { name: "Stofflappen", icon: "Itembilder/Common/Stofflappen.png", value: 17, description: "Ein schmutziger Lappen." },
    { name: "Metallschrott", icon: "Itembilder/Common/Metallschrott.png", value: 29, description: "Ein rostiges Stück Metall." },
    { name: "Alte Dose", icon: "Itembilder/Common/Dose.png", value: 21, description: "Eine zerbeulte, leere Dose." },
    { name: "Einzelne Socke", icon: "Itembilder/Common/Einzelner Socke.png", value: 20, description: "Wo ist der andere hin?" },
    { name: "Gummiband", icon: "Itembilder/Common/Gummiband.png", value: 18, description: "Ein ausgeleiertes Haargummi." },
    { name: "Alter Schlüssel", icon: "Itembilder/Common/Schlüssel.png", value: 23, description: "Passt nirgendwo rein." },
    { name: "Alte Eintrittskarte", icon: "Itembilder/Common/Kinoticket.png", value: 19, description: "Von einem vergessenen Event." },
    { name: "Briefumschlag", icon: "Itembilder/Common/Briefumschlag.png", value: 17, description: "Leer und vergilbt." },
    { name: "Stempel", icon: "Itembilder/Common/Stempel.png", value: 27, description: "Ein alter Gummistempel." },
    { name: "Schere", icon: "Itembilder/Common/Schere.png", value: 31, description: "Stumpf und verrostet." },
    { name: "Stift", icon: "Itembilder/Common/Stift.png", value: 20, description: "Schreibt nicht mehr." },
    { name: "Schraube", icon: "Itembilder/Common/Schraube.png", value: 22, description: "Eine einzelne Schraube." },
    { name: "Mutter & Bolzen", icon: "Itembilder/Common/Muttern und Bolzen.png", value: 25, description: "Passt perfekt zusammen." },
    { name: "Draht", icon: "Itembilder/Common/Draht.png", value: 24, description: "Ein verbogenes Stück Draht." },
    { name: "Schraubendreher", icon: "Itembilder/Common/Schraubendreher.png", value: 28, description: "Für winzige Schrauben." },
    { name: "Leerer Milchkarton", icon: "Itembilder/Common/Milchkarton.png", value: 18, description: "Riecht leicht säuerlich." },
    { name: "Plastikflasche", icon: "Itembilder/Common/Plastikflasche.png", value: 19, description: "Eine leere Wasserflasche." },
    { name: "Zigarettenstummel", icon: "Itembilder/Common/Zigarettenstummel.png", value: 15, description: "Eklig und nutzlos." },
    { name: "Kaffeefilter", icon: "Itembilder/Common/Kaffeefilter.png", value: 17, description: "Gebraucht und fleckig." },
    { name: "Teebeutel", icon: "Itembilder/Common/Teebeutel.png", value: 16, description: "Längst durchgezogen." },
    { name: "Wäscheklammer", icon: "Itembilder/Common/Wäscheklammer.png", value: 8, description: "Eine Handvoll aus Plastik." },
    { name: "Plastiktüte", icon: "Itembilder/Common/Plastiktüte.png", value: 4, description: "Vom Supermarkt, mehrfach verwendet." },
    { name: "Büroklammer", icon: "Itembilder/Common/Büroklammer.png", value: 6, description: "Eine verbogene Metallklammer." },
    { name: "Radiergummi", icon: "Itembilder/Common/Radiergummi.png", value: 9, description: "Hart und brüchig geworden." },
    { name: "Reißzwecke", icon: "Itembilder/Common/Reißzwecke.png", value: 6, description: "Immer noch spitz." },
    { name: "Zahnstocher", icon: "Itembilder/Common/Zahnstocher.png", value: 3, description: "Eine Handvoll Holzstäbchen." },
  ],
  Rare: [
    // Schlüssel (Rare) – seltener als Common-Schlüssel
    { name: "Schlüssel: Selten", icon: "Itembilder/Common/Schlüssel.png", value: 0, description: "Öffnet einen seltenen Raum mit Rare-lastigen Loot.", isKey: true, dropWeight: 0.6 },
    { name: "Silber Ring", icon: "Itembilder/Selten/Silber Ring.png", value: 120, description: "Ein hübscher Ring mit leichtem Glanz." },
    { name: "Schatzkarte", icon: "Itembilder/Selten/Map.png", value: 250, description: "Zeigt vergessene Wege." },
    { name: "Schachtel Zigaretten", icon: "Itembilder/Selten/zigaretten.png", value: 180, description: "\"Mit dem Rauchen aufzuhören ist kinderleicht. Ich habe es schon hundert Mal gemacht.\"", quoteAuthor: "Mark Twain" },
    { name: "Kartenspiel", icon: "Itembilder/Selten/Kartenspiel.png", value: 150, description: "Ein klassisches Deck mit aufwendigem Design." },
    { name: "Vintage-Feuerzeug", icon: "Itembilder/Selten/Feuerzeug.png", value: 140, description: "Ein Zippo mit eingraviertem Datum." },
    { name: "Alte Armbanduhr", icon: "Itembilder/Selten/Armbanduhr.png", value: 200, description: "Mechanisch, läuft noch präzise." },
    { name: "Lederbrieftasche", icon: "Itembilder/Selten/Brieftasche.png", value: 130, description: "Hochwertig verarbeitet, leicht abgenutzt." },
    { name: "Schweizer Taschenmesser", icon: "Itembilder/Selten/Taschenmesser.png", value: 180, description: "Mit allen wichtigen Werkzeugen." },
    { name: "Briefmarken-Sammlung", icon: "Itembilder/Selten/Briefmarken.png", value: 220, description: "Seltene Exemplare aus den 1950ern." },
    { name: "Silbermünzen", icon: "Itembilder/Selten/Silbermünze.png", value: 190, description: "Eine Handvoll alter Gedenkmünzen." },
    { name: "Digitalkamera", icon: "Itembilder/Selten/Kamera.png", value: 240, description: "Alte Profi-Kamera, funktioniert noch." },
    { name: "Taschenlampe (LED)", icon: "Itembilder/Selten/Taschenlampe.png", value: 120, description: "Extrem hell, militärische Qualität." },
    { name: "Multimeter", icon: "Itembilder/Selten/Multimeter.png", value: 150, description: "Für alle elektronischen Messungen." },
    { name: "Taschenuhr", icon: "Itembilder/Selten/Taschenuhr.png", value: 260, description: "Goldüberzogen, mit Kette." },
    { name: "Silberkette", icon: "Itembilder/Selten/Silberkette.png", value: 180, description: "Fein gearbeitet, leicht angelaufen." },
    { name: "Netzteil", icon: "Itembilder/Selten/Netzteil.png", value: 170, description: "Universalnetzteil, liefert zuverlässig Strom." },
    { name: "Brosche", icon: "Itembilder/Selten/Brosche.png", value: 160, description: "Mit kleinem Edelstein verziert." },
    { name: "Holz-Spielzeug", icon: "Itembilder/Selten/Holz-Spielzeug.png", value: 200, description: "Ein Andenken an einfachere Zeiten." },
    { name: "Postkarten-Sammlung", icon: "Itembilder/Selten/Postkarten.png", value: 140, description: "Aus aller Welt, teilweise frankiert." },
    { name: "Comic Heft", icon: "Itembilder/Selten/Comic.png", value: 190, description: "Erste Ausgabe, leicht vergilbt." },
    { name: "USB-Stick", icon: "Itembilder/Selten/USB.png", value: 120, description: "8GB, mit alten Fotos." },
    { name: "Kopfhörer", icon: "Itembilder/Selten/Kopfhörer.png", value: 150, description: "Over-Ear, noch funktionsfähig." },
    { name: "Wecker (Analog)", icon: "Itembilder/Selten/Wecker.png", value: 140, description: "Mit lautem Klingeln." },
    { name: "Taschenrechner", icon: "Itembilder/Selten/Taschenrechner.png", value: 110, description: "Solar-betrieben, funktioniert noch." },
    { name: "Zange", icon: "Itembilder/Selten/Zange.png", value: 180, description: "Kombinationszange in gutem Zustand." },
    { name: "Hammer", icon: "Itembilder/Selten/Hammer.png", value: 170, description: "Kleiner Schlosserhammer." },
    { name: "Maßband", icon: "Itembilder/Selten/Maßband.png", value: 130, description: "5 Meter, etwas ausgeleiert." },
    { name: "Schraubenschlüssel", icon: "Itembilder/Selten/Schraubenschlüssel.png", value: 160, description: "Verstellbar, leicht rostig." },
    { name: "Sonnenbrille", icon: "Itembilder/Selten/Sonnenbrille.png", value: 150, description: "Designer-Imitat, cooles Modell." },
    { name: "Geldbeutel", icon: "Itembilder/Selten/Geldbeutel.png", value: 190, description: "Leder, mit initialen Prägung." }
  ],
  Epic: [
    // Schlüssel (Epic)
    { name: "Schlüssel: Episch", icon: "Itembilder/Common/Schlüssel.png", value: 0, description: "Öffnet einen epischen Raum mit Epic-lastigen Loot.", isKey: true, dropWeight: 0.45 },
    { name: "Verzauberte Schriftrolle", icon: "Itembilder/Episch/Scroll.png", value: 600, description: "Ein Zauber, der nur einmal wirkt." },
    { name: "Phönixfeder", icon: "Itembilder/Episch/Phoenix Feder.png", value: 1200, description: "Glüht leicht in deiner Hand." },
    { name: "Vinyl-Schallplatte", icon: "Itembilder/Episch/Vinyl.png", value: 800, description: "Ein Medium aus vergangenen Tagen." },
    { name: "Perlenkette", icon: "Itembilder/Episch/Perlenkette.png", value: 950, description: "Echte Süßwasserperlen." },
    { name: "Bernsteinanhänger", icon: "Itembilder/Episch/Bernstein.png", value: 1100, description: "Mit eingeschlossenem Insekt." },
    { name: "Antike Schreibfeder", icon: "Itembilder/Episch/Schreibfeder.png", value: 750, description: "Mit echtem Tintenfass." },
    { name: "Goldkette", icon: "Itembilder/Episch/Goldkette.png", value: 1000, description: "Schwere 18-Karat-Goldkette." },
    { name: "Diamantring", icon: "Itembilder/Episch/Diamantring.png", value: 1400, description: "Kleiner, aber echter Diamant." },
    { name: "Smaragd-Ohrringe", icon: "Itembilder/Episch/Smaragd-Ohrringe.png", value: 1150, description: "Facettierte grüne Edelsteine." },
    { name: "Rubinanhänger", icon: "Itembilder/Episch/Rubinanhänger.png", value: 1300, description: "Tiefrotes Juwel in Goldfassung." },
    { name: "Sextant", icon: "Itembilder/Episch/Sextant.png", value: 900, description: "Navigationsgerät aus Messing." },
    { name: "Taschenuhr (Antik)", icon: "Itembilder/Episch/Taschenuhr_antik.png", value: 1100, description: "Mit aufwendiger Gravur, funktioniert noch." },
    { name: "Porzellanfigur", icon: "Itembilder/Episch/Porzellanfigur.png", value: 850, description: "Meißener Porzellan, feiner Riss." },
    { name: "Alte Bibel", icon: "Itembilder/Episch/Bibel.png", value: 950, description: "Ledereinband, handgeschrieben, aus dem 19. Jahrhundert." },
    { name: "Signiertes Buch", icon: "Itembilder/Episch/signiertes_buch.png", value: 800, description: "Erstausgabe mit Autogramm." },
    { name: "Vintage-Kamera", icon: "Itembilder/Episch/vintage_kamera.png", value: 1050, description: "Leica aus den 60ern, funktionsfähig." },
    { name: "Röhrenradio", icon: "Itembilder/Episch/roehrenradio.png", value: 900, description: "Retro-Radio aus Holz, spielt noch." },
    { name: "Schreibmaschine", icon: "Itembilder/Episch/schreibmaschine.png", value: 850, description: "Mechanische Underwood, alle Tasten funktionieren." },
    { name: "Ölgemälde", icon: "Itembilder/Episch/oelgemaelde.png", value: 1200, description: "Signiertes Landschaftsbild, Rahmen vergoldet." },
    { name: "Bronze-Statue", icon: "Itembilder/Episch/bronze_statue.png", value: 1100, description: "Kleine Figur, schwer und detailreich." },
    { name: "Kristall-Vase", icon: "Itembilder/Episch/kristall_vase.png", value: 900, description: "Handgeschliffen, böhmisches Glas." },
    { name: "Dolch (Antik)", icon: "Itembilder/Episch/dolch.png", value: 1000, description: "Zeremoniendolch mit Verzierungen." },
    { name: "Militärkompass", icon: "Itembilder/Episch/militaerkompass.png", value: 700, description: "Aus dem 2. Weltkrieg, funktioniert noch." },
    { name: "Orden & Medaille", icon: "Itembilder/Episch/orden.png", value: 950, description: "Militärische Auszeichnung mit Band." },
    { name: "Pelzmantel", icon: "Itembilder/Episch/pelzmantel.png", value: 1300, description: "Vintage, ethisch fragwürdig, aber wertvoll." },
    { name: "Katze im Karton", icon: "Itembilder/Episch/Floki.png", value: 1050, description: "Eine niedliche Katze, die es sich in einem Karton bequem gemacht hat." },
    { name: "Katze in Katzenhöhle", icon: "Itembilder/Episch/Biene.png", value: 1000, description: "Eine zufriedene Katze, die in ihrer Höhle döst." },
    { name: "Katze auf türkisem Stuhl", icon: "Itembilder/Episch/Simba.png", value: 1150, description: "Eine elegante Katze thront auf einem stilvollen türkisen Stuhl." }
  ],
  Legendary: [
    // Schlüssel (Legendary) – sehr selten
    { name: "Schlüssel: Legendär", icon: "Itembilder/Common/Schlüssel.png", value: 0, description: "Öffnet einen legendären Raum mit Legendary-lastigen Loot.", isKey: true, dropWeight: 0.3 },
    { name: "Drachenschuppe", icon: "Itembilder/Legendär/dragon_scale.png", value: 6000, description: "Unzerstörbar und selten." },
    { name: "Himmelsorb", icon: "Itembilder/Legendär/orb.png", value: 12000, description: "Ein Relikt aus einer anderen Welt." },
    { name: "Goldblock", icon: "Itembilder/Legendär/goldblock.png", value: 8000, description: "Ein massiver Block aus reinem Gold." },
    { name: "Golduhr", icon: "Itembilder/Legendär/golduhr.png", value: 9500, description: "Eine prächtige Uhr aus Gold und Diamanten." },
    { name: "Kronjuwel", icon: "Itembilder/Legendär/kronjuwel.png", value: 11500, description: "Ein seltener Edelstein aus königlichem Besitz." },
    { name: "Platinbarren", icon: "Itembilder/Legendär/platinbarren.png", value: 11000, description: "Schwer, selten und äußerst wertvoll." },
    { name: "Saphir-Diadem", icon: "Itembilder/Legendär/saphir_diadem.png", value: 10500, description: "Mit tiefblauen Saphiren besetzt." },
    { name: "Meteoritenfragment", icon: "Itembilder/Legendär/meteorit.png", value: 9000, description: "Ein Stück aus dem All, magnetisch." },
    { name: "Ritterrüstung (Antik)", icon: "Itembilder/Legendär/ritterruestung.png", value: 10000, description: "Vollplatte, musealer Zustand." },
    { name: "Meisterwerk-Gemälde", icon: "Itembilder/Legendär/meisterwerk.png", value: 12000, description: "Ein signiertes Original eines Meisters." },
    { name: "Schwarze Perle", icon: "Itembilder/Legendär/schwarze_perle.png", value: 9800, description: "Seltene Perle mit tiefschwarzem Glanz." },
    { name: "Kristallschädel", icon: "Itembilder/Legendär/kristallschaedel.png", value: 10400, description: "Mysteriöses Artefakt aus Kristall." },
    { name: "Königszepter", icon: "Itembilder/Legendär/koenigszepter.png", value: 11200, description: "Symbol königlicher Macht, reich verziert." },
    { name: "Reliquienschrein", icon: "Itembilder/Legendär/reliquienschrein.png", value: 9200, description: "Vergoldeter Schrein mit heiliger Reliquie." },
    { name: "Runenstein", icon: "Itembilder/Legendär/runenstein.png", value: 8600, description: "Antiker Stein mit leuchtenden Runen." }
  ],
  Mythisch: [
    // Schlüssel (Mythisch) – extrem selten
    { name: "Schlüssel: Mythisch", icon: "Itembilder/Mythisch/Schlüssel Mythisch.png", value: 0, description: "Öffnet einen mythischen Raum mit hochwertigem Loot.", isKey: true, dropWeight: 0.15 },
    { name: "Mystische Klinge", icon: "Itembilder/Mythisch/mystic_blade.png", value: 80000, description: "Eine legendäre Klinge mit uralter Macht." },
    { name: "Zeitkristall", icon: "Itembilder/Mythisch/time_crystal.png", value: 250000, description: "Manipuliert die Zeit für einen Moment." },
    { name: "Geheime Dokumente", icon: "Itembilder/Mythisch/geheime_dokumente.png", value: 150000, description: "Streng geheime Regierungsunterlagen." },
    { name: "Philosophenstein", icon: "Itembilder/Mythisch/philosophenstein.png", value: 210000, description: "Verwandelt das Gewöhnliche in Gold." },
    { name: "Singularitätskern", icon: "Itembilder/Mythisch/singularitaetskern.png", value: 240000, description: "Komprimierte Raumzeit in einer Kapsel." },
    { name: "Ewige Flamme", icon: "Itembilder/Mythisch/ewige_flamme.png", value: 120000, description: "Brennt ohne jede Quelle weiter." },
    { name: "Ätherisches Grimoire", icon: "Itembilder/Mythisch/aetherisches_grimoire.png", value: 175000, description: "Die Seiten ändern sich bei jedem Öffnen." },
    { name: "Weltensextant", icon: "Itembilder/Mythisch/weltensextant.png", value: 160000, description: "Findet Wege zwischen Dimensionen." },
    { name: "Schattenmantel", icon: "Itembilder/Mythisch/schattenmantel.png", value: 90000, description: "Lässt dich im Dunkel verschwinden." },
    { name: "Zeitreisekompass", icon: "Itembilder/Mythisch/zeitkompass.png", value: 140000, description: "Zeigt nicht Norden, sondern Morgen." }
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
  "Box#2": {
    cost: 500,
    columns: 3,
    rows: 2,
    weights: {
      Common: 66.00,
      Rare: 25.00,
      Epic: 7.00,
      Legendary: 1.00,
      Mythisch: 0.10
    }
  },
  "Box#3": {
    cost: 1000,
    columns: 4,
    rows: 2,
    weights: {
      Common: 57.00,
      Rare: 28.00,
      Epic: 10.00,
      Legendary: 2.00,
      Mythisch: 0.30
    }
  },
  "Box#4": {
    cost: 15000,
    columns: 4,
    rows: 3,
    weights: {
      Common: 46.00,
      Rare: 35.00,
      Epic: 14.00,
      Legendary: 3.50,
      Mythisch: 0.50
    }
  },
  "Box#5": {
    cost: 30000,
    columns: 5,
    rows: 3,
    weights: {
      Common: 35.00,
      Rare: 35.00,
      Epic: 18.00,
      Legendary: 5.50,
      Mythisch: 0.70
    }
  },
  "Box#6": {
    cost: 50000,
    columns: 6,
    rows: 3,
    weights: {
      Common: 25.00,
      Rare: 30.00,
      Epic: 30.00,
      Legendary: 7.50,
      Mythisch: 0.90
    }
  },
  "Box#7": {
    cost: 100000,
    columns: 6,
    rows: 4,
    weights: {
      Common: 15.00,
      Rare: 25.00,
      Epic: 50.00,
      Legendary: 9.00,
      Mythisch: 1.00
    }
  },
  "Testbox": {
    // Dev-Box: zieht genau 1 Item pro Rarität + eine Reihe mit allen Schlüsseln
    cost: 0,
    columns: 5,
    rows: 2,
    weights: {
      Common: 20,
      Rare: 20,
      Epic: 20,
      Legendary: 20,
      Mythisch: 20
    }
  },
  // Schlüssel-Räume: spezielle Räume, die nur über Schlüssel zugänglich sind
  "KeyRoom_Common": {
    cost: 0,
    columns: 3,
    rows: 2,
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
    columns: 3,
    rows: 2,
    weights: {
      Common: 50,
      Rare: 40,
      Epic: 9.5,
      Legendary: 0.5,
      Mythisch: 0
    }
  },
  "KeyRoom_Epic": {
    cost: 0,
    columns: 4,
    rows: 2,
    weights: {
      Common: 30,
      Rare: 40,
      Epic: 28,
      Legendary: 1.9,
      Mythisch: 0.1
    }
  },
  "KeyRoom_Legendary": {
    cost: 0,
    columns: 4,
    rows: 3,
    weights: {
      Common: 10,
      Rare: 30,
      Epic: 45,
      Legendary: 14,
      Mythisch: 1
    }
  },
  "KeyRoom_Mythisch": {
    cost: 0,
    columns: 5,
    rows: 3,
    weights: {
      Common: 0,
      Rare: 20,
      Epic: 40,
      Legendary: 30,
      Mythisch: 10
    }
  }
};

// Konstanten
const SLOT_SIZE_PX = 100;

// Aktueller gewählter Box-Typ und Kontostand
let boxType = "Box#1";
let balance = 500;
// Öffnungszustand, um Layout-Jumps beim Box-Wechsel während des Öffnens zu vermeiden
let isOpening = false;
let pendingBoxType = null; // gewünschter Box-Wechsel, der nach Öffnung angewendet wird

// Box-Reihenfolge für Progression
const boxOrder = ["Box#1", "Box#2", "Box#3", "Box#4", "Box#5", "Box#6", "Box#7", "Testbox"];

// Anzeigenamen für die Boxen
const boxDisplayNames = {
  "Box#1": "Schublade",
  "Box#2": "Sporttasche",
  "Box#3": "Koffer",
  "Box#4": "Holzkiste",
  "Box#5": "Militärkoffer",
  "Box#6": "Safe",
  "Box#7": "Tresor",
  "Testbox": "Testbox",
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
    "Testbox": "🧪",
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
  const skillBonus = 1 + (skills.wohlstand * 0.03); // +3% pro Skill-Punkt
  const permVBCount = Math.min(1, (permanentUpgrades.permValueBoost || 0));
  const shopPermBonus = 1 + (permVBCount * 0.1); // max einmal +10%
  const shopStatWealth = 1 + ((statUpgradesLevels.wealth || 0) * 0.02); // +2% pro Stufe (Shop-Stat)
  const tempBonus = (activeBoosts.valueBoostUses > 0) ? (1 + activeBoosts.valueBoost) : 1; // temporärer Boost
  const prestigeBonus = 1 + (prestigeState.level * 0.05); // +5% pro Prestige-Stufe
  return skillBonus * shopPermBonus * shopStatWealth * tempBonus * prestigeBonus;
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
  }

  // Pro-Punkt-Raten: keine harten Caps mehr, damit Glück unbegrenzt skaliert
  // Die prozentuale Verschiebung sorgt von selbst für abnehmende Zuwächse
  const crRate = 0.01 * g * boxMultiplier;    // von Common -> Rare
  const reRate = 0.0075 * g * boxMultiplier;  // von Rare -> Epic
  const elRate = 0.005 * g * boxMultiplier;   // von Epic -> Legendary
  
  // Legendary -> Mythisch: einheitliche Rate für alle Boxen
  const lmRate = 0.0025 * g * boxMultiplier;

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
  // Kappe damit es nicht zu 0 fällt
  return Math.max(0.3, Math.min(1, raw));
}

// Berechnet die Anzahl der Items basierend auf Slot-Füllrate (20-100%, Peak bei 50%) + permanente Shop-Upgrades
function getWeightedItemCount(boxType) {
  const columns = boxConfigs[boxType].columns || 4;
  const rows = boxConfigs[boxType].rows || 3;
  const totalSlots = columns * rows;
  
  // Bestimme Füllrate-Ziel basierend auf Box-Typ
  // Reduziert: Box 1-3: 60% Durchschnitt, Box 4-5: 50%, Box 6-7: 60%
  const isKR = isKeyRoom(boxType);
  const boxNumber = isKR ? NaN : parseInt((boxType || '').replace('Box#', ''));
  // KeyRooms sollen tendenziell voller sein
  const targetFillRate = isKR
    ? 0.7
    : ((boxNumber <= 3 || boxNumber >= 6) ? 0.6 : 0.5);
  
  // Glücksbonus: +2% Füllrate pro Glückspunkt (inkl. Boosts)
  let g = (skills.glueck || 0) + (statUpgradesLevels.luck || 0) + (prestigeState.level || 0);
  if (activeBoosts.rarityBoostUses > 0) {
    g = g * (1 + activeBoosts.rarityBoost);
  }
  const luckFillBonus = 0.02 * g; // +2% pro Glückspunkt (wirkt auch in KeyRooms)

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
  // +3% pro Glückspunkt (inkl. Shop/Boosts), gedeckelt bei 50%
  const extraChance = Math.min(0.5, 0.03 * g);
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
      const pool = itemPools[rarity] || itemPools.Common;
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
  // Kisten-Theme anpassen
  updateChestTheme(type);
  
  // Entferne "selected" Klasse von allen Buttons
  for (let i = 0; i < boxOrder.length; i++) {
    const btn = document.getElementById(`boxBtn${i + 1}`);
    if (btn) btn.classList.remove('selected');
  }
  
  // Füge "selected" Klasse zum gewählten Button hinzu
  const idx = boxOrder.indexOf(type);
  const selectedBtn = document.getElementById(`boxBtn${idx + 1}`);
  if (selectedBtn) selectedBtn.classList.add('selected');
  
  // Grid neu erstellen mit den Dimensionen der neuen Box
  createEmptyGrid();
  
  // Aktualisiere Info-Fenster, falls es offen ist
  if (dom.boxInfoModal && dom.boxInfoModal.style.display === 'block') {
    populateBoxInfo();
  }
  // Öffnen-Button-Icon aktualisieren (Box-Emoji oder Schlüssel)
  updateOpenBtnIcon();
}

// Exponiere selectBox global (vorerst kompatibel)
window.selectBox = selectBox;

// Wire box button clicks via JS (statt inline onclick)
for (let i = 0; i < boxOrder.length; i++) {
  const btn = document.getElementById(`boxBtn${i + 1}`);
  if (btn) {
    btn.addEventListener('click', () => selectBox(boxOrder[i]));
  }
}

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
      btn.disabled = !canAfford;
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

// DEV toggle elements (not part of dom object to avoid breaking assumptions elsewhere)
const devMoneyBtn = document.getElementById('devMoneyBtn');
const devToggleCheckbox = document.getElementById('toggleDev');
const DEV_MODE_KEY = 'lootsim_devMode_v1';
let devMode = false;

function loadDevMode() {
  try {
    const raw = localStorage.getItem(DEV_MODE_KEY);
    devMode = raw === '1';
  } catch (_) { devMode = false; }
}

function saveDevMode() {
  try { localStorage.setItem(DEV_MODE_KEY, devMode ? '1' : '0'); } catch (_) {}
}

function setDevMode(enabled) {
  devMode = !!enabled;
  if (devToggleCheckbox) devToggleCheckbox.checked = devMode;
  // Toggle dev money button
  if (devMoneyBtn) devMoneyBtn.style.display = devMode ? '' : 'none';
  // Toggle Testbox button explicitly
  const idx = boxOrder.indexOf('Testbox');
  if (idx >= 0) {
    const btn = document.getElementById(`boxBtn${idx + 1}`);
    if (btn) btn.style.display = devMode ? '' : 'none';
  }
  // Toggle green check on secret 'o'
  try {
    const secret = document.getElementById('secretDevSwitch');
    if (secret) secret.classList.toggle('dev-on', devMode);
  } catch (_) { /* ignore */ }
  saveDevMode();
  // Re-evaluate availability to ensure correct visibility
  updateBoxAvailability();
}

// initialize dev mode from storage
loadDevMode();
if (devToggleCheckbox) {
  devToggleCheckbox.addEventListener('change', (e) => {
    setDevMode(!!e.target.checked);
  });
}
// Apply initial state to UI
setDevMode(devMode);

// Secret title toggle (press-and-hold on the hidden 'o' for 1s)
try {
  const secret = document.getElementById('secretDevSwitch');
  if (secret) {
    let holdTimer = null;
    const startHold = () => {
      if (holdTimer) clearTimeout(holdTimer);
      holdTimer = setTimeout(() => {
        setDevMode(!devMode);
        try { console.log(`DEV ${devMode ? 'enabled' : 'disabled'}`); } catch (_) {}
      }, 1000); // 1s hold
    };
    const cancelHold = () => {
      if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    };
    // Mouse events
    secret.addEventListener('mousedown', startHold);
    secret.addEventListener('mouseup', cancelHold);
    secret.addEventListener('mouseleave', cancelHold);
    // Touch events
    secret.addEventListener('touchstart', (e) => { startHold(); }, { passive: true });
    secret.addEventListener('touchend', cancelHold, { passive: true });
    secret.addEventListener('touchcancel', cancelHold, { passive: true });
  }
} catch (_) { /* ignore */ }

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
function ensureAudioCtx() {
  try {
    if (!__audioCtx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) __audioCtx = new AudioCtx();
    }
  } catch (e) {
    // ignore
  }
  return __audioCtx;
}

function playRaritySound(rarity) {
  const ctx = ensureAudioCtx();
  if (!ctx) return;
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
  osc.connect(gain).connect(ctx.destination);
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
    osc2.connect(gain2).connect(ctx.destination);
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
let __keysModal = null;
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
    img.src = 'Itembilder/Common/Schlüssel.png';
    img.alt = '';
    span.appendChild(img);
  } else if (rarityForDisabledKey) {
    span.classList.add('key-mode', 'disabled');
    // Neutraler Hintergrund für deaktivierten Zustand
    span.style.backgroundColor = '#555';
    const img = document.createElement('img');
    img.src = 'Itembilder/Common/Schlüssel.png';
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
  img.src = 'Itembilder/Common/Schlüssel.png';
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
    // DEV Komfort: Alt-Klick fügt je 1 Schlüssel hinzu (nur im DEV-Mode)
    if (e.altKey && devMode) {
      for (const r of rarities) keysInventory[r] = (keysInventory[r] || 0) + 1;
      saveProgress();
      // Dev-Add gilt als entdeckt
      for (const r of rarities) discoveredKeyRarities.add(r);
      saveKeyDiscovery();
      renderKeysButtonBadges();
      if (__keysBadgesCollapsed) setKeysBtnNotify(true);
      return;
    }
    showKeysModal();
    // Öffnen des Modals gilt als gesehen → Punkt entfernen
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
  for (const r of rarities) {
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
    img.src = 'Itembilder/Common/Schlüssel.png';
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

function ensureKeysModal() {
  if (__keysModal) return __keysModal;
  const modal = document.createElement('div');
  modal.id = 'keysModal';
  modal.className = 'info-modal';
  modal.style.display = 'none';
  modal.innerHTML = `
    <div class="info-content" style="max-width: 1000px;">
      <button class="info-close" aria-label="Schließen">✖</button>
      <h3>Schlüssel</h3>
      <div id="keysBody"></div>
      <div id="keysInfoArea" style="margin-top:12px;"></div>
    </div>`;
  document.body.appendChild(modal);
  const closeBtn = modal.querySelector('.info-close');
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    modal.style.setProperty('display', 'none', 'important');
  });
  modal.addEventListener('click', (e) => {
    const content = modal.querySelector('.info-content');
    if (content && !content.contains(e.target)) {
      modal.style.setProperty('display', 'none', 'important');
    }
  });
  __keysModal = modal;
  return modal;
}

function showKeysModal() {
  const modal = ensureKeysModal();
  const body = modal.querySelector('#keysBody');
  const infoArea = modal.querySelector('#keysInfoArea');
  body.innerHTML = '';
  infoArea.innerHTML = '';

  const abbrev = { Common: 'Gewöhnlich', Rare: 'Selten', Epic: 'Episch', Legendary: 'Legendär', Mythisch: 'Mythisch' };
  for (const r of rarities) {
    const row = document.createElement('div');
    row.className = 'keys-row';

    const count = keysInventory[r] || 0;
    const target = getKeyTargetBox(r);
    const targetName = target ? (boxDisplayNames[target] || target) : '—';

    // Key icon with counter badge
    const keyCell = document.createElement('div');
    keyCell.className = 'key-cell';
    const iconWrap = document.createElement('div');
    iconWrap.className = 'key-icon-wrap';
    iconWrap.style.borderColor = colors[r] || '#777';
    const keyImg = document.createElement('img');
    keyImg.src = 'Itembilder/Common/Schlüssel.png';
    keyImg.alt = `Schlüssel ${abbrev[r]}`;
    iconWrap.appendChild(keyImg);
    const badge = document.createElement('span');
    badge.className = 'key-counter-badge';
    badge.textContent = String(count);
    iconWrap.appendChild(badge);
    const rarityLabel = document.createElement('div');
    rarityLabel.className = 'key-rarity-label';
    rarityLabel.style.color = colors[r] || '#fff';
    rarityLabel.textContent = abbrev[r];
    keyCell.appendChild(iconWrap);
    keyCell.appendChild(rarityLabel);

    // Arrow between key and door
    const arrowCell = document.createElement('div');
    arrowCell.className = 'arrow-cell';
    arrowCell.textContent = '→';

    // Door target
    const doorCell = document.createElement('div');
    doorCell.className = 'door-cell';
    const doorEmoji = document.createElement('div');
    doorEmoji.className = 'door-emoji';
    doorEmoji.textContent = target ? (getBoxIcon(target) || '🚪') : '—';
    const doorLabel = document.createElement('div');
    doorLabel.className = 'door-label';
    doorLabel.textContent = targetName;
    doorCell.appendChild(doorEmoji);
    doorCell.appendChild(doorLabel);

    // Actions on the right (Info, Öffnen)
    const actions = document.createElement('div');
    actions.className = 'key-actions';
    const infoBtn = document.createElement('button');
    infoBtn.className = 'box-info-btn';
    infoBtn.textContent = 'Info';
    infoBtn.addEventListener('click', () => {
      renderKeyTargetInfo(r, infoArea);
    });
    const useBtn = document.createElement('button');
    useBtn.className = 'box-info-btn';
    useBtn.textContent = 'Öffnen';
    useBtn.disabled = count <= 0 || isOpening || !target;
    useBtn.addEventListener('click', () => {
      if (count <= 0 || isOpening || !target) return;
      // Nur vormerken: Zielraum setzen und Öffnen-Button kennzeichnen
      openWithKey(r);
    });
    actions.appendChild(infoBtn);
    actions.appendChild(useBtn);

    row.appendChild(keyCell);
    row.appendChild(arrowCell);
    row.appendChild(doorCell);
    row.appendChild(actions);
    body.appendChild(row);
  }
  modal.style.display = 'block';
}

function renderKeyTargetInfo(rarity, container) {
  const target = getKeyTargetBox(rarity);
  if (!target) { container.innerHTML = '<em>Keine Zielkiste konfiguriert.</em>'; return; }
  const info = computeRarityStats(target);
  const stats = info.rows;
  const displayName = boxDisplayNames[target] || target;
  const icon = getBoxIcon(target);
  let html = `<div class="info-header"><strong>${icon} ${displayName}</strong></div>`;
  html += '<table class="info-table"><thead><tr><th>Rarität</th><th>Dropchance</th></tr></thead><tbody>';
  for (const s of stats) {
    html += `<tr><td class="rarity-name" style="color:${colors[s.rarity]||'#fff'}">${s.rarity}</td><td>${s.chance.toFixed(2)} %</td></tr>`;
  }
  html += '</tbody></table>';
  container.innerHTML = html;
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
  // Modal schließen
  if (__keysModal) __keysModal.style.setProperty('display', 'none', 'important');
}

// ======= Item-Tracker (Persistenz) =======
const STORAGE_KEY = 'lootsim_itemCounts_v1';
const PROGRESS_KEY = 'lootsim_progress_v1';
const KEY_DISCOVERY_KEY = 'lootsim_keyDiscovery_v1';

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
    for (const r of rarities) {
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
function saveProgress() {
  try {
    const progress = {
      balance,
      playerLevel,
      playerXP,
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
  } catch (e) {
    console.warn('Failed to save progress', e);
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
    }
  } catch (e) {
    console.warn('Failed to load progress', e);
  }
}

// Load persisted data on startup
loadCounts();
loadProgress();
// Zustand für eingeklappte Schlüssel-Badges laden
loadKeysBadgesCollapsed();
// Entdeckte Schlüssel-Raritäten laden (abhängig vom geladenen keysInventory)
loadKeyDiscovery();
// Initial Quickslots-Render (falls Gürtel bereits vorhanden)
renderQuickslots();
// Initial: Achievements-Benachrichtigung prüfen
updateAchievementsNotify();

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
    return;
  }
  // Starte Such-Animation
  setSearchingState(true);
  // Box-Konfiguration zum Start der Öffnung einfrieren
  const openBoxType = boxType;
  const columns = boxConfigs[openBoxType].columns || 4;
  const rows = boxConfigs[openBoxType].rows || 3;
  const totalSlots = columns * rows;
  const itemCount = (openBoxType === 'Testbox') ? (rarities.length * 2) : getWeightedItemCount(openBoxType);
  const desiredRarities = (openBoxType === 'Testbox') ? [...rarities, ...rarities] : null;
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
  // Run-Zähler: Boxen seit letztem Prestige
  prestigeState.runBoxesOpened = (prestigeState.runBoxesOpened || 0) + 1;
  stats.boxOpenCounts[openBoxType]++;
  stats.totalItemsPulled += itemCount;
  // Prüfe auf neue (ungesehene) Erfolge
  updateAchievementsNotify();

  for (let i = 0; i < revealSlots.length; i++) {
    const { item } = revealSlots[i];
    const pulledItem = (openBoxType === 'Testbox')
      ? (() => {
          const rar = desiredRarities[i % desiredRarities.length];
          const pool = itemPools[rar] || itemPools.Common;
          // Erste Reihe: normale Items; zweite Reihe: nur Schlüssel
          const isSecondRow = i >= rarities.length;
          let itm;
          if (isSecondRow) {
            // Suche den Schlüssel dieser Rarität aus dem Pool
            const keyItem = pool.find(it => it.isKey);
            itm = keyItem || sample(pool);
          } else {
            // Normale gewichtete Auswahl
            itm = weightedSampleByDropWeight(pool) || sample(pool);
          }
          const baseValue = itm.value || 0;
          const multiplier = getValueMultiplier();
          return { 
            ...itm, 
            rarity: rar, 
            baseValue: baseValue,
            value: Math.floor(baseValue * multiplier) 
          };
        })()
      : getRandomItem(openBoxType);
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
    await sleep(baseDelay * getTempoMultiplier()); // Mit Tempo-Skill anpassen

  // Entferne vorläufige Platzhalter-Anzeige und zeige stattdessen das Icon
  // Vorab-Klasse entfernen, dann Rarity-Farbe setzen
  item.classList.remove('pre-reveal');
  item.style.backgroundColor = colors[pulledItem.rarity] || '#999';
  // Inhalt leeren (sicherstellen)
  item.textContent = '';
    // Erzeuge Icon-Element für die Loot-Ansicht
    const iconImg = document.createElement('img');
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
    // Unique Effekt für Legendär & Mythisch
    if (pulledItem.rarity === 'Legendary' || pulledItem.rarity === 'Mythisch') {
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
  
  // Reduziere temporäre Boost-Uses
  if (activeBoosts.valueBoostUses > 0) activeBoosts.valueBoostUses--;
  if (activeBoosts.rarityBoostUses > 0) activeBoosts.rarityBoostUses--;
  if (activeBoosts.xpBoostUses > 0) activeBoosts.xpBoostUses--;
  
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

  // Icon am Ende nochmals aktualisieren (falls Schlüsselanzahl sich geändert hat)
  updateOpenBtnIcon();
  // Nach Abschluss erneut prüfen, falls während der Öffnung weitere Boxen gezählt wurden
  updateAchievementsNotify();

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
    // Hide Testbox entirely if dev mode is off
    if (boxName === 'Testbox' && !devMode) {
      btn.style.display = 'none';
      continue;
    }
    
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
  
  // Skill-Boni anzeigen
  const valueBonus = ((getValueMultiplier() - 1) * 100).toFixed(0);
  const tempoBonus = ((1 - getTempoMultiplier()) * 100).toFixed(0);
  
  // Verwende benutzerfreundlichen Box-Namen
  const displayName = boxDisplayNames[boxType] || boxType;
  const boxIcon = getBoxIcon(boxType);
  
  let html = '<div class="info-header">Gewählte Box: <strong>' + boxIcon + ' ' + displayName + '</strong></div>';
  
  // Skill-Boni anzeigen wenn vorhanden
  if (skills.wohlstand > 0 || skills.glueck > 0 || skills.effizienz > 0) {
    html += '<div class="skill-bonus-info">';
    html += '<strong>🎯 Aktive Skill-Boni:</strong><br>';
    if (skills.wohlstand > 0) {
      html += `💰 Wohlstand: +${valueBonus}% Item-Wert (+3% pro Punkt)<br>`;
    }
    if (skills.glueck > 0) {
      html += `🍀 Glück: Erhöhte Rarity-Chancen + mehr Items (${skills.glueck} Punkte)<br>`;
    }
    if (skills.effizienz > 0) {
      html += `⚡ Tempo: -${tempoBonus}% Untersuchungszeit (-3,5% pro Punkt)<br>`;
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
  for (const [itemId, item] of Object.entries(shopItems).filter(([, it]) => it.type === 'perm')) {
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
    const btnClass = `upgrade-btn shop-buy-btn${canAfford ? ' affordable' : ''}`;
    branch.innerHTML = `
      <h3>${iconHTML} ${item.name}</h3>
      <p class=\"skill-description\">${item.description}${usesText}${beltNote}</p>
      <button class=\"${btnClass}\" data-item-id=\"${itemId}\" ${!canAfford ? 'disabled' : ''}>${priceHTML}</button>
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

// Dev Money Button
if (devMoneyBtn) {
  devMoneyBtn.addEventListener('click', () => {
    balance += 1000000;
    updateBalance();
    saveProgress();
  });
}

// Reset-Button
dom.resetBtn.addEventListener('click', () => {
  if (confirm('Möchtest du deinen gesamten Fortschritt zurücksetzen? Dies kann nicht rückgängig gemacht werden!')) {
    resetProgress();
    // Sammlung schließen nach dem Reset
    closeCollection();
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
  
  // Sammlung schließen (falls geöffnet)
  if (dom.collectionOverlay) {
    dom.collectionOverlay.style.display = 'none';
  }
  
  alert('Fortschritt wurde zurückgesetzt!');
}

function showCollection() {
  const grid = dom.collectionGrid;
  grid.innerHTML = '';

  for (const rarity of rarities) {
    // Abschnitt für jede Rarität
    const section = document.createElement('div');
    section.classList.add('rarity-section');

    // Zähle entdeckte Items dieser Rarität
    const totalItems = (itemPools[rarity] || []).length;
    const discoveredCount = (itemPools[rarity] || []).filter(item => discoveredItems.has(item.name)).length;

    const sectionTitle = document.createElement('h2');
    sectionTitle.textContent = `${rarity} (${discoveredCount}/${totalItems})`;
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
    const pool = itemPools[rarity] || [];
    const names = new Set(pool.map(it => it.name));
    let count = 0;
    for (const name of discoveredItems) {
      if (names.has(name)) count++;
    }
    return count;
  } catch (_) {
    return 0;
  }
}

function canPrestige() {
  const hasLevel = playerLevel >= MAX_LEVEL;
  const hasMyth = getDiscoveredCountByRarity('Mythisch') >= 5;
  // Bedingung: 200 Boxen seit letztem Prestige (nicht Lifetime)
  const hasBoxes = (prestigeState.runBoxesOpened || 0) >= 200;
  return hasLevel && hasMyth && hasBoxes;
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
    }
    if (dom.prestigeInfo) {
      const nextLvl = (prestigeState.level || 0) + 1;
      const currBonusValue = (prestigeState.level * 5) || 0;
      const currBonusLuck = prestigeState.level || 0;
      const nextBonusValue = currBonusValue + 5;
      const nextBonusLuck = currBonusLuck + 1;
      const cLevel = playerLevel >= MAX_LEVEL;
      const cMyth = getDiscoveredCountByRarity('Mythisch') >= 5;
      const cBoxes = (prestigeState.runBoxesOpened || 0) >= 200;
      dom.prestigeInfo.innerHTML = `
        <h3>Bedingungen</h3>
        <ul class="prestige-conds">
          <li class="${cLevel ? 'ok' : 'fail'}">- Level ${MAX_LEVEL} ${cLevel ? '✓' : ''}</li>
          <li class="${cMyth ? 'ok' : 'fail'}">- 5 Mythische Items ${cMyth ? '✓' : ''}</li>
          <li class="${cBoxes ? 'ok' : 'fail'}">- 200 Boxen geöffnet ${cBoxes ? '✓' : ''}</li>
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
          <li>+5% Item-Wert multiplikativ (aktuell: +${currBonusValue}%)</li>
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

function doPrestige() {
  if (!canPrestige()) {
    alert(`Du musst Level ${MAX_LEVEL} erreichen, um zu prestigen.`);
    return;
  }
  // Sicherheitsabfrage
  if (!confirm('Prestige durchführen? Dein Run wird zurückgesetzt, dauerhafte Boni bleiben.')) {
    return;
  }

  // Steigere Prestige-Stufe
  prestigeState.level = (prestigeState.level || 0) + 1;
  // Zähler für "seit letztem Prestige" zurücksetzen
  prestigeState.runBoxesOpened = 0;

  // Reset: Progress und Run-bezogene Strukturen
  balance = 500;
  playerLevel = 0;
  playerXP = 0;
  skillPoints = 0;
  skills.wohlstand = 0;
  skills.glueck = 0;
  skills.effizienz = 0;

  // Shop/Upgrades zurücksetzen
  activeBoosts = { valueBoost: 0, rarityBoost: 0, xpBoost: 0, valueBoostUses: 0, rarityBoostUses: 0, xpBoostUses: 0 };
  permanentUpgrades = { permTempoBoost: 0, permValueBoost: 0, permXPBoost: 0, permPotionBelt: 0 };
  statUpgradesLevels = { wealth: 0, luck: 0, tempo: 0 };
  purchasedItems = new Set();

  // Boxen/Inventar
  unlockedBoxes.clear();
  unlockedBoxes.add('Box#1');
  boxType = 'Box#1';
  keysInventory = { Common: 0, Rare: 0, Epic: 0, Legendary: 0, Mythisch: 0 };

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
  dom.confirmPrestigeBtn.addEventListener('click', () => doPrestige());
}

// Initial Prestige-UI Sync
updatePrestigeUI();

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

// ======= Export/Import Spielstand =======
(function initExportImport() {
  const exportBtn = document.getElementById('exportBtn');
  const importBtn = document.getElementById('importBtn');
  const importFile = document.getElementById('importFile');

  if (!exportBtn || !importBtn || !importFile) return;

  function formatTimestamp(d = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    const yyyy = d.getFullYear();
    const MM = pad(d.getMonth() + 1);
    const dd = pad(d.getDate());
    const HH = pad(d.getHours());
    const mm = pad(d.getMinutes());
    return `${yyyy}${MM}${dd}-${HH}${mm}`;
  }

  function collectSaveSnapshot() {
    // Fortschritt aus Speicherstruktur zusammenstellen
    const progress = {
      balance,
      playerLevel,
      playerXP,
      skillPoints,
      skills: { ...skills },
      boxType,
      unlockedBoxes: Array.from(unlockedBoxes || new Set()),
      stats: { ...stats },
      achievementsState: { ...achievementsState },
      activeBoosts: { ...(typeof activeBoosts === 'object' ? activeBoosts : {}) },
      permanentUpgrades: { ...(typeof permanentUpgrades === 'object' ? permanentUpgrades : {}) },
      purchasedItems: Array.from(purchasedItems || new Set()),
      statUpgradesLevels: { ...(typeof statUpgradesLevels === 'object' ? statUpgradesLevels : {}) },
      keysInventory: { ...keysInventory },
      prestigeState: { ...(typeof prestigeState === 'object' ? prestigeState : { level: 0 }) }
    };
      try {
        const rbo = parseInt(progress.prestigeState.runBoxesOpened, 10);
        prestigeState.runBoxesOpened = isFinite(rbo) && rbo >= 0 ? rbo : 0;
      } catch (_) {
        prestigeState.runBoxesOpened = 0;
      }

    const counts = { ...itemCounts };
    const discovered = Array.from(discoveredItems);
    const discoveredKeys = Array.from(discoveredKeyRarities || new Set());

    // Settings
    const soundSettings = { muted: !!isMuted, volume: Number(globalVolume || 0) };
    const dev = !!devMode;
    const keysBadgesCollapsed = !!__keysBadgesCollapsed;

    const snapshot = {
      meta: {
        app: 'Lootingsimulator',
        version: (typeof window !== 'undefined' && window.__appVersion) ? window.__appVersion : null,
        savedAt: new Date().toISOString()
      },
      data: {
        progress,
        counts,
        discovered,
        discoveredKeys,
        settings: { soundSettings, devMode: dev, keysBadgesCollapsed }
      }
    };
    return snapshot;
  }

  function downloadJSON(obj, filename) {
    const json = JSON.stringify(obj, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(url);
      a.remove();
    }, 0);
  }

  exportBtn.addEventListener('click', () => {
    try {
      const snapshot = collectSaveSnapshot();
      const fname = `lootingsim-save-${formatTimestamp()}.json`;
      downloadJSON(snapshot, fname);
    } catch (e) {
      alert('Export fehlgeschlagen: ' + (e && e.message ? e.message : e));
    }
  });

  importBtn.addEventListener('click', () => {
    importFile.value = '';
    importFile.click();
  });

  importFile.addEventListener('change', () => {
    const file = importFile.files && importFile.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || '');
        const parsed = JSON.parse(text);
        if (!parsed || !parsed.data) throw new Error('Ungültiges Save-Format');
        const d = parsed.data;

        // Minimal-Validierung
        if (!d.progress || !d.counts) throw new Error('Datenfelder fehlen (progress/counts)');

        // In localStorage schreiben (nutzt bestehende Ladepfade beim Reload)
        try {
          localStorage.setItem('lootsim_itemCounts_v1', JSON.stringify(d.counts));
          localStorage.setItem('lootsim_progress_v1', JSON.stringify(d.progress));
          if (Array.isArray(d.discoveredKeys)) {
            localStorage.setItem('lootsim_keyDiscovery_v1', JSON.stringify(d.discoveredKeys));
          }
          if (d.settings && d.settings.soundSettings) {
            localStorage.setItem('soundSettings', JSON.stringify(d.settings.soundSettings));
          }
          if (d.settings && typeof d.settings.devMode === 'boolean') {
            localStorage.setItem('lootsim_devMode_v1', d.settings.devMode ? '1' : '0');
          }
          if (d.settings && typeof d.settings.keysBadgesCollapsed === 'boolean') {
            localStorage.setItem('lootsim_keysBadgesCollapsed_v1', d.settings.keysBadgesCollapsed ? '1' : '0');
          }
          // Prestige-State ist Teil von progress und wird über PROGRESS_KEY übernommen
        } catch (e) {
          console.warn('Konnte nicht in localStorage schreiben', e);
          throw e;
        }

        // Sanfter Reload, damit alle Strukturen korrekt initialisiert werden
        location.reload();
      } catch (e) {
        alert('Import fehlgeschlagen: ' + (e && e.message ? e.message : e));
      }
    };
    reader.onerror = () => alert('Datei konnte nicht gelesen werden.');
    reader.readAsText(file, 'utf-8');
  });
})();
