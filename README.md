# VUMC Kids Check-In v2

This frontend connects to the existing Google Apps Script backend and provides:

- Backend health status
- Live Planning Center child roster
- Search and multi-child selection
- Attendance submission
- Guest check-in
- Pickup code verification and check-out
- Installable PWA support

## Important limitation

The current GAS backend does not contain a staff authentication action. Do not place a staff PIN in public GitHub JavaScript. Add authentication to GAS later if kiosk locking is required.

## Installation

1. Download and unzip this project.
2. Open the `kids-checkin` GitHub repository.
3. Remove or rename the broken root `index.html`.
4. Upload all files and folders from this package to the repository root.
5. Confirm GitHub Pages is set to:
   - Source: Deploy from a branch
   - Branch: `main`
   - Folder: `/ (root)`
6. Wait one to three minutes.
7. Open:
   `https://vumc-media.github.io/kids-checkin/`
8. Hard refresh once:
   - Mac: Command + Shift + R
   - Windows: Ctrl + Shift + R

## Testing order

1. Confirm the header says `Backend online`.
2. Confirm children load from Planning Center.
3. Search for a child.
4. Select one or more children.
5. Click `Complete Check-In`.
6. Record the displayed pickup code.
7. Open the Pickup tab.
8. Enter the pickup code.
9. Confirm the names appear and the code is marked checked out.

## Editing the GAS address

The deployed GAS URL is stored only in:

`js/config.js`

## Deploying future changes

Because this app uses a service worker, update the `CACHE_NAME` in `service-worker.js` whenever files change. For example:

`vumc-kids-v2-2`

This forces kiosk devices to download the latest version.
