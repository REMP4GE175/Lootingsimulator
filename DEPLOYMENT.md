# Deployment-Workflow für Lootingsimulator

## Entwicklung (lokal)

1. **Code bearbeiten:**
   - Ändere `script.js` (lesbar, debugbar)
   - Teste im Live Server
   - `index.html` lädt `script.js`

2. **Testen:**
   - Öffne im Browser mit Live Server
   - DevTools für Debugging
   - Alle Features testen

---

## Deployment (Website)

### Schritt 1: Build erstellen

```powershell
# Obfuscated Version erstellen
npm run build:prod
```

Dies erstellt `script.min.js` (verschleiert)

### Schritt 2: index.html für Production vorbereiten

Ändere in `index.html` Zeile 18 und 28:
```javascript
// Von:
s.src = 'script.js' + v;

// Zu:
s.src = 'script.min.js' + v;
```

**Oder nutze das Deploy-Script (siehe unten)!**

### Schritt 3: Version aktualisieren (optional)

In `version.json`:
```json
{
  "version": "0.65",
  "date": "2025-11-17"
}
```

### Schritt 4: Deploy zu Firebase

```powershell
firebase deploy --only hosting
```

### Schritt 5: index.html zurücksetzen für lokale Entwicklung

Ändere zurück zu `script.js` für weitere lokale Entwicklung.

---

## Automatisches Deploy-Script (Empfohlen!)

Erstelle `deploy.ps1`:

```powershell
# 1. Build
Write-Host "Building production version..." -ForegroundColor Green
npm run build:prod

# 2. Backup index.html
Copy-Item index.html index.html.backup

# 3. Ändere zu script.min.js
(Get-Content index.html) -replace "script\.js", "script.min.js" | Set-Content index.html

# 4. Deploy
Write-Host "Deploying to Firebase..." -ForegroundColor Green
firebase deploy --only hosting

# 5. Restore index.html
Move-Item index.html.backup index.html -Force

Write-Host "✓ Deployment complete!" -ForegroundColor Green
Write-Host "Live URL: https://looting-simulator-90463.web.app" -ForegroundColor Cyan
```

**Dann einfach:**
```powershell
.\deploy.ps1
```

---

## Schnell-Referenz

| Kommando | Beschreibung |
|----------|--------------|
| `npm run build` | Build mit Source Maps (Development) |
| `npm run build:prod` | Build ohne Source Maps (Production) |
| `firebase deploy` | Deploy alles |
| `firebase deploy --only hosting` | Deploy nur Website |
| `firebase use looting-simulator-90463` | Projekt wechseln |

---

## Wichtig!

- **NIE** `script.js` auf die Website hochladen (nur lokal!)
- **IMMER** `script.min.js` für Production
- Version in `version.json` erhöhen für Cache-Break
- Nach Deploy: index.html zurück zu script.js für lokale Entwicklung
