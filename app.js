/**
 * Cape Jazz & Blues - Setlist Builder
 * app.js
 */

const SPREADSHEET_ID = '1BLrbe4BDbFx7-5XBRlo0ICproWUw6bJot-3rLwa4NJo';
const SHEET_GID = '477864766';

// MASTER REGISTRY
const itemRegistry = new Map();

let allSheetSongs = [];
let candidateSongs = [];

let set1Main = [];
let set1Reserve = [];
let set2Main = [];
let set2Reserve = [];

let currentReadyFilter = 'ALL';
let filterBass = false;
let filterHorns = false;
let filterHoliday = false;

// Initialize
window.addEventListener('DOMContentLoaded', () => {
  setDefaultTitle();
  initDnD();
  setupHolidayToggle();
  fetchSheetJsonp();
});

function setDefaultTitle() {
  const titleEl = document.getElementById('gig-title');
  if (titleEl) {
    const now = new Date();
    const m = now.getMonth() + 1;
    const d = now.getDate();
    const yy = String(now.getFullYear()).slice(-2);
    titleEl.value = `Set List ${m}/${d}/${yy}`;
  }
}

function createSwitchGuitarsCue() {
  const cue = {
    id: 'cue_' + Math.random().toString(36).substr(2, 9),
    title: 'Switch guitars',
    cleanTitle: 'switchguitars',
    isCue: true,
    duration: '0:00'
  };
  itemRegistry.set(cue.id, cue);
  return cue;
}

function parseDurationToSeconds(durStr) {
  if (!durStr || String(durStr).trim() === '') return 180;
  const parts = String(durStr).trim().split(':').map(Number);
  if (parts.some(isNaN)) return 180;

  if (parts.length === 3) {
    return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
  } else if (parts.length === 2) {
    return (parts[0] * 60) + parts[1];
  } else if (parts.length === 1) {
    return parts[0] * 60;
  }
  return 180;
}

function formatCardDuration(durStr) {
  const totalSec = parseDurationToSeconds(durStr);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

function resetState() {
  fetchSheetJsonp();
}

function fetchSheetJsonp() {
  const existing = document.getElementById('gviz-jsonp-script');
  if (existing) existing.remove();
  const script = document.createElement('script');
  script.id = 'gviz-jsonp-script';
  script.src = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=responseHandler:handleGvizResponse&gid=${SHEET_GID}`;
  document.body.appendChild(script);
}

// Global handler exactly matching Google's JSONP response
window.handleGvizResponse = function(response) {
  if (!response || !response.table || !response.table.rows) {
    console.error('Invalid GViz response:', response);
    return;
  }
  const rows = response.table.rows;
  const parsed = [];
  itemRegistry.clear();

  for (let i = 3; i < rows.length; i++) {
    const c = rows[i].c;
    if (!c) continue;

    const title = c[0] ? String(c[0].v || '').trim() : '';
    const genre = c[2] ? String(c[2].v || '').trim() : '';
    const ready = c[5] ? String(c[5].v || '').trim().toUpperCase() : '';
    const pBass = c[6] ? String(c[6].v || '').trim() : '';
    const horns = c[7] ? String(c[7].v || '').trim() : '';
    const rawDur = c[10] ? String(c[10].f || c[10].v || '').trim() : '';

    // Universal Ingestion Gate: Title must exist and Readiness must be strictly 'A' or 'B'
    if (title && (ready === 'A' || ready === 'B')) {
      const isHoliday = /holiday/i.test(genre) ||
                        /\b(christmas|xmas|santa|noel|winter wonderland|jingle)\b/i.test(title);

      const song = {
        id: 'song_' + i + '_' + title.replace(/[^a-zA-Z0-9]/g, ''),
        title: title,
        cleanTitle: title.toLowerCase().replace(/[^a-z0-9]/g, ''),
        genre: genre,
        readiness: ready,
        philBass: pBass !== '' && pBass !== '0' && pBass.toLowerCase() !== 'no',
        horns: horns !== '' && horns !== '0' && horns.toLowerCase() !== 'no',
        duration: formatCardDuration(rawDur),
        rawDuration: rawDur,
        isCue: false,
        isHoliday: isHoliday
      };
      itemRegistry.set(song.id, song);
      parsed.push(song);
    }
  }

  allSheetSongs = parsed;
  candidateSongs = [createSwitchGuitarsCue(), ...allSheetSongs];
  set1Main = [];
  set1Reserve = [];
  set2Main = [];
  set2Reserve = [];
  renderAll();
};

function setupHolidayToggle() {
  const holidayBtn = document.getElementById('chip-holiday') || document.querySelector('[onclick*="Holiday"], [id*="holiday"]');
  if (holidayBtn) {
    holidayBtn.onclick = () => {
      filterHoliday = !filterHoliday;
      holidayBtn.classList.toggle('active', filterHoliday);
      renderAll();
    };
  }
}

function renderAll() {
  // Ensure "Switch guitars" card is always available in Candidates
  const hasSwitchInCandidates = candidateSongs.some(s => s.isCue && s.title.toLowerCase().includes('switch guitar'));
  if (!hasSwitchInCandidates) {
    candidateSongs.unshift(createSwitchGuitarsCue());
  }

  const q = (document.getElementById('search-input')?.value || '').toLowerCase();
  const candEl = document.getElementById('list-candidates');
  const s1MainEl = document.getElementById('list-set1-main');
  const s1ResEl = document.getElementById('list-set1-reserve');
  const s2MainEl = document.getElementById('list-set2-main');
  const s2ResEl = document.getElementById('list-set2-reserve');

  if (candEl) candEl.innerHTML = '';
  if (s1MainEl) s1MainEl.innerHTML = '';
  if (s1ResEl) s1ResEl.innerHTML = '';
  if (s2MainEl) s2MainEl.innerHTML = '';
  if (s2ResEl) s2ResEl.innerHTML = '';

  const filteredCandidates = candidateSongs.filter(s => {
    if (s.isCue) return true;

    // Holiday filter gate:
    // Hidden by default; visible only when filterHoliday is toggled ON
    if (s.isHoliday && !filterHoliday) return false;

    // Category / Readiness filters
    if (currentReadyFilter !== 'ALL' && s.readiness !== currentReadyFilter) return false;
    if (filterBass && !s.philBass) return false;
    if (filterHorns && !s.horns) return false;

    // Search query
    if (q && !s.title.toLowerCase().includes(q) && !s.genre.toLowerCase().includes(q)) return false;

    return true;
  });

  const songCountOnly = filteredCandidates.filter(s => !s.isCue).length;
  const candCountEl = document.getElementById('cand
