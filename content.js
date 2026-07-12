/**
 * Upwork Bid Intel — Content Script
 * Analyses every job card and job detail page on Upwork.
 * Injects a score badge directly into the UI. No account needed.
 */

// ─── Scoring engine ───────────────────────────────────────────────────────────

function scoreJob(data) {
  let score = 100;
  const flags = [];
  const green = [];

  // ── CLIENT SIGNALS ──
  if (data.clientRating !== null) {
    if (data.clientRating >= 4.7) green.push('Top-rated client ⭐');
    else if (data.clientRating < 3.5) { score -= 25; flags.push('Low client rating (' + data.clientRating + ')'); }
    else if (data.clientRating < 4.0) { score -= 10; flags.push('Below-avg client rating'); }
  } else {
    score -= 20;
    flags.push('No client rating — never hired on Upwork');
  }

  if (data.clientHires !== null) {
    if (data.clientHires === 0) { score -= 15; flags.push('Client has 0 hires'); }
    else if (data.clientHires >= 10) green.push(data.clientHires + ' hires on Upwork');
    else if (data.clientHires >= 3) green.push(data.clientHires + ' hires');
  }

  if (data.clientSpend !== null) {
    if (data.clientSpend >= 10000) green.push('$' + (data.clientSpend/1000).toFixed(0) + 'k+ spent');
    else if (data.clientSpend >= 1000) green.push('$' + (data.clientSpend/1000).toFixed(1) + 'k spent');
    else if (data.clientSpend < 100) { score -= 10; flags.push('Client spent <$100 total'); }
  }

  if (data.paymentVerified === false) { score -= 15; flags.push('Payment NOT verified ⚠️'); }
  else if (data.paymentVerified === true) green.push('Payment verified ✓');

  // ── JOB AGE ──
  if (data.daysPosted !== null) {
    if (data.daysPosted > 30) { score -= 25; flags.push('Posted ' + data.daysPosted + ' days ago — likely stale'); }
    else if (data.daysPosted > 14) { score -= 10; flags.push('Posted ' + data.daysPosted + ' days ago'); }
    else if (data.daysPosted <= 2) green.push('Fresh listing — ' + data.daysPosted + 'd ago');
    else green.push('Posted ' + data.daysPosted + 'd ago');
  }

  // ── PROPOSALS (competition) ──
  if (data.proposals !== null) {
    if (data.proposals >= 50) { score -= 20; flags.push('50+ proposals — very crowded'); }
    else if (data.proposals >= 20) { score -= 8; flags.push(data.proposals + ' proposals — competitive'); }
    else if (data.proposals <= 5) green.push('Only ' + data.proposals + ' proposals — low competition');
    else green.push(data.proposals + ' proposals');
  }

  // ── BUDGET SANITY ──
  if (data.budgetHourly !== null) {
    if (data.budgetHourly < 10) { score -= 25; flags.push('Rate under $10/hr — race to bottom'); }
    else if (data.budgetHourly < 20) { score -= 10; flags.push('Low rate: $' + data.budgetHourly + '/hr'); }
    else if (data.budgetHourly >= 50) green.push('Good rate: $' + data.budgetHourly + '/hr');
    else green.push('$' + data.budgetHourly + '/hr rate');
  }

  if (data.budgetFixed !== null) {
    if (data.budgetFixed < 50) { score -= 20; flags.push('Fixed budget under $50'); }
    else if (data.budgetFixed < 200) { score -= 5; flags.push('Low fixed budget: $' + data.budgetFixed); }
    else if (data.budgetFixed >= 500) green.push('Solid budget: $' + data.budgetFixed);
  }

  // ── DESCRIPTION QUALITY ──
  if (data.descriptionLength !== null) {
    if (data.descriptionLength < 100) { score -= 20; flags.push('Vague description — low effort client'); }
    else if (data.descriptionLength >= 500) green.push('Detailed description (' + data.descriptionLength + ' chars)');
  }

  if (data.hasAttachments) green.push('Has attachments / files');

  // ── INTERVIEW RATE ──
  if (data.interviewRate !== null) {
    if (data.interviewRate >= 80) green.push('High interview rate: ' + data.interviewRate + '%');
    else if (data.interviewRate < 20) { score -= 10; flags.push('Low interview rate: ' + data.interviewRate + '%'); }
  }

  // ── HIRE RATE ──
  if (data.hireRate !== null) {
    if (data.hireRate >= 70) green.push('Client hires ' + data.hireRate + '% of proposals');
    else if (data.hireRate < 20) { score -= 10; flags.push('Low hire rate: ' + data.hireRate + '%'); }
  }

  score = Math.max(0, Math.min(100, score));

  let grade, color, emoji;
  if (score >= 80)      { grade = 'Excellent'; color = '#22c55e'; emoji = '🟢'; }
  else if (score >= 65) { grade = 'Good';      color = '#86efac'; emoji = '🟡'; }
  else if (score >= 45) { grade = 'Risky';     color = '#fbbf24'; emoji = '🟠'; }
  else if (score >= 25) { grade = 'Poor';      color = '#f87171'; emoji = '🔴'; }
  else                  { grade = 'Skip';      color = '#991b1b'; emoji = '💀'; }

  return { score, grade, color, emoji, flags, green };
}

// ─── Data extraction helpers ──────────────────────────────────────────────────

function getNum(el, selector, attr) {
  const node = el ? el.querySelector(selector) : document.querySelector(selector);
  if (!node) return null;
  const text = attr ? node.getAttribute(attr) : node.textContent;
  if (!text) return null;
  const n = parseFloat(text.replace(/[^0-9.]/g, ''));
  return isNaN(n) ? null : n;
}

function getText(el, selector) {
  const node = el ? el.querySelector(selector) : document.querySelector(selector);
  return node ? node.textContent.trim() : null;
}

function extractJobData(container) {
  const fullText = container ? container.textContent : document.body.textContent;

  // Client rating
  let clientRating = null;
  const ratingMatch = fullText.match(/(\d+\.\d+)\s*(out of|\/)\s*5/i) ||
                      fullText.match(/client rating[:\s]*(\d+\.\d+)/i);
  if (ratingMatch) clientRating = parseFloat(ratingMatch[1]);

  // Rating from stars element
  const ratingEl = container?.querySelector('[data-test="rating"],.rating-value,[class*="rating"]');
  if (ratingEl && !clientRating) {
    const r = parseFloat(ratingEl.textContent.replace(/[^0-9.]/g, ''));
    if (!isNaN(r) && r <= 5) clientRating = r;
  }

  // Hires
  let clientHires = null;
  const hiresMatch = fullText.match(/(\d+)\s*(job|hire)s?\s*(posted|completed|hired)/i) ||
                     fullText.match(/total\s*(jobs|hires)[:\s]*(\d+)/i) ||
                     fullText.match(/(\d+)\s*hires/i);
  if (hiresMatch) clientHires = parseInt(hiresMatch[1] || hiresMatch[2]);

  // Spend
  let clientSpend = null;
  const spendMatch = fullText.match(/\$([0-9,]+)k?\s*(total\s*)?spent/i) ||
                     fullText.match(/total\s*spent[:\s]*\$([0-9,.]+)/i);
  if (spendMatch) {
    let v = parseFloat(spendMatch[1].replace(/,/g,''));
    if (fullText.includes('k')) v *= 1000;
    clientSpend = v;
  }

  // Payment verified
  const paymentVerified = fullText.includes('Payment verified') || fullText.includes('payment-verified');

  // Days posted
  let daysPosted = null;
  const daysMatch = fullText.match(/(\d+)\s*days?\s*ago/i);
  const hoursMatch = fullText.match(/(\d+)\s*hours?\s*ago/i);
  const weeksMatch = fullText.match(/(\d+)\s*weeks?\s*ago/i);
  const monthsMatch = fullText.match(/(\d+)\s*months?\s*ago/i);
  if (hoursMatch) daysPosted = 0;
  else if (daysMatch) daysPosted = parseInt(daysMatch[1]);
  else if (weeksMatch) daysPosted = parseInt(weeksMatch[1]) * 7;
  else if (monthsMatch) daysPosted = parseInt(monthsMatch[1]) * 30;

  // Proposals
  let proposals = null;
  const propMatch = fullText.match(/(\d+)\s*(to\s*\d+\s*)?proposal/i);
  if (propMatch) proposals = parseInt(propMatch[1]);
  const propRangeMatch = fullText.match(/(\d+)\s*[-–]\s*(\d+)\s*proposal/i);
  if (propRangeMatch) proposals = Math.round((parseInt(propRangeMatch[1]) + parseInt(propRangeMatch[2])) / 2);

  // Budget hourly
  let budgetHourly = null;
  const hourlyMatch = fullText.match(/\$(\d+(?:\.\d+)?)\s*[-–\/]\s*\$(\d+(?:\.\d+)?)\s*\/?hr/i) ||
                      fullText.match(/\$(\d+(?:\.\d+)?)\s*\/\s*hr/i);
  if (hourlyMatch) {
    if (hourlyMatch[2]) budgetHourly = (parseFloat(hourlyMatch[1]) + parseFloat(hourlyMatch[2])) / 2;
    else budgetHourly = parseFloat(hourlyMatch[1]);
  }

  // Budget fixed
  let budgetFixed = null;
  const fixedMatch = fullText.match(/fixed[^$]*\$([0-9,]+)/i) ||
                     fullText.match(/budget[:\s]*\$([0-9,]+)/i);
  if (fixedMatch && !budgetHourly) budgetFixed = parseFloat(fixedMatch[1].replace(/,/g,''));

  // Description length
  const descEl = container?.querySelector('[class*="description"],[class*="desc"],article') ||
                 document.querySelector('[class*="job-description"],[class*="description"]');
  const descriptionLength = descEl ? descEl.textContent.trim().length : fullText.length > 200 ? fullText.trim().length : null;

  const hasAttachments = fullText.includes('attachment') || fullText.includes('Attachment');

  // Interview rate
  let interviewRate = null;
  const intMatch = fullText.match(/(\d+)%?\s*interview/i);
  if (intMatch) interviewRate = parseInt(intMatch[1]);

  // Hire rate
  let hireRate = null;
  const hireMatch = fullText.match(/(\d+)%?\s*hire\s*rate/i);
  if (hireMatch) hireRate = parseInt(hireMatch[1]);

  return {
    clientRating, clientHires, clientSpend, paymentVerified,
    daysPosted, proposals, budgetHourly, budgetFixed,
    descriptionLength, hasAttachments, interviewRate, hireRate
  };
}

// ─── Badge injection ──────────────────────────────────────────────────────────

const BADGE_CLASS = 'ubi-badge';
const injected = new WeakSet();

function createBadge(result, compact = false) {
  const { score, grade, color, emoji, flags, green } = result;

  if (compact) {
    const badge = document.createElement('div');
    badge.className = BADGE_CLASS + ' ubi-compact';
    badge.setAttribute('title', `Bid Intel: ${grade} (${score}/100)\n\n✅ ${green.join('\n✅ ')}${flags.length ? '\n\n⚠️ ' + flags.join('\n⚠️ ') : ''}`);
    badge.innerHTML = `<span class="ubi-score-dot" style="background:${color}"></span><span class="ubi-score-num">${score}</span><span class="ubi-grade-text">${grade}</span>`;
    return badge;
  }

  const panel = document.createElement('div');
  panel.className = BADGE_CLASS + ' ubi-panel';
  panel.innerHTML = `
    <div class="ubi-header">
      <span class="ubi-logo">⚡</span>
      <span class="ubi-title">Bid Intel</span>
      <div class="ubi-score-ring" style="--score-color:${color}">
        <span class="ubi-score-big">${score}</span>
        <span class="ubi-score-label">${emoji} ${grade}</span>
      </div>
    </div>
    ${green.length ? `<div class="ubi-greens">${green.map(g=>`<div class="ubi-green-item">✅ ${g}</div>`).join('')}</div>` : ''}
    ${flags.length ? `<div class="ubi-flags">${flags.map(f=>`<div class="ubi-flag-item">⚠️ ${f}</div>`).join('')}</div>` : ''}
    <div class="ubi-footer">No account needed · All local · <a href="#" class="ubi-link">How scores work</a></div>
  `;

  panel.querySelector('.ubi-link')?.addEventListener('click', e => {
    e.preventDefault();
    alert('Upwork Bid Intel scores jobs on:\n\n• Client rating & hire history\n• Payment verification\n• Job age (staleness)\n• Proposal count (competition)\n• Budget vs market rate\n• Description quality\n• Client hire rate\n\nScore 80+: Apply with confidence\nScore 60-79: Apply with caution\nScore 40-59: Risky — check carefully\nScore <40: Not worth your connects');
  });

  return panel;
}

// ─── Job detail page ──────────────────────────────────────────────────────────

function processDetailPage() {
  // Don't double-inject
  if (document.querySelector('.ubi-panel')) return;

  const data = extractJobData(null);
  const result = scoreJob(data);

  // Find the best insertion point
  const insertAfter = document.querySelector(
    '[data-test="job-details-header"],' +
    '[class*="job-title"],' +
    'h1[class*="title"],' +
    '[class*="JobDetailHeader"],' +
    '.up-card-section'
  );

  const panel = createBadge(result, false);

  if (insertAfter) {
    insertAfter.parentNode.insertBefore(panel, insertAfter.nextSibling);
  } else {
    const main = document.querySelector('main,[role="main"]');
    if (main) main.prepend(panel);
  }
}

// ─── Job card list (search results) ──────────────────────────────────────────

function processJobCards() {
  const cards = document.querySelectorAll(
    '[data-test="job-tile"],[class*="job-tile"],[class*="JobTile"],' +
    'section[class*="job"],.up-card-section[data-job-uid],' +
    'article[class*="job"]'
  );

  cards.forEach(card => {
    if (injected.has(card)) return;
    if (card.querySelector('.' + BADGE_CLASS)) return;

    injected.add(card);
    const data = extractJobData(card);
    const result = scoreJob(data);

    // Find title area to insert after
    const titleEl = card.querySelector('h2,h3,[class*="title"],[class*="heading"]');
    const compact = createBadge(result, true);

    if (titleEl) {
      titleEl.parentNode.insertBefore(compact, titleEl.nextSibling);
    } else {
      card.prepend(compact);
    }
  });
}

// ─── Observer for SPA navigation ─────────────────────────────────────────────

function detectPage() {
  const url = window.location.href;
  if (url.includes('/jobs/') && url.match(/~[a-z0-9]+/)) {
    // Detail page
    setTimeout(processDetailPage, 800);
  } else if (url.includes('/nx/jobs/') || url.includes('/search/jobs') || url.includes('/freelancers')) {
    // Search results
    setTimeout(processJobCards, 600);
  } else {
    // Any page — try cards
    setTimeout(processJobCards, 600);
  }
}

// Watch for SPA route changes
let lastUrl = location.href;
const observer = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    detectPage();
  }
  // Also pick up cards injected dynamically
  processJobCards();
});

observer.observe(document.body, { childList: true, subtree: true });

// Initial run
detectPage();

// Message from popup
chrome.runtime.onMessage.addListener((msg, _, sendResponse) => {
  if (msg.type === 'GET_PAGE_DATA') {
    const url = window.location.href;
    const isDetail = url.includes('/jobs/') && url.match(/~[a-z0-9]+/);
    const data = extractJobData(null);
    const result = scoreJob(data);
    sendResponse({ url, isDetail, data, result });
  }
  return true;
});
