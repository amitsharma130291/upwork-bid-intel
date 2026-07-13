/**
 * Upwork Bid Intel — Test Suite
 * Run: node test.js
 */
const fs = require('fs');
let code = fs.readFileSync('./content.js', 'utf8');
// Strip browser-only globals
code = code
  .replace(/chrome\.runtime[\s\S]*?return true;\s*\}\);/m, '')
  .replace(/new MutationObserver[\s\S]*?\.observe\(document\.body.*?\);/m, '')
  .replace(/document\.[a-zA-Z]/g, m => '/*D*/' + m)
  .replace(/location\.href/g, '"https://www.upwork.com/nx/find-work"');
const extractFromText = eval('(' + code.match(/function extractFromText[\s\S]+?^}/m)[0] + ')');
const scoreJob       = eval('(' + code.match(/function scoreJob[\s\S]+?^}/m)[0] + ')');

let pass = 0, fail = 0;
function test(name, text, activityText, checks) {
  const d = extractFromText(text, activityText || null);
  const r = scoreJob(d);
  const failures = [];
  for (const [k, v] of Object.entries(checks)) {
    let ok = true;
    if (k === 'scoreMin')   ok = r.score >= v;
    else if (k === 'scoreMax')   ok = r.score <= v;
    else if (k === 'score')      ok = Math.abs(r.score - v) <= 5;
    else if (k === 'hasFlag')    ok = r.flags.some(f => f.text.includes(v));
    else if (k === 'hasGreen')   ok = r.green.some(g => g.text.includes(v));
    else if (k === 'noFlag')     ok = !r.flags.some(f => f.text.includes(v));
    else if (k === 'noGreen')    ok = !r.green.some(g => g.text.includes(v));
    else ok = String(d[k]) === String(v);
    if (!ok) failures.push({ k, v, got: k.startsWith('has')||k.startsWith('no') ? (k.includes('Flag')?r.flags.map(f=>f.text):r.green.map(g=>g.text)) : (k.startsWith('score')?r.score:d[k]) });
  }
  if (failures.length === 0) { console.log('  ✓', name); pass++; }
  else { console.log('  ✗', name); failures.forEach(f => console.log('      '+f.k+': expected', f.v, '| got', JSON.stringify(f.got))); fail++; }
}

// ── EXTRACTION ────────────────────────────────────────────────────────────────
console.log('\n── Extraction ──');

test('Rating: card format "verified 5.0 $400K+"',
  'Payment verified 5.0 $400K+ spent', null, { clientRating: 5 });

test('Rating: "5.00 of 38 reviews"',
  '$440K+ spent 5.00 of 38 reviews', null, { clientRating: 5 });

test('Rating: star symbol "★ 4.7"',
  '★ 4.7 Payment verified', null, { clientRating: 4.7 });

test('Rating: zero reviews should be null',
  '0.00 of 0 reviews', null, { clientRating: null });

test('Spend: $440K',
  '$440K+ spent 84 hires', null, { clientSpend: 440000 });

test('Spend: $5K+',
  '$5K+ spent', null, { clientSpend: 5000 });

test('Spend: $0 total spent (new client)',
  '$0 total spent 0 hires', null, { clientSpend: 0 });

test('Hires: "84 hires, 29 active"',
  '84 hires, 29 active', null, { clientHires: 84 });

test('Hires: "0 hires" new client',
  '$0 total spent 0 hires', null, { clientHires: 0 });

test('Hires: NOT matched from "hire rate"',
  '70% hire rate, 1 open job', null, { clientHires: null });

test('Hire rate: 0%',
  '0% hire rate, 1 open job', null, { hireRate: 0 });

test('Hire rate: 70%',
  '70% hire rate', null, { hireRate: 70 });

test('Payment: "Payment method verified"',
  'Payment method verified', null, { paymentVerified: true });

test('Payment: "Payment NOT verified"',
  'Payment method not verified', null, { paymentVerified: false });

test('Payment: "Payment unverified"',
  'Payment unverified billing', null, { paymentVerified: false });

test('Proposals: 50+ from activity section',
  'Payment verified 4.8 $50K spent',
  'Activity on this job Proposals: 50+ Interviewing: 0',
  { proposalsMid: 50 });

test('Proposals: "15 to 20"',
  'Payment verified',
  'Activity on this job Proposals: 15 to 20',
  { proposalsMid: 18 });

test('Proposals: "Fewer than 5"',
  'Payment verified',
  'Activity on this job Proposals: Fewer than 5',
  { proposalsMid: 3 });

test('Proposals: NOT matched from connects cost "proposal: 27"',
  '27 required Connects to submit a proposal: 27 Payment verified',
  'Activity on this job Proposals: 50+',
  { proposalsMid: 50 });

test('Hourly: card format "Hourly: $12-$24"',
  'Hourly: $12.00 - $24.00', null, { hourlyMid: 18 });

test('Hourly: detail page "$15.00-$30.00 Hourly"',
  '$15.00-$30.00\nHourly', null, { hourlyMid: 23 });

test('Hourly: NOT matched from "Hourly 1 open job"',
  'Hourly 1 open job', null, { hourlyMid: null });

test('Avg hourly rate paid',
  '$10.72 /hr avg hourly rate paid', null, { avgHourlyPaid: 10.72 });

test('Fixed budget: "Est. Budget: $500"',
  'Est. Budget: $500', null, { fixedBudget: 500 });

test('Fixed budget: "$30.00 Fixed-price" (modal format)',
  '$30.00 Fixed-price Intermediate', null, { fixedBudget: 30 });

test('Days posted: today',
  'Posted today', null, { daysPosted: 0 });

test('Days posted: 1 hour ago',
  'Posted 1 hour ago', null, { daysPosted: 0 });

test('Days posted: yesterday',
  'Posted yesterday', null, { daysPosted: 1 });

test('Days posted: 40 days ago',
  'Posted 40 days ago', null, { daysPosted: 40 });

// ── SCORING ───────────────────────────────────────────────────────────────────
console.log('\n── Scoring ──');

test('Great job: 5★, $440K, 84 hires, payment ok, fresh, few proposals',
  'Payment verified 5.0 $440K+ spent 84 hires Posted today',
  'Activity on this job Proposals: 5 to 10',
  { scoreMin: 80, hasGreen: "Top-rated" });

test('Brand new ghost client: $0, 0 hires, 0% hire rate',
  'Payment method verified 0.00 of 0 reviews 0% hire rate $0 total spent 0 hires Posted 1 day ago',
  'Activity on this job Proposals: 10 to 15',
  { scoreMax: 55, hasFlag: '0% hire rate — posted' });

test('0% hire rate -20 pts',
  'Payment verified 4.8 $50K+ spent 0% hire rate, 1 open job',
  'Activity on this job Proposals: 10 to 15',
  { hasFlag: '0% hire rate' });

test('50+ proposals -20 pts',
  'Payment verified 5.0 $440K+ spent 84 hires 70% hire rate Posted today',
  'Activity on this job Proposals: 50+',
  { hasFlag: 'crowded' });

test('Payment unverified -20 pts',
  'Payment method not verified 0.00 of 0 reviews Posted today',
  'Activity on this job Proposals: 10 to 15',
  { hasFlag: 'NOT verified', scoreMax: 65 });

test('Low avg paid $10/hr -20 pts',
  'Payment verified 5.0 $440K+ spent 84 hires $10.72 /hr avg hourly rate paid',
  null,
  { hasFlag: 'very low' });

test('Good avg paid $26/hr — green, no deduction',
  'Payment verified 5.0 $440K+ spent 84 hires $26.26 /hr avg hourly rate paid',
  null,
  { hasGreen: '$26', noFlag: '/hr' });

test('$30 fixed budget -25 pts',
  '$30.00 Fixed-price Payment verified 4.8 $50K spent 20 hires 70% hire rate',
  null,
  { hasFlag: 'Budget', fixedBudget: 30 });

test('Stale job 40 days -10 pts',
  'Payment verified 4.9 $100K+ spent 40 hires Posted 40 days ago',
  'Activity on this job Proposals: 10 to 15',
  { hasFlag: 'stale' });

test('Posted 21 days ago — flag',
  'Payment method verified 10 jobs posted 0% hire rate Posted 21 days ago',
  'Activity on this job Proposals: Fewer than 5',
  { hasFlag: 'Posted 21d ago', scoreMax: 65 });

// ── EDGE CASES ────────────────────────────────────────────────────────────────
console.log('\n── Edge cases ──');

test('Score never below 0',
  'Payment unverified $0 spent 0 hires 0% hire rate Posted 90 days ago $20 Fixed-price',
  'Activity on this job Proposals: 50+',
  { scoreMin: 0 });

test('Score never above 100',
  'Payment verified 5.0 $500K+ spent 200 hires 90% hire rate Posted today $5000 Fixed-price',
  'Activity on this job Proposals: Fewer than 5',
  { scoreMax: 100 });

test('Hourly not extracted from fixed-price job',
  '$500 Fixed-price Payment verified', null,
  { hourlyMid: null, fixedBudget: 500 });

// ── RESULT ────────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`  ${pass} passed  |  ${fail} failed  |  ${pass+fail} total`);
if (fail === 0) console.log('  ✅ All tests pass — ready to ship');
else console.log('  ❌ Fix failures before submitting');
process.exit(fail > 0 ? 1 : 0);
