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
    masterList: [],         // All ingested songs meeting Readiness A or B
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
    return `Set List ${month}/${day}/${year}`; }  function parseDurationToSec(rawVal, formattedVal) { let str = (formattedVal \vert{}\vert{} rawVal \vert{}\vert{} '').toString().trim(); if (!str) return 0;  str = str.replace(/[^\d:]/g, ''); if (!str) return 0;  const parts = str.split(':').map(p => parseInt(p, 10) \vert{}\vert{} 0);  if (parts.length === 3) { const [h, m, s] = parts; if (h === 0) return (m * 60) + s; return (h * 3600) + (m * 60) + s; } if (parts.length === 2) { return (parts[0] * 60) + parts[1]; } const floatMins = parseFloat(str); if (!isNaN(floatMins)) { return Math.round(floatMins * 60); } return 0; }  function formatSecToMMSS(seconds) { const s = Math.max(0, Math.floor(seconds \vert{}\vert{} 0)); const mins = Math.floor(s / 60); const secs = s \% 60; return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
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

  function normalizeRow(cells) {
    if (!Array.isArray(cells) || cells.length === 0) return null;

    // Helper to safely get string values from cell objects or raw strings
    const getVal = (idx) => {
      const cell = cells[idx];
      if (cell === null || cell === undefined) return '';
      if (typeof cell === 'object') return (cell.v !== null && cell.v !== undefined) ? String(cell.v).trim() : '';
      return String(cell).trim();
    };

    // Col A (index 0) = Tune Title
    const title = getVal(0);
    if (!title || title.toLowerCase() === 'tune' || title === '`') return null;

    // Col F (index 5) = Readiness
    const readiness = getVal(5).toUpperCase();

    // STRICT INGESTION RULE: Col F must be strictly 'A' or 'B' (applies to all songs, including Holiday)
    if (readiness !== 'A' && readiness !== 'B') {
      return null;
    }

    // Col C (index 2) = Genre
    const genre = getVal(2) || 'Other';
    const isHoliday = genre.toLowerCase().includes('holiday');

    // Col G (index 6) = Phil Bass
    const philBass = isTrueFlag(getVal(6));

    // Col H (index 7) = Horns
    const horns = isTrueFlag(getVal(7));

    // Col K (index 10) = Est Time
    const cellK = cells[10];
    const durRaw = getVal(10);
    const durFormatted = (cellK && typeof cellK === 'object') ? (cellK.f || cellK.v || '') : '';
    const durationSec = parseDurationToSec(durRaw, durFormatted);

    return {
      id: 'song_' + Math.random().toString(36).substring(2, 9),
      title: title,
