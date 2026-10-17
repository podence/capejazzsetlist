/**
 * Cape Jazz & Blues Setlist Builder
 * app.js - Direct CSV Ingestion matching index.html IDs
 */

const SPREADSHEET_ID = '1BLrbe4BDbFx7-5XBRlo0ICproWUw6bJot-3rLwa4NJo';
const SHEET_GID = '477864766';

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
  const countBadge = document.getElementById('pool-count');

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

    // Verified Sheet Column Mapping:
    // Col 0: Tune
    // Col 2: Genre
    // Col 5: Ready
    // Col 6: P Bass
    // Col 7: Horns
    // Col 10: Est Time
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

// 5. Render Candidate Cards to #pool-list
function renderPool() {
  const pool = document.getElementById('pool-list');
  const countBadge = document.getElementById('pool-count');
  if (!pool) return;

  // Track cards already assigned to set columns
  const assignedIds = new Set();
  document.querySelectorAll('#set1-list [data-id], #set1-res-list [data-id], #set2-list [data-id], #set2-res-list [data-id]').forEach(el => {
    assignedIds.add(el.getAttribute('data-id'));
  });

  const visibleSongs = allSongs.filter(song => {
    if (assignedIds.has(song.id)) return false;

    // Holiday filter logic:
    // Hidden by default. If showHoliday is true, they show up alongside regular songs.
    if (song.isHoliday && !showHoliday) return false;

    // Category / Readiness filters
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

// 6. Song Card HTML Builder
function createSongCard(song) {
  const card = document.createElement('div');
  card.className = 'song-card bg-slate-900 border border-slate-800 hover:border-slate-700 p-2.5 rounded select-none cursor-grab text-xs transition-colors';
  card.setAttribute('data-id', song.id);
  card.setAttribute('data-title', song.title);
  card.setAttribute('data-duration', song.duration);

  const titleColor = song.isHoliday ? 'text-[#fca5a5] font-semibold' : 'text-slate-100 font-medium';

  card.innerHTML = `
    <div class="flex items-center justify-between mb-1.5 pointer-events-none">
      <span class="${titleColor}">${escapeHtml(song.title)}</span>
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
      ghostClass: 'opacity-40',
      chosenClass: 'bg-slate-800',
      onEnd: () => {
        updateSetStats();
        // Update candidate counter badge
        const poolCount = document.getElementById('pool-count');
        const poolList = document.getElementById('pool-list');
        if (poolCount && poolList) {
          poolCount.innerText = poolList.querySelectorAll('.song-card').length;
        }
      }
    });
  });

  // Preset drag cue: + Switch guitars
  const presetCue = document.getElementById('preset-cue-container');
  if (presetCue) {
    new Sortable(presetCue, {
      group: {
        name: 'setlist-builder',
        pull: 'clone',
        put: false
      },
      sort: false,
      animation: 150,
      onClone: (evt) => {
        const orig = evt.item;
        orig.setAttribute('data-title', 'Switch guitars');
        orig.setAttribute('data-cue', 'true');
      }
    });
  }
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
  // Sync Sheet button
  const syncBtn = document.getElementById('btn-reload-sheet');
  if (syncBtn) {
    syncBtn.addEventListener('click', () => loadSheetCSV());
  }

  // Reset All button
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

  // Filter Chips (All, Ready A, Ready B, Phil Bass, Horns)
  document.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.getAttribute('data-filter');
      renderPool();
    });
  });

  // Holiday Toggle Button
  const holidayBtn = document.getElementById('btn-holiday-toggle');
  if (holidayBtn) {
    holidayBtn.addEventListener('click', () => {
      showHoliday = !showHoliday;
      holidayBtn.classList.toggle('active', showHoliday);
      renderPool();
    });
  }

  // Export Word dropdown toggles
  const exportBtn = document.getElementById('btn-export-dropdown');
  const exportMenu = document.getElementById('export-menu');
  if (exportBtn && exportMenu) {
    exportBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      exportMenu.classList.toggle('hidden');
    });
    document.addEventListener('click', () => exportMenu.classList.add('hidden'));
  }

  // Export Standard
  const btnStandard = document.getElementById('btn-export-standard');
  if (btnStandard) {
    btnStandard.addEventListener('click', () => exportWordDoc('standard'));
  }

  // Export Geoff's format
  const btnGeoff = document.getElementById('btn-export-geoff');
  if (btnGeoff) {
    btnGeoff.addEventListener('click', () => exportWordDoc('geoff'));
  }
}

// 10. Word Document Generation (Unnumbered format)
function exportWordDoc(format = 'standard') {
  const gigTitle = document.getElementById('gig-title')?.value || "Cape Jazz & Blues Setlist";

  const buildSetHtml = (listId, resId, label) => {
    const mainCards = document.querySelectorAll(`#${listId} .song-card`);
    const resCards = document.querySelectorAll(`#${resId} .song-card`);
    if (mainCards.length === 0 && resCards.length === 0) return '';

    let html = `<div style="font-size: 14pt; font-weight: bold; margin-bottom: 6pt; text-transform: uppercase; ${format === 'geoff' ? 'color:#DC2626; font-size:22pt;' : 'color:#000;'}">${label}</div>`;

    mainCards.forEach(c => {
      const isCue = c.getAttribute('data-cue') === 'true';
      const title = c.getAttribute('data-title') || c.innerText.trim();
      if (isCue) {
        html += `<div style="font-style:italic; margin: 3pt 0; color:#555;">${escapeHtml(title)}</div>`;
      } else {
        html += `<div style="margin: 2pt 0; ${format === 'geoff' ? 'color:#1D4ED8; font-weight:bold; font-size:18pt;' : 'color:#000;'}">${escapeHtml(title)}</div>`;
      }
    });

    if (resCards.length > 0) {
      html += `<div style="font-size: 13pt; font-weight: bold; margin-top: 10pt; margin-bottom: 4pt; color:#444;">Reserve</div>`;
      resCards.forEach(c => {
        const title = c.getAttribute('data-title') || c.innerText.trim();
        html += `<div style="margin: 2pt 0; ${format === 'geoff' ? 'color:#1D4ED8; font-weight:bold;' : 'color:#000;'}">${escapeHtml(title)}</div>`;
      });
    }

    return html;
  };

  const col1Html = buildSetHtml('set1-list', 'set1-res-list', 'SET ONE');
  const col2Html = buildSetHtml('set2-list', 'set2-res-list', 'SET TWO');

  const docContent = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset='utf-8'>
      <title>${escapeHtml(gigTitle)}</title>
      <style>
        @page { size: 8.5in 11in; margin: 0.75in; }
        body { font-family: ${format === 'geoff' ? "'Calibri', sans-serif" : "'Aptos', sans-serif"}; font-size: 13.5pt; color: #000; }
        .title { font-size: 16pt; font-weight: bold; margin-bottom: 14pt; }
        table { width: 100%; border-collapse: collapse; }
        td { width: 50%; vertical-align: top; padding-right: 20pt; }
        td + td { padding-right: 0; padding-left: 20pt; }
      </style>
    </head>
    <body>
      <div class="title">${escapeHtml(gigTitle)}</div>
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

// 11. Expose Global app namespace for inline HTML button handlers
window.app = {
  addCustomCue: (setKey) => {
    const text = prompt("Enter stage cue (e.g. 'Switch guitars', 'Acoustic Guitar'):", "Switch guitars");
    if (!text) return;
    const target = setKey === 'set1' ? document.getElementById('set1-list') : document.getElementById('set2-list');
    if (!target) return;

    const cueCard = document.createElement('div');
    cueCard.className = 'song-card card-cue bg-rose-950/40 border border-rose-800 text-rose-200 p-2 rounded text-xs select-none cursor-grab flex items-center justify-between';
    cueCard.setAttribute('data-cue', 'true');
    cueCard.setAttribute('data-title', text);
    cueCard.innerHTML = `
      <span class="italic font-semibold">📌 ${escapeHtml(text)}</span>
      <button onclick="this.parentElement.remove(); window.app.updateStats();" class="text-rose-400 hover:text-rose-200 ml-2 font-bold">✕</button>
    `;
    target.appendChild(cueCard);
    updateSetStats();
  },
  updateStats: () => updateSetStats()
};
