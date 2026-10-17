/**
 * Cape Jazz & Blues Setlist Builder
 * Modular, defensive state-first implementation.
 */

// Global Visual Error Boundary
window.onerror = function (msg, url, lineNo, columnNo, error) {
  const banner = document.getElementById('error-banner');
  const errorMsg = document.getElementById('error-msg');
  if (banner && errorMsg) {
    banner.classList.remove('hidden');
    errorMsg.textContent = `${msg} [Line: ${lineNo}, Col:${columnNo}]`;
  }
  console.error("Setlist App Global Error:", { msg, url, lineNo, columnNo, error });
  return false;
};

(function () {
  'use strict';

  const CONFIG = {
    SPREADSHEET_ID: '1BLrbe4BDbFx7-5XBRlo0ICproWUw6bJot-3rLwa4NJo',
    SHEET_GID: '477864766',
    SKIP_ROWS: 3
  };

  const state = {
    masterList: [],         // All ingested songs (Standard + Holiday)
    pool: [],               // Remaining songs not placed in sets
    set1: [],               // Set 1 items
    set1_res: [],           // Set 1 Reserve items
    set2: [],               // Set 2 items
    set2_res: [],           // Set 2 Reserve items
    activeCategory: 'all',  // 'all' | 'readyA' | 'readyB' | 'phil' | 'horns'
    includeHoliday: false   // Default OFF: holiday tunes hidden
  };

  function getFormattedTodayDate() {
    const d = new Date();
    const month = d.getMonth() + 1;
    const day = d.getDate();
    const year = String(d.getFullYear()).slice(-2);
    return `Set List ${month}/${day}/${year}`;
  }

  function parseDurationToSec(rawVal, formattedVal) {
    let str = (formattedVal || rawVal || '').toString().trim();
    if (!str) return 0;

    str = str.replace(/[^\d:]/g, '');
    if (!str) return 0;

    const parts = str.split(':').map(p => parseInt(p, 10) || 0);

    if (parts.length === 3) {
      const [h, m, s] = parts;
      if (h === 0) return (m * 60) + s;
      return (h * 3600) + (m * 60) + s;
    }
    if (parts.length === 2) {
      return (parts[0] * 60) + parts[1];
    }
    const floatMins = parseFloat(str);
    if (!isNaN(floatMins)) {
      return Math.round(floatMins * 60);
    }
    return 0;
  }

  function formatSecToMMSS(seconds) {
    const s = Math.max(0, Math.floor(seconds || 0));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  function isTrueFlag(val) {
    if (!val) return false;
    const str = String(val).trim().toUpperCase();
    return str === 'Y' || str === 'YES' || str === 'W' || str === '1' || str === 'TRUE';
  }

  function checkIsHoliday(flatRow, title) {
    const holidayTitles = [
      "i'll be home for christmas",
      "jingle bells",
      "merry little christmas",
      "winter wonderland",
      "blue christmas",
      "christmas time is here",
      "oh christmas tree",
      "santa claus is coming",
      "white christmas",
      "frosty the snowman",
      "we wish you a merry christmas",
      "the christmas song",
      "run rudolph run",
      "rockin around the christmas tree",
      "jingle bell rock"
    ];
    
    const tLower = (title || '').toLowerCase();
    if (holidayTitles.some(ht => tLower.includes(ht))) {
      return true;
    }

    const combined = flatRow.join(' ').toLowerCase();
    return /holiday|christmas|xmas|santa|jingle|winter wonderland|frosty|merry little|rudolph|roastin/i.test(combined);
  }

  function getGenreClass(genre = '', isHoliday = false) {
    if (isHoliday) return 'title-holiday';
    const g = String(genre).toLowerCase();
    if (g.includes('jazz')) return 'title-jazz';
    if (g.includes('blues')) return 'title-blues';
    return 'title-other';
  }

  function normalizeRow(flatCells, rawCells) {
    if (!Array.isArray(flatCells) || flatCells.length === 0) return null;

    const title = flatCells[0] ? String(flatCells[0]).trim() : '';
    if (!title || title.toLowerCase() === 'tune' || title === '`') return null;

    const isHoliday = checkIsHoliday(flatCells, title);

    // Locate Readiness by scanning columns 3 through 7 for single letter A or B
    let readinessRaw = '';
    for (let c = 3; c <= 7; c++) {
      const val = flatCells[c] ? String(flatCells[c]).trim().toUpperCase() : '';
      if (val === 'A' || val === 'B') {
        readinessRaw = val;
        break;
      }
    }

    // Strict Rule:
    // Regular tunes MUST have an explicit Readiness of 'A' or 'B' (blank, C, D, eval rejected)
    // Holiday tunes are ALWAYS ingested so the Holiday button can display them
    if (!isHoliday && readinessRaw !== 'A' && readinessRaw !== 'B') {
      return null;
    }

    // Genre extraction
    let genre = 'Other';
    if (isHoliday) {
      genre = 'Holiday';
    } else if (flatCells[2] && flatCells[2].trim()) {
      genre = flatCells[2].trim();
    } else if (flatCells[1] && flatCells[1].trim()) {
      genre = flatCells[1].trim();
    }

    // Phil on Bass & Horns scans
    let philBass = false;
    let horns = false;
    for (let c = 5; c <= 9; c++) {
      if (isTrueFlag(flatCells[c])) {
        // First occurrence is typically Bass, next is Horns
        if (!philBass && (c === 6 || c === 7)) philBass = true;
        else if (c === 7 || c === 8) horns = true;
      }
    }

    // Duration extraction
    let durationSec = 0;
    for (let c = 9; c < flatCells.length; c++) {
      const val = flatCells[c];
      const fVal = rawCells && rawCells[c] ? (rawCells[c].f || rawCells[c].v) : '';
      const parsed = parseDurationToSec(val, fVal);
      if (parsed > 0) {
        durationSec = parsed;
        break;
      }
    }

    return {
      id: 'song_' + Math.random().toString(36).substring(2, 9),
      title: title,
      genre: genre,
      readiness: readinessRaw || (isHoliday ? 'H' : 'B'),
      philBass: philBass,
      horns: horns,
      durationSec: durationSec,
      isHoliday: isHoliday,
      isCue: false
    };
  }

  function fetchGoogleSheetData() {
    return new Promise((resolve, reject) => {
      const callbackName = 'gvizCallback_' + Math.floor(Math.random() * 1000000);
      const url = `https://docs.google.com/spreadsheets/d/${CONFIG.SPREADSHEET_ID}/gviz/tq?tqx=responseHandler:${callbackName}&gid=${CONFIG.SHEET_GID}`;

      const script = document.createElement('script');
      script.src = url;

      window[callbackName] = function (json) {
        try {
          cleanup();
          const rows = json.table.rows;
          const parsedItems = [];

          for (let i = CONFIG.SKIP_ROWS; i < rows.length; i++) {
            const rowData = rows[i].c || [];
            const flatRow = rowData.map(cell => (cell && cell.v !== null && cell.v !== undefined) ? cell.v : '');
            const normalized = normalizeRow(flatRow, rowData);
            if (normalized) parsedItems.push(normalized);
          }
          resolve(parsedItems);
        } catch (err) {
          reject(err);
        }
      };

      script.onerror = function () {
        cleanup();
        reject(new Error("Network error loading sheet."));
      };

      function cleanup() {
        delete window[callbackName];
        if (script.parentNode) script.parentNode.removeChild(script);
      }

      document.body.appendChild(script);
    });
  }

  function createCardElement(item, listKey) {
    const card = document.createElement('div');
    card.dataset.id = item.id;
    card.dataset.list = listKey;

    if (item.isCue) {
      card.className = 'card-song card-cue flex items-center justify-between text-xs';
      card.innerHTML = `
        <span class="truncate pointer-events-none">🚩 ${escapeHtml(item.title || '+ Stage Cue')}</span>
        <div class="flex items-center gap-1.5 ml-2 pointer-events-auto">
          ${listKey !== 'pool' ? `<button title="Duplicate" class="btn-dup text-xs opacity-70 hover:opacity-100">⎘</button>` : ''}
          <button title="Remove" class="btn-remove text-xs text-rose-400 hover:text-rose-200">✕</button>
        </div>
      `;
      return card;
    }

    const titleColorClass = getGenreClass(item.genre, item.isHoliday);
    const formattedTime = item.durationSec > 0 ? formatSecToMMSS(item.durationSec) : '--:--';

    card.className = `card-song flex items-center justify-between text-xs ${item.isHoliday ? 'genre-holiday-card' : ''}`;
    card.innerHTML = `
      <div class="min-w-0 pr-2 pointer-events-none">
        <p class="font-medium text-sm truncate ${titleColorClass}">${escapeHtml(item.title || 'Untitled')}</p>
        <div class="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
          <span class="font-semibold text-slate-300">[${escapeHtml(item.readiness || '-')}]</span>
          <span>${formattedTime}</span>
          ${item.philBass ? '<span class="text-amber-400 font-bold bg-amber-950/70 border border-amber-600/50 px-1 rounded text-[10px]" title="Phil on Bass">P</span>' : ''}
          ${item.horns ? '<span class="text-emerald-400 font-bold bg-emerald-950/70 border border-emerald-600/50 px-1 rounded text-[10px]" title="Horns">H</span>' : ''}
        </div>
      </div>
      <div class="flex items-center gap-1.5 flex-shrink-0 pointer-events-auto">
        ${listKey !== 'pool' ? `<button title="Duplicate" class="btn-dup text-xs text-slate-400 hover:text-slate-100">⎘</button>` : ''}
        <button title="Remove" class="btn-remove text-xs text-slate-500 hover:text-rose-400">✕</button>
      </div>
    `;

    return card;
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>'"]/g, tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag));
  }

  function renderAll() {
    renderPool();
    renderSetColumn('set1', 'set1-list', 'set1-count', 'set1-time');
    renderSetColumn('set1_res', 'set1-res-list', null, null);
    renderSetColumn('set2', 'set2-list', 'set2-count', 'set2-time');
    renderSetColumn('set2_res', 'set2-res-list', null, null);
  }

  function renderPool() {
    const poolContainer = document.getElementById('pool-list');
    const poolCountEl = document.getElementById('pool-count');
    if (!poolContainer) return;

    poolContainer.innerHTML = '';

    // Collect IDs of songs already in sets so they don't appear in pool
    const assignedIds = new Set([
      ...state.set1.map(s => s.id),
      ...state.set1_res.map(s => s.id),
      ...state.set2.map(s => s.id),
      ...state.set2_res.map(s => s.id)
    ]);

    // Filter from Master Catalog directly to prevent permanent data loss
    const availableSongs = state.masterList.filter(s => !assignedIds.has(s.id));

    const filtered = availableSongs.filter(item => {
      // 1. Holiday Exclusion: If false, completely exclude holiday songs
      if (!state.includeHoliday && item.isHoliday) {
        return false;
      }

      // 2. Base Category Filters
      if (state.activeCategory === 'readyA') return item.readiness === 'A';
      if (state.activeCategory === 'readyB') return item.readiness === 'B';
      if (state.activeCategory === 'phil') return Boolean(item.philBass);
      if (state.activeCategory === 'horns') return Boolean(item.horns);
      
      return true; // 'all'
    });

    filtered.forEach(item => {
      poolContainer.appendChild(createCardElement(item, 'pool'));
    });

    if (poolCountEl) poolCountEl.textContent = filtered.length;
  }

  function renderSetColumn(listKey, containerId, countId, timeId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';
    const items = state[listKey] || [];
    let totalSec = 0;
    let songCount = 0;

    items.forEach(item => {
      if (!item.isCue) {
        totalSec += (item.durationSec || 0);
        songCount++;
      }
      container.appendChild(createCardElement(item, listKey));
    });

    if (countId) {
      const cEl = document.
