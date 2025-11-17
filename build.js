const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');

// Konfiguration
const isProduction = process.argv.includes('--production');
const inputFile = 'script.js';
const outputFile = 'script.min.js';

console.log(`Building ${isProduction ? 'PRODUCTION' : 'DEVELOPMENT'} version...`);

// Lese Source-Code
const sourceCode = fs.readFileSync(inputFile, 'utf8');

// Obfuscation-Optionen
const obfuscationOptions = {
  // Basis-Optionen (immer aktiv)
  compact: true,
  controlFlowFlattening: false, // Zu aggressiv, kann Fehler verursachen
  deadCodeInjection: false, // Zu aggressiv
  debugProtection: false, // Kann Probleme verursachen
  debugProtectionInterval: 0,
  disableConsoleOutput: false, // Console logs bleiben
  
  // String-Verschleierung
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false, // Wichtig: Globale Variablen nicht umbenennen
  rotateStringArray: true,
  selfDefending: isProduction, // Nur in Production
  stringArray: true,
  stringArrayCallsTransform: true,
  stringArrayEncoding: ['base64'],
  stringArrayIndexShift: true,
  stringArrayRotate: true,
  stringArrayShuffle: true,
  stringArrayWrappersCount: 2,
  stringArrayWrappersChainedCalls: true,
  stringArrayWrappersParametersMaxCount: 4,
  stringArrayWrappersType: 'function',
  stringArrayThreshold: 0.75,
  
  // Unicode-Escape
  unicodeEscapeSequence: false, // Kann die Dateigröße massiv erhöhen
  
  // Source Maps (nur Development)
  sourceMap: !isProduction,
  sourceMapMode: 'separate'
};

console.log('Obfuscating code...');

// Obfuskiere den Code
const obfuscationResult = JavaScriptObfuscator.obfuscate(sourceCode, obfuscationOptions);

// Schreibe Output
fs.writeFileSync(outputFile, obfuscationResult.getObfuscatedCode(), 'utf8');

// Schreibe Source Map (nur Development)
if (!isProduction && obfuscationResult.getSourceMap()) {
  fs.writeFileSync(outputFile + '.map', obfuscationResult.getSourceMap(), 'utf8');
  console.log(`✓ Source map created: ${outputFile}.map`);
}

// Zeige Statistiken
const originalSize = Buffer.byteLength(sourceCode, 'utf8');
const obfuscatedSize = Buffer.byteLength(obfuscationResult.getObfuscatedCode(), 'utf8');
const reduction = ((1 - obfuscatedSize / originalSize) * 100).toFixed(2);

console.log(`✓ Build complete!`);
console.log(`  Original:    ${(originalSize / 1024).toFixed(2)} KB`);
console.log(`  Obfuscated:  ${(obfuscatedSize / 1024).toFixed(2)} KB`);
console.log(`  Change:      ${reduction > 0 ? '-' : '+'}${Math.abs(reduction)}%`);
console.log(`  Output:      ${outputFile}`);
console.log('');
console.log('Next steps:');
console.log('1. Test script.min.js in your browser');
console.log('2. Update index.html to load script.min.js instead of script.js');
console.log('3. Deploy to your website');
