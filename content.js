/**
 * Upwork Bid Intel v2.0 — Simplified, reliable injection
 * Strategy: anchor on job title links (h2/h3 > a[href*="/jobs/"]) — the ONE
 * stable element on every Upwork page. No guessing at card class names.
 */

// ─── Scoring engine ───────────────────────────────────────────────────────────
function scoreJob(d) {
  let score = 100;
  // Each flag/green is {text, pts} where pts is the point change (negative = deduction, 0 = neutral good)
  const flags = [], green = [], info = [];

  function addFlag(text, pts) { score -= pts; flags.push({ text, pts }); }
  function addGreen(text)     { green.push({ text }); }
  function addInfo(text)      { info.push({ text }); }

  // ── CLIENT RATING ──
  if (d.clientRating !== null && d.clientRating > 0) {
    if (d.clientRating >= 4.8)       addGreen('Top-rated client (' + d.clientRating + '★)');
    else if (d.clientRating >= 4.5)  addGreen('Good client rating (' + d.clientRating + ')');
    else if (d.clientRating >= 4.0)  addFlag('Average client rating: ' + d.clientRating, 5);
    else if (d.clientRating >= 3.5)  addFlag('Below-avg client rating: ' + d.clientRating, 15);
    else                             addFlag('Low client rating: ' + d.clientRating, 25);
  } else {
    addFlag('No client rating — new to Upwork', 15);
  }

  // ── CLIENT SPEND (track record) ──
  if (d.clientSpend !== null) {
    if (d.clientSpend === 0)           addFlag('$0 spent — brand new account', 15);
    else if (d.clientSpend < 500)      addFlag('Only $' + d.clientSpend + ' spent — very little history', 10);
    else if (d.clientSpend < 1000)     addFlag('Limited spend: $' + d.clientSpend, 3);
    else if (d.clientSpend >= 50000)   addGreen('$' + (d.clientSpend/1000).toFixed(0) + 'K+ spent — seasoned client 💪');
    else if (d.clientSpend >= 10000)   addGreen('$' + (d.clientSpend/1000).toFixed(0) + 'K+ spent');
    else if (d.clientSpend >= 1000)    addGreen('$' + (d.clientSpend/1000).toFixed(1) + 'K spent');
  }

  // ── CLIENT HIRES ──
  if (d.clientHires !== null) {
    if (d.clientHires === 0)      addFlag('0 hires ever', 10);
    else if (d.clientHires >= 10) addGreen(d.clientHires + ' total hires');
    else if (d.clientHires >= 3)  addGreen(d.clientHires + ' hires');
  }

  // ── HIRE RATE ──
  if (d.hireRate !== null) {
    if (d.hireRate === 0)        addFlag('0% hire rate — posted jobs but never hired ⚠️', 20);
    else if (d.hireRate < 20)    addFlag(d.hireRate + '% hire rate — rarely hires', 10);
    else if (d.hireRate < 40)    addFlag(d.hireRate + '% hire rate — below average', 5);
    else if (d.hireRate >= 70)   addGreen(d.hireRate + '% hire rate — hires often ✓');
    else if (d.hireRate >= 50)   addGreen(d.hireRate + '% hire rate');
  }

  // ── PAYMENT VERIFICATION ──
  if (d.paymentVerified === false)     addFlag('Payment NOT verified ⚠️', 20);
  else if (d.paymentVerified === true) addGreen('Payment verified ✓');

  // ── JOB AGE ──
  if (d.daysPosted !== null) {
    if (d.daysPosted > 60)      addFlag('Posted ' + d.daysPosted + 'd ago — very stale', 30);
    else if (d.daysPosted > 30) addFlag('Posted ' + d.daysPosted + 'd ago — stale', 20);
    else if (d.daysPosted > 14) addFlag('Posted ' + d.daysPosted + 'd ago', 10);
    else if (d.daysPosted > 3)  { /* 4–14 days: neutral */ }
    else if (d.daysPosted === 0) addGreen('Posted today — very fresh 🔥');
    else                         addGreen('Posted ' + d.daysPosted + 'd ago — fresh');
  }

  // ── PROPOSALS (competition) ──
  if (d.proposalsMid !== null) {
    if (d.proposalsMid >= 50)       addFlag('50+ proposals — very crowded', 20);
    else if (d.proposalsMid >= 30)  addFlag('~' + d.proposalsMid + ' proposals — crowded', 12);
    else if (d.proposalsMid >= 20)  addFlag('~' + d.proposalsMid + ' proposals — competitive', 7);
    else if (d.proposalsMid >= 10)  addFlag('~' + d.proposalsMid + ' proposals', 3);
    else if (d.proposalsMid <= 5)   addGreen('Only ~' + d.proposalsMid + ' proposals 🎯');
    else                            addGreen('~' + d.proposalsMid + ' proposals');
  }

  // ── HOURLY RATE ──
  // Prefer avg hourly rate actually paid (client history) over posted range
  const effectiveRate = d.avgHourlyPaid !== null ? d.avgHourlyPaid : d.hourlyMid;
  const rateLabel = d.avgHourlyPaid !== null ? 'avg paid $' + d.avgHourlyPaid + '/hr' : '~$' + d.hourlyMid + '/hr';
  if (effectiveRate !== null) {
    if (effectiveRate < 10)       addFlag(rateLabel + ' — race to bottom', 25);
    else if (effectiveRate < 15)  addFlag('Pays ' + rateLabel + ' — very low', 20);
    else if (effectiveRate < 25)  addFlag('Pays ' + rateLabel + ' — below market', 10);
    else if (effectiveRate >= 70) addGreen('Pays ' + rateLabel + ' — strong 💰');
    else if (effectiveRate >= 50) addGreen('Pays ' + rateLabel + ' — good');
    else                          addGreen('Pays ' + rateLabel); // $25–$69: positive, no deduction
    // Note when avg paid is lower than posted range
    if (d.avgHourlyPaid !== null && d.hourlyMid !== null && d.avgHourlyPaid < d.hourlyMid - 5) {
      const postedRange = (d.hourlyLow && d.hourlyHigh)
        ? '$' + d.hourlyLow + '–$' + d.hourlyHigh
        : '$' + d.hourlyMid;
      addInfo('Posted ' + postedRange + '/hr but pays $' + d.avgHourlyPaid + '/hr avg');
    }
  }

  // ── FIXED BUDGET ──
  if (d.fixedBudget !== null && d.hourlyMid === null) {
    if (d.fixedBudget < 50)         addFlag('Budget <$50 — not worth it', 25);
    else if (d.fixedBudget < 150)   addFlag('Very low budget: $' + d.fixedBudget, 15);
    else if (d.fixedBudget < 300)   addFlag('Low budget: $' + d.fixedBudget, 8);
    else if (d.fixedBudget < 500)   addFlag('Modest budget: $' + d.fixedBudget, 3);
    else if (d.fixedBudget >= 2000) addGreen('Strong budget: $' + d.fixedBudget + ' 💰');
    else if (d.fixedBudget >= 500)  addGreen('Decent budget: $' + d.fixedBudget);
  }

  score = Math.max(0, Math.min(100, score));

  let grade, color;
  if (score >= 80)      { grade = 'Excellent'; color = '#16a34a'; }
  else if (score >= 65) { grade = 'Good';      color = '#65a30d'; }
  else if (score >= 45) { grade = 'Risky';     color = '#d97706'; }
  else if (score >= 25) { grade = 'Poor';      color = '#dc2626'; }
  else                  { grade = 'Skip';      color = '#7f1d1d'; }

  return { score, grade, color, flags, green, info };
}
function verdictText(score) {
  if (score >= 80) return 'Strong signals — apply with confidence.';
  if (score >= 65) return 'Looks decent — worth applying.';
  if (score >= 45) return 'Some red flags — check details first.';
  if (score >= 25) return 'Multiple warnings — probably skip.';
  return 'Too many red flags — save your connects.';
}

// ─── Data extraction ──────────────────────────────────────────────────────────
function extractFromText(text, activityText) {
  // Payment verified — negative lookahead so "unverified" doesn't match
  // "Payment method verified" or "Payment verified" → true
  // "Payment method not verified" / "unverified" → false
  const paymentVerified = /payment(?:\s+method)?\s+verified/i.test(text) ? true
    : /payment(?:\s+method)?\s+(?:un|not\s+)verified/i.test(text) ? false
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
  // "Activity on this job" section is sometimes outside the slider container.
  // Use activityText (full body scoped to that section) when provided,
  // otherwise fall back to the slider text.
  const propSource = activityText || text;
  const activityM = propSource.match(/activity\s+on\s+this\s+job([\s\S]{0,500})/i);
  const propScope = activityM ? activityM[1] : propSource;
  const pp = propScope.match(/\bproposals\s*[:\s]+50\+/i);
  const pr = propScope.match(/\bproposals\s*[:\s]+(\d+)\s+to\s+(\d+)/i);
  const pl = propScope.match(/\bproposals\s*[:\s]+(?:less|fewer)\s+than\s+(\d+)/i);
  const ps = propScope.match(/\bproposals\s*[:\s]+(\d+)/i);
  if (pp) proposalsMid = 50;
  else if (pr) proposalsMid = Math.round((+pr[1] + +pr[2]) / 2);
  else if (pl) proposalsMid = Math.round(+pl[1] / 2);
  else if (ps) proposalsMid = +ps[1];

  // Hourly rate
  let hourlyMid = null;
  // Match both "Hourly $N-$M" (card list) and "$N.00-$M.00 Hourly" (detail page)
  // Require $ before digits to avoid "Hourly 1 open job" false match
  const hrA = text.match(/hourly[:\s]*\$([\d.]+)\s*[-\u2013]\s*\$?([\d.]+)/i);
  const hrB = text.match(/\$([\d.]+)\s*[-\u2013]\s*\$?([\d.]+)\s*hourly/i);
  const hsA = text.match(/hourly[:\s]*\$([\d.]+)/i);
  let hourlyLow = null, hourlyHigh = null;
  if (hrA) { hourlyLow = +hrA[1]; hourlyHigh = +hrA[2]; hourlyMid = Math.round((hourlyLow + hourlyHigh) / 2); }
  else if (hrB) { hourlyLow = +hrB[1]; hourlyHigh = +hrB[2]; hourlyMid = Math.round((hourlyLow + hourlyHigh) / 2); }
  else if (hsA) { hourlyMid = +hsA[1]; }

  // Client's actual avg hourly rate paid (more honest than posted range)
  let avgHourlyPaid = null;
  const avgM = text.match(/\$([\d.]+)\s*\/hr\s*avg\s+hourly\s+rate\s+paid/i);
  if (avgM) avgHourlyPaid = parseFloat(avgM[1]);

  // Fixed budget — match both "est. budget: $N" and "$N Fixed-price" (Upwork modal format)
  let fixedBudget = null;
  const fb = text.match(/(?:est\.?\s*budget|fixed\s*(?:price|budget)?)[:\s]*\$?([\d,]+)/i) ||
             text.match(/\$([\d,.]+)\s*(?:fixed.price|fixed)/i);
  if (fb && !hourlyMid) fixedBudget = parseFloat(fb[1].replace(/,/g,''));

  // Client spend
  let clientSpend = null;
  // Match "$440K spent", "$5K+ spent", "$0 total spent", "$1,234 spent"
  const sm = text.match(/\$([\d,.]+)(k\+?)?\s*(?:\+\s*)?(?:total\s+)?spent/i);
  if (sm) {
    let v = parseFloat(sm[1].replace(/,/g,''));
    if (sm[2] && /k/i.test(sm[2])) v *= 1000;
    clientSpend = v;
  }

  // Client hires — match "N hires" but NOT "hire rate" or "% hire rate"
  let clientHires = null;
  if (/no\s+hires/i.test(text)) clientHires = 0;
  else {
    const m = text.match(/(\d+)\s+hires[^a-z]/i) || text.match(/(\d+)\s+hires$/im);
    if (m) clientHires = +m[1];
  }

  // Hire rate percentage (how often this client actually hires after posting)
  let hireRate = null;
  const hrm = text.match(/(\d+)%\s*hire\s*rate/i);
  if (hrm) hireRate = +hrm[1];

  // Client rating (1.0–5.9)
  // Client rating — Upwork shows it in several ways depending on context:
  // • Card list:   "Payment verified 5.0 $400K+ spent"  (bare decimal between signals)
  // • Full page:   "Rating is 5.0 out of 5" / "5.0 of 38 reviews"
  // • With symbol: "★ 5.0" / "⭐5.0"
  let clientRating = null;
  // 1. Explicit rating context
  const rmCtx = text.match(/(?:★|[⭐]|rating\s+is)[^\d]*([1-5]\.\d)/i) ||
                text.match(/([1-5]\.\d)\s*(?:of\s*5|★|stars?)/i) ||
                text.match(/([1-5]\.\d{1,2})\s+of\s+[1-9]\d*\s+reviews?/i);
  if (rmCtx) clientRating = parseFloat(rmCtx[1]);
  // 2. Upwork card pattern: "Payment verified 5.0 $NNN spent" or "verified 4.8 $"
  if (!clientRating) {
    const rmCard = text.match(/(?:payment\s+(?:method\s+)?verified|verified)[^\d$]{0,10}([1-5]\.\d)/i);
    if (rmCard) clientRating = parseFloat(rmCard[1]);
  }
  // 3. Bare rating near spend marker: "5.0 $400K+"
  if (!clientRating) {
    const rmSpend = text.match(/([1-5]\.\d)\s+\$[\d,.]+[Kk+]/);
    if (rmSpend) clientRating = parseFloat(rmSpend[1]);
  }

  return { paymentVerified, daysPosted, proposalsMid, hourlyMid, hourlyLow, hourlyHigh, avgHourlyPaid, fixedBudget, clientSpend, clientHires, clientRating, hireRate };
}

// ─── Badge (compact, inline) ──────────────────────────────────────────────────
let activeTooltip = null;
let hideTimer = null;

function removeTooltip() {
  clearTimeout(hideTimer);
  if (activeTooltip) { activeTooltip.remove(); activeTooltip = null; }
}

function renderBadge(result) {
  const { score, grade, color, flags, green, info = [] } = result;
  const bg = color + '18';

  const badge = document.createElement('span');
  badge.setAttribute('data-ubi-badge', '1');
  badge.style.cssText = `display:inline-flex!important;flex-direction:column!important;align-items:flex-start!important;gap:2px!important;` +
    `background:${bg}!important;border:1.5px solid ${color}!important;border-radius:5px!important;` +
    `padding:3px 8px 4px!important;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;` +
    `font-size:12px!important;font-weight:700!important;color:${color}!important;cursor:default!important;` +
    `user-select:none!important;white-space:nowrap!important;vertical-align:middle!important;line-height:1.2!important;` +
    `box-sizing:border-box!important;text-decoration:none!important;`;

  // Top row: dot + score + EST.
  const topRow = document.createElement('span');
  topRow.style.cssText = 'display:inline-flex!important;align-items:center!important;gap:5px!important;';

  const dot = document.createElement('span');
  dot.style.cssText = `display:inline-block!important;width:7px!important;height:7px!important;` +
    `border-radius:50%!important;background:${color}!important;flex-shrink:0!important;`;

  const lbl = document.createElement('span');
  lbl.style.cssText = `font-size:12px!important;font-weight:700!important;color:${color}!important;`;
  lbl.textContent = score;

  const est = document.createElement('span');
  est.style.cssText = `font-size:9px!important;font-weight:600!important;color:${color}!important;` +
    `opacity:0.75!important;letter-spacing:0.2px!important;text-transform:uppercase!important;`;
  est.textContent = 'est.';

  topRow.appendChild(dot);
  topRow.appendChild(lbl);
  topRow.appendChild(est);
  badge.appendChild(topRow);

  // Bottom row: hint text — lives INSIDE the badge, never clipped
  const hint = document.createElement('span');
  hint.style.cssText = `font-size:8px!important;font-weight:400!important;color:${color}!important;` +
    `opacity:0.6!important;letter-spacing:0.1px!important;line-height:1!important;`;
  hint.textContent = 'open job for full score';
  badge.appendChild(hint);

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
        r.innerHTML = '<span style="flex-shrink:0">✓</span><span>' + g.text + '</span>';
        sig.appendChild(r);
      });
      flags.forEach(f => {
        const r = document.createElement('div');
        r.style.cssText = 'display:flex!important;justify-content:space-between!important;gap:6px!important;font-size:11px!important;color:#fcd34d!important;line-height:1.4!important;';
        r.innerHTML = '<span style="display:flex;gap:6px"><span style="flex-shrink:0">!</span><span>' + f.text + '</span></span>' +
          '<span style="flex-shrink:0;opacity:0.7;font-size:10px;padding-left:6px">−' + f.pts + ' pts</span>';
        sig.appendChild(r);
      });
      (info || []).forEach(item => {
        const r = document.createElement('div');
        r.style.cssText = 'font-size:10px!important;color:#93c5fd!important;line-height:1.4!important;padding-top:2px!important;';
        r.textContent = 'ℹ ' + item.text;
        sig.appendChild(r);
      });
      tip.appendChild(sig);
    }

    const foot = document.createElement('div');
    foot.style.cssText = 'background:#111118!important;padding:5px 14px 4px!important;font-size:10px!important;color:#5a5a72!important;border-top:1px solid #2e2e3e!important;';
    foot.textContent = '⚡ Upwork Bid Intel · All local · No account';
    tip.appendChild(foot);

    // Highlighted note — must be impossible to miss
    const note = document.createElement('div');
    note.style.cssText = 'background:#2a2010!important;border-top:1px solid #f59e0b!important;' +
      'padding:6px 14px!important;font-size:11px!important;font-weight:600!important;' +
      'color:#fbbf24!important;line-height:1.4!important;display:flex!important;gap:6px!important;align-items:flex-start!important;';
    note.innerHTML = '<span style="flex-shrink:0;font-size:13px">⚠︎</span>' +
      '<span>Score is estimated — open the job for the full score</span>';
    tip.appendChild(note);
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

// ─── Skeleton loader ──────────────────────────────────────────────────────────
function renderSkeleton() {
  const panel = document.createElement('div');
  panel.setAttribute('data-ubi-panel', '1');
  panel.setAttribute('data-ubi-skeleton', '1');
  panel.style.cssText = [
    'display:flex!important','align-items:stretch!important',
    'background:#fff!important','border:1.5px solid #e2e2ee!important',
    'border-left:4px solid #d0d0e8!important','border-radius:10px!important',
    'margin:10px 0 14px!important','max-width:680px!important',
    'overflow:hidden!important','box-sizing:border-box!important',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important',
  ].join(';');

  // Left placeholder
  const L = document.createElement('div');
  L.style.cssText = 'flex-shrink:0!important;display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;padding:16px 18px!important;min-width:80px!important;background:#f8f8fc!important;border-right:1px solid #e8e8f0!important;gap:8px!important;';
  const pulse = document.createElement('div');
  pulse.style.cssText = 'width:44px!important;height:44px!important;border-radius:50%!important;background:linear-gradient(90deg,#e8e8f0 25%,#d0d0e8 50%,#e8e8f0 75%)!important;background-size:200% 100%!important;animation:ubi-pulse 1.4s ease-in-out infinite!important;';
  const bar = document.createElement('div');
  bar.style.cssText = 'width:36px!important;height:10px!important;border-radius:4px!important;background:linear-gradient(90deg,#e8e8f0 25%,#d0d0e8 50%,#e8e8f0 75%)!important;background-size:200% 100%!important;animation:ubi-pulse 1.4s ease-in-out infinite!important;';
  L.appendChild(pulse); L.appendChild(bar); panel.appendChild(L);

  // Right placeholder
  const R = document.createElement('div');
  R.style.cssText = 'flex:1!important;padding:12px 16px!important;display:flex!important;flex-direction:column!important;gap:8px!important;justify-content:center!important;';
  const hdr = document.createElement('div');
  hdr.style.cssText = 'display:flex!important;align-items:center!important;gap:6px!important;';
  const icon = document.createElement('span'); icon.textContent = '⚡'; icon.style.fontSize='13px';
  const lbl = document.createElement('span');
  lbl.style.cssText = 'font-size:10px!important;font-weight:700!important;color:#8080a0!important;letter-spacing:0.5px!important;text-transform:uppercase!important;';
  lbl.textContent = 'Bid Intel · Analysing…';
  hdr.appendChild(icon); hdr.appendChild(lbl); R.appendChild(hdr);
  [80,60,90,50].forEach(w => {
    const s = document.createElement('div');
    s.style.cssText = `width:${w}%!important;height:8px!important;border-radius:4px!important;background:linear-gradient(90deg,#e8e8f0 25%,#d0d0e8 50%,#e8e8f0 75%)!important;background-size:200% 100%!important;animation:ubi-pulse 1.4s ease-in-out infinite!important;`;
    R.appendChild(s);
  });
  panel.appendChild(R);

  // Inject keyframes once
  if (!document.getElementById('ubi-pulse-style')) {
    const st = document.createElement('style');
    st.id = 'ubi-pulse-style';
    st.textContent = '@keyframes ubi-pulse{0%{background-position:200% 0}100%{background-position:-200% 0}}';
    document.head.appendChild(st);
  }
  return panel;
}

// ─── Detail panel ─────────────────────────────────────────────────────────────
function renderPanel(result) {
  const { score, grade, color, flags, green, info = [] } = result;
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

  // ── Score breakdown table ──
  const table = document.createElement('div');
  table.style.cssText = 'margin-bottom:8px!important;';

  function mkRow(icon, label, delta, rowColor) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex!important;align-items:baseline!important;justify-content:space-between!important;' +
      'padding:2px 0!important;border-bottom:1px solid #f0f0f6!important;gap:8px!important;';
    const left = document.createElement('span');
    left.style.cssText = 'font-size:11px!important;color:' + rowColor + '!important;flex:1!important;min-width:0!important;';
    left.textContent = icon + ' ' + label;
    const right = document.createElement('span');
    right.style.cssText = 'font-size:11px!important;font-weight:700!important;color:' + rowColor + '!important;flex-shrink:0!important;';
    right.textContent = delta;
    row.appendChild(left); row.appendChild(right);
    return row;
  }

  // Start row
  const startRow = document.createElement('div');
  startRow.style.cssText = 'display:flex!important;align-items:baseline!important;justify-content:space-between!important;' +
    'padding:2px 0 3px!important;border-bottom:2px solid #e2e2ee!important;margin-bottom:2px!important;';
  const sl = document.createElement('span');
  sl.style.cssText = 'font-size:11px!important;font-weight:700!important;color:#6060a0!important;';
  sl.textContent = 'Started at';
  const sr = document.createElement('span');
  sr.style.cssText = 'font-size:11px!important;font-weight:700!important;color:#6060a0!important;';
  sr.textContent = '100';
  startRow.appendChild(sl); startRow.appendChild(sr);
  table.appendChild(startRow);

  green.forEach(g => table.appendChild(mkRow('✓', g.text, '—', '#166534')));
  flags.forEach(f => table.appendChild(mkRow('▼', f.text, '−' + f.pts, '#b45309')));

  // Final score row
  const finalRow = document.createElement('div');
  finalRow.style.cssText = 'display:flex!important;align-items:baseline!important;justify-content:space-between!important;' +
    'padding:3px 0 1px!important;border-top:2px solid #e2e2ee!important;margin-top:2px!important;';
  const fl = document.createElement('span');
  fl.style.cssText = 'font-size:11px!important;font-weight:700!important;color:#1a1a2e!important;';
  fl.textContent = 'Final score';
  const fr = document.createElement('span');
  fr.style.cssText = 'font-size:13px!important;font-weight:900!important;color:' + color + '!important;';
  fr.textContent = score;
  finalRow.appendChild(fl); finalRow.appendChild(fr);
  table.appendChild(finalRow);

  // Info rows — zero-point notes, shown below final score in muted blue
  info.forEach(item => {
    const infoRow = document.createElement('div');
    infoRow.style.cssText = 'font-size:10px!important;color:#4f7ac7!important;padding:3px 0 0!important;';
    infoRow.textContent = 'ℹ ' + item.text;
    table.appendChild(infoRow);
  });

  R.appendChild(table);

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

    // Scope: walk up to nearest card boundary.
    // Best Matches / Most Recent use <section>; Search page uses <article>.
    // Stop before job-tile-list, search-results, or main containers.
    let scope = heading;
    while (scope.parentElement) {
      const tag = scope.parentElement.tagName.toLowerCase();
      const cls = (scope.parentElement.className || '');
      if (tag === 'section' || tag === 'article') { scope = scope.parentElement; break; }
      if (cls.includes('job-tile-list') || cls.includes('search-results') ||
          cls.includes('jobs-list') || tag === 'main') break;
      scope = scope.parentElement;
    }
    const text = scope.textContent || '';

    // Proposals: read from span.value WITHIN this card scope only
    // (document-wide query bleeds values across cards)
    let domProposalsMid = null;
    scope.querySelectorAll('.ca-item').forEach(item => {
      const title = item.querySelector('.title');
      if (title && /proposals/i.test(title.textContent)) {
        const val = (item.querySelector('.value, span.value') || {}).textContent || '';
        const v = val.trim();
        if (/50\+/.test(v)) domProposalsMid = 50;
        else {
          const rng = v.match(/(\d+)\s+to\s+(\d+)/i);
          const few = v.match(/fewer|less/i);
          const num = v.match(/\d+/);
          if (rng) domProposalsMid = Math.round((+rng[1] + +rng[2]) / 2);
          else if (few && num) domProposalsMid = Math.round(+num[0] / 2);
          else if (num) domProposalsMid = +num[0];
        }
      }
    });
    const data = extractFromText(text);
    if (domProposalsMid !== null) data.proposalsMid = domProposalsMid;
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
  // Works for both /details/~uid (slider) and plain /jobs/~uid (full page)
  const m = location.href.match(/(?:\/jobs\/|\/details\/)~([0-9a-f]+)/i);
  const jobUid = m ? m[1].replace(/^0+/, '') : null; // strip leading zeros

  // Find the modal/slider container — widest scope that contains the job
  function getSlider() {
    // Try widest first (full slider body includes client section)
    return document.querySelector('.air3-slider-body') ||
           document.querySelector('.job-details-content') ||
           document.querySelector('.job-details-card') ||
           Array.from(document.querySelectorAll('.air3-card-sections')).find(el => el.querySelector('h4')) ||
           null;
  }

  // For insertion point we want the narrower content container with the h4
  function getInsertContainer() {
    return document.querySelector('.job-details-content') ||
           document.querySelector('.job-details-card') ||
           Array.from(document.querySelectorAll('.air3-card-sections')).find(el => el.querySelector('h4')) ||
           null;
  }

  // Check slider exists in DOM
  function sliderIsReady() {
    return getSlider();
  }

  // Check client section is present (payment/rating/spend/hires)
  function clientIsReady(slider) {
    const txt = slider.textContent || '';
    return /payment\s+(un)?verified/i.test(txt) ||
           /spent/i.test(txt) ||
           /\d+\s+(?:hires|reviews?)/i.test(txt);
  }

  const currentUrl = location.href.split('?')[0];

  function inject(slider, forced) {
    // Collect text: slider content + about-client sidebar (if separate)
    const sidebarEl = document.querySelector('[data-test="about-client-container"], .cfe-ui-job-about-client');
    const sidebarInSlider = slider.contains(sidebarEl);
    const sliderText = slider.textContent || '';
    const clientText = (sidebarEl && !sidebarInSlider) ? sidebarEl.textContent : '';
    const text = sliderText + (clientText ? '\n' + clientText : '');

    if (!text || text.trim().length < 50) return false;

    // Proposals: read from DOM span.value inside .ca-item — immune to tooltip text injection
    // textContent regex fails because Upwork injects tooltip HTML between "Proposals:" and "50+"
    let domProposalsMid = null;
    document.querySelectorAll('.ca-item').forEach(item => {
      const title = item.querySelector('.title');
      if (title && /proposals/i.test(title.textContent)) {
        const val = (item.querySelector('.value, span.value') || {}).textContent || '';
        const v = val.trim();
        if (/50\+/.test(v)) domProposalsMid = 50;
        else {
          const rng = v.match(/(\d+)\s+to\s+(\d+)/i);
          const few = v.match(/fewer|less/i);
          const num = v.match(/\d+/);
          if (rng) domProposalsMid = Math.round((+rng[1] + +rng[2]) / 2);
          else if (few && num) domProposalsMid = Math.round(+num[0] / 2);
          else if (num) domProposalsMid = +num[0];
        }
      }
    });
    const activityBodyM = document.body.textContent.match(/activity\s+on\s+this\s+job[\s\S]{0,500}/i);
    const activityText = activityBodyM ? activityBodyM[0] : null;
    const data = extractFromText(text, activityText);
    // Override proposals with DOM-read value if available (more reliable)
    if (domProposalsMid !== null) data.proposalsMid = domProposalsMid;
    const result = scoreJob(data);
    const panel = renderPanel(result);
    panel.setAttribute('data-ubi-panel', '1');
    panel.setAttribute('data-ubi-url', currentUrl);

    // Insert after the h4 title — use narrower content container
    const insertTarget = getInsertContainer() || slider;
    const titleEl = insertTarget.querySelector('h4, h2, h1');
    if (titleEl && titleEl.parentNode) {
      titleEl.parentNode.insertBefore(panel, titleEl.nextSibling);
    } else {
      insertTarget.prepend(panel);
    }
    return true;
  }

  // Attempt injection — returns true on success, false to retry
  // Show skeleton immediately when slider appears
  function showSkeleton() {
    if (document.querySelector('[data-ubi-panel]')) return; // already something there
    const insertTarget = getInsertContainer();
    if (!insertTarget) return;
    const sk = renderSkeleton();
    sk.setAttribute('data-ubi-url', currentUrl);
    const titleEl = insertTarget.querySelector('h4, h2, h1');
    if (titleEl && titleEl.parentNode) titleEl.parentNode.insertBefore(sk, titleEl.nextSibling);
    else insertTarget.prepend(sk);
  }

  function tryInject(force) {
    // Already done (real panel) for this URL?
    const existing = document.querySelector(`[data-ubi-panel][data-ubi-url="${currentUrl}"]`);
    if (existing && !existing.hasAttribute('data-ubi-skeleton')) return true;

    // Remove stale panels from a different URL
    document.querySelectorAll('[data-ubi-panel]').forEach(el => {
      if (el.getAttribute('data-ubi-url') !== currentUrl) el.remove();
    });

    const slider = sliderIsReady();
    if (!slider) return false;

    // Show skeleton while waiting for client data
    showSkeleton();

    const hasClient = clientIsReady(slider);
    if (!hasClient && !force) return false;

    // Remove skeleton and inject real panel
    document.querySelectorAll('[data-ubi-skeleton]').forEach(el => el.remove());
    return inject(slider, force);
  }

  // Retry chain: immediate → 300ms → 600ms → 1000ms → 1800ms → force at 2500ms
  if (!tryInject()) {
    const delays = [300, 600, 1000, 1800, 2500];
    let attempt = 0;
    function retry() {
      if (document.querySelector(`[data-ubi-panel][data-ubi-url="${currentUrl}"]:not([data-ubi-skeleton])`)) return;
      const isLast = attempt >= delays.length;
      if (!tryInject(isLast)) {
        if (!isLast) {
          attempt++;
          setTimeout(retry, delays[attempt - 1]);
        }
      }
    }
    setTimeout(retry, delays[0]);
  }
}

function onRouteChange() {
  const url = location.href;
  if (/(?:\/jobs\/|\/details\/)~[0-9a-f]+/i.test(url)) {
    // Try cards immediately, then again at 300ms in case React is still rendering
    processCards();
    setTimeout(processCards, 300);
    // Detail panel needs a bit longer for slider DOM to appear
    setTimeout(processDetailPage, 400);
  } else {
    // Try immediately, retry once if cards aren't rendered yet
    processCards();
    setTimeout(processCards, 250);
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

  // Slider or about-client appeared — re-trigger detail page scoring
  if (/(?:\/jobs\/|\/details\/)~[0-9a-f]+/i.test(location.href)) {
    const slider = document.querySelector('.job-details-content') || document.querySelector('.job-details-card') || Array.from(document.querySelectorAll('.air3-card-sections')).find(el => el.querySelector('h4'));
    const curUrl = location.href.split('?')[0];
    const alreadyDone = document.querySelector(`[data-ubi-panel][data-ubi-url="${curUrl}"]`);
    if (slider && !alreadyDone) {
      clearTimeout(throttle);
      throttle = setTimeout(processDetailPage, 400);
      return;
    }
  }

  clearTimeout(throttle);
  throttle = setTimeout(processCards, 150);
}).observe(document.body, { childList: true, subtree: true });

onRouteChange();

// Popup message handler
chrome.runtime.onMessage.addListener((msg, _, sendResponse) => {
  if (msg.type === 'GET_PAGE_DATA') {
    // Use same scoped text as the modal inject — NOT document.body (all 30 cards bleed together)
    let text = '';

    // 1. Prefer the slider/detail container (same source as modal panel)
    const slider =
      document.querySelector('.job-details-content') ||
      document.querySelector('.job-details-card') ||
      Array.from(document.querySelectorAll('.air3-card-sections')).find(el => el.querySelector('h4'));
    if (slider) {
      text = slider.textContent || '';
      const sidebarEl = document.querySelector('[data-test="about-client-container"], .cfe-ui-job-about-client');
      if (sidebarEl && !slider.contains(sidebarEl)) text += '\n' + (sidebarEl.textContent || '');
    }

    // 2. Fallback: full body (popup open on a listing page, no detail slider present)
    if (!text) text = document.body.textContent || '';

    const activityBodyM = document.body.textContent.match(/activity\s+on\s+this\s+job[\s\S]{0,500}/i);
    const activityText = activityBodyM ? activityBodyM[0] : null;
    const data = extractFromText(text, activityText);

    // Also read proposals from DOM if available
    document.querySelectorAll('.ca-item').forEach(item => {
      const title = item.querySelector('.title');
      if (title && /proposals/i.test(title.textContent)) {
        const val = (item.querySelector('.value, span.value') || {}).textContent || '';
        const v = val.trim();
        if (/50\+/.test(v)) data.proposalsMid = 50;
        else {
          const rng = v.match(/(\d+)\s+to\s+(\d+)/i);
          const few = v.match(/fewer|less/i);
          const num = v.match(/\d+/);
          if (rng) data.proposalsMid = Math.round((+rng[1] + +rng[2]) / 2);
          else if (few && num) data.proposalsMid = Math.round(+num[0] / 2);
          else if (num) data.proposalsMid = +num[0];
        }
      }
    });

    const result = scoreJob(data);
    // isDetail = true when a job detail slider or full job page is open
    const isDetail = !!(
      document.querySelector('.job-details-content') ||
      document.querySelector('.job-details-card') ||
      Array.from(document.querySelectorAll('.air3-card-sections')).find(el => el.querySelector('h4')) ||
      /(?:\/jobs\/|\/details\/)~[0-9a-f]+/i.test(location.href)
    );
    sendResponse({ result, url: location.href, isDetail });
  }
  return true;
});
