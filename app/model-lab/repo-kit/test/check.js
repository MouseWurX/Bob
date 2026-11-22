// The test helper every test file uses: check(name, ok) prints PASS or FAIL and keeps count.
let pass = 0, fail = 0;
export function check(name, ok, extra = '') {
  if (ok) pass++; else fail++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ` (${extra})` : ''}`);
}
export const totals = () => ({ pass, fail });
