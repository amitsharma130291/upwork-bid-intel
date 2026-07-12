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
  const paymentVerified = /payment\s+verified/i.test(text) && !/payment\s+un/i.test(text);

  // ── JOB AGE ──
  // "Posted 2 weeks ago · Proposals: 5 to 10"
  // "Posted 2 months ago"
  // "Posted 3 days ago"
  let daysPosted = null;
  const hoursM  = text.match(/posted\s+(\d+)\s+hours?\s+ago/i);
  const daysM   = text.match(/posted\s+(\d+)\s+days?\s+ago/i);
  const weeksM  = text.match(/posted\s+(\d+)\s+weeks?\s+ago/i);
  const monthsM = text.match(/posted\s+(\d+)\s+months?\s+ago/i);
  if      (hoursM)  daysPosted = 0;
  else if (daysM)   daysPosted = parseInt(daysM[1]);
  else if (weeksM)  daysPosted = parseInt(weeksM[1]) * 7;
  else if (monthsM) daysPosted = parseInt(monthsM[1]) * 30;

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
  const spentM = text.match(/\$([0-9,.]+)(k\+?)?\s+spent/i);
  if (spentM) {
    let v = parseFloat(spentM[1].replace(/,/g,''));
    if (spentM[2] && spentM[2].toLowerCase().includes('k')) v *= 1000;
    clientSpend = v;
  }

  // ── CLIENT RATING ──
  // Upwork shows numeric rating like "4.9" near stars, or just "0" for no rating
  let clientRating = null;
  const ratingM = text.match(/\b([4-5]\.\d)\b/);  // 4.x or 5.x — likely a rating
  if (ratingM) clientRating = parseFloat(ratingM[1]);

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
function renderCompact(result) {
  const { score, grade, color } = result;
  const div = document.createElement('span');
  div.className = 'ubi-badge';
  div.setAttribute('data-ubi', '1');
  div.innerHTML =
    `<span class="ubi-dot" style="background:${color}"></span>` +
    `<span class="ubi-num">${score}</span>` +
    `<span class="ubi-lbl">${grade}</span>`;

  // Full tooltip on hover
  const ttLines = [];
  if (result.green.length) ttLines.push('✅ ' + result.green.join('\n✅ '));
  if (result.flags.length) ttLines.push('⚠️ ' + result.flags.join('\n⚠️ '));
  div.title = `Bid Intel: ${grade} (${score}/100)\n\n${ttLines.join('\n\n')}`;
  return div;
}

function renderPanel(result) {
  const { score, grade, color, emoji, flags, green } = result;
  const div = document.createElement('div');
  div.className = 'ubi-panel';
  div.setAttribute('data-ubi', '1');
  div.innerHTML = `
    <div class="ubi-ph">
      <span class="ubi-plogo">⚡</span>
      <span class="ubi-ptitle">Bid Intel</span>
      <div class="ubi-pring" style="border-color:${color}">
        <span class="ubi-pbig" style="color:${color}">${score}</span>
        <span class="ubi-psub">${emoji} ${grade}</span>
      </div>
    </div>
    ${green.length ? `<div class="ubi-pg">${green.map(g=>`<div class="ubi-gi">✅ ${g}</div>`).join('')}</div>` : ''}
    ${flags.length ? `<div class="ubi-pf">${flags.map(f=>`<div class="ubi-fi">⚠️ ${f}</div>`).join('')}</div>` : ''}
    <div class="ubi-pfoot">No account · All local · Upwork Bid Intel</div>
  `;
  return div;
}

// ─── Card processing (search results) ────────────────────────────────────────
function processCards() {
  // Upwork job cards — various selectors across Upwork's changing markup
  const cards = document.querySelectorAll([
    '[data-test="job-tile"]',
    '[class*="JobTile"]',
    '[class*="job-tile"]',
    'article[class*="job"]',
    'section[class*="job"]',
  ].join(','));

  cards.forEach(card => {
    // Skip if already scored
    if (card.dataset.ubiDone) return;
    card.dataset.ubiDone = '1';

    const text = card.textContent || '';
    const data = extractFromText(text);
    const result = scoreJob(data);
    const badge = renderCompact(result);

    // Insert after title
    const titleEl = card.querySelector('h2, h3, [class*="title"], [class*="heading"], a[href*="/jobs/"]');
    if (titleEl) {
      // Insert as inline element right after the title
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'margin:4px 0 6px;';
      wrapper.appendChild(badge);
      titleEl.parentNode.insertBefore(wrapper, titleEl.nextSibling);
    } else {
      card.prepend(badge);
    }
  });
}

// ─── Detail page ──────────────────────────────────────────────────────────────
function processDetailPage() {
  if (document.querySelector('.ubi-panel')) return;

  const text = document.body.textContent || '';
  const data = extractFromText(text);
  const result = scoreJob(data);
  const panel = renderPanel(result);

  // Try to insert after the job title / header
  const target = document.querySelector([
    '[data-test="job-details-header"]',
    'h1',
    '[class*="JobTitle"]',
    '[class*="job-title"]',
  ].join(','));

  if (target?.parentNode) {
    target.parentNode.insertBefore(panel, target.nextSibling);
  } else {
    const main = document.querySelector('main, [role="main"]');
    if (main) main.prepend(panel);
  }
}

// ─── Route detection ──────────────────────────────────────────────────────────
function onRouteChange() {
  const url = location.href;
  if (url.match(/\/jobs\/.*~[0-9a-f]+/i)) {
    setTimeout(processDetailPage, 900);
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
    // Clear done flags so new page is scored fresh
    document.querySelectorAll('[data-ubi-done]').forEach(el => delete el.dataset.ubiDone);
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
    const data = extractFromText(document.body.textContent);
    const result = scoreJob(data);
    sendResponse({ result, isDetail: !!location.href.match(/\/jobs\/.*~[0-9a-f]+/i) });
  }
  return true;
});
