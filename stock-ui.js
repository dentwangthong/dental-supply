// =====================================================
// stock-ui.js — หน้าจอระบบคลังวัสดุ (อยู่ในหน้า Admin เดิม)
// วางคู่กับ index.html และ gas-api.js ใน GitHub repo แล้วเพิ่มบรรทัดนี้ใน index.html
//   <script src="stock-ui.js"></script>
// (วางต่อจาก <script src="gas-api.js"></script> ได้เลย)
// สคริปต์นี้จะเพิ่มปุ่ม "คลังวัสดุ" ในเมนู Admin ให้เอง ไม่ต้องแก้ HTML อื่น
// ต้องใช้: gasCall (gas-api.js), Swal, showLoader/hideLoader (index.html เดิม)
// =====================================================
(function () {
  'use strict';

  var S = {
    tab: 'board', board: null, byId: {}, comps: null, cfg: null, units: null, orders: null,
    plan: null, db: null, openReq: undefined, hist: null,
    f: { q: '', status: 'all' }, pf: { q: '' }, of: { q: '', status: 'all' }, df: { q: '', mode: 'all' },
    d: { unitCode: '', reqRow: 0, lines: [], preview: null, note: '', info: '' },
    r: { itemId: '', orderRow: 0 }
  };
  var STK = {};
  window.STK = STK;

  // ---------- ตัวช่วย ----------
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
  }
  function nf(n, d) {
    if (n === null || n === undefined || n === '') return '-';
    return Number(n).toLocaleString('th-TH', { maximumFractionDigits: d === undefined ? 2 : d });
  }
  function p2(n) { return String(n).padStart(2, '0'); }
  function today() { var d = new Date(); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
  function fd(s) {
    if (!s) return '-';
    var m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[3] + '/' + m[2] + '/' + (Number(m[1]) + 543) : s;
  }
  function busy(on) {
    if (on) { if (typeof showLoader === 'function') showLoader(); }
    else if (typeof hideLoader === 'function') hideLoader();
  }
  function fail(msg) { return Swal.fire('ข้อผิดพลาด', msg, 'error'); }
  function toast(msg) { return Swal.fire({ icon: 'success', title: msg, timer: 1400, showConfirmButton: false }); }
  async function call(fn) {
    var args = [].slice.call(arguments, 1);
    busy(true);
    try { return await gasCall(fn, args); }
    catch (e) { busy(false); await fail(e.message || String(e)); return null; }
    finally { busy(false); }
  }
  function badge(status) {
    var cls = { 'ปกติ': 'bg-green-100 text-green-700', 'ใกล้หมด': 'bg-amber-100 text-amber-700', 'หมด': 'bg-red-100 text-red-700', 'ไม่มียอด': 'bg-gray-100 text-gray-500' }[status] || 'bg-gray-100 text-gray-600';
    return '<span class="px-2 py-0.5 rounded-full text-xs whitespace-nowrap ' + cls + '">' + esc(status) + '</span>';
  }
  var INPUT = 'w-full border rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200';
  var BTN = 'px-3 py-1.5 rounded-lg text-sm transition ';
  var TH = 'p-2 border text-left text-xs font-medium text-gray-600';

  function parseItem(v) {
    var id = String(v || '').split(' | ')[0].trim();
    return S.byId[id] || null;
  }
  function itemLabel(it) { return it.id + ' | ' + it.name; }

  // ---------- โมดัล ----------
  function modal(title, body, wide) {
    STK.close();
    var m = document.createElement('div');
    m.id = 'stkModal';
    m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9500;overflow-y:auto;padding:12px';
    m.innerHTML = '<div class="bg-white rounded-xl shadow-xl w-full ' + (wide ? 'max-w-4xl' : 'max-w-lg') + ' mx-auto mt-6 mb-6 p-5">' +
      '<div class="flex justify-between items-start mb-3"><h3 class="text-lg font-medium text-gray-700">' + title + '</h3>' +
      '<button type="button" onclick="STK.close()" class="text-gray-400 hover:text-gray-600 text-2xl leading-none" aria-label="ปิด">&times;</button></div>' +
      '<div id="stkModalBody">' + body + '</div></div>';
    document.body.appendChild(m);
  }
  STK.close = function () { var m = $('stkModal'); if (m) m.parentNode.removeChild(m); };

  // ---------- โหลดข้อมูล ----------
  async function loadBoard(force) {
    if (S.board && !force) return true;
    busy(true);
    try {
      S.board = await gasCall('stockGetBoard', []);
    } catch (e) {
      busy(false);
      if (/ไม่พบชีต/.test(e.message || '')) { renderSetup(e.message); return false; }
      await fail(e.message || String(e));
      return false;
    }
    busy(false);
    S.byId = {};
    S.board.items.forEach(function (it) { S.byId[it.id] = it; });
    var dl = $('stkItems');
    if (dl) dl.innerHTML = S.board.items.map(function (it) { return '<option value="' + esc(itemLabel(it)) + '"></option>'; }).join('');
    return true;
  }
  async function loadComps(force) {
    if (S.comps && !force) return;
    S.comps = (await call('stockGetCompanies')) || [];
    var dl = $('stkComps');
    if (dl) dl.innerHTML = S.comps.map(function (c) { return '<option value="' + esc(c) + '"></option>'; }).join('');
  }
  async function loadUnits() {
    if (S.units) return;
    var res = await call('getUnits');
    var list = [];
    var seen = {};
    Object.keys(res || {}).forEach(function (k) {
      if (!/^[0-9A-Za-z]{5}$/.test(k) || seen[k]) return;
      seen[k] = true;
      list.push({ code: k, name: res[k] });
    });
    list.sort(function (a, b) { return a.name < b.name ? -1 : 1; });
    S.units = list;
  }
  async function loadOrders(force) {
    if (S.orders && !force) return;
    S.orders = await call('stockGetOrders');
  }

  // ---------- โครงหน้า ----------
  var TABS = [['board', 'ภาพรวม', 'fa-chart-pie'], ['recv', 'รับเข้า', 'fa-box-open'], ['disp', 'จ่ายออก', 'fa-truck-ramp-box'],
    ['orders', 'ใบสั่งซื้อ', 'fa-file-invoice'], ['plan', 'แผนประจำปี', 'fa-calendar-check'], ['db', 'ฐานข้อมูลวัสดุ', 'fa-database'], ['cfg', 'ตั้งค่า', 'fa-gear']];

  function shell() {
    var root = $('stockApp');
    if (!root) return;
    var nav = TABS.map(function (t) {
      var on = S.tab === t[0];
      return '<button type="button" onclick="STK.go(\'' + t[0] + '\')" class="' + BTN + (on ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200') + '"><i class="fa-solid ' + t[2] + ' mr-1"></i>' + t[1] + '</button>';
    }).join('');
    root.innerHTML = '<div class="flex flex-wrap gap-2 mb-4">' + nav + '</div><div id="stkBody"></div>' +
      '<datalist id="stkItems"></datalist><datalist id="stkComps"></datalist>';
    var dl = $('stkItems');
    if (dl && S.board) dl.innerHTML = S.board.items.map(function (it) { return '<option value="' + esc(itemLabel(it)) + '"></option>'; }).join('');
    var dc = $('stkComps');
    if (dc && S.comps) dc.innerHTML = S.comps.map(function (c) { return '<option value="' + esc(c) + '"></option>'; }).join('');
  }
  function body(html) { var b = $('stkBody'); if (b) b.innerHTML = html; }

  STK.go = async function (tab, arg) {
    S.tab = tab;
    shell();
    body('<p class="text-gray-400 text-center py-6">กำลังโหลด...</p>');
    var ok = await loadBoard(tab === 'board' && arg === 'refresh');
    if (!ok) return;
    if (tab === 'board') renderBoard();
    else if (tab === 'recv') await renderRecv(arg);
    else if (tab === 'disp') await renderDisp(arg);
    else if (tab === 'orders') await renderOrders();
    else if (tab === 'plan') await renderPlan();
    else if (tab === 'db') await renderDb();
    else if (tab === 'cfg') await renderCfg();
  };

  function renderSetup(msg) {
    shell();
    body('<div class="border rounded-xl p-6 bg-yellow-50 text-center"><p class="mb-2 font-medium text-yellow-800">ยังไม่ได้เตรียมชีตสำหรับระบบคลัง</p>' +
      '<p class="text-sm text-gray-600 mb-4">' + esc(msg || '') + '</p>' +
      '<button type="button" onclick="STK.setup()" class="' + BTN + 'bg-blue-500 text-white hover:bg-blue-600">เตรียมชีตตอนนี้ (ทำครั้งเดียว ไม่ลบข้อมูลเดิม)</button></div>');
  }
  STK.setup = async function () {
    var r = await call('stockSetup');
    if (!r) return;
    if (!r.success) return fail(r.error);
    S.board = null;
    await Swal.fire({ icon: 'success', title: 'เตรียมชีตเรียบร้อย', html: '<div class="text-left text-sm">' + r.report.map(function (x) { return '• ' + esc(x); }).join('<br>') + '</div>' });
    STK.go('board');
  };

  // ---------- ภาพรวม (Board) ----------
  function renderBoard() {
    var b = S.board, c = b.cards;
    var cardDef = [['ทั้งหมด', c.total, 'text-gray-700', 'all'], ['ปกติ', c.ok, 'text-green-600', 'ปกติ'], ['ใกล้หมด', c.low, 'text-amber-600', 'ใกล้หมด'],
      ['หมด', c.out, 'text-red-600', 'หมด'], ['ยังไม่มียอด', c.noData, 'text-gray-400', 'ไม่มียอด']];
    var cardsHtml = cardDef.map(function (x) {
      return '<button type="button" onclick="STK.setStatus(\'' + x[3] + '\')" class="border rounded-xl p-3 bg-white text-left hover:shadow transition"><div class="text-xs text-gray-500">' + x[0] + '</div><div class="text-2xl font-semibold ' + x[2] + '">' + nf(x[1], 0) + '</div></button>';
    }).join('') +
      '<button type="button" onclick="STK.showExpiry()" class="border rounded-xl p-3 bg-white text-left hover:shadow transition"><div class="text-xs text-gray-500">ล็อตใกล้หมดอายุ</div><div class="text-2xl font-semibold text-amber-600">' + nf(c.nearLots, 0) + '</div></button>' +
      '<button type="button" onclick="STK.showExpiry()" class="border rounded-xl p-3 bg-white text-left hover:shadow transition"><div class="text-xs text-gray-500">ล็อตหมดอายุแล้ว</div><div class="text-2xl font-semibold text-red-600">' + nf(c.expiredLots, 0) + '</div></button>';

    var opts = [['all', 'ทุกสถานะ'], ['need', 'ที่ต้องดำเนินการ (หมด/ใกล้หมด/มีของหมดอายุ)'], ['ปกติ', 'ปกติ'], ['ใกล้หมด', 'ใกล้หมด'], ['หมด', 'หมด'], ['ไม่มียอด', 'ยังไม่มียอด']]
      .map(function (o) { return '<option value="' + o[0] + '"' + (S.f.status === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('');

    body('<div id="stkBanner"></div>' +
      '<div class="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 mb-4">' + cardsHtml + '</div>' +
      '<div class="flex flex-wrap gap-2 mb-3"><input id="bq" type="text" placeholder="ค้นหาชื่อ / รหัส D / CPN / P151" value="' + esc(S.f.q) + '" oninput="STK.filterBoard()" class="' + INPUT + ' md:w-80">' +
      '<select id="bs" onchange="STK.filterBoard()" class="border rounded-lg px-3 py-1.5 text-sm">' + opts + '</select>' +
      '<button type="button" onclick="STK.go(\'board\',\'refresh\')" class="' + BTN + 'bg-gray-100 hover:bg-gray-200"><i class="fa-solid fa-rotate mr-1"></i>รีเฟรช</button></div>' +
      '<div class="overflow-x-auto"><table class="w-full text-sm border-collapse"><thead class="bg-gray-100"><tr>' +
      ['รหัส', 'รายการ', 'คงเหลือ', 'หน่วย', 'min', 'สถานะ', 'หมดอายุใกล้สุด', 'สั่ง/แผน', ''].map(function (h) { return '<th class="' + TH + '">' + h + '</th>'; }).join('') +
      '</tr></thead><tbody id="bbody"></tbody></table></div><p id="bcount" class="text-xs text-gray-400 mt-2"></p>');
    drawBoardRows();
    S.openReq = undefined; // โหลดใหม่ทุกครั้ง เพราะมีใบเบิกใหม่เข้ามาได้ตลอด
    loadBanner();
  }
  STK.setStatus = function (s) { S.f.status = s; renderBoard(); };
  STK.filterBoard = function () {
    S.f.q = $('bq').value; S.f.status = $('bs').value; drawBoardRows();
  };
  function drawBoardRows() {
    var q = S.f.q.trim().toLowerCase(), st = S.f.status;
    var sev = { 'หมด': 0, 'ใกล้หมด': 1, 'ปกติ': 2, 'ไม่มียอด': 3 };
    var rows = S.board.items.filter(function (it) {
      if (q && (it.name + ' ' + it.id + ' ' + it.cpn + ' ' + it.p151).toLowerCase().indexOf(q) < 0) return false;
      if (st === 'all') return true;
      if (st === 'need') return it.status === 'หมด' || it.status === 'ใกล้หมด' || it.expQty > 0 || it.nearQty > 0;
      return it.status === st;
    }).sort(function (a, b) { return (sev[a.status] - sev[b.status]) || (a.name < b.name ? -1 : 1); });
    var html = rows.map(function (it) {
      var plan = it.planQty === null ? '-' : '<span class="' + (it.ordered > it.planQty ? 'text-red-600 font-medium' : '') + '">' + nf(it.ordered) + ' / ' + nf(it.planQty) + '</span>';
      return '<tr class="border-t hover:bg-gray-50"><td class="p-2 text-xs text-gray-500 whitespace-nowrap">' + esc(it.id) + '</td>' +
        '<td class="p-2">' + esc(it.name) + '<div class="text-[11px] text-gray-400">' + esc(it.p151 || 'ไม่มี P151') + ' · ' + esc(it.cpn) + '</div></td>' +
        '<td class="p-2 text-right whitespace-nowrap font-medium">' + nf(it.usable) +
        (it.expQty > 0 ? '<div class="text-[11px] text-red-500 font-normal">หมดอายุแล้ว ' + nf(it.expQty) + '</div>' : '') + '</td>' +
        '<td class="p-2 text-xs text-gray-500 whitespace-nowrap">' + esc(it.unit || '-') + '</td>' +
        '<td class="p-2 text-right">' + nf(it.min) + '</td><td class="p-2">' + badge(it.status) + '</td>' +
        '<td class="p-2 text-xs whitespace-nowrap">' + fd(it.nearest) + '</td><td class="p-2 text-xs whitespace-nowrap">' + plan + '</td>' +
        '<td class="p-2 text-right whitespace-nowrap"><button type="button" onclick="STK.detail(\'' + it.id + '\')" class="text-blue-600 text-xs underline mr-2">รายละเอียด</button>' +
        '<button type="button" onclick="STK.go(\'recv\',\'' + it.id + '\')" class="text-green-600 text-xs underline mr-2">รับ</button>' +
        '<button type="button" onclick="STK.go(\'disp\',{item:\'' + it.id + '\'})" class="text-amber-600 text-xs underline">จ่าย</button></td></tr>';
    }).join('');
    $('bbody').innerHTML = html || '<tr><td colspan="9" class="p-4 text-center text-gray-400">ไม่พบรายการ</td></tr>';
    $('bcount').textContent = 'แสดง ' + rows.length + ' จาก ' + S.board.items.length + ' รายการ';
  }
  async function loadBanner() {
    try {
      if (S.openReq === undefined) S.openReq = await gasCall('stockGetOpenRequisitions', []);
    } catch (e) { S.openReq = null; }
    var el = $('stkBanner');
    if (!el || !S.openReq) return;
    var n = S.openReq.filter(function (r) { return r.shouldCut; }).length;
    if (n > 0) el.innerHTML = '<div class="mb-3 p-3 rounded-lg bg-yellow-50 border border-yellow-200 text-sm text-yellow-800 flex flex-wrap items-center justify-between gap-2"><span><i class="fa-solid fa-triangle-exclamation mr-1"></i>มีใบเบิกที่จัดของแล้วแต่ยังไม่ตัดสต็อก ' + n + ' รายการ</span><button type="button" onclick="STK.go(\'disp\')" class="' + BTN + 'bg-yellow-500 text-white hover:bg-yellow-600">ไปตัดสต็อก</button></div>';
  }
  STK.showExpiry = function () {
    var rows = S.board.expLots;
    if (!rows.length) return Swal.fire('ไม่มีล็อตที่ใกล้หมดอายุหรือหมดอายุ', '', 'info');
    var h = '<div class="overflow-x-auto"><table class="w-full text-sm border-collapse"><thead class="bg-gray-100"><tr>' + ['รายการ', 'ล็อต', 'ยี่ห้อ', 'หมดอายุ', 'เหลือ', 'สถานะ'].map(function (x) { return '<th class="' + TH + '">' + x + '</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.map(function (l) {
        return '<tr class="border-t"><td class="p-2">' + esc(l.name) + '</td><td class="p-2">' + esc(l.lotNo || '-') + '</td><td class="p-2">' + esc(l.brand || '-') + '</td><td class="p-2">' + fd(l.expiry) + '</td><td class="p-2 text-right">' + nf(l.bal) + '</td><td class="p-2 ' + (l.days < 0 ? 'text-red-600' : 'text-amber-600') + '">' + (l.days < 0 ? 'เลยมา ' + (-l.days) + ' วัน' : 'อีก ' + l.days + ' วัน') + '</td></tr>';
      }).join('') + '</tbody></table></div>';
    modal('ล็อตที่หมดอายุ / ใกล้หมดอายุ', h, true);
  };

  STK.detail = async function (id) {
    var r = await call('stockGetItemDetail', id);
    if (!r) return;
    var it = r.item;
    var lots = r.lots.length ? r.lots.map(function (l) {
      var exp = l.days === null ? '-' : fd(l.expiry) + ' <span class="' + (l.days < 0 ? 'text-red-600' : (l.days <= Number(S.board.cfg.EXPIRY_DAYS) ? 'text-amber-600' : 'text-gray-400')) + ' text-xs">(' + (l.days < 0 ? 'หมดอายุแล้ว' : 'อีก ' + l.days + ' วัน') + ')</span>';
      return '<tr class="border-t"><td class="p-2 text-xs">' + esc(l.id) + '</td><td class="p-2">' + esc(l.lotNo || '-') + '</td><td class="p-2">' + esc(l.brand || '-') + '<div class="text-[11px] text-gray-400">' + esc(l.company) + '</div></td><td class="p-2 whitespace-nowrap">' + exp + '</td>' +
        '<td class="p-2 text-right font-medium">' + nf(l.bal) + '</td><td class="p-2 text-right">' + nf(l.price) + '</td>' +
        '<td class="p-2"><button type="button" onclick="STK.adjust(\'' + it.id + '\',\'' + l.id + '\')" class="text-xs text-blue-600 underline">ปรับยอด</button></td></tr>';
    }).join('') : '<tr><td colspan="7" class="p-3 text-center text-gray-400">ยังไม่มีล็อต</td></tr>';
    var hist = r.history.length ? r.history.map(function (h) {
      return '<tr class="border-t"><td class="p-2 text-xs whitespace-nowrap">' + esc(h.time) + '</td><td class="p-2">' + esc(h.type) + '</td><td class="p-2 text-xs">' + esc(h.lotId) + '</td><td class="p-2 text-right ' + (h.qty < 0 ? 'text-red-600' : 'text-green-600') + '">' + (h.qty > 0 ? '+' : '') + nf(h.qty) + '</td><td class="p-2 text-xs">' + esc(h.unit) + '</td><td class="p-2 text-xs">' + esc(h.note) + '</td></tr>';
    }).join('') : '<tr><td colspan="6" class="p-3 text-center text-gray-400">ยังไม่มีประวัติ</td></tr>';
    var planTxt = r.plan ? 'แผนปี ' + esc(S.board.cfg.FY) + ': ซื้อ ' + nf(r.plan.qty) + ' ' + esc(r.plan.unit) + ' · สั่งแล้ว ' + nf(r.ordered) : 'ไม่มีในแผน/ไม่มีรหัส P151';
    modal(esc(it.name),
      '<div class="text-sm text-gray-500 mb-3">' + esc(it.id) + ' · CPN ' + esc(it.cpn || '-') + ' · ' + esc(it.p151 || 'ไม่มี P151') + ' · หน่วย ' + esc(it.unit || '-') + ' · min ' + nf(it.min) + ' · rate/เดือน ' + nf(it.rate) + '<br>' + planTxt + '</div>' +
      '<div class="flex gap-2 mb-3"><button type="button" onclick="STK.close();STK.go(\'recv\',\'' + it.id + '\')" class="' + BTN + 'bg-green-500 text-white hover:bg-green-600">รับเข้า</button>' +
      '<button type="button" onclick="STK.close();STK.go(\'disp\',{item:\'' + it.id + '\'})" class="' + BTN + 'bg-amber-500 text-white hover:bg-amber-600">จ่ายออก</button></div>' +
      '<h4 class="font-medium text-sm mb-1">ล็อตคงเหลือ (จ่ายตามหมดอายุก่อน)</h4><div class="overflow-x-auto mb-4"><table class="w-full text-sm border-collapse"><thead class="bg-gray-100"><tr>' + ['ล็อต', 'เลขล็อต', 'ยี่ห้อ/บริษัท', 'หมดอายุ', 'เหลือ', 'ราคา', ''].map(function (x) { return '<th class="' + TH + '">' + x + '</th>'; }).join('') + '</tr></thead><tbody>' + lots + '</tbody></table></div>' +
      '<h4 class="font-medium text-sm mb-1">ประวัติล่าสุด</h4><div class="overflow-x-auto"><table class="w-full text-sm border-collapse"><thead class="bg-gray-100"><tr>' + ['เวลา', 'ประเภท', 'ล็อต', 'จำนวน', 'หน่วยบริการ', 'หมายเหตุ'].map(function (x) { return '<th class="' + TH + '">' + x + '</th>'; }).join('') + '</tr></thead><tbody>' + hist + '</tbody></table></div>', true);
  };

  STK.adjust = async function (itemId, lotId) {
    var res = await Swal.fire({
      title: 'ปรับยอดล็อต ' + lotId,
      html: '<input id="adjD" type="number" step="any" class="swal2-input" placeholder="จำนวนที่ปรับ (+ เพิ่ม / - ลด)"><input id="adjN" type="text" class="swal2-input" placeholder="เหตุผล เช่น แตกหัก นับสต็อกพบต่าง">',
      showCancelButton: true, confirmButtonText: 'บันทึก', cancelButtonText: 'ยกเลิก',
      preConfirm: function () {
        var d = Number($('adjD').value), n = $('adjN').value.trim();
        if (!d) { Swal.showValidationMessage('ใส่จำนวนที่ปรับ'); return false; }
        if (!n) { Swal.showValidationMessage('ใส่เหตุผล'); return false; }
        return { delta: d, note: n };
      }
    });
    if (!res.isConfirmed) return;
    var r = await call('stockAdjust', { itemId: itemId, lotId: lotId, delta: res.value.delta, note: res.value.note });
    if (!r) return;
    if (!r.success) return fail(r.error);
    S.board = null;
    await toast('ปรับยอดแล้ว');
    await loadBoard(true);
    STK.detail(itemId);
  };

  // ---------- รับเข้า ----------
  async function renderRecv(prefill) {
    await Promise.all([loadComps(), loadOrders()]);
    var pre = typeof prefill === 'object' && prefill ? prefill : { item: prefill };
    S.r.itemId = pre.item || ''; S.r.orderRow = pre.order || 0;
    var it = S.byId[S.r.itemId];
    body('<div class="max-w-2xl"><h3 class="text-lg font-medium mb-3"><i class="fa-solid fa-box-open text-green-500 mr-2"></i>รับวัสดุเข้าคลัง</h3>' +
      '<div class="grid grid-cols-1 md:grid-cols-2 gap-3">' +
      '<div class="md:col-span-2"><label class="text-xs text-gray-500">วัสดุ (พิมพ์ค้นหาแล้วเลือกจากรายการ)</label><input id="rItem" list="stkItems" value="' + esc(it ? itemLabel(it) : '') + '" onchange="STK.recvPick()" class="' + INPUT + '" placeholder="พิมพ์ชื่อหรือรหัส"><div id="rInfo" class="text-xs text-gray-500 mt-1"></div></div>' +
      '<div><label class="text-xs text-gray-500">ประเภทรายการ</label><select id="rKind" class="' + INPUT + '"><option>รับเข้า</option><option>ยอดยกมา</option></select></div>' +
      '<div><label class="text-xs text-gray-500">รับจากใบสั่งซื้อ (ถ้ามี)</label><select id="rOrder" onchange="STK.recvOrder()" class="' + INPUT + '"><option value="">ไม่ผูกใบสั่ง</option></select></div>' +
      '<div><label class="text-xs text-gray-500">บริษัท</label><input id="rCompany" list="stkComps" class="' + INPUT + '"></div>' +
      '<div><label class="text-xs text-gray-500">ยี่ห้อ</label><input id="rBrand" class="' + INPUT + '"></div>' +
      '<div><label class="text-xs text-gray-500">เลขล็อต</label><input id="rLot" class="' + INPUT + '"></div>' +
      '<div><label class="text-xs text-gray-500">วันหมดอายุ (เว้นว่างได้ถ้าไม่มี)</label><input id="rExp" type="date" class="' + INPUT + '"></div>' +
      '<div><label class="text-xs text-gray-500">จำนวนที่รับ</label><input id="rQty" type="number" min="0" step="any" class="' + INPUT + '"></div>' +
      '<div><label class="text-xs text-gray-500">ราคา/หน่วย (บาท)</label><input id="rPrice" type="number" min="0" step="any" class="' + INPUT + '"></div>' +
      '<div><label class="text-xs text-gray-500">วันที่รับ</label><input id="rDate" type="date" value="' + today() + '" class="' + INPUT + '"></div>' +
      '<div><label class="text-xs text-gray-500">หมายเหตุ</label><input id="rNote" class="' + INPUT + '"></div></div>' +
      '<button type="button" id="rBtn" onclick="STK.recvSave()" class="mt-4 ' + BTN + 'bg-green-500 text-white hover:bg-green-600"><i class="fa-solid fa-check mr-1"></i>บันทึกรับเข้า</button>' +
      '<div id="rDone" class="mt-3 text-sm"></div></div>');
    if (it) STK.recvPick(pre.order);
  }
  STK.recvPick = function (orderRow) {
    var it = parseItem($('rItem').value);
    S.r.itemId = it ? it.id : '';
    $('rInfo').innerHTML = it ? 'หน่วย: <b>' + esc(it.unit || '-') + '</b> · คงเหลือใช้ได้ ' + nf(it.usable) + ' · ' + badge(it.status) : '<span class="text-red-500">ยังไม่ได้เลือกวัสดุ</span>';
    var sel = $('rOrder');
    var list = it && it.p151 && S.orders ? S.orders.orders.filter(function (o) { return o.p151 === it.p151 && ['ตรวจรับแล้ว'].indexOf(o.status) < 0; }) : [];
    sel.innerHTML = '<option value="">ไม่ผูกใบสั่ง</option>' + list.map(function (o) {
      return '<option value="' + o.row + '"' + (Number(orderRow) === o.row ? ' selected' : '') + '>แถว ' + o.row + ' · ' + esc(o.company) + ' · ' + nf(o.qty) + ' ' + esc(o.unit) + ' · ' + esc(o.status) + '</option>';
    }).join('');
    if (orderRow) STK.recvOrder();
    if (it && !$('rPrice').value && it.planPrice) $('rPrice').value = it.planPrice;
  };
  STK.recvOrder = function () {
    var row = Number($('rOrder').value);
    var o = S.orders && S.orders.orders.filter(function (x) { return x.row === row; })[0];
    if (!o) return;
    if (o.company) $('rCompany').value = o.company;
    if (o.price) $('rPrice').value = o.price;
    if (o.qty && !$('rQty').value) $('rQty').value = o.qty;
  };
  STK.recvSave = async function () {
    var it = parseItem($('rItem').value);
    if (!it) return fail('กรุณาเลือกวัสดุจากรายการ');
    var qty = Number($('rQty').value);
    if (!(qty > 0)) return fail('ใส่จำนวนที่รับ (มากกว่า 0)');
    if (!$('rExp').value) {
      var c = await Swal.fire({ title: 'ไม่ได้ใส่วันหมดอายุ', text: 'ล็อตนี้จะถูกจ่ายหลังสุดและไม่ถูกแจ้งเตือนหมดอายุ ต้องการบันทึกต่อหรือไม่', icon: 'question', showCancelButton: true, confirmButtonText: 'บันทึกต่อ', cancelButtonText: 'กลับไปใส่' });
      if (!c.isConfirmed) return;
    }
    $('rBtn').disabled = true;
    var r = await call('stockReceive', { itemId: it.id, kind: $('rKind').value, company: $('rCompany').value, brand: $('rBrand').value, lotNo: $('rLot').value,
      expiry: $('rExp').value, received: $('rDate').value, qty: qty, price: $('rPrice').value, orderRow: $('rOrder').value, note: $('rNote').value });
    if ($('rBtn')) $('rBtn').disabled = false;
    if (!r) return;
    if (!r.success) return fail(r.error);
    S.board = null; S.orders = null;
    await loadBoard(true);
    await loadOrders(true);
    await toast('บันทึกรับเข้าแล้ว');
    ['rQty', 'rLot', 'rExp', 'rBrand', 'rNote'].forEach(function (id) { if ($(id)) $(id).value = ''; });
    STK.recvPick();
    if ($('rDone')) $('rDone').innerHTML = '<span class="text-green-700">✓ ' + esc(it.name) + ' คงเหลือรวม ' + nf(r.balance) + ' ' + esc(r.unit || '') + ' (ล็อต ' + esc(r.lotId) + ')</span>';
  };

  // ---------- จ่ายออก ----------
  async function renderDisp(pre) {
    await Promise.all([loadUnits(), loadHist(true), loadOpenReq(true)]);
    S.d = { unitCode: S.d.unitCode || '', reqRow: 0, lines: [], preview: null, note: '', info: '' };
    pre = pre || {};
    if (pre.item) S.d.lines = [{ itemId: pre.item, qty: '' }];
    drawDisp();
    if (pre.req) { $('dReq').value = String(pre.req); await STK.dispReq(); }
  }
  async function loadHist() { S.hist = (await call('stockGetDispenseHistory')) || []; }
  async function loadOpenReq() { S.openReq = await call('stockGetOpenRequisitions'); }

  function drawDisp() {
    var hosp = S.board.cfg.HOSPITAL_CODE;
    var unitOpts = '<option value="">— เลือกหน่วยบริการ —</option>' + (S.units || []).map(function (u) {
      return '<option value="' + esc(u.code) + '"' + (S.d.unitCode === u.code ? ' selected' : '') + '>' + esc(u.name) + (u.code === hosp ? ' (ใช้ภายใน รพ.)' : '') + ' [' + esc(u.code) + ']</option>';
    }).join('');
    var reqs = (S.openReq || []).slice().sort(function (a, b) { return (b.shouldCut - a.shouldCut) || (b.row - a.row); });
    var reqOpts = '<option value="">— ไม่ผูกใบเบิก (จ่ายเอง/จ่ายภายใน) —</option>' + reqs.map(function (r) {
      return '<option value="' + r.row + '"' + (S.d.reqRow === r.row ? ' selected' : '') + '>' + (r.shouldCut ? '★ ' : '') + 'แถว ' + r.row + ' · ' + esc(r.unitName) + ' · ' + esc(r.date) + ' · ' + esc(r.status) + (r.hasItems ? '' : ' (ไฟล์ Excel)') + '</option>';
    }).join('');
    var histRows = (S.hist || []).map(function (h) {
      return '<tr class="border-t ' + (h.reversed ? 'text-gray-400 line-through' : '') + '"><td class="p-2 text-xs whitespace-nowrap">' + esc(h.time) + '</td><td class="p-2 text-xs">' + esc(h.kind) + '</td><td class="p-2">' + esc(h.unitName) + '</td><td class="p-2 text-xs">' + h.lines.map(function (l) { return esc(l.name) + ' x' + nf(l.qty); }).join('<br>') + '</td>' +
        '<td class="p-2">' + (h.reversed ? '<span class="text-xs">ยกเลิกแล้ว</span>' : '<button type="button" onclick="STK.reverse(\'' + esc(h.batch) + '\')" class="text-xs text-red-600 underline">ยกเลิก (คืนยอด)</button>') + '</td></tr>';
    }).join('') || '<tr><td colspan="5" class="p-3 text-center text-gray-400">ยังไม่มีประวัติการจ่าย</td></tr>';

    body('<div class="max-w-4xl"><h3 class="text-lg font-medium mb-3"><i class="fa-solid fa-truck-ramp-box text-amber-500 mr-2"></i>จ่ายวัสดุออกจากคลัง</h3>' +
      '<div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">' +
      '<div><label class="text-xs text-gray-500">ใบเบิกที่รอตัดสต็อก (★ = จัดของแล้ว)</label><select id="dReq" onchange="STK.dispReq()" class="' + INPUT + '">' + reqOpts + '</select></div>' +
      '<div><label class="text-xs text-gray-500">หน่วยบริการที่รับ</label><select id="dUnit" class="' + INPUT + '">' + unitOpts + '</select></div></div>' +
      '<div id="dInfo" class="text-sm mb-2">' + S.d.info + '</div>' +
      '<table class="w-full text-sm border-collapse mb-2"><thead class="bg-gray-100"><tr><th class="' + TH + '">วัสดุ</th><th class="' + TH + '" style="width:110px">จำนวนจ่ายจริง</th><th class="' + TH + '" style="width:40px"></th></tr></thead><tbody id="dLines"></tbody></table>' +
      '<div class="flex flex-wrap gap-2 mb-3"><button type="button" onclick="STK.addLine()" class="' + BTN + 'bg-gray-100 hover:bg-gray-200"><i class="fa-solid fa-plus mr-1"></i>เพิ่มรายการ</button>' +
      '<button type="button" onclick="STK.previewDisp()" class="' + BTN + 'bg-blue-100 text-blue-700 hover:bg-blue-200">ดูแผนตัดล็อต</button>' +
      '<button type="button" id="dBtn" onclick="STK.doDispense()" class="' + BTN + 'bg-amber-500 text-white hover:bg-amber-600"><i class="fa-solid fa-check mr-1"></i>ยืนยันตัดสต็อก</button></div>' +
      '<input id="dNote" placeholder="หมายเหตุ (ถ้ามี)" value="' + esc(S.d.note) + '" class="' + INPUT + ' mb-3">' +
      '<div id="dPreview" class="mb-6"></div>' +
      '<h4 class="font-medium text-sm mb-1">ประวัติการจ่ายล่าสุด</h4><div class="overflow-x-auto"><table class="w-full text-sm border-collapse"><thead class="bg-gray-100"><tr>' + ['เวลา', 'ประเภท', 'หน่วยบริการ', 'รายการ', ''].map(function (x) { return '<th class="' + TH + '">' + x + '</th>'; }).join('') + '</tr></thead><tbody>' + histRows + '</tbody></table></div></div>');
    drawLines();
  }
  function drawLines() {
    if (!S.d.lines.length) S.d.lines = [{ itemId: '', qty: '' }];
    $('dLines').innerHTML = S.d.lines.map(function (l, i) {
      var it = S.byId[l.itemId];
      return '<tr class="border-t dl"><td class="p-1"><input class="dl-item ' + INPUT + '" list="stkItems" value="' + esc(it ? itemLabel(it) : '') + '" placeholder="พิมพ์ชื่อหรือรหัสวัสดุ">' +
        (it ? '<div class="text-[11px] text-gray-400">ใช้ได้ ' + nf(it.usable) + ' ' + esc(it.unit) + '</div>' : '') + '</td>' +
        '<td class="p-1"><input class="dl-qty ' + INPUT + '" type="number" min="0" step="any" value="' + esc(l.qty) + '"></td>' +
        '<td class="p-1 text-center"><button type="button" onclick="STK.delLine(' + i + ')" class="text-red-500" aria-label="ลบรายการ"><i class="fa-solid fa-xmark"></i></button></td></tr>';
    }).join('');
  }
  function syncLines() {
    var rows = document.querySelectorAll('#dLines tr.dl');
    var out = [];
    rows.forEach(function (tr) {
      var it = parseItem(tr.querySelector('.dl-item').value);
      out.push({ itemId: it ? it.id : '', qty: tr.querySelector('.dl-qty').value, raw: tr.querySelector('.dl-item').value });
    });
    S.d.lines = out;
    S.d.unitCode = $('dUnit').value;
    S.d.note = $('dNote').value;
  }
  STK.addLine = function () { syncLines(); S.d.lines.push({ itemId: '', qty: '' }); drawLines(); };
  STK.delLine = function (i) { syncLines(); S.d.lines.splice(i, 1); drawLines(); };

  STK.dispReq = async function () {
    var row = Number($('dReq').value);
    S.d.reqRow = row;
    if (!row) { S.d.info = ''; S.d.lines = []; S.d.preview = null; drawDisp(); return; }
    var r = await call('stockGetRequisitionLines', row);
    if (!r) return;
    S.d.unitCode = r.unitCode;
    S.d.lines = r.lines.map(function (l) { return { itemId: l.itemId, qty: l.qty }; });
    var info = '<div class="p-2 rounded-lg bg-blue-50 text-blue-800">ใบเบิกแถว ' + row + ' · ' + esc(r.unitName) + ' · สถานะ ' + esc(r.status) + '</div>';
    if (!r.hasItems) info += '<div class="p-2 mt-1 rounded-lg bg-yellow-50 text-yellow-800">ใบเบิกนี้ส่งด้วยไฟล์ Excel ระบบอ่านรายการให้ไม่ได้ ' + (r.file ? '<a href="' + esc(r.file) + '" target="_blank" rel="noopener" class="underline">เปิดไฟล์</a> แล้ว' : '') + 'กรอกรายการที่จ่ายจริงด้านล่าง</div>';
    if (r.unmapped.length) info += '<div class="p-2 mt-1 rounded-lg bg-red-50 text-red-700">ไม่พบรหัส CPN ในฐานข้อมูล (ไม่ถูกตัดสต็อก): ' + r.unmapped.map(function (u) { return esc(u.cpn + ' ' + u.name + ' x' + u.qty); }).join(', ') + '</div>';
    S.d.info = info;
    S.d.preview = r.preview;
    drawDisp();
    renderPreview(r.preview);
  };

  function renderPreview(plan) {
    var el = $('dPreview');
    if (!el || !plan) return;
    if (!plan.length) { el.innerHTML = ''; return; }
    el.innerHTML = '<div class="border rounded-lg p-3 bg-gray-50"><div class="font-medium text-sm mb-2">แผนตัดสต็อก (หมดอายุก่อนจ่ายก่อน)</div>' + plan.map(function (x) {
      var al = x.allocs.map(function (a) { return '<div class="text-xs text-gray-600 ml-3">ล็อต ' + esc(a.lotNo || '-') + (a.brand ? ' (' + esc(a.brand) + ')' : '') + ' · หมดอายุ ' + fd(a.expiry) + ' · ตัด <b>' + nf(a.qty) + '</b></div>'; }).join('');
      var warn = x.short > 0 ? '<div class="text-xs text-red-600 ml-3">ขาด ' + nf(x.short) + ' (สต็อกที่ใช้ได้ไม่พอ' + (x.expiredBal > 0 ? ' · มีของหมดอายุแล้ว ' + nf(x.expiredBal) + ' ที่ไม่ถูกจ่าย' : '') + ')</div>' : '';
      return '<div class="mb-2"><div class="text-sm">' + esc(x.name) + ' <b>x' + nf(x.qty) + '</b> ' + esc(x.unit) + '</div>' + al + warn + '</div>';
    }).join('') + '</div>';
  }

  function collectDispense() {
    syncLines();
    if (!S.d.unitCode) { fail('เลือกหน่วยบริการที่รับของ'); return null; }
    var lines = [], bad = '';
    S.d.lines.forEach(function (l) {
      var q = Number(l.qty);
      if (!l.itemId && !l.raw && !q) return;
      if (!l.itemId) { bad = 'เลือกวัสดุจากรายการให้ถูกต้อง: ' + (l.raw || '(ว่าง)'); return; }
      if (!(q > 0)) { bad = 'ใส่จำนวนมากกว่า 0 ให้ครบทุกรายการ'; return; }
      lines.push({ itemId: l.itemId, qty: q });
    });
    if (bad) { fail(bad); return null; }
    if (!lines.length) { fail('ยังไม่มีรายการจ่าย'); return null; }
    return lines;
  }
  STK.previewDisp = async function () {
    var lines = collectDispense();
    if (!lines) return;
    var plan = await call('stockPreviewDispense', lines);
    if (plan) renderPreview(plan);
  };
  STK.doDispense = async function () {
    var lines = collectDispense();
    if (!lines) return;
    $('dBtn').disabled = true;
    var payload = { unitCode: S.d.unitCode, lines: lines, reqRow: S.d.reqRow || 0, note: S.d.note };
    var r = await call('stockDispense', payload);
    if ($('dBtn')) $('dBtn').disabled = false;
    if (!r) return;
    if (!r.success && r.needPartial) {
      renderPreview(r.plan);
      var short = r.plan.filter(function (x) { return x.short > 0; }).map(function (x) { return esc(x.name) + ' ขาด ' + nf(x.short); }).join('<br>');
      var c = await Swal.fire({ icon: 'warning', title: 'สต็อกไม่พอ', html: '<div class="text-left text-sm">' + short + '</div><p class="mt-2 text-sm">ต้องการตัดเท่าที่มีหรือไม่</p>', showCancelButton: true, confirmButtonText: 'ตัดเท่าที่มี', cancelButtonText: 'ยกเลิก' });
      if (!c.isConfirmed) return;
      payload.allowPartial = true;
      r = await call('stockDispense', payload);
      if (!r) return;
    }
    if (!r.success) return fail(r.error);
    S.board = null; S.openReq = undefined;
    await toast('ตัดสต็อกแล้ว');
    S.d = { unitCode: '', reqRow: 0, lines: [], preview: null, note: '', info: '' };
    await loadBoard(true);
    STK.go('disp');
  };
  STK.reverse = async function (batch) {
    var c = await Swal.fire({ title: 'ยกเลิกการจ่ายชุดนี้?', text: 'ระบบจะคืนยอดเข้าล็อตเดิมทั้งหมด และเปิดให้ตัดสต็อกใบเบิกนั้นใหม่ได้', icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: 'ยกเลิกการจ่าย', cancelButtonText: 'กลับ' });
    if (!c.isConfirmed) return;
    var r = await call('stockReverseBatch', batch);
    if (!r) return;
    if (!r.success) return fail(r.error);
    S.board = null; S.openReq = undefined;
    await toast('คืนยอดแล้ว');
    await loadBoard(true);
    STK.go('disp');
  };
  STK.openDispenseForReq = function (row) {
    var dash = $('adminDashboard');
    if (dash) { var t = $('adminTableContainer'); if (t) t.classList.add('hidden'); var s = $('stockApp'); if (s) s.classList.remove('hidden'); }
    S.openReq = undefined;
    STK.go('disp', { req: row });
  };

  // ---------- ใบสั่งซื้อ (HosStock) ----------
  async function renderOrders() {
    await loadOrders(true);
    var st = ['all'].concat(S.orders.statuses);
    body('<div class="flex flex-wrap gap-2 mb-3"><input id="oq" placeholder="ค้นหารายการ / บริษัท" value="' + esc(S.of.q) + '" oninput="STK.filterOrders()" class="' + INPUT + ' md:w-72">' +
      '<select id="os" onchange="STK.filterOrders()" class="border rounded-lg px-3 py-1.5 text-sm">' + st.map(function (s) { return '<option value="' + esc(s) + '"' + (S.of.status === s ? ' selected' : '') + '>' + (s === 'all' ? 'ทุกสถานะ' : esc(s)) + '</option>'; }).join('') + '</select>' +
      '<button type="button" onclick="STK.orderForm(0)" class="' + BTN + 'bg-blue-500 text-white hover:bg-blue-600"><i class="fa-solid fa-plus mr-1"></i>เพิ่มใบสั่ง</button></div>' +
      '<p class="text-xs text-gray-500 mb-2">ปีงบ ' + esc(S.orders.fy) + ' · นับยอดสั่งเทียบแผนตั้งแต่สถานะ "สั่งสินค้าแล้ว" เป็นต้นไป (ใบเสนอราคาไม่นับ)</p>' +
      '<div class="overflow-x-auto"><table class="w-full text-sm border-collapse"><thead class="bg-gray-100"><tr>' + ['แถว', 'วันที่สั่ง', 'รายการ', 'บริษัท', 'จำนวน', 'ราคา', 'สถานะ', ''].map(function (h) { return '<th class="' + TH + '">' + h + '</th>'; }).join('') + '</tr></thead><tbody id="obody"></tbody></table></div>');
    drawOrders();
  }
  STK.filterOrders = function () { S.of.q = $('oq').value; S.of.status = $('os').value; drawOrders(); };
  function drawOrders() {
    var q = S.of.q.trim().toLowerCase();
    var rows = S.orders.orders.filter(function (o) {
      if (S.of.status !== 'all' && o.status !== S.of.status) return false;
      return !q || (o.name + ' ' + o.company + ' ' + o.p151).toLowerCase().indexOf(q) >= 0;
    });
    $('obody').innerHTML = rows.map(function (o) {
      var cls = o.status === 'ตรวจรับแล้ว' || o.status === 'ได้รับสินค้าแล้ว' ? 'bg-green-100 text-green-700' : (o.status === 'ได้รับใบเสนอราคาแล้ว' ? 'bg-gray-100 text-gray-600' : 'bg-blue-100 text-blue-700');
      var it = null;
      S.board.items.forEach(function (x) { if (x.p151 && x.p151 === o.p151) it = x; });
      return '<tr class="border-t hover:bg-gray-50"><td class="p-2 text-xs">' + o.row + '</td><td class="p-2 text-xs whitespace-nowrap">' + fd(o.ordered) + '</td><td class="p-2">' + esc(o.name) + '<div class="text-[11px] text-gray-400">' + esc(o.p151) + '</div></td><td class="p-2">' + esc(o.company) + '</td>' +
        '<td class="p-2 text-right whitespace-nowrap">' + nf(o.qty) + ' ' + esc(o.unit) + '</td><td class="p-2 text-right">' + nf(o.price) + '</td><td class="p-2"><span class="px-2 py-0.5 rounded-full text-xs whitespace-nowrap ' + cls + '">' + esc(o.status) + '</span></td>' +
        '<td class="p-2 whitespace-nowrap"><button type="button" onclick="STK.orderForm(' + o.row + ')" class="text-xs text-blue-600 underline mr-2">แก้ไข</button>' +
        (it ? '<button type="button" onclick="STK.go(\'recv\',{item:\'' + it.id + '\',order:' + o.row + '})" class="text-xs text-green-600 underline mr-2">รับของ</button>' : '') +
        '<button type="button" onclick="STK.delOrder(' + o.row + ')" class="text-xs text-red-500 underline">ลบ</button></td></tr>';
    }).join('') || '<tr><td colspan="8" class="p-4 text-center text-gray-400">ไม่พบใบสั่ง</td></tr>';
  }
  STK.orderForm = async function (row) {
    await loadComps();
    var o = row ? S.orders.orders.filter(function (x) { return x.row === row; })[0] : null;
    var it = null;
    if (o) S.board.items.forEach(function (x) { if (x.p151 === o.p151 && o.p151) it = x; });
    var stOpts = S.orders.statuses.map(function (s) { return '<option' + ((o ? o.status : 'สั่งสินค้าแล้ว') === s ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('');
    modal(row ? 'แก้ไขใบสั่งซื้อ (แถว ' + row + ')' : 'เพิ่มใบสั่งซื้อ',
      '<div class="grid grid-cols-1 md:grid-cols-2 gap-3">' +
      '<div class="md:col-span-2"><label class="text-xs text-gray-500">วัสดุ</label><input id="oItem" list="stkItems" value="' + esc(it ? itemLabel(it) : '') + '" onchange="STK.orderCheck(' + row + ',true)" class="' + INPUT + '"></div>' +
      '<div><label class="text-xs text-gray-500">บริษัท</label><input id="oCompany" list="stkComps" value="' + esc(o ? o.company : '') + '" class="' + INPUT + '"></div>' +
      '<div><label class="text-xs text-gray-500">สถานะ</label><select id="oStatus" onchange="STK.orderCheck(' + row + ')" class="' + INPUT + '">' + stOpts + '</select></div>' +
      '<div><label class="text-xs text-gray-500">จำนวนสั่ง</label><input id="oQty" type="number" min="0" step="any" value="' + esc(o ? o.qty : '') + '" oninput="STK.orderCheck(' + row + ')" class="' + INPUT + '"></div>' +
      '<div><label class="text-xs text-gray-500">ราคา/หน่วย (บาท)</label><input id="oPrice" type="number" min="0" step="any" value="' + esc(o ? o.price : '') + '" class="' + INPUT + '"></div>' +
      '<div><label class="text-xs text-gray-500">วันที่แจ้ง</label><input id="oNotified" type="date" value="' + esc(o ? o.notified : today()) + '" class="' + INPUT + '"></div>' +
      '<div><label class="text-xs text-gray-500">วันที่สั่ง</label><input id="oOrdered" type="date" value="' + esc(o ? o.ordered : today()) + '" class="' + INPUT + '"></div>' +
      '<div class="md:col-span-2"><label class="text-xs text-gray-500">หมายเหตุ</label><input id="oNote" value="' + esc(o ? o.note : '') + '" class="' + INPUT + '"></div>' +
      '<div id="oCheck" class="md:col-span-2 text-sm"></div></div>' +
      '<div class="mt-4 flex gap-2"><button type="button" id="oBtn" onclick="STK.orderSave(' + row + ')" class="' + BTN + 'bg-blue-500 text-white hover:bg-blue-600">บันทึก</button><button type="button" onclick="STK.close()" class="' + BTN + 'bg-gray-100 hover:bg-gray-200">ยกเลิก</button></div>');
    if (it) STK.orderCheck(row);
  };
  var orderTimer = null;
  STK.orderCheck = function (row, pick) {
    clearTimeout(orderTimer);
    if (pick) { // เลือกวัสดุใหม่ → เติมราคาตามแผนให้ทันที (ถ้ายังไม่ได้กรอก)
      var pi = parseItem($('oItem') && $('oItem').value);
      if (pi && !$('oPrice').value && pi.planPrice) $('oPrice').value = pi.planPrice;
    }
    orderTimer = setTimeout(async function () {
      var it = parseItem($('oItem') && $('oItem').value);
      var el = $('oCheck');
      if (!el) return;
      if (!it) { el.innerHTML = ''; return; }
      if (!it.p151) { el.innerHTML = '<span class="text-gray-500">วัสดุนี้ไม่มีรหัส P151 จึงเทียบกับแผนไม่ได้</span>'; return; }
      var q = Number($('oQty').value) || 0;
      var chk = null;
      try { chk = await gasCall('stockPlanCheck', [it.p151, q, row || 0]); } catch (e) { return; }
      if (!$('oCheck') || !chk) return;
      if (!chk.found) { $('oCheck').innerHTML = '<span class="text-amber-600">ไม่มีรายการนี้ในแผนปี ' + esc(chk.fy) + '</span>'; return; }
      var counted = ['สั่งสินค้าแล้ว', 'รอรับสินค้า', 'ได้รับสินค้าแล้ว', 'รอตรวจรับ', 'ตรวจรับแล้ว'].indexOf($('oStatus').value) >= 0;
      $('oCheck').innerHTML = '<div class="p-2 rounded-lg ' + (chk.over && counted ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700') + '">แผนปี ' + esc(chk.fy) + ': ' + nf(chk.planQty) + ' ' + esc(chk.unit) + ' · สั่งสะสมแล้ว ' + nf(chk.ordered) + ' · หลังสั่งรอบนี้ ' + nf(chk.after) +
        (counted ? (chk.over ? ' → <b>เกินแผน</b>' : ' → อยู่ในแผน') : ' (สถานะนี้ยังไม่นับเป็นยอดสั่ง)') + '</div>';
    }, 350);
  };
  STK.orderSave = async function (row) {
    var it = parseItem($('oItem').value);
    if (!it) return fail('กรุณาเลือกวัสดุจากรายการ');
    var p = { row: row || 0, itemId: it.id, company: $('oCompany').value, qty: $('oQty').value, price: $('oPrice').value, status: $('oStatus').value,
      ordered: $('oOrdered').value, notified: $('oNotified').value, note: $('oNote').value };
    $('oBtn').disabled = true;
    var r = await call('stockSaveOrder', p);
    if ($('oBtn')) $('oBtn').disabled = false;
    if (!r) return;
    if (!r.success && r.needConfirm) {
      var c = await Swal.fire({ icon: 'warning', title: 'ยอดสั่งสะสมเกินแผน', html: '<div class="text-sm text-left">แผน ' + nf(r.check.planQty) + ' · สั่งแล้ว ' + nf(r.check.ordered) + ' · หลังสั่งรอบนี้ ' + nf(r.check.after) + '</div>',
        input: 'text', inputPlaceholder: 'เหตุผลที่สั่งเกินแผน', showCancelButton: true, confirmButtonText: 'ยืนยันสั่งเกินแผน', cancelButtonText: 'กลับไปแก้',
        inputValidator: function (v) { if (!String(v || '').trim()) return 'กรุณาใส่เหตุผล'; } });
      if (!c.isConfirmed) return;
      p.confirmOver = true; p.overReason = c.value;
      r = await call('stockSaveOrder', p);
      if (!r) return;
    }
    if (!r.success) return fail(r.error);
    STK.close();
    S.board = null;
    await toast('บันทึกใบสั่งแล้ว');
    await loadBoard(true);
    renderOrders();
  };
  STK.delOrder = async function (row) {
    var c = await Swal.fire({ title: 'ลบใบสั่งแถว ' + row + '?', text: 'ล้างข้อมูลในแถวนี้ ย้อนกลับไม่ได้', icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: 'ลบ', cancelButtonText: 'ยกเลิก' });
    if (!c.isConfirmed) return;
    var r = await call('stockDeleteOrder', row);
    if (!r) return;
    if (!r.success) return fail(r.error);
    S.board = null;
    await loadBoard(true);
    renderOrders();
  };

  // ---------- แผนประจำปี ----------
  async function renderPlan() {
    S.plan = await call('stockGetPlan');
    if (!S.plan) return;
    body('<div class="flex flex-wrap items-center gap-2 mb-2"><input id="pq" placeholder="ค้นหารายการ / รหัส" value="' + esc(S.pf.q) + '" oninput="STK.filterPlan()" class="' + INPUT + ' md:w-72"><span class="text-sm text-gray-500">ปีงบ ' + esc(S.plan.fy) + ' · ชีต ' + esc(S.plan.sheet) + '</span></div>' +
      '<div id="ptotal" class="text-sm mb-2"></div><div class="overflow-x-auto"><table class="w-full text-sm border-collapse"><thead class="bg-gray-100"><tr>' +
      ['รหัส', 'รายการ', 'หน่วย', 'ใช้ปีก่อน', 'ประมาณใช้', 'แผนซื้อ', 'ราคา/หน่วย', 'มูลค่า', 'สั่งสะสม', ''].map(function (h) { return '<th class="' + TH + '">' + h + '</th>'; }).join('') + '</tr></thead><tbody id="pbody"></tbody></table></div>');
    drawPlan();
  }
  STK.filterPlan = function () { S.pf.q = $('pq').value; drawPlan(); };
  function drawPlan() {
    var q = S.pf.q.trim().toLowerCase();
    var rows = S.plan.rows.filter(function (r) { return !q || (r.name + ' ' + r.code).toLowerCase().indexOf(q) >= 0; });
    var total = rows.reduce(function (s, r) { return s + r.value; }, 0);
    $('ptotal').innerHTML = 'แสดง ' + rows.length + ' รายการ · มูลค่าแผนรวม <b>' + nf(total) + '</b> บาท';
    $('pbody').innerHTML = rows.map(function (r) {
      return '<tr class="border-t hover:bg-gray-50"><td class="p-2 text-xs whitespace-nowrap">' + esc(r.code) + '</td><td class="p-2">' + esc(r.name) + '</td><td class="p-2 text-xs">' + esc(r.unit) + '</td><td class="p-2 text-right">' + nf(r.h68) + '</td><td class="p-2 text-right">' + nf(r.usage) + '</td>' +
        '<td class="p-2 text-right font-medium">' + nf(r.qty) + '</td><td class="p-2 text-right">' + nf(r.price) + '</td><td class="p-2 text-right">' + nf(r.value) + '</td>' +
        '<td class="p-2 text-right ' + (r.ordered > r.qty ? 'text-red-600 font-medium' : '') + '">' + nf(r.ordered) + '</td>' +
        '<td class="p-2"><button type="button" onclick="STK.planEdit(' + r.row + ')" class="text-xs text-blue-600 underline">แก้ไข</button></td></tr>';
    }).join('') || '<tr><td colspan="10" class="p-4 text-center text-gray-400">ไม่พบรายการ</td></tr>';
  }
  STK.planEdit = function (row) {
    var r = S.plan.rows.filter(function (x) { return x.row === row; })[0];
    if (!r) return;
    function f(id, label, v) { return '<div><label class="text-xs text-gray-500">' + label + '</label><input id="' + id + '" type="number" step="any" value="' + esc(v) + '" oninput="STK.planCalc()" class="' + INPUT + '"></div>'; }
    modal('แก้แผน: ' + esc(r.name), '<div class="text-xs text-gray-500 mb-2">' + esc(r.code) + ' · หน่วย ' + esc(r.unit) + '</div><div class="grid grid-cols-2 gap-3">' +
      f('pCarry', 'ยกยอดมา', r.carry) + f('pUsage', 'ประมาณการใช้', r.usage) + f('pQty', 'ปริมาณการซื้อ (K)', r.qty) + f('pPrice', 'ราคาต่อหน่วย (L)', r.price) +
      f('pQ1', 'งวดที่ 1 (บาท)', r.q1) + f('pQ2', 'งวดที่ 2 (บาท)', r.q2) + f('pQ3', 'งวดที่ 3 (บาท)', r.q3) + f('pQ4', 'งวดที่ 4 (บาท)', r.q4) +
      '<div class="col-span-2"><label class="text-xs text-gray-500">หมายเหตุ</label><input id="pNote" value="' + esc(r.note) + '" class="' + INPUT + '"></div></div>' +
      '<div id="pVal" class="text-sm mt-3"></div><div class="mt-3 flex gap-2"><button type="button" onclick="STK.planSave(' + row + ')" class="' + BTN + 'bg-blue-500 text-white hover:bg-blue-600">บันทึก</button><button type="button" onclick="STK.close()" class="' + BTN + 'bg-gray-100 hover:bg-gray-200">ยกเลิก</button></div>');
    STK.planCalc();
  };
  STK.planCalc = function () { $('pVal').innerHTML = 'มูลค่าการซื้อ (M) = ' + nf((Number($('pQty').value) || 0) * (Number($('pPrice').value) || 0)) + ' บาท (คำนวณอัตโนมัติ)'; };
  STK.planSave = async function (row) {
    var r = S.plan.rows.filter(function (x) { return x.row === row; })[0];
    var p = { row: row, code: r.code, carry: $('pCarry').value, usage: $('pUsage').value, qty: $('pQty').value, price: $('pPrice').value, q1: $('pQ1').value, q2: $('pQ2').value, q3: $('pQ3').value, q4: $('pQ4').value, note: $('pNote').value };
    var res = await call('stockSavePlanRow', p);
    if (!res) return;
    if (!res.success) return fail(res.error);
    STK.close(); S.board = null;
    await toast('บันทึกแผนแล้ว');
    renderPlan();
  };

  // ---------- ฐานข้อมูลวัสดุ ----------
  async function renderDb() {
    S.db = await call('stockGetDb');
    if (!S.db) return;
    var modes = [['all', 'ทั้งหมด'], ['nop151', 'ไม่มี P151'], ['nomin', 'ยังไม่ตั้ง min']];
    body('<div class="flex flex-wrap gap-2 mb-3"><input id="dq" placeholder="ค้นหา ชื่อ / รหัส" value="' + esc(S.df.q) + '" oninput="STK.filterDb()" class="' + INPUT + ' md:w-72">' +
      '<select id="dm" onchange="STK.filterDb()" class="border rounded-lg px-3 py-1.5 text-sm">' + modes.map(function (m) { return '<option value="' + m[0] + '"' + (S.df.mode === m[0] ? ' selected' : '') + '>' + m[1] + '</option>'; }).join('') + '</select>' +
      '<button type="button" onclick="STK.dbEdit(0)" class="' + BTN + 'bg-blue-500 text-white hover:bg-blue-600"><i class="fa-solid fa-plus mr-1"></i>เพิ่มวัสดุ</button>' +
      '<button type="button" onclick="STK.fillDefaults()" class="' + BTN + 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200">เติม rate/month และ min ที่ว่างอัตโนมัติ</button></div>' +
      '<div class="overflow-x-auto"><table class="w-full text-sm border-collapse"><thead class="bg-gray-100"><tr>' + ['รหัส', 'CPN', 'P151', 'รายการ', 'หน่วย', 'rate/เดือน', 'min', ''].map(function (h) { return '<th class="' + TH + '">' + h + '</th>'; }).join('') + '</tr></thead><tbody id="dbody"></tbody></table></div><p id="dcount" class="text-xs text-gray-400 mt-2"></p>');
    drawDb();
  }
  STK.filterDb = function () { S.df.q = $('dq').value; S.df.mode = $('dm').value; drawDb(); };
  function drawDb() {
    var q = S.df.q.trim().toLowerCase();
    var rows = S.db.items.filter(function (i) {
      if (S.df.mode === 'nop151' && i.p151) return false;
      if (S.df.mode === 'nomin' && i.min !== null) return false;
      return !q || (i.name + ' ' + i.id + ' ' + i.cpn + ' ' + i.p151).toLowerCase().indexOf(q) >= 0;
    });
    $('dbody').innerHTML = rows.map(function (i) {
      return '<tr class="border-t hover:bg-gray-50"><td class="p-2 text-xs">' + esc(i.id) + '</td><td class="p-2 text-xs">' + esc(i.cpn) + '</td><td class="p-2 text-xs">' + esc(i.p151 || '-') + '</td><td class="p-2">' + esc(i.name) + '</td><td class="p-2 text-xs">' + esc(i.unit) + '</td><td class="p-2 text-right">' + nf(i.rate) + '</td><td class="p-2 text-right">' + nf(i.min) + '</td>' +
        '<td class="p-2"><button type="button" onclick="STK.dbEdit(' + i.row + ')" class="text-xs text-blue-600 underline">แก้ไข</button></td></tr>';
    }).join('') || '<tr><td colspan="8" class="p-4 text-center text-gray-400">ไม่พบรายการ</td></tr>';
    $('dcount').textContent = 'แสดง ' + rows.length + ' จาก ' + S.db.items.length + ' รายการ';
  }
  STK.dbEdit = function (row) {
    var i = row ? S.db.items.filter(function (x) { return x.row === row; })[0] : { cpn: '', p151: '', name: '', unit: '', rate: null, min: null, spec: '' };
    function f(id, label, v, type, cls) { return '<div class="' + (cls || '') + '"><label class="text-xs text-gray-500">' + label + '</label><input id="' + id + '" type="' + (type || 'text') + '" step="any" value="' + esc(v === null || v === undefined ? '' : v) + '" class="' + INPUT + '"></div>'; }
    modal(row ? 'แก้ไขวัสดุ ' + esc(i.id) : 'เพิ่มวัสดุใหม่', '<div class="grid grid-cols-2 gap-3">' +
      f('bName', 'ชื่อรายการ', i.name, 'text', 'col-span-2') + f('bCpn', 'รหัส CPN', i.cpn) + f('bP151', 'รหัส P151', i.p151) + f('bUnit', 'หน่วยนับ', i.unit) + f('bRate', 'rate/เดือน', i.rate, 'number') + f('bMin', 'min (จุดสั่งซื้อ)', i.min, 'number') +
      f('bSpec', 'คุณลักษณะ', i.spec, 'text', 'col-span-2') + '</div>' +
      '<div class="mt-3 flex gap-2"><button type="button" onclick="STK.dbSave(' + row + ')" class="' + BTN + 'bg-blue-500 text-white hover:bg-blue-600">บันทึก</button><button type="button" onclick="STK.close()" class="' + BTN + 'bg-gray-100 hover:bg-gray-200">ยกเลิก</button></div>');
  };
  STK.dbSave = async function (row) {
    var r = await call('stockSaveDb', { row: row || 0, name: $('bName').value, cpn: $('bCpn').value, p151: $('bP151').value, unit: $('bUnit').value, rate: $('bRate').value, min: $('bMin').value, spec: $('bSpec').value });
    if (!r) return;
    if (!r.success) return fail(r.error);
    STK.close(); S.board = null;
    await toast('บันทึกแล้ว');
    await loadBoard(true);
    renderDb();
  };
  STK.fillDefaults = async function () {
    var c = await Swal.fire({ title: 'เติมค่าที่ว่างอัตโนมัติ', html: '<div class="text-sm text-left">• rate/เดือน = ประมาณการใช้ในแผน ÷ 12<br>• min = rate/เดือน × จำนวนเดือนสำรอง (ปัดขึ้น)<br>เติมเฉพาะช่องที่ว่าง ไม่ทับค่าที่คุณกรอกเอง</div>', input: 'number', inputValue: S.board.cfg.MIN_MONTHS || 2, inputLabel: 'จำนวนเดือนสำรอง', showCancelButton: true, confirmButtonText: 'เติมค่า', cancelButtonText: 'ยกเลิก' });
    if (!c.isConfirmed) return;
    var r = await call('stockFillDefaults', { months: Number(c.value) || 2 });
    if (!r) return;
    if (!r.success) return fail(r.error);
    S.board = null;
    await Swal.fire('เสร็จแล้ว', 'เติม rate/เดือน ' + r.rateFilled + ' รายการ · เติม min ' + r.minFilled + ' รายการ (สำรอง ' + r.months + ' เดือน) ตรวจและแก้ได้ในตาราง', 'success');
    await loadBoard(true);
    renderDb();
  };

  // ---------- ตั้งค่า ----------
  async function renderCfg() {
    var res = await Promise.all([call('stockGetConfig'), call('stockGetCompanies')]);
    S.cfg = res[0]; S.comps = res[1] || [];
    if (!S.cfg) return;
    function f(id, label, v, hint) { return '<div><label class="text-xs text-gray-500">' + label + '</label><input id="' + id + '" value="' + esc(v) + '" class="' + INPUT + '">' + (hint ? '<div class="text-[11px] text-gray-400">' + hint + '</div>' : '') + '</div>'; }
    body('<div class="max-w-2xl"><h3 class="text-lg font-medium mb-3">ตั้งค่าระบบคลัง</h3><div class="grid grid-cols-1 md:grid-cols-2 gap-3">' +
      f('cFY', 'ปีงบประมาณ (พ.ศ.)', S.cfg.FY, 'ใช้เทียบแผนและนับยอดสั่ง') + f('cPlan', 'ชื่อชีตแผนของปีนั้น', S.cfg.PLAN_SHEET, 'ปี 70: สร้างชีตแผนใหม่ แล้วเปลี่ยนค่านี้') +
      f('cExp', 'เตือนก่อนหมดอายุ (วัน)', S.cfg.EXPIRY_DAYS) + f('cMonths', 'เดือนสำรองสำหรับคำนวณ min', S.cfg.MIN_MONTHS) +
      f('cHosp', 'รหัสหน่วยของโรงพยาบาล', S.cfg.HOSPITAL_CODE, 'แสดงป้าย "ใช้ภายใน รพ." ในรายการหน่วยตอนจ่ายออก') + f('cMail', 'อีเมลผู้รับแจ้งเตือน (คั่นด้วย ,)', S.cfg.ALERT_EMAILS, 'เว้นว่าง = ใช้อีเมลของรหัส 00001') + '</div>' +
      '<div class="mt-3 flex flex-wrap gap-2"><button type="button" onclick="STK.cfgSave()" class="' + BTN + 'bg-blue-500 text-white hover:bg-blue-600">บันทึกการตั้งค่า</button>' +
      '<button type="button" onclick="STK.testMail()" class="' + BTN + 'bg-gray-100 hover:bg-gray-200"><i class="fa-solid fa-envelope mr-1"></i>ส่งอีเมลสรุปทดสอบ</button>' +
      '<button type="button" onclick="STK.setup()" class="' + BTN + 'bg-gray-100 hover:bg-gray-200">ตรวจ/เตรียมชีตอีกครั้ง</button></div>' +
      '<div class="mt-4 p-3 rounded-lg bg-blue-50 text-sm text-blue-800">แจ้งเตือนอัตโนมัติทุกเช้า: เปิด Apps Script เลือกฟังก์ชัน <code>stockInstallTrigger</code> แล้วกด Run ครั้งเดียว (ระบบจะส่งอีเมลเฉพาะวันที่มีของใกล้หมดหรือใกล้หมดอายุ)</div>' +
      '<h4 class="font-medium mt-6 mb-2">รายชื่อบริษัท (' + S.comps.length + ')</h4><div class="flex gap-2 mb-2"><input id="cNew" placeholder="ชื่อบริษัทใหม่" class="' + INPUT + '"><button type="button" onclick="STK.addComp()" class="' + BTN + 'bg-blue-500 text-white hover:bg-blue-600 whitespace-nowrap">เพิ่ม</button></div>' +
      '<div class="text-sm text-gray-600 flex flex-wrap gap-1">' + S.comps.map(function (c) { return '<span class="px-2 py-0.5 bg-gray-100 rounded-full">' + esc(c) + '</span>'; }).join('') + '</div></div>');
  }
  STK.cfgSave = async function () {
    var r = await call('stockSaveConfig', { FY: $('cFY').value.trim(), PLAN_SHEET: $('cPlan').value.trim(), EXPIRY_DAYS: $('cExp').value.trim(), MIN_MONTHS: $('cMonths').value.trim(), HOSPITAL_CODE: $('cHosp').value.trim(), ALERT_EMAILS: $('cMail').value.trim() });
    if (!r) return;
    if (!r.success) return fail(r.error);
    S.board = null;
    await toast('บันทึกการตั้งค่าแล้ว');
  };
  STK.testMail = async function () {
    var r = await call('stockSendDigestNow');
    if (!r) return;
    if (r.sent) Swal.fire('ส่งแล้ว', 'ส่งถึง ' + r.to.join(', ') + ' (ใกล้หมด ' + r.lowCount + ' · ใกล้หมดอายุ ' + r.expCount + ')', 'success');
    else Swal.fire('ยังไม่ได้ส่ง', r.reason || '', 'info');
  };
  STK.addComp = async function () {
    var n = $('cNew').value.trim();
    if (!n) return;
    var r = await call('stockAddCompany', n);
    if (!r) return;
    if (!r.success) return fail(r.error);
    S.comps = null;
    renderCfg();
  };

  // ---------- ต่อเข้ากับหน้า Admin เดิม ----------
  function showStock() {
    var t = $('adminTableContainer'), s = $('stockApp');
    if (t) t.classList.add('hidden');
    if (s) s.classList.remove('hidden');
    STK.go(S.tab || 'board', S.tab === 'board' ? 'refresh' : undefined);
  }
  function showTable() {
    var t = $('adminTableContainer'), s = $('stockApp');
    if (t) t.classList.remove('hidden');
    if (s) s.classList.add('hidden');
  }

  function mount() {
    var dash = $('adminDashboard');
    if (!dash || $('stockApp')) return;
    var menu = dash.querySelector('.flex.space-x-4.mb-4') || dash.querySelector('.flex');
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'btnStock';
    btn.className = 'px-4 py-1 bg-emerald-500 text-white rounded-full text-sm';
    btn.innerHTML = '<i class="fa-solid fa-warehouse mr-1"></i>คลังวัสดุ';
    btn.onclick = showStock;
    menu.appendChild(btn);
    var box = document.createElement('div');
    box.id = 'stockApp';
    box.className = 'hidden mt-2';
    dash.appendChild(box);

    var style = document.createElement('style');
    style.textContent = '.swal2-container{z-index:10100!important}';
    document.head.appendChild(style);

    // เมนูเดิมถูกกด → ซ่อนหน้าคลัง
    var origLoad = window.loadAdminData;
    if (typeof origLoad === 'function') window.loadAdminData = function () { showTable(); return origLoad.apply(this, arguments); };
    var origLogout = window.logoutAdmin;
    if (typeof origLogout === 'function') window.logoutAdmin = function () {
      showTable(); S.board = null; S.openReq = undefined;
      var s = $('stockApp'); if (s) s.innerHTML = '';
      return origLogout.apply(this, arguments);
    };
    // เปลี่ยนสถานะเป็น "จัดของแล้ว" → ถามว่าจะไปตัดสต็อกเลยไหม
    var origUpdate = window.updateReq;
    if (typeof origUpdate === 'function') window.updateReq = async function (rowIndex) {
      var sel = $('status_' + rowIndex);
      var status = sel ? sel.value : '';
      var res = await origUpdate.apply(this, arguments);
      if (status === 'จัดของแล้ว') {
        var c = await Swal.fire({ icon: 'question', title: 'ตัดสต็อกใบเบิกนี้เลยไหม', text: 'ตรวจจำนวนที่จ่ายจริงแล้วยืนยันตัดสต็อกได้ที่หน้า "คลังวัสดุ > จ่ายออก"', showCancelButton: true, confirmButtonText: 'ไปตัดสต็อก', cancelButtonText: 'ไว้ทีหลัง' });
        if (c.isConfirmed) STK.openDispenseForReq(rowIndex);
      }
      return res;
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
