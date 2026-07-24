# Publishing mc-sdk to GitHub

Repo: https://github.com/TravaMC/mc-sdk

## Push

```powershell
cd "C:\Users\Максим\Desktop\PaperPlugin MCP"
git remote set-url origin https://github.com/TravaMC/mc-sdk.git
git push -u origin main
```

## Optional release / npm

```powershell
npm run build; npm test; npm run smoke
git tag v3.0.0
git push origin v3.0.0
npm publish --access public
```

Package name on npm is `mc-sdk`.

## Cursor users

Point MCP at `dist/index.js` after `npm run build` (see README). Project config file is `.mc-sdk.json`.
