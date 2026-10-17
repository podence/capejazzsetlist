function parseGVizPayload(gvizData) {
  if (!gvizData || !gvizData.table) {
    console.error('Malformed GViz data payload:', gvizData);
    return;
  }

  const table = gvizData.table;
  const cols = table.cols || [];
  const rows = table.rows || [];

  console.log(`GViz loaded: ${cols.length} columns, ${rows.length} rows.`);

  // Resolve column indexes dynamically by label/header, with numeric fallbacks
  const findColIndex = (regex, fallbackIndex) => {
    const idx = cols.findIndex(col => col && col.label && regex.test(col.label.trim()));
    return idx !== -1 ? idx : fallbackIndex;
  };

  const colIdx = {
    tune: findColIndex(/tune|title|song/i, 0),         // Col A
    orig: findColIndex(/orig/i, 1),                    // Col B
    wrkOn: findColIndex(/wrk\s*on/i, 2),               // Col C
    genre: findColIndex(/genre/i, 3),                  // Col D
    ready: findColIndex(/ready/i, 5),                  // Col F
    pBass: findColIndex(/p\s*bass|phil/i, 6),           // Col G
    horns: findColIndex(/horns?/i, 7),                 // Col H
    estTime: findColIndex(/est\s*time|time|duration/i, 13) // Col N
  };

  console.log('Resolved column mapping:', colIdx);

  allTracks = [];

  rows.forEach((row, rowIndex) => {
    const c = row.c || [];

    // Safe cell extraction handling nulls, numbers, booleans, and formatted values
    const getVal = (idx) => {
      if (!c[idx]) return '';
      if (c[idx].f !== undefined && c[idx].f !== null) return String(c[idx].f).trim();
      if (c[idx].v !== undefined && c[idx].v !== null) return String(c[idx].v).trim();
      return '';
    };

    const tune = getVal(colIdx.tune);
    const orig = getVal(colIdx.orig);
    const wrkOn = getVal(colIdx.wrkOn);
    const genre = getVal(colIdx.genre);
    const rawReady = getVal(colIdx.ready);
    const pBass = getVal(colIdx.pBass);
    const horns = getVal(colIdx.horns);
    const estTime = getVal(colIdx.estTime);

    // Normalize readiness (clean hidden characters, spaces, uppercase)
    const ready = rawReady.replace(/[^A-Za-z]/g, '').toUpperCase();

    // Universal Ingestion Gate: Must have tune name AND readiness strictly 'A' or 'B'
    if (!tune || (ready !== 'A' && ready !== 'B')) {
      return;
    }

    const holidayRegex = /(holiday|christmas|xmas|santa|noel|winter wonderland|jingle)/i;
    const isHoliday = holidayRegex.test(genre) || holidayRegex.test(tune);

    allTracks.push({
      id: `track-${rowIndex}`,
      tune,
      orig,
      wrkOn,
      genre,
      ready,
      pBass: ['y', 'yes', 'true', '1'].includes(pBass.toLowerCase()),
      horns: ['y', 'yes', 'true', '1'].includes(horns.toLowerCase()),
      estTime,
      isHoliday
    });
  });

  console.log(`Ingested ${allTracks.length} eligible candidates (Readiness A/B).`);
  renderCandidatePool();
}
