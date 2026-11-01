/**
 * Cape Jazz & Blues Setlist Builder
 * Modular, State-First JavaScript Implementation
 */

// 1. Global Visual Error Boundary
window.onerror = function (message, source, lineno, colno, error) {
  const banner = document.getElementById('error-banner');
  const msgEl = document.getElementById('error-msg');
  if (banner && msgEl) {
    banner.classList.remove('hidden');
    const filename = source ? source.split('/').pop() : 'script';
    msgEl.innerText = `${message} (${filename}:${lineno}${colno ? ':' + colno : ''})`;
  }
  return false;
};

// 2. Constants & Data Source
const SPREADSHEET_ID = '1BLrbe4BDbFx7-5XBRlo0ICproWUw6bJot-3rLwa4NJo';
const SHEET_GID = '477864766';

// 3. Application State
const state = {
  registry: new Map(), // Master lookup: ID -> Normalized Item Object
  pool: [],            // Array of IDs
  set1: [],            // Array of IDs
  set1Res: [],         // Array of IDs
  set2: [],            // Array of IDs
  set2Res: [],         // Array of IDs
  activeFilter: 'all', // 'all' | 'readyA' | 'readyB' | 'phil' | 'horns'
  showHoliday: false
};

// Expose minimal namespace for inline click callbacks
window.app = {
  addCustomCue: (setKey) => {
    const text = prompt("Enter stage cue (e.g., 'Switch guitars', 'Break'):", "Switch guitars");
    if (!text || !text.trim()) return;
    const cueItem = createCueItem(text.trim());
    state.registry.set(cueItem.id, cueItem);

    if (setKey === 'set1') state.set1.push(cueItem.id);
    else if (setKey === 'set2') state.set2.push(cueItem.id);

    renderAllColumns();
  },
  duplicateCard: (id, targetListKey) => {
    const original = state.registry.get(id);
    if (!original) return;

    const dupId = `dup_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const cloned = { ...original, id: dupId };
    state.registry.set(dupId, cloned);

    if (Array.isArray(state[targetListKey])) {
      const idx = state[targetListKey].indexOf(id);
      if (idx !== -1) {
        state[targetListKey].splice(idx + 1, 0, dupId);
      } else {
        state[targetListKey].push(dupId);
      }
    }
    renderAllColumns();
  },
  removeCard: (id, targetListKey) => {
    if (Array.isArray(state[targetListKey])) {
      state[targetListKey] = state[targetListKey].filter(x => x !== id);
    }
    // If it's a cue or custom item not present in any other set, clean from registry
    const isInAnySet = ['set1', 'set1Res', 'set2', 'set2Res', 'pool'].some(k => state[k].includes(id));
    if (!isInAnySet && (id.startsWith('cue_') || id.startsWith('custom_') || id.startsWith('dup_'))) {
      state.registry.delete(id);
    }
    renderAllColumns();
  }
};

// 4. Initialization
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  initSortableInstances();
  loadSheetDataGViz();
});

// 5. Defensive Row Normalizer
function normalizeSheetRow(rawRow, index) {
  if (!rawRow) return null;

  // Handles both GViz row.c format and standard array row formats
  const getVal = (colIdx) => {
    if (Array.isArray(rawRow)) {
      return (rawRow[colIdx] || '').toString().trim();
    }
    if (rawRow.c && Array.isArray(rawRow.c)) {
      const cell = rawRow.c[colIdx];
      if (!cell || cell.v === null || cell.v === undefined) return '';
      return (cell.f || cell.v).toString().trim();
    }
    return '';
  };

  const title = getVal(0);     // Col A
  const genre = getVal(2);     // Col C
  const rawReady = getVal(5).toUpperCase(); // Col F
  const rawPhil = getVal(6);   // Col G
  const rawHorns = getVal(7);  // Col H
  const rawDuration = getVal(10); // Col K

  if (!title) return null;

  const isHoliday = /holiday|christmas|xmas/i.test(genre) ||
                    /\b(christmas|xmas|santa|noel|winter wonderland|jingle)\b/i.test(title);

  const ready = (rawReady === 'A' || rawReady === 'B') ? rawReady : '';

  // Gating rule: Title exists AND (Readiness is 'A' or 'B' OR Genre contains Holiday/Christmas/Xmas)
  if (!ready && !isHoliday) {
    return null;
  }

  const pBass = rawPhil !== '' && rawPhil !== '0' && rawPhil.toLowerCase() !== 'no';
  const horns = rawHorns !== '' && rawHorns !== '0' && rawHorns.toLowerCase() !== 'no';

  return {
    id: `song_${index}_${title.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
    isCue: false,
    title,
    genre: genre || 'Other',
    ready,
    pBass,
    horns,
    duration: rawDuration || '3:00',
    isHoliday
  };
}

function createCueItem(text) {
  return {
    id: `cue_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    isCue: true,
    title: text,
    duration: '0:00',
    ready: '',
    pBass: false,
    horns: false,
    genre: '',
    isHoliday: false
  };
}

// 6. Data Loading via GViz JSONP
function loadSheetDataGViz() {
  const poolContainer = document.getElementById('pool-list');
  if (poolContainer) {
    poolContainer.innerHTML = '<div class="p-3 text-slate-400 text-xs font-mono">⏳ Loading songs from Google Sheets...</div>';
  }

  const callbackName = 'handleGVizData_' + Math.floor(Math.random() * 100000);
  window[callbackName] = function (data) {
    try {
      if (!data || !data.table || !Array.isArray(data.table.rows)) {
        throw new Error("Invalid GViz JSONP payload received.");
      }
      ingestSheetRows(data.table.rows);
    } catch (err) {
      triggerErrorBanner("GViz Parsing Error: " + err.message);
    } finally {
      delete window[callbackName];
      const el = document.getElementById(callbackName);
      if (el) el.remove();
    }
  };

  const script = document.createElement('script');
  script.id = callbackName;
  script.src = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=responseHandler:${callbackName}&gid=${SHEET_GID}`;
  script.onerror = function () {
    triggerErrorBanner("Failed to connect to Google Sheets via GViz. Ensure the sheet is public.");
    // Fallback attempt: Fetch CSV export directly
    fallbackFetchCSV();
  };
  document.body.appendChild(script);
}

// CSV Fallback Loader if GViz encounters network/header blocks
async function fallbackFetchCSV() {
  const csvUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${SHEET_GID}`;
  try {
    const res = await fetch(csvUrl);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    const rows = parseCSVText(text);
    // Skip 3 header rows (indices 0, 1, 2)
    ingestSheetRows(rows.slice(3));
  } catch (err) {
    triggerErrorBanner("CSV Fallback also failed: " + err.message);
  }
}

function parseCSVText(text) {
  const lines = [];
  let row = [''];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];
    if (c === '"') {
      if (inQuotes && next === '"') { row[row.length - 1] += '"'; i++; }
      else { inQuotes = !inQuotes; }
    } else if (c === ',' && !inQuotes) {
      row.push('');
    } else if ((c === '\r' || c === '\n') && !inQuotes) {
      if (c === '\r' && next === '\n') i++;
      lines.push(row);
      row = [''];
    } else {
      row[row.length - 1] += c;
    }
  }
  if (row.length > 1 || row[0] !== '') lines.push(row);
  return lines;
}

function ingestSheetRows(rawRows) {
  state.registry.clear();
  state.pool = [];

  // Sheet data starts at row index 3 if passing whole table
  // If rawRows is from GViz rows, index 0, 1, 2 are header rows
  const startIndex = rawRows.length > 3 ? 3 : 0;

  for (let i = startIndex; i < rawRows.length; i++) {
    const item = normalizeSheetRow(rawRows[i], i);
    if (item) {
      state.registry.set(item.id, item);
      state.pool.push(item.id);
    }
  }

  renderAllColumns();
}

// 7. Rendering & Safe DOM Card Generation
function getGenreColorClass(item) {
  if (item.isHoliday) return 'title-holiday';
  const g = (item.genre || '').toLowerCase();
  if (g.includes('jazz')) return 'title-jazz';
  if (g.includes('blues')) return 'title-blues';
  return 'title-other';
}

function renderCardElement(item, listKey) {
  const card = document.createElement('div');
  const isCue = !!item.isCue;

  card.setAttribute('data-id', item.id);
  card.className = `card-item ${isCue ? 'card-cue' : 'card-song'} ${item.isHoliday ? 'genre-holiday-card' : ''}`;

  if (isCue) {
    card.innerHTML = `
      <div class="flex items-center justify-between text-xs">
        <span class="italic font-semibold pointer-events-none">📌 ${escapeHtml(item.title)}</span>
        <div class="flex items-center gap-1">
          ${listKey !== 'pool' ? `<button title="Duplicate" onclick="window.app.duplicateCard('${item.id}', '${listKey}')" class="card-btn text-rose-300">⎘</button>` : ''}
          <button title="Remove" onclick="window.app.removeCard('${item.id}', '${listKey}')" class="card-btn text-rose-400 font-bold ml-1">✕</button>
        </div>
      </div>
    `;
    return card;
  }

  const titleClass = getGenreColorClass(item);
  const readyLabel = item.ready ? `Ready ${item.ready}` : (item.id.startsWith('custom_') ? 'Custom' : 'Sheet');
  const readyClass = item.ready === 'A' 
    ? 'bg-emerald-950 text-emerald-400 border-emerald-800' 
    : (item.ready === 'B' ? 'bg-blue-950 text-blue-400 border-blue-800' : 'bg-slate-800 text-slate-300 border-slate-700');

  card.innerHTML = `
    <div class="flex items-center justify-between mb-1">
      <span class="${titleClass} font-semibold text-xs truncate mr-2">${escapeHtml(item.title)}</span>
      <div class="flex items-center gap-1.5 shrink-0">
        <span class="font-mono text-[11px] text-slate-400">${item.duration || '3:00'}</span>
        ${listKey !== 'pool' ? `<button title="Duplicate" onclick="window.app.duplicateCard('${item.id}', '${listKey}')" class="card-btn text-slate-400 hover:text-white">⎘</button>` : ''}
        ${listKey !== 'pool' ? `<button title="Remove" onclick="window.app.removeCard('${item.id}', '${listKey}')" class="card-btn text-rose-400 hover:text-rose-200">✕</button>` : ''}
      </div>
    </div>
    <div class="flex items-center justify-between text-[10px]">
      <div class="flex items-center gap-1">
        <span class="px-1.5 py-0.5 rounded font-mono font-bold border ${readyClass}">
          ${readyLabel}
        </span>
        ${item.pBass ? '<span class="px-1.5 py-0.5 rounded bg-purple-950 text-purple-300 border border-purple-800 font-bold">🎸 Bass</span>' : ''}
        ${item.horns ? '<span class="px-1.5 py-0.5 rounded bg-amber-950 text-amber-300 border border-amber-800 font-bold">🎺 Horns</span>' : ''}
      </div>
      <span class="text-slate-500 italic truncate max-w-[110px]">${escapeHtml(item.genre || '')}</span>
    </div>
  `;

  return card;
}

function renderAllColumns() {
  renderPoolColumn();
  renderSetColumn('set1-list', state.set1, 'set1');
  renderSetColumn('set1-res-list', state.set1Res, 'set1Res');
  renderSetColumn('set2-list', state.set2, 'set2');
  renderSetColumn('set2-res-list', state.set2Res, 'set2Res');
  updateTimers();
}

function renderPoolColumn() {
  const poolEl = document.getElementById('pool-list');
  const countBadge = document.getElementById('pool-count');
  if (!poolEl) return;

  poolEl.innerHTML = '';

  const visiblePoolIds = state.pool.filter(id => {
    const item = state.registry.get(id);
    if (!item) return false;
    if (item.isHoliday && !state.showHoliday) return false;

    if (state.activeFilter === 'readyA' && item.ready !== 'A') return false;
    if (state.activeFilter === 'readyB' && item.ready !== 'B') return false;
    if (state.activeFilter === 'phil' && !item.pBass) return false;
    if (state.activeFilter === 'horns' && !item.horns) return false;

    return true;
  });

  visiblePoolIds.forEach(id => {
    const item = state.registry.get(id);
    if (item) poolEl.appendChild(renderCardElement(item, 'pool'));
  });

  if (countBadge) countBadge.innerText = visiblePoolIds.length;
}

function renderSetColumn(containerId, idArray, listKey) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  idArray.forEach(id => {
    const item = state.registry.get(id);
    if (item) {
      container.appendChild(renderCardElement(item, listKey));
    }
  });
}

// 8. Timers & Summary Calculation
function parseDurationToSeconds(str) {
  if (!str) return 180;
  const parts = str.toString().trim().split(':').map(Number);
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
    return (parts[0] * 60) + parts[1];
  }
  if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
    return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
  }
  return 180;
}

function updateTimers() {
  const calcSet = (ids) => {
    let count = 0;
    let sec = 0;
    ids.forEach(id => {
      const item = state.registry.get(id);
      if (item && !item.isCue) {
        count++;
        sec += parseDurationToSeconds(item.duration);
      }
    });
    const mins = Math.floor(sec / 60);
    const remSec = sec % 60;
    return { count, timeStr: `${mins}:${remSec < 10 ? '0' : ''}${remSec}`, totalMins: Math.round(sec / 60) };
  };

  const s1 = calcSet(state.set1);
  const s2 = calcSet(state.set2);

  const set1Count = document.getElementById('set1-count');
  const set1Time = document.getElementById('set1-time');
  const set2Count = document.getElementById('set2-count');
  const set2Time = document.getElementById('set2-time');

  if (set1Count) set1Count.innerText = `${s1.count} songs`;
  if (set1Time) set1Time.innerText = s1.timeStr;
  if (set2Count) set2Count.innerText = `${s2.count} songs`;
  if (set2Time) set2Time.innerText = s2.timeStr;
}

// 9. State-First SortableJS Event Bindings
function initSortableInstances() {
  if (typeof Sortable === 'undefined') {
    triggerErrorBanner("SortableJS not detected. Recheck CDN script.");
    return;
  }

  const listConfig = [
    { el: document.getElementById('pool-list'), key: 'pool' },
    { el: document.getElementById('set1-list'), key: 'set1' },
    { el: document.getElementById('set1-res-list'), key: 'set1Res' },
    { el: document.getElementById('set2-list'), key: 'set2' },
    { el: document.getElementById('set2-res-list'), key: 'set2Res' }
  ];

  listConfig.forEach(({ el, key }) => {
    if (!el) return;
    new Sortable(el, {
      group: 'setlist-builder',
      animation: 150,
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-drag',
      onEnd: (evt) => {
        const fromKey = getListKeyByElement(evt.from);
        const toKey = getListKeyByElement(evt.to);
        const movedId = evt.item.getAttribute('data-id');

        if (!fromKey || !toKey || !movedId) {
          renderAllColumns();
          return;
        }

        // State-first transaction: mutate internal state arrays, then re-render
        if (fromKey === toKey) {
          // Reorder within the same list
          const list = state[fromKey];
          const oldIndex = evt.oldIndex;
          const newIndex = evt.newIndex;
          if (oldIndex !== undefined && newIndex !== undefined) {
            const [item] = list.splice(oldIndex, 1);
            list.splice(newIndex, 0, item);
          }
        } else {
          // Transfer across lists
          state[fromKey] = state[fromKey].filter(id => id !== movedId);
          const newIndex = evt.newIndex !== undefined ? evt.newIndex : state[toKey].length;
          state[toKey].splice(newIndex, 0, movedId);
        }

        renderAllColumns();
      }
    });
  });
}

function getListKeyByElement(el) {
  if (!el) return null;
  if (el.id === 'pool-list') return 'pool';
  if (el.id === 'set1-list') return 'set1';
  if (el.id === 'set1-res-list') return 'set1Res';
  if (el.id === 'set2-list') return 'set2';
  if (el.id === 'set2-res-list') return 'set2Res';
  return null;
}

// 10. Event Listeners & Modals
function setupEventListeners() {
  // Sync button
  const syncBtn = document.getElementById('btn-reload-sheet');
  if (syncBtn) syncBtn.addEventListener('click', () => loadSheetDataGViz());

  // Reset button
  const resetBtn = document.getElementById('btn-reset');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      // Re-pool all songs, clear sets
      const allActive = [...state.set1, ...state.set1Res, ...state.set2, ...state.set2Res];
      allActive.forEach(id => {
        if (!id.startsWith('cue_') && !state.pool.includes(id)) {
          state.pool.push(id);
        }
      });
      state.set1 = [];
      state.set1Res = [];
      state.set2 = [];
      state.set2Res = [];
      renderAllColumns();
    });
  }

  // Filter chips
  document.querySelectorAll('[data-filter]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-filter]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.activeFilter = btn.getAttribute('data-filter');
      renderPoolColumn();
    });
  });

  // Holiday filter chip
  const holidayBtn = document.getElementById('btn-holiday-toggle');
  if (holidayBtn) {
    holidayBtn.addEventListener('click', () => {
      state.showHoliday = !state.showHoliday;
      holidayBtn.classList.toggle('active', state.showHoliday);
      document.body.classList.toggle('holiday-highlight', state.showHoliday);
      renderPoolColumn();
    });
  }

  // Persistent Cue Card Button
  const persistentCueBtn = document.getElementById('btn-persistent-cue');
  if (persistentCueBtn) {
    persistentCueBtn.addEventListener('click', () => {
      const cue = createCueItem('Switch guitars');
      state.registry.set(cue.id, cue);
      state.set1.push(cue.id);
      renderAllColumns();
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
  if (btnStandard) btnStandard.addEventListener('click', () => exportWordDocument('standard'));

  const btnGeoff = document.getElementById('btn-export-geoff');
  if (btnGeoff) btnGeoff.addEventListener('click', () => exportWordDocument('geoff'));

  // Modals Wiring
  setupTextImportModal();
  setupPasteSheetModal();
}

// 11. Modal Handlers
function setupTextImportModal() {
  const modal = document.getElementById('import-modal');
  const openBtn = document.getElementById('btn-open-import-modal');
  const closeBtn = document.getElementById('btn-close-import');
  const runBtn = document.getElementById('btn-run-import');
  const textarea = document.getElementById('import-textarea');

  if (!modal || !openBtn || !closeBtn || !runBtn || !textarea) return;

  openBtn.addEventListener('click', () => {
    textarea.value = '';
    modal.classList.remove('hidden');
    textarea.focus();
  });
  closeBtn.addEventListener('click', () => modal.classList.add('hidden'));

  runBtn.addEventListener('click', () => {
    const text = textarea.value.trim();
    if (text) parseAndImportText(text);
    modal.classList.add('hidden');
  });
}

function parseAndImportText(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  let currentTargetKey = null;

  // Move existing set songs back to pool
  const currentSetSongs = [...state.set1, ...state.set1Res, ...state.set2, ...state.set2Res];
  currentSetSongs.forEach(id => {
    if (!id.startsWith('cue_') && !state.pool.includes(id)) {
      state.pool.push(id);
    }
  });

  state.set1 = [];
  state.set1Res = [];
  state.set2 = [];
  state.set2Res = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const upper = line.toUpperCase();

    if (upper.includes('SET ONE') || upper.includes('SET 1')) {
      currentTargetKey = 'set1';
      continue;
    }
    if (upper.includes('SET TWO') || upper.includes('SET 2')) {
      currentTargetKey = 'set2';
      continue;
    }
    if (upper.includes('RESERVE') || upper.includes('ALTERNATES')) {
      currentTargetKey = currentTargetKey === 'set1' ? 'set1Res' : 'set2Res';
      continue;
    }

    // Setlist title before any headers
    if (!currentTargetKey) {
      const gigTitleInput = document.getElementById('gig-title');
      if (gigTitleInput) gigTitleInput.value = line;
      continue;
    }

    // Skip summary lines
    if (/\b\d+\s*songs?\b/i.test(line) || /\b\d+\s*mins?\.?\b/i.test(line)) {
      continue;
    }

    // Clean leading bullets / numbering
    const clean = line.replace(/^[\d]+[\.\)\-\s]+/, '').replace(/^[\-\*•]\s*/, '').trim();
    if (!clean) continue;

    // Detect cue lines
    const lower = clean.toLowerCase();
    const isCue = /^switch\b/i.test(clean) ||
                  /^cue\s*:/i.test(clean) ||
                  lower === 'acoustic guitar' ||
                  lower === 'break' ||
                  lower === 'intermission';

    if (isCue) {
      const cue = createCueItem(clean);
      state.registry.set(cue.id, cue);
      state[currentTargetKey].push(cue.id);
      continue;
    }

    // Match song in registry
    const norm = lower.replace(/[^a-z0-9]/g, '');
    let foundId = Array.from(state.registry.keys()).find(k => {
      const item = state.registry.get(k);
      return !item.isCue && item.title.toLowerCase().replace(/[^a-z0-9]/g, '') === norm;
    });

    if (!foundId && norm.length > 4) {
      foundId = Array.from(state.registry.keys()).find(k => {
        const item = state.registry.get(k);
        if (item.isCue) return false;
        const sNorm = item.title.toLowerCase().replace(/[^a-z0-9]/g, '');
        return sNorm.includes(norm) || norm.includes(sNorm);
      });
    }

    if (foundId) {
      state.pool = state.pool.filter(id => id !== foundId);
      state[currentTargetKey].push(foundId);
    } else {
      // Create custom song item
      const customItem = {
        id: `custom_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        isCue: false,
        title: clean,
        genre: 'Other',
        ready: '',
        pBass: false,
        horns: false,
        duration: '3:00',
        isHoliday: /\b(christmas|xmas|santa|noel|winter wonderland|jingle)\b/i.test(clean)
      };
      state.registry.set(customItem.id, customItem);
      state[currentTargetKey].push(customItem.id);
    }
  }

  renderAllColumns();
}

function setupPasteSheetModal() {
  const modal = document.getElementById('paste-modal');
  const openBtn = document.getElementById('btn-open-paste-modal');
  const closeBtn = document.getElementById('btn-close-paste');
  const runBtn = document.getElementById('btn-run-paste');
  const textarea = document.getElementById('paste-textarea');

  if (!modal || !openBtn || !closeBtn || !runBtn || !textarea) return;

  openBtn.addEventListener('click', () => {
    textarea.value = '';
    modal.classList.remove('hidden');
    textarea.focus();
  });
  closeBtn.addEventListener('click', () => modal.classList.add('hidden'));

  runBtn.addEventListener('click', () => {
    const raw = textarea.value.trim();
    if (raw) {
      const lines = raw.split(/\r?\n/).map(line => line.split('\t'));
      ingestSheetRows(lines);
    }
    modal.classList.add('hidden');
  });
}

// 12. Word Document Export (.doc HTML format)
function exportWordDocument(format = 'standard') {
  const gigTitle = document.getElementById('gig-title')?.value || "Set List Name";

  const getSetMetrics = (idArray) => {
    let count = 0;
    let sec = 0;
    idArray.forEach(id => {
      const item = state.registry.get(id);
      if (item && !item.isCue) {
        count++;
        sec += parseDurationToSeconds(item.duration);
      }
    });
    return { count, mins: Math.round(sec / 60) };
  };

  const buildColumnHtml = (mainIds, resIds, headerLabel) => {
    const mainItems = mainIds.map(id => state.registry.get(id)).filter(Boolean);
    const resItems = resIds.map(id => state.registry.get(id)).filter(Boolean);
    const stats = getSetMetrics(mainIds);

    const sectionHeaderStyle = format === 'geoff'
      ? 'color: #D60000; font-size: 18pt; font-weight: bold; text-decoration: underline; margin-bottom: 6pt; text-transform: uppercase;'
      : 'color: #000000; font-size: 14pt; font-weight: bold; text-transform: uppercase; margin-bottom: 6pt;';

    let html = `<div style="${sectionHeaderStyle}">${headerLabel}</div>`;

    mainItems.forEach(item => {
      if (item.isCue) {
        if (format === 'geoff') {
          html += `<div style="color: #1F4E79; text-decoration: underline; font-style: italic; font-size: 18pt; margin: 2pt 0;">${escapeHtml(item.title)}</div>`;
        } else {
          html += `<div style="color: #555555; font-style: italic; font-size: 13.5pt; margin: 2pt 0;">${escapeHtml(item.title)}</div>`;
        }
      } else {
        if (format === 'geoff') {
          html += `<div style="color: #1F4E79; font-weight: bold; font-size: 18pt; margin: 2pt 0;">${escapeHtml(item.title)} <span style="color: #D60000; font-weight: normal; font-size: 14pt;">${item.duration}</span></div>`;
        } else {
          html += `<div style="color: #000000; font-size: 13.5pt; margin: 2pt 0;">${escapeHtml(item.title)} <span style="color: #666666; font-size: 11pt;">(${item.duration})</span></div>`;
        }
      }
    });

    if (stats.count > 0) {
      if (format === 'geoff') {
        html += `<div style="color: #D60000; font-size: 18pt; font-weight: bold; margin-top: 8pt; margin-bottom: 8pt;">${stats.count} songs – ${stats.mins} mins.</div>`;
      } else {
        html += `<div style="color: #000000; font-size: 13.5pt; font-weight: bold; margin-top: 6pt; margin-bottom: 6pt;">${stats.count} songs – ${stats.mins} mins.</div>`;
      }
    }

    if (resItems.length > 0) {
      const resHeaderStyle = format === 'geoff'
        ? 'color: #D60000; font-size: 18pt; font-weight: bold; text-decoration: none; margin-top: 10pt; margin-bottom: 4pt;'
        : 'color: #000000; font-size: 13pt; font-weight: bold; margin-top: 10pt; margin-bottom: 4pt;';

      html += `<div style="${resHeaderStyle}">Reserve</div>`;

      resItems.forEach(item => {
        if (item.isCue) {
          if (format === 'geoff') {
            html += `<div style="color: #1F4E79; text-decoration: underline; font-style: italic; font-size: 18pt; margin: 2pt 0;">${escapeHtml(item.title)}</div>`;
          } else {
            html += `<div style="color: #555555; font-style: italic; font-size: 13.5pt; margin: 2pt 0;">${escapeHtml(item.title)}</div>`;
          }
        } else {
          if (format === 'geoff') {
            html += `<div style="color: #1F4E79; font-weight: bold; font-size: 18pt; margin: 2pt 0;">${escapeHtml(item.title)} <span style="color: #D60000; font-weight: normal; font-size: 14pt;">${item.duration}</span></div>`;
          } else {
            html += `<div style="color: #000000; font-size: 13.5pt; margin: 2pt 0;">${escapeHtml(item.title)} <span style="color: #666666; font-size: 11pt;">(${item.duration})</span></div>`;
          }
        }
      });
    }

    return html;
  };

  const col1Html = buildColumnHtml(state.set1, state.set1Res, 'SET ONE');
  const col2Html = buildColumnHtml(state.set2, state.set2Res, 'SET TWO');

  const titleStyle = format === 'geoff'
    ? 'color: #D60000; font-size: 22pt; font-weight: bold; text-align: center; margin-bottom: 16pt;'
    : 'color: #000000; font-size: 16pt; font-weight: bold; text-align: center; margin-bottom: 14pt;';

  const docHtml = `
    <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
    <head>
      <meta charset='utf-8'>
      <title>${escapeHtml(gigTitle)}</title>
      <style>
        @page { size: 8.5in 11in; margin: 0.65in; }
        body { font-family: ${format === 'geoff' ? "'Calibri', sans-serif" : "'Aptos', sans-serif"}; color: #000; }
        table { width: 100%; border-collapse: collapse; }
        td { width: 50%; vertical-align: top; padding-right: 18pt; }
        td + td { padding-right: 0; padding-left: 18pt; }
      </style>
    </head>
    <body>
      <div style="${titleStyle}">${escapeHtml(gigTitle)}</div>
      <table><tr><td>${col1Html}</td><td>${col2Html}</td></tr></table>
    </body>
    </html>
  `;

  const blob = new Blob(['\ufeff', docHtml], { type: 'application/msword' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${gigTitle.replace(/[^a-zA-Z0-9_-]/g, '_')}_${format}.doc`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// 13. Helpers
function escapeHtml(str) {
  if (!str) return '';
  return str.toString().replace(/[&<>'"]/g, tag => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    "'": '&#39;',
    '"': '&quot;'
  }[tag] || tag));
}

function triggerErrorBanner(msg) {
  const banner = document.getElementById('error-banner');
  const msgEl = document.getElementById('error-msg');
  if (banner && msgEl) {
    banner.classList.remove('hidden');
    msgEl.innerText = msg;
  }
}
