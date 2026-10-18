/**
 * Cape Jazz & Blues Setlist Builder
 * app.js - Direct CSV Ingestion matching index.html IDs
 */

const SPREADSHEET_ID = '1BLrbe4BDbFx7-5XBRlo0ICproWUw6bJot-3rLwa4NJo';
const SHEET_GID = '477864766';

// Global app handlers exposed immediately before DOM runs
window.app = {
  addCustomCue: (setKey) => {
    const text = prompt("Enter stage cue (e.g. 'Switch guitars', 'Acoustic Guitar', 'Break'):", "Switch guitars");
    if (!text || !text.trim()) return;
    const target = setKey === 'set1' ? document.getElementById('set1-list') : document.getElementById('set2-list');
    if (!target) return;

    target.appendChild(createCueCard(text.trim()));
    updateSetStats();
  },
  updateStats: () => updateSetStats()
};

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
      pool.innerHTML = `<div class="p-3 text-rose-300 bg-rose-950/60 border border-rose
