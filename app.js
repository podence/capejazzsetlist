// --- BULLETPROOF GVIZ PARSER & INGESTION ---

function parseGVizPayload(gvizData) {
  if (!gvizData || !gvizData.table || !gvizData.table.rows) {
    console.error('GViz payload missing table or rows:', gvizData);
    return;
  }

  const rawRows = gvizData.table.rows;
  if (rawRows.length === 0) {
    console.warn('Google Sheet returned 0 rows.');
    return;
  }

  // Helper to extract clean text from any cell
  const extractCellText = (cell) => {
    if (!cell) return '';
    if (cell.f !== undefined && cell.f !== null) return String(cell.f).trim();
    if (cell.v !== undefined && cell.v !== null) return String(cell.v).trim();
    return '';
  };

  // Determine column index map:
  // 1. Try table.cols labels
  // 2. If labels are blank, inspect the first data row (header row)
  let colMap = {
    tune: 0,   // Col A
    genre: 3,  // Col D
    ready: 5,  // Col F
    pBass: 6,  // Col G
    horns: 7,  // Col H
    estTime: 13 // Col N
  };

  let startIndex = 0;
  const firstRowValues = (rawRows[0].c || []).map(extractCellText);
  const headerRowHasLabels = firstRowValues.some(v => /tune|song|ready|genre/i.test(v));

  if (headerRowHasLabels) {
    // Row 0 is the text header row
    startIndex = 1;
    firstRowValues.forEach((val, idx) => {
      const clean = val.toLowerCase();
      if (/tune|title|song/.test(clean)) colMap.tune = idx;
      else if (/genre/.test(clean)) colMap.genre = idx;
      else if (/ready/.test(clean)) colMap.ready = idx;
      else if (/p\s*bass|phil/.test(clean)) colMap.pBass = idx;
      else if (/horn/.test(clean)) colMap.horns = idx;
      else if (/time|duration|est/.test(clean)) colMap.estTime = idx;
    });
  } else if (gvizData.table.cols && gvizData.table.cols.some(c => c.label)) {
    // GViz table.cols has labels
    gvizData.table.cols.forEach((col, idx) => {
      const clean = (col.label || '').toLowerCase();
      if (/tune|title|song/.test(clean)) colMap.tune = idx;
      else if (/genre/.test(clean)) colMap.genre = idx;
      else if (/ready/.test(clean)) colMap.ready = idx;
      else if (/p\s*bass|phil/.test(clean)) colMap.pBass = idx;
      else if (/horn/.test(clean)) colMap.horns = idx;
      else if (/time|duration|est/.test(clean)) colMap.estTime = idx;
    });
  }

  console.log('Active Column Mapping:', colMap);

  allTracks = [];

  for (let r = startIndex; r < rawRows.length; r++) {
    const cells = rawRows[r].c || [];

    const getVal = (idx) => extractCellText(cells[idx]);

    const tune = getVal(colMap.tune);
    const genre = getVal(colMap.genre);
    const rawReady = getVal(colMap.ready);
    const rawPBass = getVal(colMap.pBass);
    const rawHorns = getVal(colMap.horns);
    const estTime = getVal(colMap.estTime);

    // Skip empty rows or accidental repeated headers
    if (!tune || /^tune$/i.test(tune)) continue;

    // Normalization: clean whitespace/punctuation, get upper case
    const readyClean = rawReady.replace(/[^a-zA-Z]/g, '').toUpperCase();

    // STRICT INGESTION CRITERION:
    // Only bring in if Readiness is strictly 'A' or 'B'
    if (readyClean !== 'A' && readyClean !== 'B') {
      continue;
    }

    // Holiday Song Detection:
    // Col D (Genre) contains 'holiday' or title contains seasonal cues
    const isHoliday = /holiday/i.test(genre) || 
                      /\b(christmas|xmas|santa|noel|winter wonderland|jingle)\b/i.test(tune);

    const isPBass = /^(y|yes|true|1)$/i.test(rawPBass);
    const isHorns = /^(y|yes|true|1)$/i.test(rawHorns);

    allTracks.push({
      id: `track-${r}`,
      tune,
      genre,
      ready: readyClean,
      pBass: isPBass,
      horns: isHorns,
      estTime,
      isHoliday
    });
  }

  console.log(`Ingested ${allTracks.length} total tracks (A/B Ready). Standard: ${allTracks.filter(t => !t.isHoliday).length}, Holiday: ${allTracks.filter(t => t.isHoliday).length}`);
  
  renderCandidatePool();
}

// --- BULLETPROOF CANDIDATE POOL RENDERER ---

function renderCandidatePool() {
  const pool = document.getElementById('candidate-pool');
  if (!pool) {
    console.error('Candidate pool element (#candidate-pool) not found in DOM.');
    return;
  }

  // Get set of all song IDs currently placed in sets to prevent duplicates
  const placedTrackIds = new Set();
  document.querySelectorAll('.set-column [data-track-id]').forEach(el => {
    const id = el.getAttribute('data-track-id');
    if (id) placedTrackIds.add(id);
  });

  const visibleTracks = allTracks.filter(track => {
    // 1. Exclude if already assigned to a set
    if (placedTrackIds.has(track.id)) return false;

    // 2. Holiday Visibility Logic:
    // Regular songs are always allowed.
    // Holiday songs are ONLY visible if showHoliday is toggled ON.
    if (track.isHoliday && !activeFilters.showHoliday) {
      return false;
    }

    // 3. Category & Readiness Filters
    if (activeFilters.readyA && !activeFilters.readyB && track.ready !== 'A') return false;
    if (activeFilters.readyB && !activeFilters.readyA && track.ready !== 'B') return false;
    if (activeFilters.horns && !track.horns) return false;
    if (activeFilters.pbass && !track.pBass) return false;

    // 4. Live Search Box
    if (activeFilters.search) {
      const q = activeFilters.search.toLowerCase();
      const matchTune = track.tune.toLowerCase().includes(q);
      const matchGenre = track.genre.toLowerCase().includes(q);
      if (!matchTune && !matchGenre) return false;
    }

    return true;
  });

  pool.innerHTML = '';

  if (visibleTracks.length === 0) {
    pool.innerHTML = `
      <div class="p-6 text-center text-slate-400 text-sm">
        No songs match the current filters. ${!activeFilters.showHoliday ? 'Click <strong>+ Holiday</strong> to include holiday repertoire.' : ''}
      </div>
    `;
    return;
  }

  visibleTracks.forEach(track => {
    pool.appendChild(createSongCard(track));
  });
}
