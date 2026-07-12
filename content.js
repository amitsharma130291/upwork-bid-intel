/**
 * Upwork Bid Intel v2.0 — Simplified, reliable injection
 * Strategy: anchor on job title links (h2/h3 > a[href*="/jobs/"]) — the ONE
 * stable element on every Upwork page. No guessing at card class names.
 */

// ─── Scoring engine ───────────────────────────────────────────────────────────
function scoreJob(d) {
  let score = 100;
  const flags = [], green = [];

  // ── CLIENT RATING ──
  if (d.clientRating !== null && d.clientRating > 0) {
    if (d.clientRating >= 4.8)       green.push('Top-rated client (' + d.clientRating + '★)');
    else if (d.clientRating >= 4.5)  green.push('Good client rating (' + d.clientRating + ')');
    else if (d.clientRating >= 4.0)  { score -= 5;  flags.push('Average client rating: ' + d.clientRating); }
    else if (d.clientRating >= 3.5)  { score -= 15; flags.push('Below-avg client rating: ' + d.clientRating); }
    else                             { score -= 25; flags.push('Low client rating: ' + d.clientRating); }
  } else {
    score -= 15; flags.push('No client rating — new to Upwork');
  }

  // ── CLIENT SPEND (track record) ──
  if (d.clientSpend !== null) {
    if (d.clientSpend === 0)           { score -= 15; flags.push('$0 spent — brand new account'); }
    else if (d.clientSpend < 500)      { score -= 10; flags.push('Only $' + d.clientSpend + ' spent — very little history'); }
    else if (d.clientSpend < 1000)     { score -= 3;  flags.push('Limited spend: $' + d.clientSpend); }
    else if (d.clientSpend >= 50000)   green.push('$' + (d.clientSpend/1000).toFixed(0) + 'K+ spent — seasoned client 💪');
    else if (d.clientSpend >= 10000)   green.push('$' + (d.clientSpend/1000).toFixed(0) + 'K+ spent');
    else if (d.clientSpend >= 1000)    green.push('$' + (d.clientSpend/1000).toFixed(1) + 'K spent');
  }

  // ── CLIENT HIRES ──
  if (d.clientHires !== null) {
    if (d.clientHires === 0)      { score -= 10; flags.push('0 hires ever'); }
    else if (d.clientHires >= 10) green.push(d.clientHires + ' total hires');
    else if (d.clientHires >= 3)  green.push(d.clientHires + ' hires');
  }

  // ── PAYMENT VERIFICATION ──
  if (d.paymentVerified === false)     { score -= 20; flags.push('Payment NOT verified ⚠️'); }
  else if (d.paymentVerified === true) green.push('Payment verified ✓');

  // ── JOB AGE ──
  if (d.daysPosted !== null) {
    if (d.daysPosted > 60)      { score -= 30; flags.push('Posted ' + d.daysPosted + 'd ago — very stale'); }
    else if (d.daysPosted > 30) { score -= 20; flags.push('Posted ' + d.daysPosted + 'd ago — stale'); }
    else if (d.daysPosted > 14) { score -= 10; flags.push('Posted ' + d.daysPosted + 'd ago'); }
    else if (d.daysPosted > 3)  { /* 4–14 days: neutral, no flag */ }
    else if (d.daysPosted === 0) green.push('Posted today — very fresh 🔥');
    else                         green.push('Posted ' + d.daysPosted + 'd ago — fresh');
  }

  // ── PROPOSALS (competition) ──
  if (d.proposalsMid !== null) {
    if (d.proposalsMid >= 50)       { score -= 20; flags.push('50+ proposals — very crowded'); }
    else if (d.proposalsMid >= 30)  { score -= 12; flags.push('~' + d.proposalsMid + ' proposals — crowded'); }
    else if (d.proposalsMid >= 20)  { score -= 7;  flags.push('~' + d.proposalsMid + ' proposals — competitive'); }
    else if (d.proposalsMid >= 10)  { score -= 3;  flags.push('~' + d.proposalsMid + ' proposals'); }
    else if (d.proposalsMid <= 5)   green.push('Only ~' + d.proposalsMid + ' proposals 🎯');
    else                            green.push('~' + d.proposalsMid + ' proposals');
  }

  // ── HOURLY RATE ──
  if (d.hourlyMid !== null) {
    if (d.hourlyMid < 10)       { score -= 25; flags.push('$' + d.hourlyMid + '/hr — race to bottom'); }
    else if (d.hourlyMid < 20)  { score -= 15; flags.push('Low rate: ~$' + d.hourlyMid + '/hr'); }
    else if (d.hourlyMid < 30)  { score -= 5;  flags.push('Below-market: ~$' + d.hourlyMid + '/hr'); }
    else if (d.hourlyMid >= 60) green.push('Strong rate: ~$' + d.hourlyMid + '/hr 💰');
    else if (d.hourlyMid >= 40) green.push('Good rate: ~$' + d.hourlyMid + '/hr');
    else                        { /* $30–39: neutral */ }
  }

  // ── FIXED BUDGET ──
  if (d.fixedBudget !== null && d.hourlyMid === null) {
    if (d.fixedBudget < 50)         { score -= 25; flags.push('Budget <$50 — not worth it'); }
    else if (d.fixedBudget < 150)   { score -= 15; flags.push('Very low budget: $' + d.fixedBudget); }
    else if (d.fixedBudget < 300)   { score -= 8;  flags.push('Low budget: $' + d.fixedBudget); }
    else if (d.fixedBudget < 500)   { score -= 3;  flags.push('Modest budget: $' + d.fixedBudget); }
    else if (d.fixedBudget >= 2000) green.push('Strong budget: $' + d.fixedBudget + ' 💰');
    else if (d.fixedBudget >= 500)  green.push('Decent budget: $' + d.fixedBudget);
  }

  score = Math.max(0, Math.min(100, score));

  let grade, color;
  if (score >= 80)      { grade = 'Excellent'; color = '#16a34a'; }
  else if (score >= 65) { grade = 'Good';      color = '#65a30d'; }
  else if (score >= 45) { grade = 'Risky';     color = '#d97706'; }
  else if (score >= 25) { grade = 'Poor';      color = '#dc2626'; }
  else                  { grade = 'Skip';      color = '#7f1d1d'; }

  return { score, grade, color, flags, green };
}
function verdictText(score) {
  if (score >= 80) return 'Strong signals — apply with confidence.';
  if (score >= 65) return 'Looks decent — worth applying.';
  if (score >= 45) return 'Some red flags — check details first.';
  if (score >= 25) return 'Multiple warnings — probably skip.';
  return 'Too many red flags — save your connects.';
}

// ─── Data extraction ──────────────────────────────────────────────────────────
function extractFromText(text) {
  // Payment verified — negative lookahead so "unverified" doesn't match
  const paymentVerified = /payment\s+(?!un)verified/i.test(text) ? true
    : /payment\s+un/i.test(text) || /payment\s+not/i.test(text) ? false
    : null;

  // Job age
  let daysPosted = null;
  if (/posted\s+(just\s+now|today)/i.test(text) || /posted\s+\d+\s+(?:hours?|minutes?|mins?)\s+ago/i.test(text)) daysPosted = 0;
  else if (/posted\s+yesterday/i.test(text)) daysPosted = 1;
  else { const m = text.match(/posted\s+(\d+)\s+days?\s+ago/i); if (m) daysPosted = +m[1]; }
  if (daysPosted === null) { const m = text.match(/posted\s+(\d+)\s+weeks?\s+ago/i); if (m) daysPosted = +m[1]*7; }
  if (daysPosted === null) { const m = text.match(/posted\s+(\d+)\s+months?\s+ago/i); if (m) daysPosted = +m[1]*30; }

  // Proposals
  let proposalsMid = null;
  const pr = text.match(/proposals?[:\s]+(\d+)\s+to\s+(\d+)/i);
  const pl = text.match(/proposals?[:\s]+(?:less|fewer)\s+than\s+(\d+)/i);
  const pp = text.match(/proposals?[:\s]*50\+/i);
  const ps = text.match(/proposals?[:\s]+(\d+)/i);
  if (pp) proposalsMid = 50;
  else if (pr) proposalsMid = Math.round((+pr[1] + +pr[2]) / 2);
  else if (pl) proposalsMid = Math.round(+pl[1] / 2);
  else if (ps) proposalsMid = +ps[1];

  // Hourly rate
  let hourlyMid = null;
  const hr = text.match(/hourly[:\s$]*(\d+(?:\.\d+)?)\s*[-–]\s*\$?(\d+(?:\.\d+)?)/i);
  const hs = text.match(/hourly[:\s$]*(\d+(?:\.\d+)?)/i);
  if (hr) hourlyMid = Math.round((+hr[1] + +hr[2]) / 2);
  else if (hs) hourlyMid = +hs[1];

  // Fixed budget
  let fixedBudget = null;
  const fb = text.match(/(?:est\.?\s*budget|fixed)[:\s]*\$?([\d,]+)/i);
  if (fb && !hourlyMid) fixedBudget = parseFloat(fb[1].replace(/,/g,''));

  // Client spend
  let clientSpend = null;
  const sm = text.match(/\$([\d,.]+)(k\+?)?\s*\+?\s*spent/i);
  if (sm) {
    let v = parseFloat(sm[1].replace(/,/g,''));
    if (sm[2] && /k/i.test(sm[2])) v *= 1000;
    clientSpend = v;
  }

  // Client hires
  let clientHires = null;
  if (/no\s+hires/i.test(text)) clientHires = 0;
  else { const m = text.match(/(\d+)\s+hires/i); if (m) clientHires = +m[1]; }

  // Client rating (1.0–5.9)
  let clientRating = null;
  const rm = text.match(/(?:★|[⭐]|rating)[^\d]*([1-5]\.\d)/i) || text.match(/\b([4-5]\.\d)\b/);
  if (rm) clientRating = parseFloat(rm[1]);

  return { paymentVerified, daysPosted, proposalsMid, hourlyMid, fixedBudget, clientSpend, clientHires, clientRating };
}

// ─── Badge (compact, inline) ──────────────────────────────────────────────────
let activeTooltip = null;
let hideTimer = null;

function removeTooltip() {
  clearTimeout(hideTimer);
  if (activeTooltip) { activeTooltip.remove(); activeTooltip = null; }
}

function renderBadge(result) {
  const { score, grade, color, flags, green } = result;
  const bg = color + '18';

  const badge = document.createElement('span');
  badge.setAttribute('data-ubi-badge', '1');
  badge.style.cssText = `display:inline-flex!important;align-items:center!important;gap:5px!important;` +
    `background:${bg}!important;border:1.5px solid ${color}!important;border-radius:5px!important;` +
    `padding:2px 8px!important;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;` +
    `font-size:12px!important;font-weight:700!important;color:${color}!important;cursor:default!important;` +
    `user-select:none!important;white-space:nowrap!important;vertical-align:middle!important;line-height:1.5!important;` +
    `box-sizing:border-box!important;text-decoration:none!important;`;

  const dot = document.createElement('span');
  dot.style.cssText = `display:inline-block!important;width:7px!important;height:7px!important;` +
    `border-radius:50%!important;background:${color}!important;flex-shrink:0!important;`;

  const lbl = document.createElement('span');
  lbl.style.cssText = `font-size:12px!important;font-weight:700!important;color:${color}!important;`;
  lbl.textContent = score;

  badge.appendChild(dot);
  badge.appendChild(lbl);

  // ── Hover tooltip ──
  function showTip() {
    clearTimeout(hideTimer);
    removeTooltip();
    const rect = badge.getBoundingClientRect();
    const tip = document.createElement('div');
    activeTooltip = tip;
    tip.style.cssText = `position:fixed!important;z-index:2147483647!important;width:270px!important;` +
      `background:#1a1a24!important;border:1px solid #3a3a4e!important;border-radius:10px!important;` +
      `box-shadow:0 8px 32px rgba(0,0,0,0.55)!important;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;` +
      `font-size:12px!important;color:#e8e8f0!important;overflow:hidden!important;pointer-events:none!important;` +
      `top:-9999px!important;left:-9999px!important;`;

    // Header
    const hdr = document.createElement('div');
    hdr.style.cssText = 'display:flex!important;align-items:center!important;gap:12px!important;padding:12px 14px!important;border-bottom:1px solid #2e2e3e!important;';
    const sEl = document.createElement('div');
    sEl.style.cssText = `font-size:32px!important;font-weight:900!important;line-height:1!important;color:${color}!important;flex-shrink:0!important;width:48px!important;text-align:center!important;`;
    sEl.textContent = score;
    const meta = document.createElement('div');
    meta.style.cssText = 'flex:1!important;min-width:0!important;';
    const pill = document.createElement('div');
    pill.style.cssText = `display:inline-block!important;background:${color}!important;color:#fff!important;font-size:10px!important;font-weight:800!important;letter-spacing:0.6px!important;text-transform:uppercase!important;border-radius:4px!important;padding:2px 8px!important;margin-bottom:4px!important;`;
    pill.textContent = grade;
    const verd = document.createElement('div');
    verd.style.cssText = 'font-size:11px!important;color:#b0b0c8!important;line-height:1.4!important;';
    verd.textContent = verdictText(score);
    meta.appendChild(pill); meta.appendChild(verd);
    hdr.appendChild(sEl); hdr.appendChild(meta);
    tip.appendChild(hdr);

    // Signals
    if (green.length || flags.length) {
      const sig = document.createElement('div');
      sig.style.cssText = 'padding:8px 14px 10px!important;display:flex!important;flex-direction:column!important;gap:4px!important;';
      green.forEach(g => {
        const r = document.createElement('div');
        r.style.cssText = 'display:flex!important;gap:6px!important;font-size:11px!important;color:#6ee7b7!important;line-height:1.4!important;';
        r.innerHTML = '<span style="flex-shrink:0">✓</span><span>' + g + '</span>';
        sig.appendChild(r);
      });
      flags.forEach(f => {
        const r = document.createElement('div');
        r.style.cssText = 'display:flex!important;gap:6px!important;font-size:11px!important;color:#fcd34d!important;line-height:1.4!important;';
        r.innerHTML = '<span style="flex-shrink:0">!</span><span>' + f + '</span>';
        sig.appendChild(r);
      });
      tip.appendChild(sig);
    }

    const foot = document.createElement('div');
    foot.style.cssText = 'background:#111118!important;padding:5px 14px!important;font-size:10px!important;color:#5a5a72!important;border-top:1px solid #2e2e3e!important;';
    foot.textContent = '⚡ Upwork Bid Intel · All local · No account';
    tip.appendChild(foot);
    document.body.appendChild(tip);

    // Position: fixed viewport coords, no scrollY
    requestAnimationFrame(() => {
      const tw = tip.offsetWidth || 270, th = tip.offsetHeight || 200;
      let left = rect.left;
      if (left + tw > window.innerWidth - 8) left = window.innerWidth - tw - 8;
      if (left < 8) left = 8;
      let top = rect.bottom + 6;
      if (top + th > window.innerHeight - 8) top = rect.top - th - 6;
      if (top < 8) top = 8;
      tip.style.top = top + 'px'; tip.style.left = left + 'px';
    });
  }

  badge.addEventListener('mouseenter', showTip);
  badge.addEventListener('mouseleave', () => { hideTimer = setTimeout(removeTooltip, 120); });
  return badge;
}

// ─── Detail panel ─────────────────────────────────────────────────────────────
function renderPanel(result) {
  const { score, grade, color, flags, green } = result;
  const panel = document.createElement('div');
  panel.setAttribute('data-ubi-panel', '1');
  panel.style.cssText = `display:flex!important;align-items:stretch!important;background:#fff!important;` +
    `border:1.5px solid #e2e2ee!important;border-left:4px solid ${color}!important;border-radius:10px!important;` +
    `margin:10px 0 14px!important;max-width:680px!important;box-shadow:0 1px 4px rgba(0,0,0,0.07)!important;` +
    `overflow:hidden!important;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;box-sizing:border-box!important;`;

  // Left score
  const L = document.createElement('div');
  const rgb = hexToRgb(color);
  L.style.cssText = `flex-shrink:0!important;display:flex!important;flex-direction:column!important;align-items:center!important;` +
    `justify-content:center!important;padding:16px 18px!important;min-width:80px!important;text-align:center!important;` +
    `background:rgba(${rgb},0.07)!important;border-right:1px solid rgba(${rgb},0.18)!important;gap:5px!important;`;
  const nEl = document.createElement('div');
  nEl.style.cssText = `font-size:32px!important;font-weight:900!important;color:${color}!important;line-height:1!important;letter-spacing:-1px!important;`;
  nEl.textContent = score;
  const pEl = document.createElement('div');
  pEl.style.cssText = `background:${color}!important;color:#fff!important;font-size:9px!important;font-weight:800!important;` +
    `letter-spacing:0.8px!important;text-transform:uppercase!important;border-radius:4px!important;padding:2px 7px!important;`;
  pEl.textContent = grade;
  L.appendChild(nEl); L.appendChild(pEl); panel.appendChild(L);

  // Right content
  const R = document.createElement('div');
  R.style.cssText = 'flex:1!important;padding:12px 16px!important;min-width:0!important;';

  const hRow = document.createElement('div');
  hRow.style.cssText = 'display:flex!important;align-items:center!important;gap:6px!important;margin-bottom:6px!important;';
  const logo = document.createElement('span'); logo.textContent = '⚡'; logo.style.fontSize = '13px';
  const ttl = document.createElement('span');
  ttl.style.cssText = 'font-size:10px!important;font-weight:700!important;color:#8080a0!important;letter-spacing:0.5px!important;text-transform:uppercase!important;';
  ttl.textContent = 'Bid Intel';
  hRow.appendChild(logo); hRow.appendChild(ttl); R.appendChild(hRow);

  const vEl = document.createElement('div');
  vEl.style.cssText = `font-size:13px!important;font-weight:600!important;color:#1a1a2e!important;margin-bottom:8px!important;line-height:1.4!important;`;
  vEl.textContent = verdictText(score);
  R.appendChild(vEl);

  if (green.length || flags.length) {
    const chips = document.createElement('div');
    chips.style.cssText = 'display:flex!important;flex-wrap:wrap!important;gap:4px!important;margin-bottom:8px!important;';
    green.forEach(g => {
      const c = document.createElement('span');
      c.style.cssText = 'background:#f0fdf4!important;color:#166534!important;border:1px solid #bbf7d0!important;border-radius:5px!important;padding:2px 8px!important;font-size:11px!important;white-space:nowrap!important;';
      c.textContent = '✓ ' + g; chips.appendChild(c);
    });
    flags.forEach(f => {
      const c = document.createElement('span');
      c.style.cssText = 'background:#fffbeb!important;color:#92400e!important;border:1px solid #fde68a!important;border-radius:5px!important;padding:2px 8px!important;font-size:11px!important;white-space:nowrap!important;';
      c.textContent = '! ' + f; chips.appendChild(c);
    });
    R.appendChild(chips);
  }

  const foot = document.createElement('div');
  foot.style.cssText = 'font-size:10px!important;color:#a0a0b8!important;';
  foot.textContent = 'All local · No account · Upwork Bid Intel';
  R.appendChild(foot);
  panel.appendChild(R);
  return panel;
}

function hexToRgb(hex) {
  return [parseInt(hex.slice(1,3),16),parseInt(hex.slice(3,5),16),parseInt(hex.slice(5,7),16)].join(',');
}

// ─── Card injection ───────────────────────────────────────────────────────────
// Anchor on job title links — the ONE reliable element on every Upwork page.
// No guessing at card container class names.

const scoredUrls = new Set();

function processCards() {
  // Find every job title heading that contains a /jobs/ link
  const titleLinks = document.querySelectorAll('h2 a[href*="/jobs/"], h3 a[href*="/jobs/"]');

  titleLinks.forEach(link => {
    const href = (link.getAttribute('href') || '').split('?')[0];
    if (!href) return;

    // Dedup by URL — survives React re-renders
    if (scoredUrls.has(href)) return;

    // Check if badge already exists right after the heading
    const heading = link.closest('h2') || link.closest('h3');
    if (!heading) return;
    if (heading.nextSibling && heading.nextSibling.getAttribute &&
        heading.nextSibling.getAttribute('data-ubi-badge')) return;

    scoredUrls.add(href);

    // Scope: walk up to the <section> card boundary.
    // DO NOT walk past the section — that lands on the list container
    // holding ALL 30 cards, mixing every card's data together.
    let scope = heading;
    while (scope.parentElement && scope.tagName.toLowerCase() !== 'section') {
      scope = scope.parentElement;
    }
    const text = scope.textContent || '';
    const data = extractFromText(text);
    const result = scoreJob(data);
    const badge = renderBadge(result);

    // Wrap in a block element so it doesn't collapse into the heading's flex row
    const wrap = document.createElement('div');
    wrap.setAttribute('data-ubi-badge', '1');
    wrap.style.cssText = 'display:block!important;margin:3px 0!important;padding:0!important;line-height:1!important;';
    wrap.appendChild(badge);

    // Insert immediately after the heading
    if (heading.nextSibling) {
      heading.parentNode.insertBefore(wrap, heading.nextSibling);
    } else {
      heading.parentNode.appendChild(wrap);
    }
  });
}

// ─── Slider / detail page ─────────────────────────────────────────────────────
function processDetailPage() {
  const m = location.href.match(/(?:\/jobs\/|\/details\/)~([0-9a-f]+)/i);
  const hasSlider = !!(document.querySelector('.job-details-content') || document.querySelector('.job-details-card') || Array.from(document.querySelectorAll('.air3-card-sections')).find(el => el.querySelector('h4')));
  // Upwork sometimes opens the job modal without changing the URL.
  // If the slider exists, score it even when /details/~uid is absent.
  if (!m && !hasSlider) return;

  // Remove stale panel from previous navigation
  document.querySelectorAll('[data-ubi-panel]').forEach(el => el.remove());

  const jobUid = m ? m[1] : null;

  function tryInject() {
    // Already injected this navigation?
    if (document.querySelector('[data-ubi-panel]')) return;

    let text = '';
    let insertAfter = null;

    // ── Strategy 1: find the job detail slider ──
    // Upwork renders the slider as:
    //   div.job-details-content > div.job-details-card > div.air3-card-sections
    //   OR directly as div.air3-card-sections (when no outer wrapper)
    // CRITICAL: when the slider is open the full page has MANY .air3-card-sections
    // (one per list card). The modal one is uniquely the one containing an h4 title.
    // List job cards use h3; the modal/slider uses h4.
    let sliderContent =
      document.querySelector('.job-details-content') ||
      document.querySelector('.job-details-card') ||
      Array.from(document.querySelectorAll('.air3-card-sections')).find(el => el.querySelector('h4')) ||
      null;
    if (sliderContent) {
      text = sliderContent.textContent || '';
      const titleEl = sliderContent.querySelector('h4, h2, h1');
      if (titleEl) insertAfter = titleEl;
    }

    // ── Strategy 2: matching background card text ──
    if (!text) {
      const cardLink = jobUid ? Array.from(document.querySelectorAll('a[href*="/jobs/"]'))
        .find(a => (a.getAttribute('href') || '').includes(jobUid)) : null;
      const card = cardLink?.closest('section.air3-card-section, [data-ubi-done], article');
      if (card) text = card.textContent || '';
    }

    // ── Strategy 3: any heading not in nav ──
    if (!text) {
      const heading = Array.from(document.querySelectorAll('h4, h3, h2, h1'))
        .find(h => !h.closest('nav, header'));
      if (heading) {
        let el = heading;
        while (el.parentElement && !['section','main','body'].includes(el.tagName.toLowerCase())) {
          el = el.parentElement;
        }
        text = el.textContent || '';
        if (!insertAfter) insertAfter = heading;
      }
    }

    if (!text || text.trim().length < 30) return false; // signal: not ready yet

    const data = extractFromText(text);
    const result = scoreJob(data);
    const panel = renderPanel(result);
    panel.setAttribute('data-ubi-panel', '1');

    if (insertAfter && insertAfter.parentNode) {
      insertAfter.parentNode.insertBefore(panel, insertAfter.nextSibling);
    } else {
      const container = document.querySelector('.job-details-content') || Array.from(document.querySelectorAll('.air3-card-sections')).find(el => el.querySelector('h4')) || document.querySelector('main') || document.body;
      container.prepend(panel);
    }
    return true; // signal: success
  }

  // Try immediately, then retry at 800ms, 1800ms, 3500ms
  // The slider loads asynchronously so content may not exist yet
  if (!tryInject()) {
    setTimeout(() => { if (!tryInject()) {
      setTimeout(() => { if (!tryInject()) {
        setTimeout(tryInject, 1700);
      }}, 1000);
    }}, 800);
  }
}

function onRouteChange() {
  const url = location.href;
  if (/(?:\/jobs\/|\/details\/)~[0-9a-f]+/i.test(url)) {
    setTimeout(processDetailPage, 1000);
    setTimeout(processCards, 700);
  } else {
    setTimeout(processCards, 700);
  }
}

let lastUrl = location.href;
let throttle = null;

new MutationObserver(() => {
  // Route change
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    scoredUrls.clear();
    document.querySelectorAll('[data-ubi-panel]').forEach(el => el.remove());
    onRouteChange();
    return;
  }

  // Slider content appeared dynamically — inject panel even if Upwork
  // did not update the URL to /details/~uid.
  const slider = document.querySelector('.job-details-content') || document.querySelector('.job-details-card') || Array.from(document.querySelectorAll('.air3-card-sections')).find(el => el.querySelector('h4'));
  if (slider && !document.querySelector('[data-ubi-panel]')) {
    clearTimeout(throttle);
    throttle = setTimeout(processDetailPage, 300);
    return;
  }

  clearTimeout(throttle);
  throttle = setTimeout(processCards, 500);
}).observe(document.body, { childList: true, subtree: true });

onRouteChange();

// Popup message handler
chrome.runtime.onMessage.addListener((msg, _, sendResponse) => {
  if (msg.type === 'GET_PAGE_DATA') {
    const data = extractFromText(document.body.textContent || '');
    const result = scoreJob(data);
    sendResponse({ result, url: location.href });
  }
  return true;
});
