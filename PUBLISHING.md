# Publishing mc-sdk to GitHub

Target: https://github.com/TsuckermanDev/mc-sdk

## 1. Create the empty GitHub repo

On GitHub: **New repository** → name `mc-sdk` → **Public** → **do not** add README/LICENSE/gitignore (this tree already has them).

(API create failed with the current GitHub token: missing `repo` / `public_repo` scope — create in the UI or re-auth with those scopes.)

## 2. Push this tree

```powershell
cd "C:\Users\Максим\Desktop\PaperPlugin MCP"
git remote add origin https://github.com/TsuckermanDev/mc-sdk.git
git push -u origin main
```

## 3. Optional release / npm

```powershell
npm run build; npm test; npm run smoke
git tag v3.0.0
git push origin v3.0.0
npm publish --access public
```

Package name on npm is `mc-sdk`.

## Cursor users

Point MCP at `dist/index.js` after `npm run build` (see README). Project config file is `.mc-sdk.json`.
