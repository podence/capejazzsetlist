// --- BULLETPROOF CSV INGESTION PIPELINE ---

async function loadSheetData() {
  const pool = document.querySelector('#candidate-pool, #candidatePool, .candidate-pool-list');
  if (pool) {
    pool.innerHTML = '<div style="padding:1rem; color:#94a3b8; font-size:0.875rem;">Loading songs from Google Sheet...</div>';
  }

  // Google Sheet direct CSV export URL
  const csvUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${SHEET_GID}`;

  try {
    const res = await fetch(csvUrl);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} - Verify Sheet sharing is "Anyone with link can view"`);
    }
    const csvText = await res.text();
    parseCSVData(csvText);
  } catch (err) {
    console.error('Fetch error:', err);
    if (pool) {
      pool.innerHTML = `
        <div style="padding:1rem; border:1px solid #dc2626; border-radius:6px; background:#450a0a; color:#fca5a5; font-size:0.875rem;">
          <strong>Error loading sheet:</strong><br>${err.message}
        </div>`;
    }
  }
}

// Robust CSV parser supporting quotes, commas, and line breaks
function parseCSV(text) {
  const lines = [];
  let row = [''];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const next = text[i + 1];

    if (c === '"') {
      if (inQuotes && next === '"') {
        row[row.length - 1] += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
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

function parseCSVData(csvText) {
  const rows = parseCSV(csvText);
  allTracks = [];

  // Find the exact row containing 'Tune' in Column A
  let headerIndex = -1;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const col0 = (rows[i][0] || '').trim().toLowerCase();
    if (col0 === 'tune') {
      headerIndex = i;
      break;
    }
  }

  // Data starts on the row immediately following the header (Row 4 / index 3)
  const dataStartIndex = (headerIndex !== -1) ? headerIndex + 1 : 3;

  for (let i = dataStartIndex; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length === 0) continue;

    // EXACT INDICES CONFIRMED FROM YOUR SHEET:
    // Col A (0): Tune
    // Col B (1): wrk on
    // Col C (2): Genre
    // Col D (3): Orig
    // Col E (4): Rating
    // Col F (5): Ready
    // Col G (6): P Bass
    // Col H (7): Horns
    // Col K (10): Est Time
    const tune = (r[0] || '').trim();
    const wrkOn = (r[1] || '').trim();
    const genre = (r[2] || '').trim();
    const rawReady = (r[5] || '').trim();
    const rawPBass = (r[6] || '').trim();
    const rawHorns = (r[7] || '').trim();
    const estTime = (r[10] || '').trim();

    // Skip empty rows or accidental repeated headers
    if (!tune || /^tune$/i.test(tune)) continue;

    // Strict Normalization: Ready MUST be 'A' or 'B'
    const readyClean = rawReady.replace(/[^A-Za-z]/g, '').toUpperCase();
    if (readyClean !== 'A' && readyClean !== 'B') {
      continue;
    }

    // Holiday check (Genre contains Holiday OR title cues)
    const isHoliday = /holiday/i.test(genre) ||
                      /\b(christmas|xmas|santa|noel|winter wonderland|jingle)\b/i.test(tune);

    const isPBass = /^(y|yes|true|1)$/i.test(rawPBass);
    const isHorns = /^(y|yes|true|1)$/i.test(rawHorns);

    allTracks.push({
      id: `track-${i}`,
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

  console.log(`Ingested ${allTracks.length} songs (A/B Ready).`);
  renderCandidatePool();
}
