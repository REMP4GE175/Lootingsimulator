# Build-System für Code-Obfuscation

Dieses Setup verschleiert dein JavaScript für die Production-Website.

## Installation

```powershell
npm install
```

## Verwendung

### Development Build (mit Source Maps zum Debuggen)
```powershell
npm run build
```

### Production Build (maximale Verschleierung)
```powershell
npm run build:prod
```

## Was passiert?

Der Build-Prozess:
1. Liest `script.js`
2. Verschleiert den Code:
   - Umbenennung von Variablen (z.B. `balance` → `_0x3a7f`)
   - String-Verschlüsselung (Base64)
   - Code-Transformation
   - String-Array-Rotation
3. Erstellt `script.min.js`

## Deployment

1. Baue Production-Version: `npm run build:prod`
2. Teste `script.min.js` lokal
3. Lade `script.min.js` auf deine Website hoch
4. Ändere `index.html`:
   ```html
   <!-- Alt: -->
   <script src="script.js"></script>
   
   <!-- Neu: -->
   <script src="script.min.js"></script>
   ```

## Wichtig

- `script.js` bleibt deine Entwicklungs-Datei (lesbar, editierbar)
- `script.min.js` ist nur für die Website (verschleiert)
- **Niemals** `script.js` auf die Website hochladen
- Bei Änderungen: `script.js` bearbeiten, dann neu builden

## Sicherheit

⚠️ **Hinweis:** Obfuscation ist **keine echte Sicherheit**. Der Code kann theoretisch noch dekompiliert werden, aber es ist deutlich schwerer zu verstehen.

## Dateien

- `package.json` - NPM Konfiguration
- `build.js` - Build-Script
- `script.js` - Original (bearbeitbar)
- `script.min.js` - Obfuscated Output (nicht bearbeiten!)
