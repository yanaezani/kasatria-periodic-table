# Periodic Table of People — Kasatria assessment

A modified version of the three.js `css3d_periodictable` demo. Users sign in with Google, the page reads
200 records from a Google Sheet, and shows them as tiles in four layouts: Table (20×10), Sphere,
Double Helix and Grid (5×4×10). Tiles are coloured by Net Worth: red < $100K, orange $100K–$200K, green > $200K.

## Files
| File | Purpose |
|---|---|
| `index.html` | Login screen (Image A) + 3D view |
| `main.js` | Google sign-in, Sheets fetch, tiles, 4 layouts |
| `style.css` | Login and tile styling |
| `config.js` | **Your Client ID and Sheet ID go here** |
| `data.csv` | The data, converted to UTF-8 — import this into Google Sheets |

## Setup

### 1. Google Sheet (assignment step 1)
1. Go to sheets.google.com → Blank spreadsheet.
2. File → Import → Upload → `data.csv` → "Replace current sheet".
3. Share → add **lisa@kasatria.com** as Viewer.
4. Copy the sheet ID from the URL: `docs.google.com/spreadsheets/d/<THIS_PART>/edit`.

### 2. Google Cloud project (assignment step 2)
1. console.cloud.google.com → create a new project.
2. APIs & Services → Library → enable **Google Sheets API**.
3. APIs & Services → OAuth consent screen → External. Add app name and your email.
   Add the scope `.../auth/spreadsheets.readonly`.
   Under **Test users**, add your own email *and* `lisa@kasatria.com` (while the app is in "Testing", only test users can sign in).
4. APIs & Services → Credentials → Create credentials → OAuth client ID → **Web application**.
   Under **Authorized JavaScript origins** add:
   - `http://localhost:8000` (local testing)
   - your hosted URL, e.g. `https://<username>.github.io`
5. Copy the Client ID.

### 3. Configure
Edit `config.js` and paste in `CLIENT_ID` and `SHEET_ID`.

### 4. Run locally
```
python -m http.server 8000
```
Open http://localhost:8000. (It must be served over http, not opened as a file.)

Add `?demo` to the URL (http://localhost:8000/?demo) to preview the layouts from `data.csv` without Google.

### 5. Host it (assignment step 10)
GitHub Pages is the simplest: push these files to a repo → Settings → Pages → deploy from `main` branch.
Add the resulting `https://<username>.github.io` origin to the OAuth client (step 2.4), then send that URL.

## How it works
- **Sign-in:** Google Identity Services token client requests read-only Sheets access; the user's name and photo show in the top bar.
- **Data:** `GET sheets.googleapis.com/v4/spreadsheets/{id}/values/A:F` with the access token. Columns are matched by header name, so order doesn't matter.
- **Table:** 20 columns × 10 rows, centred.
- **Sphere:** same as the original demo.
- **Double helix:** even-indexed tiles on strand A, odd on strand B, offset by 180°.
- **Grid:** x = i mod 5, y = ⌊i/5⌋ mod 4, z = ⌊i/20⌋ → 5 × 4 × 10.
- Drag to rotate, scroll to zoom, right-drag to pan.
