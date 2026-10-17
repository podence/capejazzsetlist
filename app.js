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
    masterList: [],         // All ingested songs meeting Readiness A or B strictly
    pool: [],               // Active pool items available to pick
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

  function applyDefaultDateTitle() {
    const gigTitleInput = document.getElementById('gig-title');
    if (gigTitleInput) {
      const todayTitle = getFormattedTodayDate();
      if (!gigTitleInput.value || gigTitleInput.value === 'Set List Name') {
        gigTitleInput.value = todayTitle;
      }
      gigTitleInput.defaultValue = todayTitle;
    }
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

  function getGenreClass(genre = '', isHoliday = false) {
    if (isHoliday) return 'title-holiday';
    const g = String(genre).toLowerCase();
    if (g.includes('jazz')) return 'title-jazz';
    if (g.includes('blues')) return 'title-blues';
    return 'title-other';
  }

  // FIXED-COLUMN NORMALIZER
  // Col A (0): Title | Col C (2): Genre | Col F (5): Readiness | Col G (6): Phil Bass | Col H (7): Horns | Col K (10): Est Time
  function normalizeRow(cells) {
    if (!Array.isArray(cells) || cells.length === 0) return null;

    const getVal = (idx) => {
      const c = cells[idx];
      if (!c || c.v === null || c.v === undefined) return '';
      return String(c.v).trim();
    };

    const title = getVal(0);
    if (!title || title.toLowerCase() === 'tune' || title === '`') return null;

    // Strict Gate: Col F (index 5) MUST be 'A' or 'B'. Rating in Col E is ignored.
    const readiness = getVal(5).toUpperCase();
    if (readiness !== 'A' && readiness !== 'B') {
      return null;
    }

    const genre = getVal(2);
    const isHoliday = genre.toLowerCase().includes('holiday');

    const philBass = isTrueFlag(getVal(6));
    const horns = isTrueFlag(getVal(7));

    const cellK = cells[10];
    const durRaw = getVal(10);
    const durFormatted = (cellK && typeof cellK === 'object') ? (cellK.f || cellK.v || '') : '';
    const durationSec = parseDurationToSec(durRaw, durFormatted);

    return {
      id: 'song_' + Math.random().toString(36).substring(2, 9),
      title: title,
      genre: isHoliday ? 'Holiday' : (genre || 'Other'),
      readiness: readiness,
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
            const rowData = rows[i]?.c || [];
            const normalized = normalizeRow(rowData);
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

    const assignedIds = new Set([
      ...state.set1.map(s => s.id),
      ...state.set1_res.map(s => s.id),
      ...state.set2.map(s => s.id),
      ...state.set2_res.map(s => s.id)
    ]);

    const availableSongs = state.masterList.filter(s => !assignedIds.has(s.id));

    const filtered = availableSongs.filter(item => {
      // Holiday Inclusion: If false, completely exclude holiday songs
      if (!state.includeHoliday && item.isHoliday) {
        return false;
      }

      // Category Filters
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
      const cEl = document.getElementById(countId);
      if (cEl) cEl.textContent = `${songCount} song${songCount === 1 ? '' : 's'}`;
    }
    if (timeId) {
      const tEl = document.getElementById(timeId);
      if (tEl) tEl.textContent = formatSecToMMSS(totalSec);
    }
  }

  function moveItemState(itemId, fromListKey, toListKey, newIndex) {
    let item = null;

    if (fromListKey === 'pool') {
      item = state.masterList.find(x => x.id === itemId);
    } else {
      const sourceArr = state[fromListKey];
      const sourceIndex = sourceArr.findIndex(x => x.id === itemId);
      if (sourceIndex !== -1) {
        item = sourceArr.splice(sourceIndex, 1)[0];
      }
    }

    if (!item) return;

    if (toListKey !== 'pool') {
      const targetArr = state[toListKey];
      const targetIndex = (typeof newIndex === 'number' && newIndex >= 0) ? newIndex : targetArr.length;
      targetArr.splice(targetIndex, 0, item);
    }

    renderAll();
  }

  function removeItem(itemId, listKey) {
    const arr = state[listKey];
    if (!arr) return;
    const idx = arr.findIndex(x => x.id === itemId);
    if (idx !== -1) {
      arr.splice(idx, 1);
      renderAll();
    }
  }

  function duplicateItem(itemId, listKey) {
    const arr = state[listKey];
    if (!arr) return;
    const idx = arr.findIndex(x => x.id === itemId);
    if (idx !== -1) {
      const original = arr[idx];
      const clone = Object.assign({}, original, {
        id: (original.isCue ? 'cue_' : 'song_') + Math.random().toString(36).substring(2, 9)
      });
      arr.splice(idx + 1, 0, clone);
      renderAll();
    }
  }

  function resetAll() {
    if (!confirm("Reset all sets back to the candidate pool?")) return;
    
    state.set1 = [];
    state.set1_res = [];
    state.set2 = [];
    state.set2_res = [];
    
    const gigTitleInput = document.getElementById('gig-title');
    if (gigTitleInput) {
      const todayTitle = getFormattedTodayDate();
      gigTitleInput.value = todayTitle;
      gigTitleInput.defaultValue = todayTitle;
    }

    renderAll();
  }

  function initSortableContainers() {
    const listMap = [
      { id: 'pool-list', key: 'pool' },
      { id: 'set1-list', key: 'set1' },
      { id: 'set1-res-list', key: 'set1_res' },
      { id: 'set2-list', key: 'set2' },
      { id: 'set2-res-list', key: 'set2_res' }
    ];

    listMap.forEach(({ id, key }) => {
      const el = document.getElementById(id);
      if (!el) return;

      Sortable.create(el, {
        group: 'setlist-group',
        animation: 150,
        ghostClass: 'sortable-ghost',
        dragClass: 'sortable-drag',
        emptyInsertThreshold: 40,
        onEnd: function (evt) {
          const itemEl = evt.item;
          const fromKey = evt.from.dataset.list || key;
          const toKey = evt.to.dataset.list || listMap.find(m => m.id === evt.to.id)?.key;
          const itemId = itemEl.dataset.id;
          
          if (!toKey || !fromKey || !itemId) {
            renderAll();
            return;
          }

          moveItemState(itemId, fromKey, toKey, evt.newIndex);
        }
      });
    });

    const guitarCue = document.getElementById('drag-guitar-cue');
    if (guitarCue) {
      guitarCue.addEventListener('click', () => {
        state.set1.push({
          id: 'cue_' + Math.random().toString(36).substring(2, 9),
          title: 'Switch guitars',
          isCue: true
        });
        renderAll();
      });
    }

    listMap.forEach(({ id, key }) => {
      const el = document.getElementById(id);
      if (el) el.dataset.list = key;
    });
  }

  document.addEventListener('click', function (e) {
    const removeBtn = e.target.closest('.btn-remove');
    if (removeBtn) {
      const card = removeBtn.closest('.card-song');
      if (card) removeItem(card.dataset.id, card.dataset.list);
      return;
    }

    const dupBtn = e.target.closest('.btn-dup');
    if (dupBtn) {
      const card = dupBtn.closest('.card-song');
      if (card) duplicateItem(card.dataset.id, card.dataset.list);
      return;
    }
  });

  function initFilterChips() {
    const categoryChips = document.querySelectorAll('.chip[data-filter]');
    categoryChips.forEach(chip => {
      chip.addEventListener('click', () => {
        categoryChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        state.activeCategory = chip.dataset.filter;
        renderPool();
      });
    });

    const holidayBtn = document.getElementById('btn-holiday-toggle');
    if (holidayBtn) {
      holidayBtn.addEventListener('click', () => {
        state.includeHoliday = !state.includeHoliday;
        holidayBtn.classList.toggle('active', state.includeHoliday);
        document.body.classList.toggle('holiday-highlight', state.includeHoliday);
        renderPool();
      });
    }
  }

  function initModals() {
    const resetBtn = document.getElementById('btn-reset');
    if (resetBtn) resetBtn.onclick = resetAll;

    const pasteModal = document.getElementById('paste-modal');
    document.getElementById('btn-open-paste-modal').onclick = () => pasteModal.classList.remove('hidden');
    document.getElementById('btn-close-paste').onclick = () => pasteModal.classList.add('hidden');
    document.getElementById('btn-parse-tsv').onclick = () => {
      const tsv = document.getElementById('paste-textarea').value;
      const lines = tsv.split('\n');
      const parsed = [];
      lines.forEach(line => {
        if (!line.trim()) return;
        const row = line.split('\t').map(v => ({ v: v.trim() }));
        const norm = normalizeRow(row);
        if (norm) parsed.push(norm);
      });
      if (parsed.length) {
        state.masterList = parsed;
        renderAll();
      }
      pasteModal.classList.add('hidden');
      document.getElementById('paste-textarea').value = '';
    };

    const importModal = document.getElementById('import-modal');
    document.getElementById('btn-open-import-modal').onclick = () => importModal.classList.remove('hidden');
    document.getElementById('btn-close-import').onclick = () => importModal.classList.add('hidden');
    document.getElementById('btn-run-import').onclick = () => {
      const text = document.getElementById('import-textarea').value;
      parseSetlistText(text);
      importModal.classList.add('hidden');
      document.getElementById('import-textarea').value = '';
    };

    const exportBtn = document.getElementById('btn-export-dropdown');
    const exportMenu = document.getElementById('export-menu');
    exportBtn.onclick = (e) => {
      e.stopPropagation();
      exportMenu.classList.toggle('hidden');
    };
    document.addEventListener('click', () => exportMenu.classList.add('hidden'));

    document.getElementById('btn-export-standard').onclick = () => exportWordDoc('standard');
    document.getElementById('btn-export-geoff').onclick = () => exportWordDoc('geoff');

    document.getElementById('btn-reload-sheet').onclick = loadRemoteSheet;
  }

  function parseSetlistText(text) {
    let currentTarget = 'set1';
    const lines = text.split('\n');

    lines.forEach(rawLine => {
      const line = rawLine.trim();
      if (!line) return;

      if (/^set\s*one/i.test(line)) { currentTarget = 'set1'; return; }
      if (/^set\s*two/i.test(line)) { currentTarget = 'set2'; return; }
      if (/reserve/i.test(line)) { currentTarget = (currentTarget === 'set1' ? 'set1_res' : 'set2_res'); return; }

      const cleanTitle = line.replace(/^\d+[\.\-\)]\s*/, '').trim();
      
      const poolIdx = state.masterList.findIndex(p => p.title.toLowerCase() === cleanTitle.toLowerCase());
      if (poolIdx !== -1) {
        state[currentTarget].push(state.masterList[poolIdx]);
      } else {
        const isHoliday = cleanTitle.toLowerCase().includes('holiday') || cleanTitle.toLowerCase().includes('christmas');
        const manualSong = {
          id: 'manual_' + Math.random().toString(36).substring(2, 9),
          title: cleanTitle,
          readiness: 'B',
          genre: isHoliday ? 'Holiday' : 'Other',
          durationSec: 0,
          philBass: false,
          horns: false,
          isHoliday: isHoliday,
          isCue: cleanTitle.startsWith('+') || /cue|switch/i.test(cleanTitle)
        };
        state.masterList.push(manualSong);
        state[currentTarget].push(manualSong);
      }
    });

    renderAll();
  }

  // WORD EXPORT (Standard: Aptos, Black, No Numbers; Geoff: Calibri, Red/Blue, No Numbers)
  function exportWordDoc(format) {
    const gigTitle = document.getElementById('gig-title').value.trim() || 'Setlist';
    const isGeoff = (format === 'geoff');

    function renderSectionHTML(title, items) {
      if (!items || items.length === 0) return '';
      
      let html = '';
      if (isGeoff) {
        html += `<h2 style="font-family:Calibri; font-size:18pt; color:#DC2626; font-weight:bold; margin-top:20pt; margin-bottom:6pt;">${title}</h2>`;
      } else {
        html += `<h2 style="font-family:Aptos, sans-serif; font-size:14pt; color:#000000; font-weight:bold; margin-top:16pt; margin-bottom:6pt;">${title}</h2>`;
      }
      
      items.forEach(item => {
        if (item.isCue) {
          if (isGeoff) {
            html += `<p style="font-family:Calibri; font-size:18pt; color:#DC2626; font-style:italic; font-weight:bold; margin:4pt 0 4pt 18pt;">🚩 ${escapeHtml(item.title)}</p>`;
          } else {
            html += `<p style="font-family:Aptos, sans-serif; font-size:13.5pt; color:#000000; font-style:italic; margin:3pt 0 3pt 14pt;">🚩 ${escapeHtml(item.title)}</p>`;
          }
        } else {
          const dur = item.durationSec ? ` (${formatSecToMMSS(item.durationSec)})` : '';
          
          if (isGeoff) {
            html += `<p style="font-family:Calibri; font-size:18pt; color:#1D4ED8; font-weight:bold; margin:4pt 0;">${escapeHtml(item.title)}<span style="color:#DC2626; font-weight:normal;">${dur}</span></p>`;
          } else {
            html += `<p style="font-family:Aptos, sans-serif; font-size:13.5pt; color:#000000; margin:3pt 0;">${escapeHtml(item.title)}${dur}</p>`;
          }
        }
      });
      return html;
    }

    const docContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset='utf-8'>
        <title>${escapeHtml(gigTitle)}</title>
        <style>
          @page { size: 8.5in 11in; margin: 0.8in; }
          body { font-family: ${isGeoff ? 'Calibri' : 'Aptos, sans-serif'}; }
        </style>
      </head>
      <body>
        <h1 style="text-align:center; font-family:${isGeoff ? 'Calibri' : 'Aptos, sans-serif'}; font-size:${isGeoff ? '22pt' : '18pt'}; color:${isGeoff ? '#DC2626' : '#000000'}; font-weight:bold; margin-bottom:18pt;">
          ${escapeHtml(gigTitle)}
        </h1>
        ${renderSectionHTML('SET ONE', state.set1)}
        ${renderSectionHTML('SET ONE RESERVE', state.set1_res)}
        ${renderSectionHTML('SET TWO', state.set2)}
        ${renderSectionHTML('SET TWO RESERVE', state.set2_res)}
      </body>
      </html>
    `;

    const blob = new Blob(['\ufeff', docContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const downloadAnchor = document.createElement('a');
    downloadAnchor.href = url;
    downloadAnchor.download = `${gigTitle.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${format}.doc`;
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    document.body.removeChild(downloadAnchor);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  window.app = {
    addCustomCue(targetKey) {
      const cueText = prompt('Enter custom cue text:', 'Switch guitars');
      if (cueText && cueText.trim()) {
        state[targetKey].push({
          id: 'cue_' + Math.random().toString(36).substring(2, 9),
          title: cueText.trim(),
          isCue: true
        });
        renderAll();
      }
    }
  };

  async function loadRemoteSheet() {
    try {
      const items = await fetchGoogleSheetData();
      state.masterList = items;
      renderAll();
    } catch (err) {
      console.warn("GViz fetch issue. App ready for TSV paste.", err);
      renderAll();
    }
  }

  function init() {
    applyDefaultDateTitle();
    initSortableContainers();
    initFilterChips();
    initModals();
    loadRemoteSheet();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
