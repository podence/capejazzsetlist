/**
 * Cape Jazz & Blues Setlist Builder
 * Repository: podence/capejazzsetlist
 */

const SPREADSHEET_ID = '1BLrbe4BDbFx7-5XBRlo0ICproWUw6bJot-3rLwa4NJo';
const SHEET_GID = '477864766';
const CSV_URL = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${SHEET_GID}`;

// State
let allSongs = [];
let activeFilter = 'ALL';
let sortables = {};

// Helper: Format today's date as M/D/YY
function getDefaultTitle() {
  const d = new Date();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const year = String(d.getFullYear()).slice(-2);
  return `Set List ${month}/${day}/${year}`;
}

// Convert MM:SS or M:SS string to total seconds
function parseTimeToSeconds(timeStr) {
  if (!timeStr) return 0;
  const clean = timeStr.trim();
  const parts = clean.split(':');
  if (parts.length === 2) {
    const mins = parseInt(parts[0], 10) || 0;
    const secs = parseInt(parts[1], 10) || 0;
    return (mins * 60) + secs;
  }
  return 0;
}

// Format seconds into M:SS or MM:SS
function formatSecondsToTime(totalSecs) {
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

// Ingestion & CSV Parsing Pipeline (Protected)
function parseCSV(text) {
  const rows = [];
  let currentRow = [];
  let currentField = '';
  let insideQuote = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuote && nextChar === '"') {
        currentField += '"';
        i++;
      } else {
        insideQuote = !insideQuote;
      }
    } else if (char === ',' && !insideQuote) {
      currentRow.push(currentField);
      currentField = '';
    } else if ((char === '\r' || char === '\n') && !insideQuote) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
    } else {
      currentField += char;
    }
  }

  if (currentField || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  return rows;
}

async function loadSheetCSV() {
  try {
    const response = await fetch(CSV_URL);
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const text = await response.text();
    parseCSVAndIngest(text);
  } catch (err) {
    console.error('Failed to load Google Sheet CSV:', err);
    const poolEl = document.getElementById('candidatePool');
    if (poolEl) {
      poolEl.innerHTML = `<div style="color:red; padding:15px;">Failed to load songs from Google Sheet. Verify internet connection or CORS settings.</div>`;
    }
  }
}

function parseCSVAndIngest(csvText) {
  const rows = parseCSV(csvText);
  if (rows.length < 2) return;

  const header = rows[0].map(h => h.trim());
  const colTitle = 0;   // Col A
  const colGenre = 2;   // Col C
  const colReady = 5;   // Col F
  const colBass = 6;    // Col G
  const colHorns = 7;   // Col H
  const colDur = 10;    // Col K

  allSongs = [];

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length <= colTitle) continue;

    const title = (r[colTitle] || '').trim();
    if (!title) continue;

    const readiness = (r[colReady] || '').trim().toUpperCase();
    // Only ingest A or B readiness
    if (readiness !== 'A' && readiness !== 'B') continue;

    const genre = (r[colGenre] || '').trim();
    const bass = (r[colBass] || '').trim();
    const horns = (r[colHorns] || '').trim();
    const durRaw = (r[colDur] || '').trim();
    const durationSec = parseTimeToSeconds(durRaw);

    allSongs.push({
      id: `song-${i}`,
      title: title,
      genre: genre,
      readiness: readiness,
      bass: bass,
      horns: horns,
      durationRaw: durRaw || '0:00',
      durationSec: durationSec,
      isHoliday: genre.toLowerCase().includes('holiday') || genre.toLowerCase().includes('christmas')
    });
  }

  console.log(`Ingested ${allSongs.length} eligible songs (A/B readiness).`);
  renderCandidatePool();
  updateAllDurations();
}

// Rendering Candidate Pool
function renderCandidatePool() {
  const pool = document.getElementById('candidatePool');
  if (!pool) return;

  pool.innerHTML = '';

  const filtered = allSongs.filter(song => {
    if (activeFilter === 'ALL') return !song.isHoliday;
    if (activeFilter === 'HOLIDAY') return song.isHoliday;
    if (activeFilter === 'A') return song.readiness === 'A' && !song.isHoliday;
    if (activeFilter === 'B') return song.readiness === 'B' && !song.isHoliday;
    return true;
  });

  filtered.forEach(song => {
    // Avoid re-rendering songs currently placed in sets or reserves
    if (document.getElementById(song.id)) return;

    const el = createSongCard(song);
    pool.appendChild(el);
  });
}

function createSongCard(song) {
  const div = document.createElement('div');
  div.className = 'song-card';
  div.id = song.id;
  div.setAttribute('data-id', song.id);
  div.setAttribute('data-title', song.title);
  div.setAttribute('data-duration', song.durationSec);
  div.setAttribute('data-raw-duration', song.durationRaw);
  div.setAttribute('data-genre', song.genre);
  div.setAttribute('data-bass', song.bass);
  div.setAttribute('data-horns', song.horns);

  const hornBadge = song.horns ? `<span class="badge horns">${song.horns}</span>` : '';
  const bassBadge = song.bass ? `<span class="badge bass">${song.bass}</span>` : '';

  div.innerHTML = `
    <div class="song-info">
      <span class="song-title">${song.title}</span>
      <span class="song-meta">${song.genre} &bull; ${song.durationRaw}</span>
    </div>
    <div class="song-badges">
      ${hornBadge}
      ${bassBadge}
    </div>
  `;
  return div;
}

// Cue Handling
function addCustomCue(targetSet) {
  const cueText = prompt('Enter stage cue (e.g., "Switch to Fretless", "Break", "Announcements"):');
  if (!cueText || !cueText.trim()) return;

  const targetList = document.getElementById(targetSet === 1 ? 'set1List' : 'set2List');
  if (!targetList) return;

  const cueId = `cue-${Date.now()}`;
  const cueEl = document.createElement('div');
  cueEl.className = 'song-card cue-card';
  cueEl.id = cueId;
  cueEl.setAttribute('data-is-cue', 'true');
  cueEl.setAttribute('data-title', cueText.trim());

  cueEl.innerHTML = `
    <div class="song-info">
      <span class="cue-title">STAGE CUE: ${cueText.trim()}</span>
    </div>
    <button type="button" class="btn-delete-cue" onclick="this.closest('.cue-card').remove(); window.app.updateAllDurations();">&times;</button>
  `;

  targetList.appendChild(cueEl);
  updateAllDurations();
}

// Duration Calculations
function updateAllDurations() {
  updateSectionDuration('set1List', 'set1Duration', 'set1Count');
  updateSectionDuration('set1Reserve', 'set1ReserveDuration', 'set1ReserveCount');
  updateSectionDuration('set2List', 'set2Duration', 'set2Count');
  updateSectionDuration('set2Reserve', 'set2ReserveDuration', 'set2ReserveCount');
}

function updateSectionDuration(listId, durationId, countId) {
  const listEl = document.getElementById(listId);
  const durEl = document.getElementById(durationId);
  const countEl = document.getElementById(countId);
  if (!listEl) return;

  let totalSecs = 0;
  let songCount = 0;

  Array.from(listEl.children).forEach(child => {
    if (child.getAttribute('data-is-cue') === 'true') return;
    const sec = parseInt(child.getAttribute('data-duration'), 10) || 0;
    totalSecs += sec;
    songCount++;
  });

  if (durEl) durEl.textContent = formatSecondsToTime(totalSecs);
  if (countEl) countEl.textContent = `${songCount} song${songCount === 1 ? '' : 's'}`;
}

// SortableJS Drag & Drop Initialization
function initSortables() {
  const containers = [
    'candidatePool',
    'set1List',
    'set1Reserve',
    'set2List',
    'set2Reserve'
  ];

  containers.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;

    sortables[id] = new Sortable(el, {
      group: 'setlist-shared',
      animation: 150,
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      onEnd: () => {
        updateAllDurations();
      }
    });
  });
}

// Export Engine: Standard vs Geoff Format
function extractSetData(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return [];

  const items = [];
  Array.from(container.children).forEach(child => {
    const isCue = child.getAttribute('data-is-cue') === 'true';
    if (isCue) {
      items.push({
        isCue: true,
        title: child.getAttribute('data-title') || 'Cue'
      });
    } else {
      items.push({
        isCue: false,
        title: child.getAttribute('data-title') || '',
        duration: child.getAttribute('data-raw-duration') || '',
        genre: child.getAttribute('data-genre') || '',
        bass: child.getAttribute('data-bass') || '',
        horns: child.getAttribute('data-horns') || ''
      });
    }
  });
  return items;
}

async function exportWord(formatType = 'standard') {
  if (typeof docx === 'undefined') {
    alert('Word export engine (docx.js) is not loaded.');
    return;
  }

  const gigTitle = (document.getElementById('gigTitleInput')?.value || getDefaultTitle()).trim();
  const set1Items = extractSetData('set1List');
  const set1Reserve = extractSetData('set1Reserve');
  const set2Items = extractSetData('set2List');
  const set2Reserve = extractSetData('set2Reserve');

  const set1Dur = document.getElementById('set1Duration')?.textContent || '0:00';
  const set2Dur = document.getElementById('set2Duration')?.textContent || '0:00';

  const isGeoff = formatType === 'geoff';
  const docFont = isGeoff ? 'Calibri' : 'Aptos';

  const doc = new docx.Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 720, bottom: 720, left: 1080, right: 1080 } // 0.5" top/bot, 0.75" sides
        }
      },
      children: [
        // Title
        new docx.Paragraph({
          children: [
            new docx.TextRun({
              text: gigTitle,
              bold: true,
              size: 36, // 18pt
              font: docFont,
              shading: isGeoff ? { type: docx.ShadingType.SOLID, color: "F0F0F0" } : undefined
            })
          ],
          alignment: docx.AlignmentType.CENTER,
          spacing: { after: 200 }
        }),

        // SET 1 Header
        new docx.Paragraph({
          children: [
            new docx.TextRun({
              text: 'SET 1',
              bold: true,
              underline: {},
              size: 26, // 13pt
              font: docFont
            })
          ],
          spacing: { before: 150, after: 100 }
        }),
        ...generateDocxItemList(set1Items, docFont, isGeoff),

        // Set 1 Total
        new docx.Paragraph({
          children: [
            new docx.TextRun({
              text: `Set 1 Duration: ${set1Dur}`,
              bold: !isGeoff, // Geoff: unbolded
              color: isGeoff ? 'C00000' : '000000', // Geoff: red total
              size: 22,
              font: docFont
            })
          ],
          spacing: { before: 100, after: 100 }
        }),

        // Set 1 Reserve
        ...(set1Reserve.length > 0 ? [
          new docx.Paragraph({
            children: [
              new docx.TextRun({
                text: 'Reserve / Alternates:',
                bold: !isGeoff, // Geoff: unbolded
                size: 20,
                font: docFont
              })
            ],
            spacing: { before: 80, after: 60 }
          }),
          ...generateDocxItemList(set1Reserve, docFont, isGeoff)
        ] : []),

        // SET 2 Header
        new docx.Paragraph({
          children: [
            new docx.TextRun({
              text: 'SET 2',
              bold: true,
              underline: {},
              size: 26,
              font: docFont
            })
          ],
          spacing: { before: 250, after: 100 }
        }),
        ...generateDocxItemList(set2Items, docFont, isGeoff),

        // Set 2 Total
        new docx.Paragraph({
          children: [
            new docx.TextRun({
              text: `Set 2 Duration: ${set2Dur}`,
              bold: !isGeoff, // Geoff: unbolded
              color: isGeoff ? 'C00000' : '000000',
              size: 22,
              font: docFont
            })
          ],
          spacing: { before: 100, after: 100 }
        }),

        // Set 2 Reserve
        ...(set2Reserve.length > 0 ? [
          new docx.Paragraph({
            children: [
              new docx.TextRun({
                text: 'Reserve / Alternates:',
                bold: !isGeoff, // Geoff: unbolded
                size: 20,
                font: docFont
              })
            ],
            spacing: { before: 80, after: 60 }
          }),
          ...generateDocxItemList(set2Reserve, docFont, isGeoff)
        ] : [])
      ]
    }]
  });

  const blob = await docx.Packer.toBlob(doc);
  const safeFilename = gigTitle.toLowerCase().replace(/[^a-z0-9]/g, '_') + (isGeoff ? '_geoff' : '') + '.docx';
  saveAs(blob, safeFilename);
}

function generateDocxItemList(items, docFont, isGeoff) {
  return items.map((item, idx) => {
    if (item.isCue) {
      return new docx.Paragraph({
        children: [
          new docx.TextRun({
            text: `*** ${item.title} ***`,
            italics: true,
            bold: false,
            color: '666666',
            size: 20,
            font: docFont
          })
        ],
        spacing: { before: 40, after: 40 }
      });
    }

    const details = [item.duration, item.bass, item.horns].filter(Boolean).join(' | ');
    return new docx.Paragraph({
      children: [
        new docx.TextRun({
          text: `${item.title}`,
          bold: !isGeoff,
          size: 22,
          font: docFont
        }),
        new docx.TextRun({
          text: details ? `  (${details})` : '',
          size: 20,
          color: '555555',
          font: docFont
        })
      ],
      spacing: { before: 30, after: 30 }
    });
  });
}

// Global initialization
window.addEventListener('DOMContentLoaded', () => {
  const titleInput = document.getElementById('gigTitleInput');
  if (titleInput && !titleInput.value) {
    titleInput.value = getDefaultTitle();
  }

  // Filter chips
  document.querySelectorAll('.filter-chip').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
      activeFilter = e.target.getAttribute('data-filter') || 'ALL';
      renderCandidatePool();
    });
  });

  initSortables();
  loadSheetCSV();
});

// Window namespace for inline template calls
window.app = {
  addCustomCue,
  exportWord,
  updateAllDurations
};