/**
 * Cape Jazz & Blues Setlist Builder
 * app.js - Direct CSV Ingestion matching index.html IDs
 */

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
  },
  updateStats: () => updateSetStats()
};

// State
let allSongs = [];
let activeFilter = 'all';
let showHoliday = false;

// Initialize on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  setDefaultTitle();
  initSortable();
  setupEventListeners();
  loadSheetCSV();
});

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
    pool.innerHTML = '<div class="p-3 text-slate-400 text-xs">Loading songs from Google Sheet...</div>';
  }

  const csvUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${SHEET_GID}`;

  try {
    const res = await fetch(csvUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status} - Check sheet sharing permissions`);
    const csvText = await res.text();
    parseCSVAndIngest(csvText);
  } catch (err) {
    console.error('Sheet fetch error:', err);
    if (pool) {
      pool.innerHTML = `<div class="p-3 text-rose-300 bg-rose-950/60 border border-rose-800 rounded text-xs">Failed to load songs: ${err.message}</div>`;
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

  // Data starts at Sheet Row 4 (index 3). Row index 2 contains headers.
  for (let i = 3; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length === 0) continue;

    const title = (r[0] || '').trim();
    const genre = (r[2] || '').trim();
    const rawReady = (r[5] || '').trim().toUpperCase();
    const rawPBass = (r[6] || '').trim();
    const rawHorns = (r[7] || '').trim();
    const rawTime = (r[10] || '').trim();

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
  renderPool();
}

// Determine genre CSS class
function getGenreTitleClass(song) {
  if (song.isHoliday) return 'title-holiday';
  const g = (song.genre || '').toLowerCase();
  if (g.includes('jazz')) return 'title-jazz';
  if (g.includes('blues')) return 'title-blues';
  return 'title-other';
}

// 5. Render Candidate Cards to #pool-list
function renderPool() {
  const pool = document.getElementById('pool-list');
  const countBadge = document.getElementById('pool-count');
  if (!pool) return;

  const assignedIds = new Set();
  document.querySelectorAll('#set1-list [data-id], #set1-res-list [data-id], #set2-list [data-id], #set2-res-list [data-id]').forEach(el => {
    assignedIds.add(el.getAttribute('data-id'));
  });

  const visibleSongs = allSongs.filter(song => {
    if (assignedIds.has(song.id)) return false;
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
  card.setAttribute('data-id', song.id);
  card.setAttribute('data-title', song.title);
  card.setAttribute('data-duration', song.duration);

  const titleClass = getGenreTitleClass(song);

  card.innerHTML = `
    <div class="flex items-center justify-between mb-1.5 pointer-events-none">
      <span class="${titleClass} font-semibold">${escapeHtml(song.title)}</span>
      <span class="font-mono text-[11px] text-slate-400">${song.duration}</span>
    </div>
    <div class="flex items-center justify-between text-[10px] pointer-events-none">
      <div class="flex items-center gap-1.5">
        <span class="px-1.5 py-0.5 rounded font-mono font-bold ${song.ready === 'A' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-blue-950 text-blue-400 border border-blue-800'}">
          Ready ${song.ready}
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
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-drag',
      onEnd: (evt) => {
        updateSetStats();
        // If a card was dragged into or out of the candidate pool, re-render the pool to respect current filters & clean IDs
        if (evt.to.id === 'pool-list' || evt.from.id === 'pool-list') {
          renderPool();
        }
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

// 9. Event Listeners & UI Hooks
function setupEventListeners() {
  const syncBtn = document.getElementById('btn-reload-sheet');
  if (syncBtn) {
    syncBtn.addEventListener('click', () => loadSheetCSV());
  }

  const resetBtn = document.getElementById('btn-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      document.getElementById('set1-list').innerHTML = '';
      document.getElementById('set1-res-list').innerHTML = '';
      document.getElementById('set2-list').innerHTML = '';
      document.getElementById('set2-res-list').innerHTML = '';
      updateSetStats();
      renderPool();
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

  // Setup Plain Text Import Modal
  setupImportModal();
}

// 10. Plain Text Import Modal Logic
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
  let currentTarget = document.getElementById('set1-list');

  // Clear existing sets before importing
  document.getElementById('set1-list').innerHTML = '';
  document.getElementById('set1-res-list').innerHTML = '';
  document.getElementById('set2-list').innerHTML = '';
  document.getElementById('set2-res-list').innerHTML = '';

  lines.forEach(line => {
    const upper = line.toUpperCase();

    // Section headers
    if (upper.includes('SET ONE') || upper.includes('SET 1')) {
      currentTarget = document.getElementById('set1-list');
      return;
    }
    if (upper.includes('SET TWO') || upper.includes('SET 2')) {
      currentTarget = document.getElementById('set2-list');
      return;
    }
    if (upper.includes('RESERVE') || upper.includes('ALTERNATES')) {
      if (currentTarget === document.getElementById('set1-list')) {
        currentTarget = document.getElementById('set1-res-list');
      } else {
        currentTarget = document.getElementById('set2-res-list');
      }
      return;
    }

    // Strip leading numbering, bullets, dashes (e.g., "1. Song", "- Song", "1 ) Song")
    const cleanedLine = line.replace(/^[\d]+[\.\)\-\s]+/, '').replace(/^[\-\*•]\s*/, '').trim();
    if (!cleanedLine) return;

    // Direct match against known songs (case-insensitive)
    const normalizedInput = cleanedLine.toLowerCase().replace(/[^a-z0-9]/g, '');
    const matchedSong = allSongs.find(s => s.title.toLowerCase().replace(/[^a-z0-9]/g, '') === normalizedInput);

    if (matchedSong) {
      currentTarget.appendChild(createSongCard(matchedSong));
    } else {
      // If it doesn't match a song title in the pool, treat as a stage cue
      currentTarget.appendChild(createCueCard(cleanedLine));
    }
  });

  updateSetStats();
  renderPool();
}

// 11. Word Document Generation (Standard & Geoff's Format, Unnumbered)
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
        :
