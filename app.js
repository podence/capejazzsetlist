// Scan header row dynamically
const headerMap = {};
headerRow.forEach((cell, idx) => {
  const label = (cell?.v || '').toString().trim().toLowerCase();
  if (label.includes('tune')) headerMap.tune = idx;
  else if (label.includes('genre')) headerMap.genre = idx;
  else if (label === 'ready') headerMap.ready = idx;
  else if (label.includes('bass')) headerMap.bass = idx;
  else if (label.includes('horn')) headerMap.horns = idx;
  else if (label.includes('time')) headerMap.time = idx;
});
