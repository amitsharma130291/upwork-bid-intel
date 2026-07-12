/**
 * Upwork Bid Intel v1.1 — Content Script
 * Fixed: regex patterns match Upwork's actual DOM text
 * Fixed: duplicate badge prevention via data attribute
 */

// ─── Scoring engine ───────────────────────────────────────────────────────────
function scoreJob(data) {
  let score = 100;
  const flags = [];
  const green = [];

  // ── CLIENT RATING ──
  if (data.clientRating !== null && data.clientRating > 0) {
    if (data.clientRating >= 4.7)      green.push('Top-rated client (' + data.clientRating + '⭐)');
    else if (data.clientRating >= 4.0) green.push('Good client rating (' + data.clientRating + ')');
    else if (data.clientRating < 3.5)  { score -= 25; flags.push('Low client rating: ' + data.clientRating); }
    else                               { score -= 10; flags.push('Below-avg client rating: ' + data.clientRating); }
  } else {
    score -= 20;
    flags.push('No client rating — never hired on Upwork');
  }

  // ── CLIENT HIRES ──
  if (data.clientHires !== null) {
    if (data.clientHires === 0)       { score -= 15; flags.push('Client has 0 hires ever'); }
    else if (data.clientHires >= 10)  green.push(data.clientHires + ' total hires');
    else if (data.clientHires >= 3)   green.push(data.clientHires + ' hires');
  }

  // ── CLIENT SPEND ──
  if (data.clientSpend !== null) {
    if (data.clientSpend === 0)           { score -= 10; flags.push('$0 spent — brand new account'); }
    else if (data.clientSpend >= 10000)   green.push('$' + (data.clientSpend/1000).toFixed(0) + 'k+ spent on Upwork');
    else if (data.clientSpend >= 1000)    green.push('$' + (data.clientSpend/1000).toFixed(1) + 'k spent');
    else if (data.clientSpend < 100)      { score -= 5; flags.push('Client spent <$100 total'); }
  }

  // ── PAYMENT VERIFICATION ──
  if (data.paymentVerified === false)     { score -= 20; flags.push('Payment NOT verified ⚠️'); }
  else if (data.paymentVerified === true) green.push('Payment verified ✓');

  // ── JOB AGE ──
  if (data.daysPosted !== null) {
    if (data.daysPosted > 60)      { score -= 30; flags.push('Posted ' + data.daysPosted + ' days ago — very stale'); }
    else if (data.daysPosted > 30) { score -= 20; flags.push('Posted ' + data.daysPosted + ' days ago — likely stale'); }
    else if (data.daysPosted > 14) { score -= 8;  flags.push('Posted ' + data.daysPosted + ' days ago'); }
    else if (data.daysPosted <= 1) green.push('Posted today — very fresh');
    else if (data.daysPosted <= 3) green.push('Posted ' + data.daysPosted + ' days ago — fresh');
  }

  // ── PROPOSALS (competition) ──
  if (data.proposalsMid !== null) {
    if (data.proposalsMid >= 50)      { score -= 20; flags.push('50+ proposals — very crowded'); }
    else if (data.proposalsMid >= 25) { score -= 10; flags.push(data.proposalsMid + '± proposals — competitive'); }
    else if (data.proposalsMid <= 5)  green.push('Only ~' + data.proposalsMid + ' proposals — low competition 🎯');
    else                              green.push('~' + data.proposalsMid + ' proposals');
  }

  // ── BUDGET ──
  if (data.hourlyMid !== null) {
    if (data.hourlyMid < 10)      { score -= 25; flags.push('Rate $' + data.hourlyMid + '/hr — race to bottom'); }
    else if (data.hourlyMid < 20) { score -= 10; flags.push('Low rate: ~$' + data.hourlyMid + '/hr'); }
    else if (data.hourlyMid >= 50) green.push('Strong rate: ~$' + data.hourlyMid + '/hr 💰');
    else                           green.push('Rate: ~$' + data.hourlyMid + '/hr');
  }

  if (data.fixedBudget !== null) {
    if (data.fixedBudget < 50)       { score -= 20; flags.push('Fixed budget <$50 — not worth it'); }
    else if (data.fixedBudget < 200) { score -= 5;  flags.push('Low fixed budget: $' + data.fixedBudget); }
    else if (data.fixedBudget >= 500) green.push('Good budget: $' + data.fixedBudget + ' 💰');
    else                              green.push('Budget: $' + data.fixedBudget);
  }

  // ── DESCRIPTION QUALITY ──
  if (data.descLength !== null) {
    if (data.descLength < 80)       { score -= 20; flags.push('Vague job description — lazy client'); }
    else if (data.descLength >= 400) green.push('Detailed description');
  }

  score = Math.max(0, Math.min(100, score));

  let grade, color, emoji;
  if (score >= 80)      { grade = 'Excellent'; color = '#22c55e'; emoji = '🟢'; }
  else if (score >= 65) { grade = 'Good';      color = '#84cc16'; emoji = '🟡'; }
  else if (score >= 45) { grade = 'Risky';     color = '#f59e0b'; emoji = '🟠'; }
  else if (score >= 25) { grade = 'Poor';      color = '#ef4444'; emoji = '🔴'; }
  else                  { grade = 'Skip';      color = '#7f1d1d'; emoji = '💀'; }

  return { score, grade, color, emoji, flags, green };
}

// ─── Data extraction — matched to Upwork's actual text patterns ───────────────
function extractFromText(text) {
  // ── PAYMENT VERIFICATION ──
  // "Payment verified" vs "Payment unverified"
  const paymentVerified = /payment\s+(?!un)verified/i.test(text);

  // ── JOB AGE ──
  // "Posted 2 weeks ago · Proposals: 5 to 10"
  // "Posted 2 months ago"
  // "Posted 3 days ago"
  let daysPosted = null;
  const hoursM     = text.match(/posted\s+(\d+)\s+hours?\s+ago/i);
  const yesterdayM = text.match(/posted\s+yesterday/i);
  const todayM     = text.match(/posted\s+today/i);
  const justNowM   = text.match(/posted\s+just\s+now/i);
  const daysM      = text.match(/posted\s+(\d+)\s+days?\s+ago/i);
  const weeksM     = text.match(/posted\s+(\d+)\s+weeks?\s+ago/i);
  const monthsM    = text.match(/posted\s+(\d+)\s+months?\s+ago/i);
  if      (justNowM || todayM || hoursM) daysPosted = 0;
  else if (yesterdayM) daysPosted = 1;
  else if (daysM)      daysPosted = parseInt(daysM[1]);
  else if (weeksM)     daysPosted = parseInt(weeksM[1]) * 7;
  else if (monthsM)    daysPosted = parseInt(monthsM[1]) * 30;

  // ── PROPOSALS ──
  // "Proposals: 5 to 10"  "Proposals: 10 to 15"  "Proposals: Less than 5"
  let proposalsMid = null;
  const propRange  = text.match(/proposals?[:\s]+(\d+)\s+to\s+(\d+)/i);
  const propLess   = text.match(/proposals?[:\s]+less\s+than\s+(\d+)/i);
  const propSingle = text.match(/proposals?[:\s]+(\d+)/i);
  if (propRange)       proposalsMid = Math.round((parseInt(propRange[1]) + parseInt(propRange[2])) / 2);
  else if (propLess)   proposalsMid = Math.round(parseInt(propLess[1]) / 2);
  else if (propSingle) proposalsMid = parseInt(propSingle[1]);

  // ── HOURLY RATE ──
  // "Hourly: $15.00 - $40.00 - Intermediate"
  // "Hourly: $25.00/hr"
  let hourlyMid = null;
  const hourlyRange  = text.match(/hourly[:\s]+\$([0-9,.]+)\s*[-–]\s*\$([0-9,.]+)/i);
  const hourlySingle = text.match(/hourly[:\s]+\$([0-9,.]+)/i);
  if (hourlyRange)       hourlyMid = Math.round((parseFloat(hourlyRange[1].replace(/,/g,'')) + parseFloat(hourlyRange[2].replace(/,/g,''))) / 2);
  else if (hourlySingle) hourlyMid = parseFloat(hourlySingle[1].replace(/,/g,''));

  // ── FIXED BUDGET ──
  // "Est. budget: $500.00"  "Fixed price ... $500"
  let fixedBudget = null;
  const fixedM = text.match(/(?:est\.?\s*budget|fixed)[:\s]*\$([0-9,]+(?:\.\d+)?)/i);
  if (fixedM && !hourlyMid) fixedBudget = parseFloat(fixedM[1].replace(/,/g,''));

  // ── CLIENT HIRES (the number before "$X spent") ──
  // Upwork shows: "★★★★★ 0  $0 spent" — the 0 is total jobs posted/hires
  // Also: "123 hires"  or "No hires"
  let clientHires = null;
  const noHiresM  = /no\s+hires/i.test(text);
  const hiresM    = text.match(/(\d+)\s+hires/i);
  const jobsM     = text.match(/(\d+)\s+jobs?\s+posted/i);
  // The standalone zero before "$X spent" pattern
  const zeroBeforeSpend = text.match(/\b(0)\s+\$\d+\s+spent/i);
  if      (noHiresM)      clientHires = 0;
  else if (hiresM)        clientHires = parseInt(hiresM[1]);
  else if (jobsM)         clientHires = parseInt(jobsM[1]);
  else if (zeroBeforeSpend) clientHires = 0;

  // ── CLIENT SPEND ──
  // "$0 spent"  "$1.2k spent"  "$50K+ spent"
  let clientSpend = null;
  // Patterns: "$5K+ spent", "$1.2k spent", "$50 spent", "$5,000 spent"
  const spentM = text.match(/\$(\d[\d,.]*)(k\+?)?\s*\+?\s*spent/i);
  if (spentM) {
    let v = parseFloat(spentM[1].replace(/,/g,''));
    if (spentM[2] && /k/i.test(spentM[2])) v *= 1000;
    // Handle "$5K+ spent" where + means "more than"
    clientSpend = v;
  }

  // ── CLIENT RATING ──
  // Upwork shows numeric rating like "4.9" near stars, or just "0" for no rating
  let clientRating = null;
  // Match ratings 1.0-5.9 anchored near a star or 'rating' word, or any x.y in range
  const ratingM = text.match(/(?:★|\brating\b)[^\d]*(\d\.\d)/i) ?? text.match(/\b([1-5]\.\d)\b/);
  if (ratingM) clientRating = parseFloat(ratingM[1] ?? ratingM[2]);

  // ── DESCRIPTION LENGTH ──
  // Use the whole card text minus noise as a rough quality proxy
  const cleanText = text.replace(/\s+/g,' ').trim();
  const descLength = cleanText.length > 50 ? cleanText.length : null;

  return {
    paymentVerified, daysPosted, proposalsMid,
    hourlyMid, fixedBudget, clientHires, clientSpend,
    clientRating, descLength
  };
}

// ─── Badge rendering ──────────────────────────────────────────────────────────

// ─── Verdict copy ─────────────────────────────────────────────────────────────
function verdictText(score) {
  if (score >= 80) return '✅ Apply — strong signals across the board.';
  if (score >= 65) return '👍 Worth applying — looks decent.';
  if (score >= 45) return '⚠️ Risky — check the details first.';
  if (score >= 25) return '🔴 Probably skip — multiple red flags.';
  return '💀 Skip — save your connects for better jobs.';
}

// ─── Compact badge on job cards ───────────────────────────────────────────────
let activeTooltip = null;

function removeTooltip() {
  if (activeTooltip) { activeTooltip.remove(); activeTooltip = null; }
}

function renderCompact(result) {
  const { score, grade, color, flags, green } = result;

  // ── Minimal badge: just a coloured dot + score number ──
  const badge = document.createElement('span');
  badge.className = 'ubi-badge';
  badge.setAttribute('data-ubi', '1');
  badge.setAttribute('tabindex', '0');
  badge.style.cssText = [
    'display:inline-flex',
    'align-items:center',
    'gap:5px',
    'background:#f4f4f8',
    'border:1px solid #d8d8e4',
    'border-radius:5px',
    'padding:3px 8px',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    'font-size:12px',
    'font-weight:600',
    'color:#3a3a4e',
    'cursor:default',
    'user-select:none',
    'white-space:nowrap',
    'position:relative',
    'vertical-align:middle',
    'line-height:1.4',
    'box-sizing:border-box',
  ].join('!important;') + '!important';

  // Coloured dot (the only colour)
  const dot = document.createElement('span');
  dot.style.cssText = `display:inline-block!important;width:8px!important;height:8px!important;border-radius:50%!important;background:${color}!important;flex-shrink:0!important;`;

  // Score number — neutral dark text
  const lbl = document.createElement('span');
  lbl.style.cssText = 'font-size:12px!important;font-weight:700!important;color:#2a2a3e!important;font-family:inherit!important;';
  lbl.textContent = score;

  badge.appendChild(dot);
  badge.appendChild(lbl);

  // ── Tooltip — appended to body, position:fixed with viewport-safe placement ──
  let hideTimer = null;

  function buildTooltip() {
    const rect = badge.getBoundingClientRect();
    const tip = document.createElement('div');
    activeTooltip = tip;

    tip.style.cssText = [
      'position:fixed',
      'z-index:2147483647',
      'width:270px',
      'background:#1a1a24',
      'border:1px solid #3a3a4e',
      'border-radius:10px',
      'box-shadow:0 8px 32px rgba(0,0,0,0.55)',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      'font-size:12px',
      'color:#e8e8f0',
      'overflow:hidden',
      'pointer-events:none',
      'top:-9999px',
      'left:-9999px',
    ].join('!important;') + '!important';

    // Header: big score + grade pill + one-line verdict
    const hdr = document.createElement('div');
    hdr.style.cssText = 'display:flex!important;align-items:center!important;gap:12px!important;padding:12px 14px!important;border-bottom:1px solid #2e2e3e!important;';

    const scoreEl = document.createElement('div');
    scoreEl.style.cssText = `font-size:32px!important;font-weight:900!important;line-height:1!important;color:${color}!important;flex-shrink:0!important;width:48px!important;text-align:center!important;`;
    scoreEl.textContent = score;

    const meta = document.createElement('div');
    meta.style.cssText = 'flex:1!important;min-width:0!important;';

    const pill = document.createElement('div');
    pill.style.cssText = `display:inline-block!important;background:${color}!important;color:#fff!important;font-size:10px!important;font-weight:800!important;letter-spacing:0.6px!important;text-transform:uppercase!important;border-radius:4px!important;padding:2px 8px!important;margin-bottom:5px!important;`;
    pill.textContent = grade;

    const verd = document.createElement('div');
    verd.style.cssText = 'font-size:12px!important;color:#b0b0c8!important;line-height:1.4!important;';
    verd.textContent = verdictText(score);

    meta.appendChild(pill);
    meta.appendChild(verd);
    hdr.appendChild(scoreEl);
    hdr.appendChild(meta);
    tip.appendChild(hdr);

    // Signals
    if (green.length || flags.length) {
      const sig = document.createElement('div');
      sig.style.cssText = 'padding:8px 14px 10px!important;display:flex!important;flex-direction:column!important;gap:5px!important;';
      green.forEach(g => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex!important;align-items:flex-start!important;gap:7px!important;font-size:11px!important;color:#6ee7b7!important;line-height:1.4!important;';
        row.innerHTML = '<span style="flex-shrink:0">✓</span><span>' + g + '</span>';
        sig.appendChild(row);
      });
      flags.forEach(f => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex!important;align-items:flex-start!important;gap:7px!important;font-size:11px!important;color:#fcd34d!important;line-height:1.4!important;';
        row.innerHTML = '<span style="flex-shrink:0">!</span><span>' + f + '</span>';
        sig.appendChild(row);
      });
      tip.appendChild(sig);
    }

    const foot = document.createElement('div');
    foot.style.cssText = 'background:#111118!important;padding:5px 14px!important;font-size:10px!important;color:#5a5a72!important;border-top:1px solid #2e2e3e!important;';
    foot.textContent = '⚡ Upwork Bid Intel · No account · All local';
    tip.appendChild(foot);

    document.body.appendChild(tip);

    // ── Position: fixed = viewport coords, NO scrollY offset ──
    requestAnimationFrame(() => {
      const tw = tip.offsetWidth  || 270;
      const th = tip.offsetHeight || 200;

      // Horizontal: align to badge left, keep inside viewport
      let left = rect.left;
      if (left + tw > window.innerWidth - 8) left = window.innerWidth - tw - 8;
      if (left < 8) left = 8;

      // Vertical: below badge by default, flip above if too close to bottom
      let top = rect.bottom + 6;
      if (top + th > window.innerHeight - 8) top = rect.top - th - 6;
      if (top < 8) top = 8;

      tip.style.top  = top  + 'px';
      tip.style.left = left + 'px';
    });

    return tip;
  }

  function showTooltip() {
    clearTimeout(hideTimer);
    removeTooltip();
    buildTooltip();
  }

  function scheduleHide() {
    hideTimer = setTimeout(removeTooltip, 120);
  }

  badge.addEventListener('mouseenter', showTooltip);
  badge.addEventListener('mouseleave', scheduleHide);
  badge.addEventListener('focus',      showTooltip);
  badge.addEventListener('blur',       scheduleHide);

  return badge;
}

// ─── Detail page panel ────────────────────────────────────────────────────────
function renderPanel(result) {
  const { score, grade, color, flags, green } = result;

  const panel = document.createElement('div');
  panel.className = 'ubi-panel';
  panel.setAttribute('data-ubi', '1');
  panel.style.cssText = [
    'display:flex',
    'align-items:flex-start',
    'gap:0',
    'background:#ffffff',
    'border:1.5px solid #e2e2ee',
    `border-left:4px solid ${color}`,
    'border-radius:10px',
    'padding:0',
    'margin:14px 0',
    'max-width:660px',
    'box-shadow:0 1px 6px rgba(0,0,0,0.07)',
    'overflow:hidden',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    'font-size:13px',
    'box-sizing:border-box',
  ].join('!important;') + '!important';

  // Left score block
  const left = document.createElement('div');
  left.style.cssText = [
    'flex-shrink:0',
    'text-align:center',
    'padding:16px 18px',
    'display:flex',
    'flex-direction:column',
    'align-items:center',
    'justify-content:center',
    'gap:6px',
    'min-width:82px',
    `background:rgba(${hexToRgb(color)},0.06)`,
    `border-right:1px solid rgba(${hexToRgb(color)},0.15)`,
  ].join('!important;') + '!important';

  const numEl = document.createElement('div');
  numEl.style.cssText = `font-size:34px!important;font-weight:900!important;line-height:1!important;color:${color}!important;letter-spacing:-1px!important;`;
  numEl.textContent = score;

  const pillEl = document.createElement('div');
  pillEl.style.cssText = `display:inline-block!important;background:${color}!important;color:#fff!important;font-size:9px!important;font-weight:800!important;letter-spacing:0.8px!important;text-transform:uppercase!important;border-radius:4px!important;padding:2px 7px!important;`;
  pillEl.textContent = grade;

  left.appendChild(numEl);
  left.appendChild(pillEl);
  panel.appendChild(left);

  // Right content block
  const right = document.createElement('div');
  right.style.cssText = 'flex:1!important;padding:14px 16px!important;min-width:0!important;';

  // Header
  const headerRow = document.createElement('div');
  headerRow.style.cssText = 'display:flex!important;align-items:center!important;gap:8px!important;margin-bottom:10px!important;';

  const logoSpan = document.createElement('span');
  logoSpan.style.cssText = 'font-size:13px!important;';
  logoSpan.textContent = '⚡';

  const titleSpan = document.createElement('span');
  titleSpan.style.cssText = 'font-size:11px!important;font-weight:700!important;color:#8080a0!important;letter-spacing:0.5px!important;text-transform:uppercase!important;';
  titleSpan.textContent = 'Bid Intel';

  headerRow.appendChild(logoSpan);
  headerRow.appendChild(titleSpan);
  right.appendChild(headerRow);

  // Verdict sentence
  const verdEl = document.createElement('div');
  verdEl.style.cssText = `font-size:14px!important;font-weight:600!important;color:#1a1a2e!important;margin-bottom:10px!important;line-height:1.4!important;`;
  verdEl.textContent = verdictText(score);
  right.appendChild(verdEl);

  // Signal chips
  if (green.length || flags.length) {
    const chipsWrap = document.createElement('div');
    chipsWrap.style.cssText = 'display:flex!important;flex-wrap:wrap!important;gap:5px!important;margin-bottom:10px!important;';

    green.forEach(g => {
      const chip = document.createElement('span');
      chip.style.cssText = 'display:inline-flex!important;align-items:center!important;gap:4px!important;background:#f0fdf4!important;color:#166534!important;border:1px solid #bbf7d0!important;border-radius:5px!important;padding:3px 8px!important;font-size:11px!important;font-weight:500!important;white-space:nowrap!important;';
      chip.textContent = '✓ ' + g;
      chipsWrap.appendChild(chip);
    });

    flags.forEach(f => {
      const chip = document.createElement('span');
      chip.style.cssText = 'display:inline-flex!important;align-items:center!important;gap:4px!important;background:#fffbeb!important;color:#92400e!important;border:1px solid #fde68a!important;border-radius:5px!important;padding:3px 8px!important;font-size:11px!important;font-weight:500!important;white-space:nowrap!important;';
      chip.textContent = '! ' + f;
      chipsWrap.appendChild(chip);
    });

    right.appendChild(chipsWrap);
  }

  // Footer
  const footEl = document.createElement('div');
  footEl.style.cssText = 'font-size:10px!important;color:#a0a0b8!important;';
  footEl.textContent = 'All local · No account · Scores update as you browse';
  right.appendChild(footEl);

  panel.appendChild(right);
  return panel;
}

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return r+','+g+','+b;
}


// ─── Card processing (search results) ────────────────────────────────────────
// Track processed jobs by their URL — survives React DOM re-renders
const processedJobUrls = new Set();

function processCards() {
  // Upwork split-pane: left = job list, right = preview/detail
  // Restrict to the LEFT pane only by finding the job list container
  const listPane = document.querySelector([
    '[data-test="job-search-results"]',
    '[data-test="find-work-list"]',
    '[class*="SearchResults"]',
    '[class*="search-results"]',
    '[class*="FindWork"]',
    '[class*="find-work"]',
    '[class*="BestMatches"]',
    '[class*="JobFeed"]',
    'main [role="list"]',
    'main',
  ].join(',')) || document.body;

  // Find job cards — only within the list pane
  // Selectors cover: search results, Best Matches, My Feed, Contract pages
  const SELECTORS = [
    '[data-test="job-tile"]',
    '[data-test="UpCGrid-col"] article',
    '[class*="JobTile"]:not([class*="Preview"]):not([class*="Detail"])',
    '[class*="job-tile"]:not([class*="preview"])',
    '[class*="BestMatch"]',
    '[class*="best-match"]',
    '[class*="feed-job"]',
    'article[data-ev-label]',
  ];

  let rawCards = [];
  for (const sel of SELECTORS) {
    const found = listPane.querySelectorAll(sel);
    if (found.length) { rawCards = Array.from(found); break; }
  }

  // Broad fallback: any article or li that contains a job link
  if (!rawCards.length) {
    const candidates = Array.from(listPane.querySelectorAll('article, li, section'));
    rawCards = candidates.filter(el =>
      el.querySelector('a[href*="/jobs/"], a[href*="job_uid"]') &&
      el.textContent.length > 100
    );
  }

  // Remove descendants — keep only the outermost card element
  const cards = rawCards.filter(c => !rawCards.some(o => o !== c && o.contains(c)));

  cards.forEach(card => {
    // Get the job URL as a stable unique key
    const link = card.querySelector('a[href*="/jobs/"]') || card.querySelector('a[href*="job_uid"]');
    const jobKey = link ? (link.href || link.getAttribute('href') || '') : '';

    // Use URL-based dedup — survives React re-renders that wipe DOM attributes
    if (jobKey && processedJobUrls.has(jobKey)) return;
    // Also check DOM attribute as secondary guard
    if (card.dataset.ubiDone) return;

    // Mark immediately
    if (jobKey) processedJobUrls.add(jobKey);
    card.dataset.ubiDone = '1';

    const text = card.textContent || '';
    const data = extractFromText(text);
    const result = scoreJob(data);
    const badge = renderCompact(result);

    const wrapper = document.createElement('div');
    wrapper.dataset.ubiBadge = '1';
    wrapper.style.cssText = 'margin:4px 0 2px!important;line-height:1!important;display:block!important;';
    wrapper.appendChild(badge);

    // Insert badge after the job title row
    // Works for both search results (h2) and Best Matches / My Feed (h3, strong, etc.)
    const titleEl = card.querySelector('h2, h3, [class*="title"] a, [class*="JobTitle"]');
    if (titleEl) {
      // Walk up to find the direct child of card containing the title
      let titleRow = titleEl;
      while (titleRow.parentElement && titleRow.parentElement !== card) {
        titleRow = titleRow.parentElement;
      }
      // Guard: don't insert if a badge already exists after this row
      if (!titleRow.nextSibling?.dataset?.ubiBadge) {
        card.insertBefore(wrapper, titleRow.nextSibling);
      }
    } else {
      // No title — put badge at the top of the card
      if (!card.firstChild?.dataset?.ubiBadge) {
        card.insertBefore(wrapper, card.firstChild);
      }
    }
  });
}
// ─── Detail page ──────────────────────────────────────────────────────────────
function processDetailPage() {
  const JOB_DETAIL_RE = /(?:\/jobs\/|\/details\/)~([0-9a-f]+)/i;
  const urlMatch = location.href.match(JOB_DETAIL_RE);
  if (!urlMatch) return;
  if (document.querySelector('[data-ubi-panel]')) return;

  const jobUid = urlMatch[1]; // e.g. "022075..."

  // ── Strategy 1: find the matching background card by job URL ──
  // This guarantees the slider scores IDENTICALLY to the list badge.
  // The card's link href contains the same UID.
  const matchingCard = Array.from(
    document.querySelectorAll('a[href*="/jobs/"], a[href*="/details/"]')
  ).find(a => (a.href || a.getAttribute('href') || '').includes(jobUid))
   ?.closest('[data-ubi-done], article, li, section');

  let text = '';

  if (matchingCard) {
    // Use exact same text the badge used
    text = matchingCard.textContent || '';
  } else {
    // ── Strategy 2: find the slider pane and scope to it only ──
    // Try selectors that match ONLY the slider/modal content,
    // not the background list.
    const SLIDER_SELECTORS = [
      '[role="dialog"]',
      '[role="complementary"]',
      '[class*="slider"][class*="panel" i]',
      '[class*="SliderPanel"]',
      '[class*="ModalSlider"]',
      '[class*="JobDetails"][class*="modal" i]',
      '[class*="job-details"][class*="panel" i]',
    ];
    const sliderEl = document.querySelector(SLIDER_SELECTORS.join(','));

    if (sliderEl) {
      text = sliderEl.textContent || '';
    } else {
      // ── Strategy 3: reconstruct from visible slider h1 area ──
      // Find the h1 title and take a generous slice of surrounding text
      const h1 = document.querySelector('h1');
      if (h1) {
        // Walk up 3 levels to get the panel wrapper
        let el = h1;
        for (let i = 0; i < 4 && el.parentElement; i++) el = el.parentElement;
        text = el.textContent || '';
      } else {
        text = document.body.textContent || '';
      }
    }
  }

  const data = extractFromText(text);
  const result = scoreJob(data);
  const panel = renderPanel(result);
  panel.setAttribute('data-ubi-panel', '1');

  // Insert after h1 in the slider/modal
  const h1 = document.querySelector(
    '[role="dialog"] h1, [role="complementary"] h1, main h1, h1'
  );
  if (h1 && h1.parentNode) {
    h1.parentNode.insertBefore(panel, h1.nextSibling);
  } else {
    const main = document.querySelector('main, [role="main"]');
    if (main) main.prepend(panel);
    else document.body.prepend(panel);
  }
}

// ─── Route detection ──────────────────────────────────────────────────────────
function onRouteChange() {
  const url = location.href;
  // Detect any job detail view — full page or slider panel
  const isDetail = /(?:\/jobs\/|\/details\/)~[0-9a-f]+/i.test(url);
  if (isDetail) {
    setTimeout(processDetailPage, 900);
    // Also keep scoring the list cards underneath the slider
    setTimeout(processCards, 700);
  } else {
    setTimeout(processCards, 700);
  }
}

// ─── MutationObserver (SPA) ───────────────────────────────────────────────────
let lastUrl = location.href;
let throttleTimer = null;

new MutationObserver(() => {
  // Route change
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    // Clear both DOM flags and URL set so new page is scored fresh
    document.querySelectorAll('[data-ubi-done]').forEach(el => delete el.dataset.ubiDone);
    processedJobUrls.clear();
    onRouteChange();
    return;
  }
  // Throttle card processing (new cards injected by Upwork's infinite scroll)
  clearTimeout(throttleTimer);
  throttleTimer = setTimeout(processCards, 400);
}).observe(document.body, { childList: true, subtree: true });

// Initial run
onRouteChange();

// Popup message
chrome.runtime.onMessage.addListener((msg, _, sendResponse) => {
  if (msg.type === 'GET_PAGE_DATA') {
    const isDetail = !!location.href.match(/\/jobs\/.*~[0-9a-f]+/i);
    // On detail pages: read body. On search pages: read only first job card for popup score.
    let scopeEl = document.body;
    if (!isDetail) {
      scopeEl = document.querySelector(
        '[data-test="job-tile"], [class*="JobTile"], [class*="job-tile"], article[class*="job"]'
      ) || document.body;
    }
    const data = extractFromText(scopeEl.textContent);
    const result = scoreJob(data);
    sendResponse({ result, isDetail, multiCard: !isDetail, cardCount: document.querySelectorAll('[data-ubi-done]').length });
  }
  return true;
});
