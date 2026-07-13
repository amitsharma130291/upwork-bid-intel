async function init() {
  // Load stats
  const { stats = { checked:0, skipped:0, connects:0 } } = await chrome.storage.local.get('stats');

  // Try to get data from active tab
  try {
    const [tab] = await chrome.tabs.query({ active:true, currentWindow:true });
    if (!tab?.url?.includes('upwork.com')) throw new Error('not upwork');

    const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PAGE_DATA' });
    if (!response?.result) throw new Error('no data');

    const { result, isDetail } = response;

    // On listing pages (not a detail/modal page), don't show a job score —
    // there's no single job to score. Show a "click a job" prompt instead.
    if (!isDetail) {
      document.getElementById('jobPanel').style.display = 'none';
      document.getElementById('noJobPanel').style.display = 'block';
      document.getElementById('noJobPanel').innerHTML =
        '<div style="text-align:center;padding:16px 12px">' +
        '<div style="font-size:28px;margin-bottom:8px">👆</div>' +
        '<div style="font-size:13px;font-weight:700;color:#e8e8f0;margin-bottom:6px">Open a job to see its score</div>' +
        '<div style="font-size:11px;color:#8080a0;line-height:1.5">Click any job card on the listing page to open it, then the score breakdown will appear here.</div>' +
        '</div>';
      return;
    }

    const { score, grade, color, flags, green } = result;

    document.getElementById('jobPanel').style.display = 'block';
    document.getElementById('noJobPanel').style.display = 'none';

    // Score circle
    const circle = document.getElementById('scoreCircle');
    circle.style.borderColor = color;
    document.getElementById('scoreNum').style.color = color;
    document.getElementById('scoreNum').textContent = score;
    document.getElementById('scoreGrade').textContent = grade || '';

    document.getElementById('jobTitle').textContent = 'Job Score';

    // Flags
    const fl = document.getElementById('flagsList');
    flags.forEach(f => { const d = document.createElement('div'); d.className='flag-item'; const txt = typeof f === 'object' ? f.text : f; const pts = typeof f === 'object' && f.pts ? ' (−'+f.pts+' pts)' : ''; d.textContent='⚠️ '+txt+pts; fl.appendChild(d); });

    // Green
    const gl = document.getElementById('greenList');
    green.forEach(g => { const d = document.createElement('div'); d.className='green-item'; const txt = typeof g === 'object' ? g.text : g; d.textContent='✅ '+txt; gl.appendChild(d); });

    // Verdict
    let verdictText = '';
    if (score >= 80) verdictText = '<strong>Apply.</strong> Strong signals across the board. This client looks legit and the job is fresh.';
    else if (score >= 65) verdictText = '<strong>Apply with confidence.</strong> Good job — a few minor concerns but nothing that should stop you.';
    else if (score >= 45) verdictText = '<strong>Proceed carefully.</strong> Some red flags. Read the description thoroughly before spending connects.';
    else if (score >= 25) verdictText = '<strong>High risk.</strong> Multiple red flags. Consider skipping unless you have a strong match.';
    else verdictText = '<strong>Skip this one.</strong> Too many warning signs. Save your connects for better opportunities.';
    document.getElementById('verdict').innerHTML = verdictText;

    // Update stats
    stats.checked = (stats.checked || 0) + 1;
    if (score < 40) {
      stats.skipped = (stats.skipped || 0) + 1;
      stats.connects = (stats.connects || 0) + 6;
    }
    await chrome.storage.local.set({ stats });

  } catch(_) {
    document.getElementById('jobPanel').style.display = 'none';
    document.getElementById('noJobPanel').style.display = 'block';
  }

  // Stats bar
  const { stats: s2 = {} } = await chrome.storage.local.get('stats');
  if ((s2.checked || 0) > 0) {
    document.getElementById('statsBar').style.display = 'flex';
    document.getElementById('statChecked').textContent = s2.checked || 0;
    document.getElementById('statSkipped').textContent = s2.skipped || 0;
    document.getElementById('statConnects').textContent = s2.connects || 0;
  }
}

init();
