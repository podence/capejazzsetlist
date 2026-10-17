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
    errorMsg.textContent = `${msg} [Line: ${lineNo}, Col: ${columnNo}]`;
  }
  console.error("Setlist App Global Error:", { msg, url, lineNo, columnNo, error });
  return false;
};

(function () {
  'use strict';

  // SPREADSHEET CONFIG
  const CONFIG = {
    SPREADSHEET_ID: '1BLrbe4BDbFx7-5XBRlo0ICproWUw6bJot-3rLwa4NJo',
    SHEET_GID: '477864766',
    SKIP_ROWS: 3
  };

  // APPLICATION STATE
  const state = {
    pool: [],        // Normalized pool items
    set1: [],        // Item objects in Set 1 Active
    set1_res: [],    // Item objects in Set 1 Reserve
    set2: [],        // Item objects in Set 2 Active
    set2_res: [],    // Item objects in Set 2 Reserve
    activeFilter: 'all',
    holidayHighlight: false
  };

  // HELPERS: Defensive Row & Cell Normalization
  function parseDurationToSec(durStr) {
    if (!durStr) return 0;
    const str = String(durStr).trim();
    if (!str) return 0;
    
    // Pattern m:ss or mm:ss
    if (str.includes(':')) {
      const parts = str.split(':');
      const m = parseInt(parts[0], 10) || 0;
      const s = parseInt(parts[1], 10) || 0;
      return (m * 60) + s;
    }
    
    // Pure decimal minutes or direct integer
    const num = parseFloat(str);
    if (!isNaN(num)) {
      return Math.round(num * 60);
    }
    return 0;
  }

  function formatSecToMMSS(seconds) {
    const s = Math.max(0, Math.floor(seconds || 0));
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  function getGenreClass(genre = '') {
    const g = String(genre).toLowerCase();
    if (g.includes('holiday') || g.includes('christmas') || g.includes('xmas')) return 'title-holiday';
    if (g.includes('jazz')) return 'title-jazz';
    if (g.includes('blues')) return 'title-blues';
    return 'title-other';
  }

  function normalizeRow(row) {
    if (!Array.isArray(row)) return null;
    
    const title = row[0] ? String(row[0]).trim() : '';
    if (!title) return null; // Rule: Ingest only if Title exists

    const genre = row[2] ? String(row[2]).trim() : 'Other';
    const readiness = row[5] ? String(row[5]).trim().toUpperCase() : 'B';
    const philBass = row[6] ? String(row[6]).trim() : '';
    const horns = row[7] ? String(row[7]).trim() : '';
    const durationRaw = row[10] ? String(row[10]).trim() : '';

    const isHoliday = /holiday|christmas|xmas/i.test(genre);
    const isReady = (readiness === 'A' || readiness === 'B');

    // Rule: Ingest if (Readiness is A or B) OR Genre contains Holiday/Christmas/Xmas
    if (!isReady && !isHoliday) return null;

    return {
      id: 'song_' + Math.random().toString(36).substring(2, 9),
      title: title,
      genre: genre,
      readiness: readiness || 'B',
      philBass: philBass.toLowerCase() === 'yes' || philBass === '1' || /phil/i.test(philBass),
      horns: horns.toLowerCase() === 'yes' || horns === '1' || /horn/i.test(horns),
      durationSec: parseDurationToSec(durationRaw),
      isCue: false
    };
  }

  // DATA FETCHING: GViz JSONP
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
            const normalized = normalizeRow(flatRow);
            if (normalized) parsedItems.push(normalized);
          }
          resolve(parsedItems);
        } catch (err) {
          reject(err);
        }
      };

      script.onerror = function (e) {
        cleanup();
        reject(new Error("Network error fetching Google Sheet via GViz. Verify network or permissions."));
      };

      function cleanup() {
        delete window[callbackName];
        if (script.parentNode) script.parentNode.removeChild(script);
      }

      document.body.appendChild(script);
    });
  }

  // CARD RENDERING ENGINE (Defensive against missing properties)
  function createCardElement(item, listKey) {
    const card = document.createElement('div');
    card.dataset.id = item.id;
    card.dataset.list = listKey;

    if (item.isCue) {
      card.className = 'card-song card-cue flex items-center justify-between text-xs';
      card.innerHTML = `
        <span class="truncate">🚩 ${escapeHtml(item.title || '+ Stage Cue')}</span>
        <div class="flex items-center gap-1.5 ml-2">
          ${listKey !== 'pool' ? `<button title="Duplicate" class="btn-dup text-xs opacity-70 hover:opacity-100">⎘</button>` : ''}
          <button title="Remove" class="btn-remove text-xs text-rose-400 hover:text-rose-200">✕</button>
        </div>
      `;
      return card;
    }

    const titleColorClass = getGenreClass(item.genre);
    const isHoliday = /holiday|christmas|xmas/i.test(item.genre || '');
    
    card.className = `card-song flex items-center justify-between text-xs ${isHoliday ? 'genre-holiday-card' : ''}`;
    
    card.innerHTML = `
      <div class="min-w-0 pr-2">
        <p class="font-medium text-sm truncate ${titleColorClass}">${escapeHtml(item.title || 'Untitled')}</p>
        <div class="flex items-center gap-2 mt-0.5 text-[11px] text-slate-400">
          <span class="font-semibold text-slate-300">[${escapeHtml(item.readiness || 'B')}]</span>
          <span>${formatSecToMMSS(item.durationSec)}</span>
          ${item.philBass ? '<span class="text-amber-400 font-bold" title="Phil on Bass">P</span>' : ''}
          ${item.horns ? '<span class="text-emerald-400 font-bold" title="Horns">H</span>' : ''}
        </div>
      </div>
      <div class="flex items-center gap-1.5 flex-shrink-0">
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

  // STATE-FIRST RENDERING
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
    
    // Apply Active Filter to pool presentation
    const filtered = state.pool.filter(item => {
      if (state.activeFilter === 'readyA') return item.readiness === 'A';
      if (state.activeFilter === 'readyB') return item.readiness === 'B';
      if (state.activeFilter === 'phil') return Boolean(item.philBass);
      if (state.activeFilter === 'horns') return Boolean(item.horns);
      if (state.activeFilter === 'holiday') return /holiday|christmas|xmas/i.test(item.genre || '');
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

  // STATE MUTATIONS
  function moveItemState(itemId, fromListKey, toListKey, newIndex) {
    const sourceArr = state[fromListKey];
    const targetArr = state[toListKey];
    if (!sourceArr || !targetArr) return;

    const sourceIndex = sourceArr.findIndex(x => x.id === itemId);
    if (sourceIndex === -1) return;

    const [item] = sourceArr.splice(sourceIndex, 1);
    
    // Insert into designated index
    const targetIndex = (typeof newIndex === 'number' && newIndex >= 0) ? newIndex : targetArr.length;
    targetArr.splice(targetIndex, 0, item);

    renderAll();
  }

  function removeItem(itemId, listKey) {
    const arr = state[listKey];
    if (!arr) return;
    const idx = arr.findIndex(x => x.id === itemId);
    if (idx !== -1) {
      const [removed] = arr.splice(idx, 1);
      // If removed from a set and it's a song, return it to pool if not present
      if (listKey !== 'pool' && !removed.isCue) {
        state.pool.push(removed);
      }
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

  // SORTABLE INITIALIZATION (Strict State-First)
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

    // Make persistent "+ Switch guitars" drag source cloneable
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

    // Set container dataset lists for reliable lookup
    listMap.forEach(({ id, key }) => {
      const el = document.getElementById(id);
      if (el) el.dataset.list = key;
    });
  }

  // GLOBAL CARD EVENT DELEGATION
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

  // FILTER CHIP CONTROLS
  function initFilterChips() {
    const chips = document.querySelectorAll('.chip');
    chips.forEach(chip => {
      chip.addEventListener('click', () => {
        const f = chip.dataset.filter;
        
        if (f === 'holiday') {
          state.holidayHighlight = !state.holidayHighlight;
          chip.classList.toggle('active', state.holidayHighlight);
          document.body.classList.toggle('holiday-highlight', state.holidayHighlight);
          return;
        }

        chips.forEach(c => {
          if (c.dataset.filter !== 'holiday') c.classList.remove('active');
        });
        chip.classList.add('active');
        state.activeFilter = f;
        renderPool();
      });
    });
  }

  // MODAL & TSV PARSERS
  function initModals() {
    // Paste TSV Modal
    const pasteModal = document.getElementById('paste-modal');
    document.getElementById('btn-open-paste-modal').onclick = () => pasteModal.classList.remove('hidden');
    document.getElementById('btn-close-paste').onclick = () => pasteModal.classList.add('hidden');
    document.getElementById('btn-parse-tsv').onclick = () => {
      const tsv = document.getElementById('paste-textarea').value;
      const lines = tsv.split('\n');
      const parsed = [];
      lines.forEach(line => {
        if (!line.trim()) return;
        const row = line.split('\t');
        const norm = normalizeRow(row);
        if (norm) parsed.push(norm);
      });
      if (parsed.length) {
        state.pool = parsed;
        renderAll();
      }
      pasteModal.classList.add('hidden');
      document.getElementById('paste-textarea').value = '';
    };

    // Import Text Modal
    const importModal = document.getElementById('import-modal');
    document.getElementById('btn-open-import-modal').onclick = () => importModal.classList.remove('hidden');
    document.getElementById('btn-close-import').onclick = () => importModal.classList.add('hidden');
    document.getElementById('btn-run-import').onclick = () => {
      const text = document.getElementById('import-textarea').value;
      parseSetlistText(text);
      importModal.classList.add('hidden');
      document.getElementById('import-textarea').value = '';
    };

    // Export Dropdown
    const exportBtn = document.getElementById('btn-export-dropdown');
    const exportMenu = document.getElementById('export-menu');
    exportBtn.onclick = (e) => {
      e.stopPropagation();
      exportMenu.classList.toggle('hidden');
    };
    document.addEventListener('click', () => exportMenu.classList.add('hidden'));

    document.getElementById('btn-export-standard').onclick = () => exportDocx('standard');
    document.getElementById('btn-export-geoff').onclick = () => exportDocx('geoff');

    // Sync Sheet
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

      // Strip numbering like "1. ", "01 - "
      const cleanTitle = line.replace(/^\d+[\.\-\)]\s*/, '').trim();
      
      // Match against pool
      const poolIdx = state.pool.findIndex(p => p.title.toLowerCase() === cleanTitle.toLowerCase());
      if (poolIdx !== -1) {
        const [matched] = state.pool.splice(poolIdx, 1);
        state[currentTarget].push(matched);
      } else {
        // Create manual card
        state[currentTarget].push({
          id: 'manual_' + Math.random().toString(36).substring(2, 9),
          title: cleanTitle,
          readiness: 'B',
          genre: 'Other',
          durationSec: 0,
          isCue: cleanTitle.startsWith('+') || /cue|switch/i.test(cleanTitle)
        });
      }
    });

    renderAll();
  }

  // WORD DOC EXPORT (Standard & Geoff's Format using docx-js)
  async function exportDocx(format) {
    const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = window.docx;
    const gigTitle = document.getElementById('gig-title').value.trim() || 'Setlist';

    const isGeoff = (format === 'geoff');
    const fontName = isGeoff ? 'Calibri' : 'Aptos';

    function createSetSection(title, items, isReserve = false) {
      const paragraphs = [];
      
      // Header
      paragraphs.push(new Paragraph({
        text: title.toUpperCase(),
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 240, after: 120 },
        children: [
          new TextRun({
            text: title.toUpperCase(),
            bold: true,
            font: fontName,
            size: isGeoff ? 36 : 28, // 18pt or 14pt
            color: isGeoff ? 'DC2626' : '0284C7' // Red or Slate Blue
          })
        ]
      }));

      // Songs & Cues
      items.forEach((item, index) => {
        if (item.isCue) {
          paragraphs.push(new Paragraph({
            spacing: { before: 60, after: 60 },
            children: [
              new TextRun({
                text: `    🚩 ${item.title}`,
                italics: true,
                bold: isGeoff,
                font: fontName,
                size: isGeoff ? 36 : 24, // 18pt or 12pt
                color: isGeoff ? 'DC2626' : '64748B'
              })
            ]
          }));
        } else {
          const num = isReserve ? '• ' : `${index + 1}. `;
          const dur = item.durationSec ? ` (${formatSecToMMSS(item.durationSec)})` : '';
          
          paragraphs.push(new Paragraph({
            spacing: { before: 80, after: 80 },
            children: [
              new TextRun({
                text: num + item.title,
                bold: isGeoff,
                font: fontName,
                size: isGeoff ? 36 : 27, // 18pt or 13.5pt
                color: isGeoff ? '1D4ED8' : '0F172A' // Bold Blue or Dark
              }),
              new TextRun({
                text: dur,
                bold: false,
                font: fontName,
                size: isGeoff ? 36 : 24,
                color: isGeoff ? 'DC2626' : '64748B' // Red duration for Geoff
              })
            ]
          }));
        }
      });

      return paragraphs;
    }

    const docChildren = [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 300 },
        children: [
          new TextRun({
            text: gigTitle,
            bold: true,
            font: fontName,
            size: isGeoff ? 44 : 36, // 22pt or 18pt
            color: isGeoff ? 'DC2626' : '0F172A'
          })
        ]
      }),
      ...createSetSection('SET ONE', state.set1),
      ...createSetSection('SET ONE RESERVE', state.set1_res, true),
      ...createSetSection('SET TWO', state.set2),
      ...createSetSection('SET TWO RESERVE', state.set2_res, true)
    ];

    const doc = new Document({
      sections: [{
        properties: {},
        children: docChildren
      }]
    });

    const blob = await Packer.toBlob(doc);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${gigTitle.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${format}.docx`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  // PUBLIC CUE HELPER (Invoked by UI buttons)
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

  // INITIALIZATION
  async function loadRemoteSheet() {
    try {
      const items = await fetchGoogleSheetData();
      state.pool = items;
      renderAll();
    } catch (err) {
      console.warn("Could not load from GViz JSONP directly (CORS or network policy). App is ready for manual TSV paste.", err);
      renderAll();
    }
  }

  function init() {
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
