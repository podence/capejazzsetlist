// --- DATA INGESTION (Exact layout based on sheet screenshot) ---

function loadSheetData() {
  const callbackName = 'handleGVizData_' + Math.floor(Math.random() * 100000);

  window[callbackName] = (data) => {
    try {
      parseSheetPayload(data);
    } catch (err) {
      console.error('Parsing error:', err);
      showBanner(`Error parsing sheet: ${err.message}`, 'error');
    } finally {
      delete window[callbackName];
      if (script && script.parentNode) script.parentNode.removeChild(script);
    }
  };

  const script = document.createElement('script');
  // headers=0 tells Google not to invent headers and give us raw row data as-is
  script.src = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?headers=0&tqx=responseHandler:${callbackName}&gid=${SHEET_GID}`;
  script.onerror = () => {
    showBanner('Could not reach Google Sheets. Make sure sharing is set to "Anyone with the link can view".', 'error');
  };
  document.body.appendChild(script);
}

function parseSheetPayload(gvizData) {
  if (!gvizData || !gvizData.table || !gvizData.table.rows) {
    showBanner('Google Sheets returned an empty table.', 'error');
    return;
  }

  const rawRows = gvizData.table.rows;
  allTracks = [];

  const getCellStr = (row, idx) => {
    if (!row || !row.c || !row.c[idx]) return '';
    const cell = row.c[idx];
    if (cell.v !== null && cell.v !== undefined) return String(cell.v).trim();
    if (cell.f !== null && cell.f !== undefined) return String(cell.f).trim();
    return '';
  };

  // Find the exact row where 'Tune' appears in Column A
  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
    const val = getCellStr(rawRows[i], 0).toLowerCase();
    if (val === 'tune') {
      headerRowIndex = i;
      break;
    }
  }

  // If header found, start immediately on the next row; otherwise default to index 3 (Row 4)
  const dataStartIndex = (headerRowIndex !== -1) ? headerRowIndex + 1 : 3;

  for (let r = dataStartIndex; r < rawRows.length; r++) {
    const row = rawRows[r];

    // EXACT INDICES CONFIRMED FROM SCREENSHOT:
    // Col A (0): Tune
    // Col B (1): wrk on
    // Col C (2): Genre
    // Col D (3): Orig
    // Col E (4): Rating
    // Col F (5): Ready
    // Col G (6): P Bass
    // Col H (7): Horns
    // Col K (10): Est Time
    const tune = getCellStr(row, 0);
    const wrkOn = getCellStr(row, 1);
    const genre = getCellStr(row, 2);
    const rawReady = getCellStr(row, 5);
    const rawPBass = getCellStr(row, 6);
    const rawHorns = getCellStr(row, 7);
    const estTime = getCellStr(row, 10);

    // Skip empty lines or repeated header rows
    if (!tune || /^tune$/i.test(tune)) continue;

    // Normalize readiness: strip any whitespace, invisible chars, and uppercase
    const readyClean = rawReady.replace(/[^A-Za-z]/g, '').toUpperCase();

    // STRICT INGESTION CRITERIA: Ready must be 'A' or 'B'
    if (readyClean !== 'A' && readyClean !== 'B') {
      continue;
    }

    // Holiday Check (Col C Genre OR title cues)
    const isHoliday = /holiday/i.test(genre) ||
                      /\b(christmas|xmas|santa|noel|winter wonderland|jingle)\b/i.test(tune);

    const isPBass = /^(y|yes|true|1)$/i.test(rawPBass);
    const isHorns = /^(y|yes|true|1)$/i.test(rawHorns);

    allTracks.push({
      id: `track-${r}`,
      tune,
      wrkOn,
      genre,
      ready: readyClean,
      pBass: isPBass,
      horns: isHorns,
      estTime,
      isHoliday
    });
  }

  console.log(`Loaded ${allTracks.length} eligible songs (A/B Ready).`);
  renderCandidatePool();
}

function renderCandidatePool() {
  const pool = document.getElementById('candidate-pool');
  if (!pool) return;

  // Track already placed cards across dropzones
  const placedIds = new Set();
  document.querySelectorAll('.set-column [data-track-id]').forEach(el => {
    placedIds.add(el.getAttribute('data-track-id'));
  });

  const visibleTracks = allTracks.filter(track => {
    // 1. Exclude if placed in a set
    if (placedIds.has(track.id)) return false;

    // 2. Holiday visibility gate: Hidden by default; visible when showHoliday is active
    if (track.isHoliday && !activeFilters.showHoliday) {
      return false;
    }

    // 3. Category & Readiness toggles
    if (activeFilters.readyA && !activeFilters.readyB && track.ready !== 'A') return false;
    if (activeFilters.readyB && !activeFilters.readyA && track.ready !== 'B') return false;
    if (activeFilters.horns && !track.horns) return false;
    if (activeFilters.pbass && !track.pBass) return false;

    // 4. Search input
    if (activeFilters.search) {
      const q = activeFilters.search.toLowerCase();
      if (!track.tune.toLowerCase().includes(q) && !track.genre.toLowerCase().includes(q)) {
        return false;
      }
    }

    return true;
  });

  pool.innerHTML = '';

  if (visibleTracks.length === 0) {
    pool.innerHTML = `
      <div class="p-4 text-center text-slate-400 text-sm">
        ${allTracks.length > 0 
          ? 'No songs match active filters.' 
          : 'No songs with Readiness A or B found.'}
      </div>`;
    return;
  }

  visibleTracks.forEach(track => {
    pool.appendChild(createSongCard(track));
  });
}

function showBanner(msg, type = 'info') {
  const pool = document.getElementById('candidate-pool');
  if (!pool) return;
  const color = type === 'error' ? 'text-rose-300 border-rose-800 bg-rose-950/40' : 'text-slate-300 border-slate-700 bg-slate-800';
  pool.innerHTML = `<div class="p-4 rounded border ${color} text-sm">${msg}</div>`;
}
