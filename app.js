/**
 * Cape Jazz & Blues Setlist Builder
 * Repository: podence/capejazzsetlist
 * app.js - Modular Data Ingestion, UI Filtering, Board Management & Export
 */

// --- CONFIGURATION ---
const SPREADSHEET_ID = '1BLrbe4BDbFx7-5XBRlo0ICproWUw6bJot-3rLwa4NJo';
const SHEET_GID = '477864766';

// State Management
let allTracks = [];
let activeFilters = {
  readyA: false,
  readyB: false,
  horns: false,
  pbass: false,
  showHoliday: false,
  search: ''
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
  setDefaultTitle();
  initSortable();
  setupEventListeners();
  loadSheetData();
});

// Sets default gig title to "Set List M/D/YY" (e.g. Set List 10/17/26)
function setDefaultTitle() {
  const titleInput = document.getElementById('setlist-title');
  if (!titleInput) return;
  const now = new Date();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  const yy = String(now.getFullYear()).slice(-2);
  titleInput.value = `Set List ${m}/${d}/${yy}`;
}

// --- DATA INGESTION (GViz JSONP) ---
function loadSheetData() {
  const callbackName = 'handleGVizData_' + Math.floor(Math.random() * 100000);
  
  window[callbackName] = (data) => {
    try {
      parseGVizPayload(data);
    } catch (err) {
      console.error('Error parsing Google Sheets data:', err);
    } finally {
      delete window[callbackName];
      if (script && script.parentNode) {
        script.parentNode.removeChild(script);
      }
    }
  };

  const script = document.createElement('script');
  script.src = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=responseHandler:${callbackName}&gid=${SHEET_GID}`;
  script.onerror = () => {
    console.error('Failed to load Google Sheet via GViz.');
    const pool = document.getElementById('candidate-pool');
    if (pool) {
      pool.innerHTML = '<div class="p-4 text-rose-400 font-medium">Unable to connect to Google Sheet data source. Verify sheet permissions and connection.</div>';
    }
  };
  document.body.appendChild(script);
}

function parseGVizPayload(gvizData) {
  if (!gvizData || !gvizData.table || !gvizData.table.rows) {
    console.error('Malformed GViz data payload', gvizData);
    return;
  }

  const rows = gvizData.table.rows;
  allTracks = [];

  rows.forEach((row, index) => {
    const c = row.c || [];
    const getVal = (idx) => (c[idx] && c[idx].v !== null && c[idx].v !== undefined) ? String(c[idx].v).trim() : '';

    const tune = getVal(0);                // Col A (0): Tune
    const orig = getVal(1);                // Col B (1): Orig
    const wrkOn = getVal(2);               // Col C (2): wrk on
    const genre = getVal(3);               // Col D (3): Genre
    // Col E (4): Rating (Ignored)
    const ready = getVal(5).toUpperCase(); // Col F (5): Ready
    const pBass = getVal(6);               // Col G (6): P Bass
    const horns = getVal(7);               // Col H (7): Horns
    const estTime = getVal(13);            // Col N (13): Est Time

    // STRICT INGESTION RULE 1:
    // Only ingest if Tune exists AND Ready is strictly 'A' or 'B'
    if (!tune || (ready !== 'A' && ready !== 'B')) {
      return;
    }

    // STRICT INGESTION RULE 2:
    // Holiday check: Col D contains 'Holiday' or title contains holiday keywords
    const holidayRegex = /(holiday|christmas|xmas|santa|noel|winter wonderland|jingle)/i;
    const isHoliday = holidayRegex.test(genre) || holidayRegex.test(tune);

    const isPBass = ['y', 'yes', 'true', '1'].includes(pBass.toLowerCase());
    const isHorns = ['y', 'yes', 'true', '1'].includes(horns.toLowerCase());

    allTracks.
