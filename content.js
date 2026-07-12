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

  // Colour map for background tint
  const bgMap = {
    '#22c55e': 'rgba(34,197,94,0.12)',
    '#84cc16': 'rgba(132,204,22,0.12)',
    '#f59e0b': 'rgba(245,158,11,0.12)',
    '#ef4444': 'rgba(239,68,68,0.12)',
    '#7f1d1d': 'rgba(127,29,29,0.15)',
  };
  const bg = bgMap[color] || 'rgba(124,106,247,0.12)';

  const badge = document.createElement('span');
  badge.className = 'ubi-badge';
  badge.setAttribute('data-ubi', '1');
  badge.style.cssText = [
    'display:inline-flex',
    'align-items:center',
    'gap:5px',
    `background:${bg}`,
    `border:1.5px solid ${color}`,
    'border-radius:6px',
    'padding:3px 9px',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    'font-size:12px',
    'font-weight:700',
    `color:${color}`,
    'cursor:pointer',
    'user-select:none',
    'white-space:nowrap',
    'position:relative',
    'vertical-align:middle',
    'line-height:1.4',
    'text-decoration:none',
    'box-sizing:border-box',
    'margin:4px 0',
  ].join('!important;') + '!important';

  // Dot
  const dot = document.createElement('span');
  dot.style.cssText = [
    'display:inline-block',
    'width:7px', 'height:7px',
    'border-radius:50%',
    `background:${color}`,
    'flex-shrink:0',
  ].join('!important;') + '!important';

  // Label
  const lbl = document.createElement('span');
  lbl.style.cssText = `font-size:12px!important;font-weight:700!important;color:${color}!important;font-family:inherit!important`;
  lbl.textContent = score + ' · ' + grade;

  badge.appendChild(dot);
  badge.appendChild(lbl);

  // ── Tooltip (appended to body, not inside card) ──
  function showTooltip() {
    removeTooltip();
    const rect = badge.getBoundingClientRect();

    const tip = document.createElement('div');
    activeTooltip = tip;

    // Outer shell
    tip.style.cssText = [
      'position:fixed',
      `top:${rect.bottom + window.scrollY + 6}px`,
      `left:${Math.max(8, rect.left + window.scrollX)}px`,
      'z-index:2147483647',
      'width:280px',
      'background:#1a1a24',
      'border:1px solid #3a3a4e',
      'border-radius:10px',
      'box-shadow:0 8px 32px rgba(0,0,0,0.55)',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
      'font-size:12px',
      'color:#e8e8f0',
      'overflow:hidden',
      'pointer-events:none',
    ].join('!important;') + '!important';

    // Header row: big score + grade + verdict
    const hdr = document.createElement('div');
    hdr.style.cssText = 'display:flex!important;align-items:center!important;gap:12px!important;padding:12px 14px!important;border-bottom:1px solid #2e2e3e!important;';

    const scoreEl = document.createElement('div');
    scoreEl.style.cssText = `font-size:30px!important;font-weight:900!important;line-height:1!important;color:${color}!important;flex-shrink:0!important;width:46px!important;text-align:center!important;`;
    scoreEl.textContent = score;

    const meta = document.createElement('div');
    meta.style.cssText = 'flex:1!important;min-width:0!important;';

    const gradePill = document.createElement('div');
    gradePill.style.cssText = `display:inline-block!important;background:${color}!important;color:#fff!important;font-size:10px!important;font-weight:700!important;letter-spacing:0.6px!important;text-transform:uppercase!important;border-radius:4px!important;padding:2px 7px!important;margin-bottom:4px!important;`;
    gradePill.textContent = grade;

    const verd = document.createElement('div');
    verd.style.cssText = 'font-size:12px!important;color:#c0c0d8!important;line-height:1.4!important;';
    verd.textContent = verdictText(score);

    meta.appendChild(gradePill);
    meta.appendChild(verd);
    hdr.appendChild(scoreEl);
    hdr.appendChild(meta);
    tip.appendChild(hdr);

    // Signals list
    if (green.length || flags.length) {
      const sig = document.createElement('div');
      sig.style.cssText = 'padding:8px 14px 10px!important;display:flex!important;flex-direction:column!important;gap:5px!important;';

      green.forEach(g => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex!important;align-items:flex-start!important;gap:7px!important;font-size:11px!important;color:#6ee7b7!important;line-height:1.4!important;';
        row.innerHTML = '<span style="flex-shrink:0;font-size:12px">✓</span><span>' + g + '</span>';
        sig.appendChild(row);
      });

      flags.forEach(f => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex!important;align-items:flex-start!important;gap:7px!important;font-size:11px!important;color:#fcd34d!important;line-height:1.4!important;';
        row.innerHTML = '<span style="flex-shrink:0;font-size:12px">!</span><span>' + f + '</span>';
        sig.appendChild(row);
      });

      tip.appendChild(sig);
    }

    // Footer
    const foot = document.createElement('div');
    foot.style.cssText = 'background:#111118!important;padding:5px 14px!important;font-size:10px!important;color:#5a5a72!important;border-top:1px solid #2e2e3e!important;';
    foot.textContent = '⚡ Upwork Bid Intel · No account · All local';
    tip.appendChild(foot);

    document.body.appendChild(tip);

    // Keep tooltip in viewport
    requestAnimationFrame(() => {
      const tr = tip.getBoundingClientRect();
      if (tr.right > window.innerWidth - 8) {
        tip.style.left = Math.max(8, window.innerWidth - tr.width - 8) + 'px';
      }
      if (tr.bottom > window.innerHeight - 8) {
        tip.style.top = (rect.top + window.scrollY - tr.height - 6) + 'px';
      }
    });
  }

  badge.addEventListener('mouseenter', showTooltip);
  badge.addEventListener('mouseleave', removeTooltip);
  badge.addEventListener('focusin', showTooltip);
  badge.addEventListener('focusout', removeTooltip);

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
function processCards() {
  // Priority-fallback selector prevents ancestor+descendant double-badge.
  // Use the most specific match first; fall back progressively.
  let cards = document.querySelectorAll('[data-test="job-tile"]');
  if (!cards.length) cards = document.querySelectorAll('[class*="JobTile"]');
  if (!cards.length) cards = document.querySelectorAll('[class*="job-tile"]');
  if (!cards.length) cards = document.querySelectorAll('article[class*="job"], section[class*="job"]');

  cards.forEach(card => {
    // Skip if this element OR any ancestor is already scored
    if (card.dataset.ubiDone || card.closest('[data-ubi-done]')) return;
    // Mark this card AND all its descendants immediately to block races
    card.dataset.ubiDone = '1';
    card.setAttribute('data-ubi-done', '1');
    card.querySelectorAll('*').forEach(el => el.dataset.ubiDone = '1');

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
