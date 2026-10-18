/**
 * Cape Jazz & Blues Setlist Builder
 * app.js - Direct CSV Ingestion matching index.html IDs + Isolated LocalStorage Persistence + Guaranteed Pool Render
 */

const STORAGE_KEY = 'capejazz_saved_state';

// Visual error catcher: surface errors directly to the on-screen error banner
window.addEventListener('error', (event) => {
  const banner = document.getElementById('error-banner');
  const msg = document.getElementById('error-msg');
  if (banner && msg) {
    banner.classList.remove('hidden');
    msg.innerText = `${event.message} (${event.filename ? event.filename.split('/').pop() : 'script'}:${event.lineno})`;
  }
});

const SPREADSHEET_ID = '1BLrbe4BDbFx7-5XBRlo0ICproWUw6bJot-3rLwa4NJo';
const SHEET_GID = '477864766';

// Global app handlers exposed immediately before any DOM event runs
window.app = {
  addCustomCue: (setKey) => {
    const text = prompt("Enter stage cue (e.g. 'Switch guitars', 'Acoustic Guitar', 'Break'):", "Switch guitars");
    if (!text || !text.trim()) return;
    const target = setKey === 'set1' ? document.getElementById('set1-list') : document.getElementById('set2-list');
    if (!target) return;

    target.appendChild(createCueCard(text.trim()));
    updateSetStats();
    saveCurrentState();
  },
  updateStats: () => {
    updateSetStats();
    saveCurrentState();
  }
};

// State
let allSongs = [];
let activeFilter = 'all';
let showHoliday = false;

// Initialize as soon as DOM is ready or immediately if already loaded
function startApp() {
  initSortable();
  setupEventListeners();
  loadSheetCSV();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startApp);
} else {
  startApp();
}

// 1. Default Title: "Set List M/D/YY"
function setDefaultTitle() {
  const titleInput = document.getElementById('gig-title');
  if (!titleInput) return;
  const now = new Date();
  const m = now.getMonth() + 1;
  const d = now.getDate();
  const yy = String(now.getFullYear()).slice(-2);
  titleInput.value = `Set List ${m}/${d}/${yy}`;
}

// 2. Fetch CSV Directly from Google Sheets
async function loadSheetCSV() {
  const pool = document.getElementById('pool-list');
  if (pool) {
    pool.innerHTML = '<div class="p-3 text-slate-400 text-xs font-mono">⏳ Loading songs from Google Sheet...</div>';
  }

  const csvUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${SHEET_GID}`;

  try {
    const res = await fetch(csvUrl);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: Ensure Google Sheet is shared with 'Anyone with the link can view'`);
    }
    const csvText = await res.text();
    parseCSVAndIngest(csvText);
  } catch (err) {
    console.error('Sheet fetch error:', err);
    if (pool) {
      pool.innerHTML = `<div class="p-3 text-rose-300 bg-rose-950/80 border border-rose-800 rounded text-xs leading-relaxed">
        <strong>Error loading songs:</strong><br>${err.message}
      </div>`;
    }
    const banner = document.getElementById('error-banner');
    const msg = document.getElementById('error-msg');
    if (banner && msg) {
      banner.classList.remove('hidden');
      msg.innerText = `Google Sheet Load Failure: ${err.message}`;
    }
  }
}

// 3. Robust CSV Parser
function parseCSV(text) {
  const lines = [];
  let row = [''];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        row[row.length - 1] += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      row.push('');
    } else if ((char === '\r' || char === '\n') && !inQuotes) {
      if (char === '\r' && next === '\n') i++;
      lines.push(row);
      row = [''];
    } else {
      row[row.length - 1] += char;
    }
  }
  if (row.length > 1 || row[0] !== '') lines.push(row);
  return lines;
}

// 4. Ingest & Gate Data
function parseCSVAndIngest(csvText) {
  const rows = parseCSV(csvText);
  allSongs = [];

  // Locate the header row dynamically
  let headerRowIndex = -1;
  let colTitle = 0;
  let colGenre = 2;
  let colReady = 5;
  let colPBass = 6;
  let colHorns = 7;
  let colTime = 10;

  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const r = rows[i].map(c => (c || '').toLowerCase().trim());
    const tIdx = r.findIndex(c => c === 'title' || c.includes('song title'));
    if (tIdx !== -1) {
      headerRowIndex = i;
      colTitle = tIdx;
      const gIdx = r.findIndex(c => c === 'genre');
      if (gIdx !== -1) colGenre = gIdx;
      const rIdx = r.findIndex(c => c === 'ready');
      if (rIdx !== -1) colReady = rIdx;
      const pIdx = r.findIndex(c => c.includes('bass') || c.includes('phil'));
      if (pIdx !== -1) colPBass = pIdx;
      const hIdx = r.findIndex(c => c.includes('horn'));
      if (hIdx !== -1) colHorns = hIdx;
      const dIdx = r.findIndex(c => c.includes('time') || c.includes('duration'));
      if (dIdx !== -1) colTime = dIdx;
      break;
    }
  }

  const startIndex = headerRowIndex !== -1 ? headerRowIndex + 1 : 3;

  for (let i = startIndex; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length === 0) continue;

    const title = (r[colTitle] || '').trim();
    const genre = (r[colGenre] || '').trim();
    const rawReady = (r[colReady] || '').trim().toUpperCase();
    const rawPBass = (r[colPBass] || '').trim();
    const rawHorns = (r[colHorns] || '').trim();
    const rawTime = (r[colTime] || '').trim();

    // STRICT CRITERION: Title must exist AND Ready must be strictly 'A' or 'B'
    if (!title || (rawReady !== 'A' && rawReady !== 'B')) {
      continue;
    }

    const isHoliday = /holiday/i.test(genre) ||
                      /\b(christmas|xmas|santa|noel|winter wonderland|jingle)\b/i.test(title);

    allSongs.push({
      id: `song_${i}_${title.replace(/[^a-zA-Z0-9]/g, '')}`,
      title,
      genre,
      ready: rawReady,
      pBass: rawPBass !== '' && rawPBass !== '0' && rawPBass.toLowerCase() !== 'no',
      horns: rawHorns !== '' && rawHorns !== '0' && rawHorns.toLowerCase() !== 'no',
      duration: rawTime || '3:00',
      isHoliday
    });
  }

  console.log(`Ingested ${allSongs.length} eligible songs (A/B Ready).`);

  // Try to restore saved sets; if no valid items restored, set default title
  const hasRestored = restoreSavedState();
  if (!hasRestored) {
    setDefaultTitle();
  }

  // Always force-render candidate pool and stats
  renderPool();
  updateSetStats();
}

// Determine genre CSS class
function getGenreTitleClass(song) {
  if (song.isHoliday) return 'title-holiday';
  const g = (song.genre || '').toLowerCase();
  if (g.includes('jazz')) return 'title-jazz'[cite: 1];
  if (g.includes('blues')) return 'title-blues'[cite: 1];
  return 'title-other'[cite: 1];
}

// 5. Render Candidate Cards to #pool-list
function renderPool() {
  const pool = document.getElementById('pool-list');
  const countBadge = document.getElementById('pool-count');
  if (!pool) return;

  const assignedIds = new Set();
  document.querySelectorAll('#set1-list .song-card, #set1-res-list .song-card, #set2-list .song-card, #set2-res-list .song-card').forEach(el => {
    const id = el.getAttribute('data-id');
    const title = (el.getAttribute('data-title') || '').toLowerCase().trim();
    if (id && !id.startsWith('custom_')) assignedIds.add(id);
    if (title) assignedIds.add(title);
  });

  const visibleSongs = allSongs.filter(song => {
    // Check by unique ID or matching normalized title
    if (assignedIds.has(song.id)) return false;
    if (assignedIds.has(song.title.toLowerCase().trim())) return false;

    if (song.isHoliday && !showHoliday) return false;

    if (activeFilter === 'readyA' && song.ready !== 'A') return false;
    if (activeFilter === 'readyB' && song.ready !== 'B') return false;
    if (activeFilter === 'phil' && !song.pBass) return false;
    if (activeFilter === 'horns' && !song.horns) return false;

    return true;
  });

  pool.innerHTML = '';

  visibleSongs.forEach(song => {
    pool.appendChild(createSongCard(song));
  });

  if (countBadge) {
    countBadge.innerText = visibleSongs.length;
  }
}

// 6. Song Card Builder
function createSongCard(song) {
  const card = document.createElement('div');
  const holidayCardClass = song.isHoliday ? 'genre-holiday-card' : '';
  card.className = `song-card card-song bg-slate-900 border border-slate-800 hover:border-slate-700 p-2.5 rounded select-none cursor-grab text-xs transition-colors ${holidayCardClass}`;
  card.setAttribute('data-id', song.id || `custom_${Date.now()}`);
  card.setAttribute('data-title', song.title || '');
  card.setAttribute('data-duration', song.duration || '3:00');
  card.setAttribute('data-genre', song.genre || '');
  card.setAttribute('data-ready', song.ready || '');
  card.setAttribute('data-pbass', song.pBass ? 'true' : 'false');
  card.setAttribute('data-horns', song.horns ? 'true' : 'false');
  card.setAttribute('data-isholiday', song.isHoliday ? 'true' : 'false');

  const titleClass = getGenreTitleClass(song);

  card.innerHTML = `
    <div class="flex items-center justify-between mb-1.5 pointer-events-none">
      <span class="${titleClass} font-semibold">${escapeHtml(song.title || '')}</span>
      <span class="font-mono text-[11px] text-slate-400">${song.duration || '3:00'}</span>
    </div>
    <div class="flex items-center justify-between text-[10px] pointer-events-none">
      <div class="flex items-center gap-1.5">
        <span class="px-1.5 py-0.5 rounded font-mono font-bold ${song.ready === 'A' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : (song.ready === 'B' ? 'bg-blue-950 text-blue-400 border border-blue-800' : 'bg-slate-800 text-slate-300 border border-slate-700')}">
          ${song.ready ? `Ready ${song.ready}` : 'Custom'}
        </span>
        ${song.pBass ? '<span class="px-1.5 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800 font-bold">🎸 Bass</span>' : ''}
        ${song.horns ? '<span class="px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 font-bold">🎺 Horns</span>' : ''}
      </div>
      ${song.genre ? `<span class="text-slate-500 italic">${escapeHtml(song.genre)}</span>` : ''}
    </div>
  `;
  return card;
}

// Cue Card Builder
function createCueCard(text) {
  const card = document.createElement('div');
  card.className = 'song-card card-cue bg-rose-950/40 border border-rose-800 text-rose-200 p-2 rounded text-xs select-none cursor-grab flex items-center justify-between';
  card.setAttribute('data-cue', 'true');
  card.setAttribute('data-title', text);
  card.innerHTML = `
    <span class="italic font-semibold pointer-events-none">📌 ${escapeHtml(text)}</span>
    <button type="button" class="btn-remove-cue text-rose-400 hover:text-rose-200 ml-2 font-bold cursor-pointer">✕</button>
  `;

  card.querySelector('.btn-remove-cue').addEventListener('click', (e) => {
    e.stopPropagation();
    card.remove();
    updateSetStats();
    saveCurrentState();
  });

  return card;
}

function escapeHtml(str) {
  return str.replace(/[&<>'"]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[tag] || tag));
}

// 7. SortableJS Drag & Drop
function initSortable() {
  if (typeof Sortable === 'undefined') {
    console.warn('SortableJS library not loaded.');
    return;
  }

  const containers = [
    document.getElementById('pool-list'),
    document.getElementById('set1-list'),
    document.getElementById('set1-res-list'),
    document.getElementById('set2-list'),
    document.getElementById('set2-res-list')
  ].filter(Boolean);

  containers.forEach(container => {
    new Sortable(container, {
      group: 'setlist-builder',
      animation: 150,
      ghostClass: 'sortable-ghost'[cite: 1],
      chosenClass: 'sortable-drag'[cite: 1],
      onEnd: (evt) => {
        updateSetStats();
        if (evt.to.id === 'pool-list' || evt.from.id === 'pool-list') {
          renderPool();
        }
        saveCurrentState();
      }
    });
  });
}

// 8. Timings & Counts
function updateSetStats() {
  calculateColumnStats('set1-list', 'set1-count', 'set1-time');
  calculateColumnStats('set2-list', 'set2-count', 'set2-time');
}

function calculateColumnStats(containerId, countId, timeId) {
  const container = document.getElementById(containerId);
  const countEl = document.getElementById(countId);
  const timeEl = document.getElementById(timeId);
  if (!container) return;

  const cards = container.querySelectorAll('.song-card');
  let totalSec = 0;
  let songCount = 0;

  cards.forEach(c => {
    if (c.getAttribute('data-cue') === 'true') return;
    songCount++;
    const durStr = c.getAttribute('data-duration') || '3:00';
    const parts = durStr.split(':').map(Number);
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      totalSec += (parts[0] * 60) + parts[1];
    } else if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      totalSec += (parts[0] * 3600) + (parts[1] * 60) + parts[2];
    } else {
      totalSec += 180;
    }
  });

  if (countEl) countEl.innerText = `${songCount} songs`;
  if (timeEl) {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    timeEl.innerText = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }
}

// 9. LocalStorage Persistence Engine
function saveCurrentState() {
  try {
    const serializeContainer = (id) => {
      const container = document.getElementById(id);
      if (!container) return [];
      const items = [];
      container.querySelectorAll('.song-card').forEach(c => {
        if (c.getAttribute('data-cue') === 'true') {
          items.push({ type: 'cue', title: c.getAttribute('data-title') });
        } else {
          items.push({
            type: 'song',
            id: c.getAttribute('data-id'),
            title: c.getAttribute('data-title'),
            duration: c.getAttribute('data-duration'),
            genre: c.getAttribute('data-genre'),
            ready: c.getAttribute('data-ready'),
            pBass: c.getAttribute('data-pbass') === 'true',
            horns: c.getAttribute('data-horns') === 'true',
            isHoliday: c.getAttribute('data-isholiday') === 'true'
          });
        }
      });
      return items;
    };

    const set1 = serializeContainer('set1-list');
    const set1Res = serializeContainer('set1-res-list');
    const set2 = serializeContainer('set2-list');
    const set2Res = serializeContainer('set2-res-list');

    // Only save if there's actually something present
    if (set1.length === 0 && set1Res.length === 0 && set2.length === 0 && set2Res.length === 0) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }

    const state = {
      title: document.getElementById('gig-title')?.value || '',
      set1,
      set1Res,
      set2,
      set2Res
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('LocalStorage save failed:', err);
  }
}

function restoreSavedState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const state = JSON.parse(raw);
    if (!state) return false;

    const hasItems = (Array.isArray(state.set1) && state.set1.length > 0) ||
                     (Array.isArray(state.set1Res) && state.set1Res.length > 0) ||
                     (Array.isArray(state.set2) && state.set2.length > 0) ||
                     (Array.isArray(state.set2Res) && state.set2Res.length > 0);

    if (!hasItems) {
      localStorage.removeItem(STORAGE_KEY);
      return false;
    }

    if (state.title) {
      const gigTitle = document.getElementById('gig-title');
      if (gigTitle) gigTitle.value = state.title;
    }

    const restoreContainer = (id, items) => {
      const container = document.getElementById(id);
      if (!container || !Array.isArray(items)) return;
      container.innerHTML = '';
      items.forEach(item => {
        if (item.type === 'cue') {
          container.appendChild(createCueCard(item.title));
        } else {
          const knownSong = allSongs.find(s => s.id === item.id || s.title.toLowerCase().trim() === (item.title || '').toLowerCase().trim());
          if (knownSong) {
            container.appendChild(createSongCard(knownSong));
          } else {
            container.appendChild(createSongCard(item));
          }
        }
      });
    };

    restoreContainer('set1-list', state.set1);
    restoreContainer('set1-res-list', state.set1Res);
    restoreContainer('set2-list', state.set2);
    restoreContainer('set2-res-list', state.set2Res);

    return true;
  } catch (err) {
    console.warn('LocalStorage restore failed:', err);
    localStorage.removeItem(STORAGE_KEY);
    return false;
  }
}

// 10. Event Listeners & UI Hooks
function setupEventListeners() {
  const titleInput = document.getElementById('gig-title');
  if (titleInput) {
    titleInput.addEventListener('input', () => saveCurrentState());
  }

  const syncBtn = document.getElementById('btn-reload-sheet');
  if (syncBtn) {
    syncBtn.addEventListener('click', () => {
      localStorage.removeItem(STORAGE_KEY);
      loadSheetCSV();
    });
  }

  const resetBtn = document.getElementById('btn-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      const confirmed = confirm("Are you sure you want to reset all sets? This will clear your current layout.");
      if (!confirmed) return;

      document.getElementById('set1-list').innerHTML = '';
      document.getElementById('set1-res-list').innerHTML = '';
      document.getElementById('set2-list').innerHTML = '';
      document.getElementById('set2-res-list').innerHTML = '';

      localStorage.removeItem(STORAGE_KEY);
      setDefaultTitle();
      renderPool();
      updateSetStats();
    });
  }

  document.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.getAttribute('data-filter');
      renderPool();
    });
  });

  const holidayBtn = document.getElementById('btn-holiday-toggle');
  if (holidayBtn) {
    holidayBtn.addEventListener('click', () => {
      showHoliday = !showHoliday;
      holidayBtn.classList.toggle('active', showHoliday);
      document.body.classList.toggle('holiday-highlight', showHoliday);
      renderPool();
    });
  }

  // Export Dropdown
  const exportBtn = document.getElementById('btn-export-dropdown');
  const exportMenu = document.getElementById('export-menu');
  if (exportBtn && exportMenu) {
    exportBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      exportMenu.classList.toggle('hidden');
    });
    document.addEventListener('click', () => exportMenu.classList.add('hidden'));
  }

  const btnStandard = document.getElementById('btn-export-standard');
  if (btnStandard) {
    btnStandard.addEventListener('click', () => exportWordDoc('standard'));
  }

  const btnGeoff = document.getElementById('btn-export-geoff');
  if (btnGeoff) {
    btnGeoff.addEventListener('click', () => exportWordDoc('geoff'));
  }

  setupImportModal();
}

// 11. Plain Text Import Modal Logic
function setupImportModal() {
  const importModal = document.getElementById('import-modal');
  const openBtn = document.getElementById('btn-open-import-modal');
  const closeBtn = document.getElementById('btn-close-import');
  const runBtn = document.getElementById('btn-run-import');
  const textarea = document.getElementById('import-textarea');

  if (!importModal || !openBtn || !closeBtn || !runBtn || !textarea) return;

  openBtn.addEventListener('click', () => {
    textarea.value = '';
    importModal.classList.remove('hidden');
    textarea.focus();
  });

  closeBtn.addEventListener('click', () => {
    importModal.classList.add('hidden');
  });

  runBtn.addEventListener('click', () => {
    const rawText = textarea.value.trim();
    if (!rawText) {
      importModal.classList.add('hidden');
      return;
    }
    parseAndImportText(rawText);
    importModal.classList.add('hidden');
  });
}

function parseAndImportText(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let currentTarget = null;
  let parsedTitle = null;

  document.getElementById('set1-list').innerHTML = '';
  document.getElementById('set1-res-list').innerHTML = '';
  document.getElementById('set2-list').innerHTML = '';
  document.getElementById('set2-res-list').innerHTML = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const upper = line.toUpperCase();

    if (upper.includes('SET ONE') || upper.includes('SET 1')) {
      currentTarget = document.getElementById('set1-list');
      continue;
    }
    if (upper.includes('SET TWO') || upper.includes('SET 2')) {
      currentTarget = document.getElementById('set2-list');
      continue;
    }
    if (upper.includes('RESERVE') || upper.includes('ALTERNATES')) {
      if (currentTarget === document.getElementById('set1-list')) {
        currentTarget = document.getElementById('set1-res-list');
      } else {
        currentTarget = document.getElementById('set2-res-list');
      }
      continue;
    }

    if (!currentTarget) {
      if (!parsedTitle) {
        parsedTitle = line;
        const gigTitleInput = document.getElementById('gig-title');
        if (gigTitleInput) gigTitleInput.value = line;
      }
      continue;
    }

    if (/\b\d+\s*songs?\b/i.test(line) || /\b\d+\s*mins?\.?\b/i.test(line)) {
      continue;
    }

    const cleanedLine = line.replace(/^[\d]+[\.\)\-\s]+/, '').replace(/^[\-\*•]\s*/, '').trim();
    if (!cleanedLine) continue;

    const lowerCleaned = cleanedLine.toLowerCase();

    const isExplicitCue = /^switch\b/i.test(cleanedLine) ||
                          /^cue\s*:/i.test(cleanedLine) ||
                          lowerCleaned === 'acoustic guitar' ||
                          lowerCleaned === 'break' ||
                          lowerCleaned === 'intermission';

    if (isExplicitCue) {
      currentTarget.appendChild(createCueCard(cleanedLine));
      continue;
    }

    const normLine = lowerCleaned.replace(/[^a-z0-9]/g, '');
    let matchedSong = allSongs.find(s => s.title.toLowerCase().replace(/[^a-z0-9]/g, '') === normLine);

    if (!matchedSong && normLine.length > 5) {
      matchedSong = allSongs.find(s => {
        const normSheet = s.title.toLowerCase().replace(/[^a-z0-9]/g, '');
        return normSheet.includes(normLine) || normLine.includes(normSheet);
      });
    }

    if (matchedSong) {
      currentTarget.appendChild(createSongCard(matchedSong));
    } else {
      const fallbackSong = {
        id: `custom_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
        title: cleanedLine,
        genre: 'Other',
        ready: '',
        pBass: false,
        horns: false,
        duration: '3:00',
        isHoliday: /\b(christmas|xmas|santa|noel|winter wonderland|jingle)\b/i.test(cleanedLine)
      };
      currentTarget.appendChild(createSongCard(fallbackSong));
    }
  }

  updateSetStats();
  renderPool();
  saveCurrentState();
}

// 12. Word Document Generation
function exportWordDoc(format = 'standard') {
  const gigTitle = document.getElementById('gig-title')?.value || "Cape Jazz & Blues Setlist";

  const getSetStatsData = (containerId) => {
    const container = document.getElementById(containerId);
    if (!container) return { count: 0, mins: 0 };
    const cards = container.querySelectorAll('.song-card');
    let totalSec = 0;
    let songCount = 0;

    cards.forEach(c => {
      if (c.getAttribute('data-cue') === 'true') return;
      songCount++;
      const durStr = c.getAttribute('data-duration') || '3:00';
      const parts = durStr.split(':').map(Number);
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        totalSec += (parts[0] * 60) + parts[1];
      } else if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
        totalSec += (parts[0] * 3600) + (parts[1] * 60) + parts[2];
      } else {
        totalSec += 180;
      }
    });

    return { count: songCount, mins: Math.round(totalSec / 60) };
  };

  const buildSetHtml = (listId, resId, label) => {
    const mainCards = document.querySelectorAll(`#${listId} .song-card`);
    const resCards = document.querySelectorAll(`#${resId} .song-card`);
    if (mainCards.length === 0 && resCards.length === 0) return '';

    const stats = getSetStatsData(listId);

    const headerStyle = format === 'geoff'
      ? 'color: #000000; font-size: 18pt; font-weight: bold; text-decoration: underline; margin-bottom: 6pt; text-transform: uppercase;'
      : 'color: #000000; font-size: 14pt; font-weight: bold; text-transform: uppercase; margin-bottom: 6pt;';

    let html = `<div style="${headerStyle}">${label}</div>`;

    mainCards.forEach(c => {
      const isCue = c.getAttribute('data-cue') === 'true';
      const title = c.getAttribute('data-title') || c.innerText.trim();

      if (isCue) {
        if (format === 'geoff') {
          html += `<div style="color: #1F4E79; text-decoration: underline; font-style: italic; font-size: 15pt; margin: 2pt 0;">${escapeHtml(title)}</div>`;
        } else {
          html += `<div style="color: #555555; font-style: italic; font-size: 13.5pt; margin: 2pt 0;">${escapeHtml(title)}</div>`;
        }
      } else {
        if (format === 'geoff') {
          html += `<div style="color: #3B6E8C; font-weight: normal; font-size: 16pt; margin: 2pt 0;">${escapeHtml(title)}</div>`;
        } else {
          html += `<div style="color: #000000; font-weight: normal; font-size: 13.5pt; margin: 2pt 0;">${escapeHtml(title)}</div>`;
        }
      }
    });

    if (stats.count > 0) {
      if (format === 'geoff') {
        html += `<div style="color: #C00000; font-size: 15pt; font-weight: normal; margin-top: 8pt; margin-bottom: 8pt;">${stats.count} songs – ${stats.mins} mins.</div>`;
      } else {
        html += `<div style="color: #000000; font-size: 13.5pt; font-weight: normal; margin-top: 6pt; margin-bottom: 6pt;">${stats.count} songs – ${stats.mins} mins.</div>`;
      }
    }

    if (resCards.length > 0) {
      const resHeaderStyle = format === 'geoff'
        ? 'color: #C00000; font-size: 18pt; font-weight: normal; text-decoration: none; margin-top: 10pt; margin-bottom: 4pt;'
        : 'color: #000000; font-size: 13pt; font-weight: bold; margin-top: 10pt; margin-bottom: 4pt;';

      html += `<div style="${resHeaderStyle}">Reserve</div>`;

      resCards.forEach(c => {
        const isCue = c.getAttribute('data-cue') === 'true';
        const title = c.getAttribute('data-title') || c.innerText.trim();

        if (isCue) {
          if (format === 'geoff') {
            html += `<div style="color: #1F4E79; text-decoration: underline; font-style: italic; font-size: 15pt; margin: 2pt 0;">${escapeHtml(title)}</div>`;
          } else {
            html += `<div style="color: #555555; font-style: italic; font-size: 13.5pt; margin: 2pt 0;">${escapeHtml(title)}</div>`;
          }
        } else {
          if (format === 'geoff') {
            html += `<div style="color: #3B6E8C; font-weight: normal; font-size: 16pt; margin: 2pt 0;">${escapeHtml(title)}</div>`;
          } else {
            html += `<div style="color: #000000; font-weight: normal; font-size: 13.5pt; margin: 2pt 0;">${escapeHtml(title)}</div>`;
          }
        }
      });
    }

    return html;
  };

  const col1Html = buildSetHtml('set1-list', 'set1-res-list', 'SET ONE');
  const col2Html = buildSetHtml('set2-list', 'set2-res-list', 'SET TWO');

  const titleSectionHtml = format === 'geoff'
    ? `<p align="center" style="text-align: center; margin-top: 0in; margin-bottom: 18pt;">
         <span style="font-family: 'Calibri', sans-serif; font-size: 28pt; font-weight: bold; color: #D60000;">
           ${escapeHtml(gigTitle)}
         </span>
       </p>`
    : `<p style="font-family: 'Aptos', sans-serif; color: #000000; font-size: 16pt; font-weight: bold; margin-top: 0in; margin-bottom: 14pt;">
         ${escapeHtml(gigTitle)}
       </p>`;

  const docContent = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
    <head>
      <meta charset='utf-8'>
      <title>${escapeHtml(gigTitle)}</title>
      <style>
        @page { size: 8.5in 11in; margin: 0.75in; }
        body { font-family: ${format === 'geoff' ? "'Calibri', sans-serif" : "'Aptos', sans-serif"}; color: #000; margin: 0; padding: 0; }
        table { width: 100%; border-collapse: collapse; }
        td { width: 50%; vertical-align: top; padding-right: 20pt; }
        td + td { padding-right: 0; padding-left: 20pt; }
      </style>
    </head>
    <body>
      ${titleSectionHtml}
      <table><tr><td>${col1Html}</td><td>${col2Html}</td></tr></table>
    </body>
    </html>
  `;

  const blob = new Blob(['\ufeff', docContent], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${gigTitle.replace(/[^a-zA-Z0-9_-]/g, '_')}_${format}.doc`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
