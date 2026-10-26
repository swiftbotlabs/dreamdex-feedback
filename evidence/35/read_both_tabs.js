// Runs in the page /trader/<address> (DevTools console or CDP Runtime.evaluate). Clicks Positions, reads it,
// clicks Balances, reads it, clicks Positions again: three reads ~0.4 s apart, so both tabs show the same moment.
(async () => {
  const tab = (n) => [...document.querySelectorAll('button[role=tab]')].find((e) => e.innerText.trim() === n);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const posBlock = () => document.body.innerText.split('PERPS · DREAMDEX')[1].split('EVENT CONTRACTS')[0];
  const pnlValues = (t) => [...t.matchAll(/^([+-]?[\d,]+\.\d+) \(/gm)].map((m) => Number(m[1].replace(/,/g, '')));
  const out = { url: location.href };
  tab('Positions').click(); await wait(400);
  out.t_positions = new Date().toISOString(); const p1 = posBlock();
  out.positions = p1.replace(/\n/g, '|'); out.positions_pnl = pnlValues(p1);
  out.positions_pnl_sum = Number(out.positions_pnl.reduce((a, b) => a + b, 0).toFixed(2));
  tab('Balances').click(); await wait(400);
  out.t_balances = new Date().toISOString();
  out.balances = document.body.innerText.split('PERPS MARGIN')[1].split('WALLET')[0].replace(/\n/g, '|');
  tab('Positions').click(); await wait(400);
  out.t_positions_again = new Date().toISOString(); const p2 = posBlock();
  out.positions_again_pnl = pnlValues(p2);
  out.positions_again_pnl_sum = Number(out.positions_again_pnl.reduce((a, b) => a + b, 0).toFixed(2));
  return out;
})()
