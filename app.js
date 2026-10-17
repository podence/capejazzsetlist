// --- DIRECT, FIXED-ROW INGESTION (HEADERS ON ROW 3) ---

function loadSheetData() {
  const callbackName = 'gvizCallback_' + Math.floor(Math.random() * 100000);

  window[callbackName] = (data) => {
    try {
      parseFixedGVizPayload(data);
    } catch (err) {
      showDiagnosticError(`Parsing error: ${err.message}`);
    } finally {
      delete window[callbackName];
      if (script && script.parentNode) script.parentNode.removeChild(script);
    }
  };

  const script = document.createElement('script');
  // tqx=responseHandler routes directly to our window callback
  script.src = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=responseHandler:${callbackName}&gid=${SHEET_GID}`;
  script.onerror = () => {
    showDiagnosticError('Failed to fetch from Google Sheets. Check sheet sharing (Must be "Anyone with link can view").');
  };
  document.body.appendChild(script);
}

function parseFixedGVizPayload(gvizData) {
  if (!gvizData || !gvizData.table || !gvizData.table.rows) {
    showDiagnosticError('GViz returned an empty or malformed table structure.');
    return;
  }

  const rows = gvizData.table.rows;
  allTracks = [];

  // Helper: safely get cell string value
  const getCell = (row, colIdx) => {
    if (!row || !row.c || !row.c[colIdx]) return '';
    const cell = row.c[colIdx];
    if (cell.v !== null && cell.v !== undefined) return String(cell.v).trim();
    if (cell.f !== null && cell.f !== undefined) return String(cell.f).trim();
    return '';
  };

  // Row index 0 = Sheet Row 1
  // Row index 1 = Sheet Row 2
  // Row index 2 = Sheet Row 3 (Headers: Tune, Orig, wrk on, Genre, etc.)
  // Data starts at Row index 3 (Sheet Row 4)
  const DATA_START_INDEX = 3;

  // Verification: Verify Row 3 contains expected headers
  if (rows.length > 2) {
    const checkTuneHeader = getCell(rows[2], 0);
    const checkReadyHeader = getCell(rows[2], 5);
    console.log(`[Diagnostic] Row 3 Check -> Col A: "${checkTuneHeader}", Col F: "${checkReadyHeader}"`);
  }

  for (let i = DATA_START_INDEX; i < rows.length; i++) {
    const row = rows[i];

    const tune = getCell(row, 0);          // Col A: Tune
    const genre = getCell(row, 3);         // Col D: Genre
    const rawReady = getCell(row, 5);      // Col F: Ready
    const rawPBass = getCell(row, 6);      // Col G: P Bass
    const rawHorns = getCell(row, 7);      // Col H: Horns
    const estTime = getCell(row, 13);      // Col N: Est Time

    // Clean readiness string (strips whitespace, invisible format characters)
    const readyClean = rawReady.replace(/[^A-Za-z]/g, '').toUpperCase();

    // Universal Ingestion Rule: Only ingest if Tune exists AND Ready is strictly 'A' or 'B'
    if (!tune || (readyClean !== 'A' && readyClean !== 'B')) {
      continue;
    }

    // Holiday Check
    const isHoliday = /holiday/i.test(genre) || 
                      /\b(christmas|xmas|santa|noel|winter wonderland|jingle)\b/i.test(tune);

    const isPBass = /^(y|yes|true|1)$/i.test(rawPBass);
    const isHorns = /^(y|yes|true|1)$/i.test(rawHorns);

    allTracks.push({
      id: `track-${i}`,
      tune,
      genre,
      ready: readyClean,
      pBass: isPBass,
      horns: isHorns,
      estTime,
      isHoliday
    });
  }

  // Display clear confirmation banner on page
  const pool = document.getElementById('candidate-pool');
  if (allTracks.length === 0) {
    if (pool) {
      pool.innerHTML = `
        <div class="p-4 rounded border border-amber-600/50 bg-amber-950/30 text-amber-200 text-sm">
          <strong>Connected to Sheet, but 0 songs met criteria.</strong><br>
          Checked rows starting at Sheet Row 4.<br>
          Check if Column F contains "A" or "B" on Row 4 onwards.
        </div>
      `;
    }
  } else {
    renderCandidatePool();
  }
}

function showDiagnosticError(message) {
  const pool = document.getElementById('candidate-pool');
  if (pool) {
    pool.innerHTML = `
      <div class="p-4 rounded border border-rose-600/50 bg-rose-950/40 text-rose-200 text-sm">
        <strong>Sheet Connection Error:</strong><br>${message}
      </div>
    `;
  }
}
