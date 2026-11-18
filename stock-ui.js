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
  var BTN = 'px-3.5 py-1.5 rounded-lg text-sm transition ';
  var TH = 'p-2.5 border text-left text-xs font-semibold text-gray-600';

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
    m.innerHTML = '<div class="bg-white rounded-xl shadow-xl w-full ' + (wide === 'xl' ? 'max-w-6xl' : (wide ? 'max-w-5xl' : 'max-w-xl')) + ' mx-auto mt-6 mb-6 p-5 sm:p-6">' +
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
    ['orders', 'สั่งซื้อวัสดุ', 'fa-file-invoice'], ['docs', 'เอกสาร', 'fa-file-word'], ['plan', 'แผนประจำปี', 'fa-calendar-check'], ['db', 'ฐานข้อมูลวัสดุ', 'fa-database'], ['cfg', 'ตั้งค่า', 'fa-gear']];

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
    else if (tab === 'docs') { if (STK.renderDocs) await STK.renderDocs(arg); else body('<p class="text-red-500">ยังไม่ได้โหลดไฟล์ stock-docs.js</p>'); }
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
      ['รหัส', 'รายการ', 'คงเหลือ', 'หน่วย', 'ขนาดบรรจุ', 'min', 'สถานะ', 'หมดอายุใกล้สุด', 'สั่ง/แผน', ''].map(function (h) { return '<th class="' + TH + '">' + h + '</th>'; }).join('') +
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
        '<td class="p-2 text-xs text-gray-500 whitespace-nowrap font-mono">' + esc(it.pack || '-') + '</td>' +
        '<td class="p-2 text-right">' + nf(it.min) + '</td><td class="p-2">' + badge(it.status) + '</td>' +
        '<td class="p-2 text-xs whitespace-nowrap">' + fd(it.nearest) + '</td><td class="p-2 text-xs whitespace-nowrap">' + plan + '</td>' +
        '<td class="p-2 text-right whitespace-nowrap"><button type="button" onclick="STK.detail(\'' + it.id + '\')" class="text-blue-600 text-xs underline mr-2">รายละเอียด</button>' +
        '<button type="button" onclick="STK.go(\'recv\',\'' + it.id + '\')" class="text-green-600 text-xs underline mr-2">รับ</button>' +
        '<button type="button" onclick="STK.go(\'disp\',{item:\'' + it.id + '\'})" class="text-amber-600 text-xs underline">จ่าย</button></td></tr>';
    }).join('');
    $('bbody').innerHTML = html || '<tr><td colspan="10" class="p-4 text-center text-gray-400">ไม่พบรายการ</td></tr>';
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
      return '<tr class="border-t"><td class="p-2 text-xs">' + esc(l.id) + '</td><td class="p-2">' + esc(l.lotNo || '-') + '</td><td class="p-2 text-xs font-mono">' + esc(l.pack || it.pack || '-') + '</td><td class="p-2">' + esc(l.brand || '-') + '<div class="text-[11px] text-gray-400">' + esc(l.company) + '</div></td><td class="p-2 whitespace-nowrap">' + exp + '</td>' +
        '<td class="p-2 text-right font-medium">' + nf(l.bal) + '</td><td class="p-2 text-right">' + nf(l.price) + '</td>' +
        '<td class="p-2"><button type="button" onclick="STK.adjust(\'' + it.id + '\',\'' + l.id + '\')" class="text-xs text-blue-600 underline">ปรับยอด</button></td></tr>';
    }).join('') : '<tr><td colspan="8" class="p-3 text-center text-gray-400">ยังไม่มีล็อต</td></tr>';
    var hist = r.history.length ? r.history.map(function (h) {
      return '<tr class="border-t"><td class="p-2 text-xs whitespace-nowrap">' + esc(h.time) + '</td><td class="p-2">' + esc(h.type) + '</td><td class="p-2 text-xs">' + esc(h.lotId) + '</td><td class="p-2 text-right ' + (h.qty < 0 ? 'text-red-600' : 'text-green-600') + '">' + (h.qty > 0 ? '+' : '') + nf(h.qty) + '</td><td class="p-2 text-xs">' + esc(h.unit) + '</td><td class="p-2 text-xs">' + esc(h.note) + '</td></tr>';
    }).join('') : '<tr><td colspan="6" class="p-3 text-center text-gray-400">ยังไม่มีประวัติ</td></tr>';
    var planTxt = r.plan ? 'แผนปี ' + esc(S.board.cfg.FY) + ': ซื้อ ' + nf(r.plan.qty) + ' ' + esc(r.plan.unit) + ' · สั่งแล้ว ' + nf(r.ordered) : 'ไม่มีในแผน/ไม่มีรหัส P151';
    modal(esc(it.name),
      '<div class="text-sm text-gray-500 mb-3">' + esc(it.id) + ' · CPN ' + esc(it.cpn || '-') + ' · ' + esc(it.p151 || 'ไม่มี P151') + ' · หน่วย ' + esc(it.unit || '-') + ' · ขนาดบรรจุ ' + esc(it.pack || '-') + ' · min ' + nf(it.min) + ' · rate/เดือน ' + nf(it.rate) + '<br>' + planTxt + '</div>' +
      '<div class="flex gap-2 mb-3"><button type="button" onclick="STK.close();STK.go(\'recv\',\'' + it.id + '\')" class="' + BTN + 'bg-green-500 text-white hover:bg-green-600">รับเข้า</button>' +
      '<button type="button" onclick="STK.close();STK.go(\'disp\',{item:\'' + it.id + '\'})" class="' + BTN + 'bg-amber-500 text-white hover:bg-amber-600">จ่ายออก</button></div>' +
      '<h4 class="font-medium text-sm mb-1">ล็อตคงเหลือ (จ่ายตามหมดอายุก่อน)</h4><div class="overflow-x-auto mb-4"><table class="w-full text-sm border-collapse"><thead class="bg-gray-100"><tr>' + ['ล็อต', 'เลขล็อต', 'ขนาดบรรจุ', 'ยี่ห้อ/บริษัท', 'หมดอายุ', 'เหลือ', 'ราคา', ''].map(function (x) { return '<th class="' + TH + '">' + x + '</th>'; }).join('') + '</tr></thead><tbody>' + lots + '</tbody></table></div>' +
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

  // ---------- รับเข้า (3 ส่วน: รอรับเข้าคลัง → กรอกรายละเอียด/แยกล็อต → คิวยืนยันเข้าคลัง & สร้าง E-Import) ----------
  S.ei = { queue: [] };
  try {
    var savedQ = JSON.parse(localStorage.getItem('stk_ei_queue') || '[]');
    if (Array.isArray(savedQ)) S.ei.queue = savedQ;
  } catch (e) {}
  var recvMode = 'single';
  var recvLots = [{ lotNo: '', expiry: '', qty: '' }];

  function saveEiCache() {
    try { localStorage.setItem('stk_ei_queue', JSON.stringify(S.ei.queue || [])); } catch (e) {}
  }

  function defaultInstockId() {
    var saved = '';
    try { saved = localStorage.getItem('stk_ei_last_id') || ''; } catch (e) {}
    if (saved) return saved;
    var d = new Date();
    var yy = String(d.getFullYear() + 543).slice(-2);
    var mm = String(d.getMonth() + 1).padStart(2, '0');
    return 'SO-' + yy + mm + '-00001';
  }

  function nextInstockId(cur) {
    var s = String(cur || '').trim();
    var m = s.match(/^(.*?)(\d+)$/);
    if (!m) return s;
    var n = Number(m[2]) + 1;
    var next = m[1] + String(n).padStart(m[2].length, '0');
    try { localStorage.setItem('stk_ei_last_id', next); } catch (e) {}
    return next;
  }

  function itemByP151(p151, nameFallback) {
    if (!S.board || !S.board.items) return null;
    if (p151) {
      var found = S.board.items.filter(function (i) { return i.p151 === p151; })[0];
      if (found) return found;
    }
    if (nameFallback) {
      var nfName = String(nameFallback).trim().toLowerCase();
      return S.board.items.filter(function (i) { return String(i.name || '').trim().toLowerCase() === nfName; })[0] || null;
    }
    return null;
  }

  function queuedQtyForOrder(orderRow) {
    if (!orderRow) return 0;
    var sum = 0;
    (S.ei.queue || []).forEach(function (q) {
      if (Number(q.orderRow) === Number(orderRow) && !q.webReceived) sum += Number(q.qty) || 0;
    });
    return Math.round(sum * 10000) / 10000;
  }

  function remainingForOrder(o) {
    if (!o) return 0;
    var rec = Number(o.receivedQty) || 0;
    return Math.max(0, Math.round(((Number(o.qty) || 0) - rec) * 10000) / 10000);
  }

  async function renderRecv(prefill) {
    await Promise.all([loadComps(), loadOrders(true)]);
    var pre = typeof prefill === 'object' && prefill ? prefill : { item: prefill };
    S.r.itemId = pre.item || ''; S.r.orderRow = pre.order || 0;
    recvMode = 'single';
    recvLots = [{ lotNo: '', expiry: '', qty: '' }];
    var it = S.byId[S.r.itemId];
    body(
      '<div class="space-y-6">' +
        // ---------- ส่วนที่ 1: รายการที่ตรวจรับแล้ว (รอรับเข้าคลัง) ----------
        '<div id="recvPart1" class="bg-white border border-emerald-200 rounded-xl p-4 shadow-sm">' +
          '<div class="flex flex-wrap items-center justify-between gap-2 mb-3">' +
            '<div>' +
              '<h3 class="text-base font-semibold text-emerald-900"><i class="fa-solid fa-clipboard-check text-emerald-600 mr-2"></i>ส่วนที่ 1 · รายการที่ตรวจรับแล้ว (รอรับเข้าคลัง)</h3>' +
              '<p class="text-xs text-gray-500">แสดงรายการสั่งซื้อที่สถานะ "ตรวจรับแล้ว" และยังรับเข้าคลังไม่ครบ (เมื่อยืนยันรับเข้าครบตามจำนวนแล้ว รายการจะซ่อนอัตโนมัติ)</p>' +
            '</div>' +
            '<div class="flex flex-wrap gap-2">' +
              '<input id="p1Q" oninput="STK.drawRecvPending()" placeholder="ค้นหารายการ / บริษัท / P151" class="' + INPUT + ' text-xs md:w-52">' +
              '<select id="p1Comp" onchange="STK.drawRecvPending()" class="' + INPUT + ' text-xs md:w-44"><option value="">ทุกบริษัท</option></select>' +
            '</div>' +
          '</div>' +
          '<div class="overflow-x-auto border rounded-lg">' +
            '<table class="w-full text-sm border-collapse">' +
              '<thead class="bg-emerald-50/70 text-xs text-emerald-900">' +
                '<tr>' +
                  '<th class="p-2 border-b text-left">แถว / วันที่</th>' +
                  '<th class="p-2 border-b text-left">รายการวัสดุ &amp; รหัส</th>' +
                  '<th class="p-2 border-b text-left">บริษัท</th>' +
                  '<th class="p-2 border-b text-right">จำนวนสั่ง</th>' +
                  '<th class="p-2 border-b text-right">รับเข้าแล้ว</th>' +
                  '<th class="p-2 border-b text-right">รอรับเข้าคลัง</th>' +
                  '<th class="p-2 border-b text-right">ราคาที่ซื้อ/หน่วย</th>' +
                  '<th class="p-2 border-b text-center">เลือกรับเข้า</th>' +
                '</tr>' +
              '</thead>' +
              '<tbody id="p1Body"></tbody>' +
            '</table>' +
          '</div>' +
        '</div>' +

        // ---------- ส่วนที่ 2: กรอกรายละเอียดการรับวัสดุเข้าคลัง ----------
        '<div id="recvPart2" class="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">' +
          '<div class="flex flex-wrap items-center justify-between gap-2 mb-3">' +
            '<div>' +
              '<h3 class="text-base font-semibold text-gray-800"><i class="fa-solid fa-box-open text-green-600 mr-2"></i>ส่วนที่ 2 · กรอกรายละเอียดการรับวัสดุเข้าคลัง</h3>' +
              '<p class="text-xs text-gray-500">เลือกจากส่วนที่ 1 หรือคีย์รับเข้าเองได้ (รองรับรับล็อตเดียวและแบ่งรับหลายล็อต) เมื่อกดบันทึกจะส่งไปพักไว้ที่ส่วนที่ 3</p>' +
            '</div>' +
            '<div class="flex items-center gap-1 bg-gray-100 p-1 rounded-lg text-xs">' +
              '<button type="button" id="rModeSingle" onclick="STK.setRecvMode(\'single\')" class="px-2.5 py-1 rounded-md font-medium transition bg-white text-green-700 shadow-sm">รับล็อตเดียว</button>' +
              '<button type="button" id="rModeSplit" onclick="STK.setRecvMode(\'split\')" class="px-2.5 py-1 rounded-md font-medium transition text-gray-600 hover:text-gray-900">แบ่งรับหลายล็อต</button>' +
            '</div>' +
          '</div>' +
          '<div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">' +
            '<div class="md:col-span-2"><label class="text-xs text-gray-500">วัสดุ (พิมพ์ค้นหาแล้วเลือกจากรายการ)</label><input id="rItem" list="stkItems" value="' + esc(it ? itemLabel(it) : '') + '" onchange="STK.recvPick()" class="' + INPUT + '" placeholder="พิมพ์ชื่อหรือรหัส"><div id="rInfo" class="text-xs text-gray-500 mt-1"></div></div>' +
            '<div><label class="text-xs text-gray-500">ประเภทรายการ</label><select id="rKind" class="' + INPUT + '"><option>รับเข้า</option><option>ยอดยกมา</option></select></div>' +
            '<div><label class="text-xs text-gray-500">ผูกใบสั่งซื้อ (ถ้ามี)</label><select id="rOrder" onchange="STK.recvOrder()" class="' + INPUT + '"><option value="">ไม่ผูกรายการสั่งซื้อ (คีย์รับเข้าเอง)</option></select></div>' +
            '<div><label class="text-xs text-gray-500">บริษัท</label><input id="rCompany" list="stkComps" class="' + INPUT + '"></div>' +
            '<div><label class="text-xs text-gray-500">ยี่ห้อ</label><input id="rBrand" class="' + INPUT + '"></div>' +
            '<div><label class="text-xs text-gray-500">ขนาดบรรจุ (เช่น 1x1, 1x6)</label><input id="rPack" placeholder="เช่น 1x1, 1x6" class="' + INPUT + ' font-mono"></div>' +
            '<div><label class="text-xs text-gray-500">ราคาที่ซื้อ/หน่วย (บาท รวม VAT)</label><input id="rPrice" type="number" min="0" step="any" placeholder="กรอกราคาที่ซื้อ" oninput="STK.recvPriceHint()" class="' + INPUT + '"><div id="rPriceHint" class="text-xs"></div></div>' +
            '<div><label class="text-xs text-gray-500">วันที่รับ</label><input id="rDate" type="date" value="' + today() + '" class="' + INPUT + '"></div>' +
            '<div><label class="text-xs text-gray-500">หมายเหตุ</label><input id="rNote" class="' + INPUT + '"></div>' +
          '</div>' +
          '<div class="border rounded-xl p-3 bg-slate-50/70 mb-3">' +
            '<div class="flex flex-wrap items-center justify-between gap-2 mb-2">' +
              '<span class="text-xs font-semibold text-slate-700"><i class="fa-solid fa-layer-group mr-1"></i>รายละเอียดล็อต / วันหมดอายุ / จำนวนที่รับ</span>' +
              '<div class="flex items-center gap-2">' +
                '<span id="rLotsSum" class="text-xs text-slate-600"></span>' +
                '<button type="button" id="rAddLotBtn" onclick="STK.addRecvLot()" class="hidden px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 text-xs font-medium"><i class="fa-solid fa-plus mr-1"></i>เพิ่มล็อตย่อย</button>' +
              '</div>' +
            '</div>' +
            '<div class="overflow-x-auto"><table class="w-full text-sm border-collapse bg-white rounded-lg overflow-hidden border"><thead class="bg-gray-100 text-xs text-gray-600"><tr><th class="p-2 text-center w-10">#</th><th class="p-2 text-left">เลขล็อต (LotNumber)</th><th class="p-2 text-left w-44">วันหมดอายุ (เว้นว่างได้)</th><th class="p-2 text-right w-36">จำนวนที่รับ</th><th class="p-2 w-10"></th></tr></thead><tbody id="rLotsBody"></tbody></table></div>' +
          '</div>' +
          '<div class="flex flex-wrap items-center gap-2">' +
            '<button type="button" id="rQueueBtn" onclick="STK.queueReceive()" class="' + BTN + 'bg-green-600 text-white hover:bg-green-700 font-medium shadow-sm"><i class="fa-solid fa-arrow-down mr-1"></i>ส่งเข้าคิวส่วนที่ 3 (รอยืนยันรับเข้า &amp; สร้าง E-Import)</button>' +
            '<button type="button" onclick="STK.clearRecvForm()" class="' + BTN + 'bg-gray-100 hover:bg-gray-200 text-gray-700">ล้างฟอร์ม</button>' +
          '</div>' +
        '</div>' +

        // ---------- ส่วนที่ 3: คิวรอยืนยันรับเข้าคลัง & สร้างไฟล์ E-Import (5 Sheets) ----------
        '<div id="recvPart3" class="bg-white border border-indigo-200 rounded-xl p-4 shadow-sm">' +
          '<div class="flex flex-wrap items-center justify-between gap-2 mb-3">' +
            '<div>' +
              '<h3 class="text-base font-semibold text-indigo-900"><i class="fa-solid fa-file-import text-indigo-600 mr-2"></i>ส่วนที่ 3 · ยืนยันรับสินค้าเข้าคลัง (Web App) &amp; สร้างไฟล์ E-Import เข้า CPN (5 Sheets)</h3>' +
              '<p class="text-xs text-gray-500">ตรวจสอบรายการในคิว (ทั้งจากใบสั่งซื้อและที่คีย์รับเข้าเอง) แล้วกดยืนยันรับเข้าคลัง Web App และ/หรือสร้างไฟล์ .xls เข้า CPN</p>' +
            '</div>' +
            '<div class="flex flex-wrap gap-2">' +
              '<button type="button" id="eiWebBtn" onclick="STK.confirmQueueReceive(false)" class="' + BTN + 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm font-medium"><i class="fa-solid fa-check-double mr-1"></i>ยืนยันรับเข้าคลัง (<span id="eiWebCount">0</span>)</button>' +
              '<button type="button" id="eiExportBtn" onclick="STK.exportEImport()" class="' + BTN + 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm font-medium"><i class="fa-solid fa-file-excel mr-1"></i>ดาวน์โหลด E-Import (.xls) (<span id="eiSelCount">0</span>)</button>' +
              '<button type="button" id="eiBothBtn" onclick="STK.confirmQueueReceive(true)" class="' + BTN + 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm font-medium"><i class="fa-solid fa-bolt mr-1"></i>ยืนยันรับเข้า + โหลด E-Import พร้อมกัน</button>' +
            '</div>' +
          '</div>' +

          '<div class="grid grid-cols-1 md:grid-cols-4 gap-2 bg-indigo-50/60 border border-indigo-100 rounded-lg p-3 mb-3">' +
            '<div><label class="text-xs font-medium text-indigo-900">เลขที่ใบรับอ้างอิง (InstockID)</label>' +
              '<div class="flex gap-1"><input id="eiInstockId" value="' + esc(defaultInstockId()) + '" oninput="try{localStorage.setItem(\'stk_ei_last_id\',this.value.trim())}catch(e){}" class="' + INPUT + ' font-mono text-xs" placeholder="เช่น SO-6911-00001">' +
              '<button type="button" onclick="$(\'eiInstockId\').value=STK.bumpInstockId($(\'eiInstockId\').value)" title="เลื่อนเลขลำดับถัดไป (+1)" class="px-2.5 rounded-lg border border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-100 text-xs font-semibold">+1</button></div>' +
            '</div>' +
            '<div><label class="text-xs font-medium text-indigo-900">ชื่อหน่วยงาน/คำอธิบายไฟล์</label>' +
              '<input id="eiLabel" value="ทันตกรรมวังทอง" class="' + INPUT + ' text-xs" placeholder="เช่น ทันตกรรมวังทอง">' +
            '</div>' +
            '<div><label class="text-xs font-medium text-indigo-900">กรองรายการในคิว</label>' +
              '<select id="eiFilter" onchange="STK.drawEImport()" class="' + INPUT + ' text-xs">' +
                '<option value="all" selected>ทั้งหมดในคิว</option>' +
                '<option value="pending_web">รอยืนยันรับเข้า Web App</option>' +
                '<option value="pending_xls">รอสร้างไฟล์ E-Import</option>' +
              '</select>' +
            '</div>' +
            '<div class="flex items-end justify-end">' +
              '<button type="button" onclick="STK.clearDoneQueue()" class="' + BTN + 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-100 text-xs w-full"><i class="fa-solid fa-broom mr-1"></i>ล้างรายการที่รับเข้าและส่งออกแล้ว</button>' +
            '</div>' +
          '</div>' +

          '<div id="eiSummary" class="text-xs text-gray-600 mb-2"></div>' +
          '<div class="overflow-x-auto border rounded-lg">' +
            '<table class="w-full text-sm border-collapse">' +
              '<thead class="bg-gray-100 text-xs text-gray-700">' +
                '<tr>' +
                  '<th class="p-2 border-b text-center" style="width:36px"><input type="checkbox" id="eiChkAll" onchange="STK.eiToggleAll(this.checked)"></th>' +
                  '<th class="p-2 border-b text-left">รายการวัสดุ &amp; รหัส CPN</th>' +
                  '<th class="p-2 border-b text-left">บริษัท / ที่มา</th>' +
                  '<th class="p-2 border-b text-left" style="width:85px">ขนาดบรรจุ</th>' +
                  '<th class="p-2 border-b text-right" style="width:90px">จำนวนรับ</th>' +
                  '<th class="p-2 border-b text-right" style="width:100px">ราคาที่ซื้อ/หน่วย</th>' +
                  '<th class="p-2 border-b text-left" style="width:120px">เลขล็อต</th>' +
                  '<th class="p-2 border-b text-left" style="width:135px">วันหมดอายุ</th>' +
                  '<th class="p-2 border-b text-left">สถานะ</th>' +
                  '<th class="p-2 border-b text-center" style="width:44px">ลบ</th>' +
                '</tr>' +
              '</thead>' +
              '<tbody id="eiBody"></tbody>' +
            '</table>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
    STK.drawRecvPending();
    if (pre.order) {
      STK.pickPendingOrder(pre.order, false, true);
    } else if (it) {
      STK.recvPick();
    } else {
      STK.drawRecvLots();
    }
    STK.drawEImport();
  }

  STK.bumpInstockId = function (v) { return nextInstockId(v); };

  STK.drawRecvPending = function () {
    var tbody = $('p1Body');
    if (!tbody) return;
    var all = (S.orders && S.orders.orders) || [];
    var pending = all.filter(function (o) { return o.status === 'ตรวจรับแล้ว' && remainingForOrder(o) > 0; });
    var compSel = $('p1Comp');
    if (compSel) {
      var seen = {}, comps = [];
      pending.forEach(function (o) { var c = String(o.company || '').trim(); if (c && !seen[c]) { seen[c] = true; comps.push(c); } });
      comps.sort(function (a, b) { return a.localeCompare(b, 'th'); });
      var curC = compSel.value;
      compSel.innerHTML = '<option value="">ทุกบริษัท (' + pending.length + ')</option>' + comps.map(function (c) {
        return '<option value="' + esc(c) + '"' + (c === curC ? ' selected' : '') + '>' + esc(c) + '</option>';
      }).join('');
    }
    var q = (($('p1Q') && $('p1Q').value) || '').trim().toLowerCase();
    var cf = ($('p1Comp') && $('p1Comp').value) || '';
    var shown = pending.filter(function (o) {
      if (cf && String(o.company || '').trim() !== cf) return false;
      if (!q) return true;
      var dbIt = itemByP151(o.p151, o.name);
      var cpn = (dbIt && dbIt.cpn) || '';
      return [o.name, o.p151, o.company, cpn].join(' ').toLowerCase().indexOf(q) >= 0;
    });
    if (!shown.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="p-5 text-center text-gray-400">ไม่มีรายการตรวจรับแล้วที่รอรับเข้าคลัง</td></tr>';
      return;
    }
    tbody.innerHTML = shown.map(function (o) {
      var dbIt = itemByP151(o.p151, o.name);
      var cpn = (dbIt && dbIt.cpn) || '';
      var rec = Number(o.receivedQty) || 0;
      var rem = remainingForOrder(o);
      var qQty = queuedQtyForOrder(o.row);
      return '<tr class="border-t hover:bg-emerald-50/30">' +
        '<td class="p-2 text-xs whitespace-nowrap"><b>แถว ' + o.row + '</b><div class="text-gray-400">' + esc(fd(o.received || o.ordered)) + '</div></td>' +
        '<td class="p-2"><div class="font-medium text-gray-900">' + esc(o.name) + '</div><div class="text-[11px] text-gray-400 font-mono">' + esc(o.p151 || '-') + (cpn ? ' · CPN: ' + esc(cpn) : '') + '</div></td>' +
        '<td class="p-2 text-xs">' + esc(o.company || '-') + '</td>' +
        '<td class="p-2 text-right whitespace-nowrap">' + nf(o.qty) + ' ' + esc(o.unit || '') + '</td>' +
        '<td class="p-2 text-right whitespace-nowrap text-gray-500">' + nf(rec) + '</td>' +
        '<td class="p-2 text-right whitespace-nowrap"><b class="text-emerald-700">' + nf(rem) + '</b>' + (qQty > 0 ? '<div class="text-[11px] text-indigo-600">ในคิวแล้ว ' + nf(qQty) + '</div>' : '') + '</td>' +
        '<td class="p-2 text-right whitespace-nowrap">' + (o.price > 0 ? nf(o.price) : '<span class="text-gray-300">-</span>') + '</td>' +
        '<td class="p-2 text-center whitespace-nowrap space-x-1">' +
          '<button type="button" onclick="STK.pickPendingOrder(' + o.row + ',false)" class="px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 text-xs">รับล็อตเดียว</button>' +
          '<button type="button" onclick="STK.pickPendingOrder(' + o.row + ',true)" class="px-2 py-1 rounded bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200 text-xs">แบ่งรับหลายล็อต</button>' +
        '</td>' +
      '</tr>';
    }).join('');
  };

  STK.pickPendingOrder = function (orderRow, isSplit, noScroll) {
    var o = (S.orders && S.orders.orders || []).filter(function (x) { return x.row === Number(orderRow); })[0];
    if (!o) return;
    var dbIt = itemByP151(o.p151, o.name);
    if (!dbIt) return fail('ไม่พบรายการ "' + o.name + '" ในฐานข้อมูลวัสดุ (Database)');
    if ($('rItem')) $('rItem').value = itemLabel(dbIt);
    var rem = Math.max(0, Math.round((remainingForOrder(o) - queuedQtyForOrder(o.row)) * 10000) / 10000) || remainingForOrder(o);
    recvMode = isSplit ? 'split' : 'single';
    recvLots = isSplit ? [{ lotNo: '', expiry: '', qty: '' }, { lotNo: '', expiry: '', qty: '' }] : [{ lotNo: '', expiry: '', qty: rem }];
    STK.recvPick(o.row);
    if ($('rOrder')) $('rOrder').value = String(o.row);
    if (o.company && $('rCompany')) $('rCompany').value = o.company;
    if ($('rPrice')) $('rPrice').value = o.price > 0 ? o.price : '';
    STK.recvPriceHint();
    STK.setRecvMode(recvMode, true);
    if (!noScroll) {
      var p2 = $('recvPart2');
      if (p2) p2.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  STK.setRecvMode = function (mode, keepLots) {
    recvMode = mode === 'split' ? 'split' : 'single';
    if (!keepLots) {
      syncRecvLotsFromDom();
      if (recvMode === 'single') {
        recvLots = [recvLots[0] || { lotNo: '', expiry: '', qty: '' }];
      } else if (recvLots.length < 2) {
        recvLots.push({ lotNo: '', expiry: '', qty: '' });
      }
    }
    var bs = $('rModeSingle'), bp = $('rModeSplit'), addBtn = $('rAddLotBtn');
    if (bs) bs.className = 'px-2.5 py-1 rounded-md font-medium transition ' + (recvMode === 'single' ? 'bg-white text-green-700 shadow-sm' : 'text-gray-600 hover:text-gray-900');
    if (bp) bp.className = 'px-2.5 py-1 rounded-md font-medium transition ' + (recvMode === 'split' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-900');
    if (addBtn) addBtn.classList.toggle('hidden', recvMode !== 'split');
    STK.drawRecvLots();
  };

  function syncRecvLotsFromDom() {
    var trs = document.querySelectorAll('#rLotsBody tr');
    if (!trs.length) return;
    trs.forEach(function (tr, i) {
      if (!recvLots[i]) return;
      recvLots[i].lotNo = tr.querySelector('.rl-lot').value;
      recvLots[i].expiry = tr.querySelector('.rl-exp').value;
      recvLots[i].qty = tr.querySelector('.rl-qty').value;
    });
  }

  STK.addRecvLot = function () {
    syncRecvLotsFromDom();
    recvLots.push({ lotNo: '', expiry: '', qty: '' });
    STK.drawRecvLots();
  };

  STK.removeRecvLot = function (i) {
    syncRecvLotsFromDom();
    recvLots.splice(i, 1);
    if (!recvLots.length) recvLots.push({ lotNo: '', expiry: '', qty: '' });
    STK.drawRecvLots();
  };

  STK.drawRecvLots = function () {
    var tb = $('rLotsBody');
    if (!tb) return;
    tb.innerHTML = recvLots.map(function (l, i) {
      return '<tr class="border-t">' +
        '<td class="p-1.5 text-center text-xs text-gray-400">' + (i + 1) + '</td>' +
        '<td class="p-1.5"><input class="rl-lot ' + INPUT + ' text-xs font-mono" value="' + esc(l.lotNo) + '" placeholder="เลขล็อต"></td>' +
        '<td class="p-1.5"><input class="rl-exp ' + INPUT + ' text-xs" type="date" value="' + esc(l.expiry) + '"></td>' +
        '<td class="p-1.5"><input class="rl-qty ' + INPUT + ' text-xs text-right font-medium" type="number" min="0" step="any" value="' + esc(l.qty) + '" placeholder="จำนวน" oninput="STK.updateRecvLotsSum()"></td>' +
        '<td class="p-1.5 text-center">' + (recvMode === 'split' && recvLots.length > 1 ? '<button type="button" onclick="STK.removeRecvLot(' + i + ')" class="text-red-500 hover:text-red-700"><i class="fa-solid fa-xmark"></i></button>' : '') + '</td>' +
      '</tr>';
    }).join('');
    STK.updateRecvLotsSum();
  };

  STK.updateRecvLotsSum = function () {
    syncRecvLotsFromDom();
    var sum = 0;
    recvLots.forEach(function (l) { sum += Number(l.qty) || 0; });
    sum = Math.round(sum * 10000) / 10000;
    var el = $('rLotsSum');
    if (!el) return;
    var row = Number($('rOrder') && $('rOrder').value) || 0;
    var o = row && S.orders ? S.orders.orders.filter(function (x) { return x.row === row; })[0] : null;
    if (o) {
      var rem = Math.max(0, Math.round((remainingForOrder(o) - queuedQtyForOrder(o.row)) * 10000) / 10000);
      el.innerHTML = 'รวมที่กรอก <b>' + nf(sum) + '</b> ' + esc(o.unit || '') + ' / รอรับคงเหลือ <b>' + nf(rem) + '</b>';
    } else {
      el.innerHTML = sum > 0 ? 'รวมที่กรอก <b>' + nf(sum) + '</b>' : '';
    }
  };

  STK.recvPick = function (orderRow) {
    var it = parseItem($('rItem') && $('rItem').value);
    S.r.itemId = it ? it.id : '';
    if ($('rInfo')) {
      $('rInfo').innerHTML = it ? 'หน่วย: <b>' + esc(it.unit || '-') + '</b> · ขนาดบรรจุ: <b class="font-mono">' + esc(it.pack || '-') + '</b> · รหัส CPN: <span class="font-mono">' + esc(it.cpn || '-') + '</span> · คงเหลือใช้ได้ ' + nf(it.usable) + ' · ' + badge(it.status) : '<span class="text-red-500">ยังไม่ได้เลือกวัสดุ</span>';
    }
    if ($('rPack') && it) $('rPack').value = it.pack || '';
    var sel = $('rOrder');
    if (sel) {
      var list = it && it.p151 && S.orders ? S.orders.orders.filter(function (o) { return o.p151 === it.p151; }) : [];
      sel.innerHTML = '<option value="">ไม่ผูกรายการสั่งซื้อ (คีย์รับเข้าเอง)</option>' + list.map(function (o) {
        return '<option value="' + o.row + '"' + (Number(orderRow) === o.row ? ' selected' : '') + '>แถว ' + o.row + ' · ' + esc(o.company) + ' · ' + nf(o.qty) + ' ' + esc(o.unit) + ' · ' + esc(o.status) + '</option>';
      }).join('');
    }
    if (orderRow) STK.recvOrder();
    STK.recvPriceHint();
    STK.drawRecvLots();
  };

  STK.recvPriceHint = function () {
    var it = parseItem($('rItem') && $('rItem').value), el = $('rPriceHint');
    if (!el) return;
    var sum = 0;
    recvLots.forEach(function (l) { sum += Number(l.qty) || 0; });
    el.innerHTML = it ? priceMsg(it.planPrice, Number($('rPrice').value) || 0, sum, (S.orders && S.orders.warnPct) || 0) : '';
  };

  STK.recvOrder = function () {
    var row = Number($('rOrder') && $('rOrder').value);
    var o = S.orders && S.orders.orders.filter(function (x) { return x.row === row; })[0];
    if (!o) { STK.updateRecvLotsSum(); return; }
    if (o.company && $('rCompany')) $('rCompany').value = o.company;
    if (o.price > 0 && $('rPrice')) $('rPrice').value = o.price;
    if (recvMode === 'single' && recvLots[0] && !(Number(recvLots[0].qty) > 0)) {
      recvLots[0].qty = Math.max(0, Math.round((remainingForOrder(o) - queuedQtyForOrder(o.row)) * 10000) / 10000) || remainingForOrder(o);
      STK.drawRecvLots();
    }
    STK.recvPriceHint();
  };

  STK.clearRecvForm = function () {
    ['rItem', 'rCompany', 'rBrand', 'rPack', 'rPrice', 'rNote'].forEach(function (id) { if ($(id)) $(id).value = ''; });
    if ($('rOrder')) $('rOrder').value = '';
    if ($('rInfo')) $('rInfo').innerHTML = '';
    if ($('rPriceHint')) $('rPriceHint').innerHTML = '';
    recvMode = 'single';
    recvLots = [{ lotNo: '', expiry: '', qty: '' }];
    STK.setRecvMode('single', true);
  };

  STK.queueReceive = async function () {
    syncRecvLotsFromDom();
    var it = parseItem($('rItem').value);
    if (!it) return fail('กรุณาเลือกวัสดุจากรายการ');
    var validLots = recvLots.filter(function (l) { return Number(l.qty) > 0; });
    if (!validLots.length) return fail('ใส่จำนวนที่รับอย่างน้อย 1 ล็อต (มากกว่า 0)');
    var missingExp = validLots.some(function (l) { return !String(l.expiry || '').trim(); });
    if (missingExp) {
      var c = await Swal.fire({ title: 'มีล็อตที่ไม่ได้ใส่วันหมดอายุ', text: 'ล็อตที่ไม่ใส่วันหมดอายุจะถูกจ่ายหลังสุดและไม่ถูกแจ้งเตือนหมดอายุ ต้องการส่งเข้าคิวต่อหรือไม่', icon: 'question', showCancelButton: true, confirmButtonText: 'ส่งเข้าคิวต่อ', cancelButtonText: 'กลับไปใส่' });
      if (!c.isConfirmed) return;
    }
    var ordRow = Number($('rOrder').value) || 0;
    var kind = $('rKind').value;
    var company = $('rCompany').value.trim();
    var brand = $('rBrand').value.trim();
    var pack = ($('rPack') && $('rPack').value.trim()) || it.pack || '';
    var price = Number($('rPrice').value) || 0;
    var received = $('rDate').value || today();
    var note = $('rNote').value.trim();
    var cpn = String(it.cpn || '').trim().toUpperCase();
    if (cpn === 'DN00353') cpn = 'DT00228';

    validLots.forEach(function (l) {
      S.ei.queue.push({
        qid: 'Q_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        orderRow: ordRow,
        itemId: it.id,
        name: it.name,
        cpn: cpn,
        p151: it.p151 || '',
        unit: it.unit || '',
        pack: pack,
        kind: kind,
        company: company,
        brand: brand,
        lotNo: String(l.lotNo || '').trim(),
        expiry: String(l.expiry || '').trim(),
        received: received,
        qty: Number(l.qty),
        price: price,
        note: note,
        sel: true,
        webReceived: false,
        lotId: '',
        exportedId: ''
      });
    });
    saveEiCache();
    STK.clearRecvForm();
    STK.drawRecvPending();
    STK.drawEImport();
    await toast('ส่งเข้าคิวส่วนที่ 3 แล้ว (' + validLots.length + ' ล็อต)');
    var p3 = $('recvPart3');
    if (p3) p3.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  STK.drawEImport = function () {
    var tbody = $('eiBody');
    if (!tbody) return;
    var mode = ($('eiFilter') && $('eiFilter').value) || 'all';
    var qAll = S.ei.queue || [];
    var list = qAll.filter(function (q) {
      if (mode === 'pending_web') return !q.webReceived;
      if (mode === 'pending_xls') return !q.exportedId;
      return true;
    });
    var sumEl = $('eiSummary');
    if (sumEl) {
      var waitWeb = qAll.filter(function (q) { return !q.webReceived; }).length;
      var waitXls = qAll.filter(function (q) { return !q.exportedId; }).length;
      sumEl.innerHTML = 'ในคิวทั้งหมด <b>' + qAll.length + '</b> รายการ · รอยืนยันเข้าคลัง Web App <b>' + waitWeb + '</b> รายการ · รอสร้างไฟล์ E-Import <b>' + waitXls + '</b> รายการ';
    }
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="10" class="p-6 text-center text-gray-400">ยังไม่มีรายการในคิวส่วนที่ 3 — เลือกรายการจากส่วนที่ 1 หรือกรอกรับเข้าในส่วนที่ 2 แล้วกดส่งเข้าคิว</td></tr>';
      STK.eiUpdateCount();
      return;
    }
    tbody.innerHTML = list.map(function (q) {
      var cpn = String(q.cpn || '').trim().toUpperCase();
      if (cpn === 'DN00353') cpn = 'DT00228';
      var m = (typeof XlsWriter !== 'undefined' && XlsWriter.getMasterItem) ? XlsWriter.getMasterItem(cpn) : null;
      var unitBadge = m
        ? '<span class="inline-block px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 text-[11px] font-mono">' + esc(m.muId + ':' + m.muName + ' · ' + m.packId + ':' + m.packName) + '</span>'
        : '<span class="inline-block px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[11px]">ตรวจรหัส CPN</span>';
      var ro = q.webReceived ? ' disabled' : '';
      var webBadge = q.webReceived
        ? '<span class="inline-block px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[11px]">✓ รับเข้าคลังแล้ว (' + esc(q.lotId || '') + ')</span>'
        : '<span class="inline-block px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[11px]">รอยืนยันเข้าคลัง</span>';
      var xlsBadge = q.exportedId
        ? '<span class="inline-block px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800 text-[11px]">✓ ' + esc(q.exportedId) + '</span>'
        : '<span class="text-gray-400 text-[11px]">ยังไม่ส่งออก .xls</span>';
      var srcTag = q.orderRow ? ('<div class="text-[11px] text-blue-600">ใบสั่งแถว ' + q.orderRow + '</div>') : '<div class="text-[11px] text-purple-600">คีย์รับเข้าเอง</div>';

      return '<tr class="border-t hover:bg-indigo-50/30 ' + (q.sel ? 'bg-indigo-50/40' : '') + '">' +
        '<td class="p-2 text-center"><input type="checkbox" class="ei-chk" ' + (q.sel ? 'checked' : '') + ' onchange="STK.eiToggleRow(\'' + esc(q.qid) + '\', this.checked)"></td>' +
        '<td class="p-2">' +
          '<div class="font-medium text-gray-900">' + esc(q.name) + '</div>' +
          '<div class="flex flex-wrap items-center gap-1.5 mt-1">' +
            '<input type="text" value="' + esc(cpn) + '" placeholder="รหัส CPN" onchange="STK.eiEdit(\'' + esc(q.qid) + '\',\'cpn\',this.value);STK.drawEImport()" class="border rounded px-1.5 py-0.5 text-xs font-mono w-24 ' + (cpn ? 'border-gray-300 bg-gray-50' : 'border-red-400 bg-red-50') + '" title="รหัส ProductID ใน CPN">' +
            (q.p151 ? '<span class="text-[11px] text-gray-400 font-mono">' + esc(q.p151) + '</span>' : '') +
            unitBadge +
          '</div>' +
        '</td>' +
        '<td class="p-2 text-xs"><div>' + esc(q.company || '-') + '</div>' + srcTag + '</td>' +
        '<td class="p-2"><input type="text" value="' + esc(q.pack || '') + '"' + ro + ' placeholder="1x1" oninput="STK.eiEdit(\'' + esc(q.qid) + '\',\'pack\',this.value)" class="border rounded px-2 py-1 w-full text-xs font-mono"></td>' +
        '<td class="p-2"><input type="number" min="0" step="any" value="' + esc(q.qty) + '"' + ro + ' oninput="STK.eiEdit(\'' + esc(q.qid) + '\',\'qty\',this.value)" class="border rounded px-2 py-1 w-full text-right text-xs"></td>' +
        '<td class="p-2"><input type="number" min="0" step="any" value="' + esc(q.price) + '"' + ro + ' oninput="STK.eiEdit(\'' + esc(q.qid) + '\',\'price\',this.value)" class="border rounded px-2 py-1 w-full text-right text-xs"></td>' +
        '<td class="p-2"><input type="text" value="' + esc(q.lotNo) + '"' + ro + ' placeholder="เลข Lot" oninput="STK.eiEdit(\'' + esc(q.qid) + '\',\'lotNo\',this.value)" class="border rounded px-2 py-1 w-full text-xs font-mono"></td>' +
        '<td class="p-2"><input type="date" value="' + esc(q.expiry) + '"' + ro + ' onchange="STK.eiEdit(\'' + esc(q.qid) + '\',\'expiry\',this.value)" class="border rounded px-2 py-1 w-full text-xs"></td>' +
        '<td class="p-2 text-xs space-y-1"><div>' + webBadge + '</div><div>' + xlsBadge + '</div></td>' +
        '<td class="p-2 text-center"><button type="button" onclick="STK.removeQueueRow(\'' + esc(q.qid) + '\')" class="text-red-500 hover:text-red-700" title="ลบออกจากคิว"><i class="fa-solid fa-trash-can"></i></button></td>' +
      '</tr>';
    }).join('');
    STK.eiUpdateCount();
  };

  STK.eiEdit = function (qid, field, val) {
    var q = (S.ei.queue || []).filter(function (x) { return x.qid === qid; })[0];
    if (!q) return;
    q[field] = (field === 'qty' || field === 'price') ? (Number(val) || 0) : val;
    saveEiCache();
  };

  STK.eiToggleRow = function (qid, checked) {
    var q = (S.ei.queue || []).filter(function (x) { return x.qid === qid; })[0];
    if (q) { q.sel = !!checked; saveEiCache(); }
    STK.eiUpdateCount();
  };

  STK.eiToggleAll = function (checked) {
    var mode = ($('eiFilter') && $('eiFilter').value) || 'all';
    (S.ei.queue || []).forEach(function (q) {
      var show = (mode === 'pending_web') ? !q.webReceived : ((mode === 'pending_xls') ? !q.exportedId : true);
      if (show) q.sel = !!checked;
    });
    saveEiCache();
    STK.drawEImport();
  };

  STK.eiUpdateCount = function () {
    var sel = (S.ei.queue || []).filter(function (q) { return q.sel; });
    var webWait = sel.filter(function (q) { return !q.webReceived; }).length;
    if ($('eiSelCount')) $('eiSelCount').textContent = String(sel.length);
    if ($('eiWebCount')) $('eiWebCount').textContent = String(webWait);
  };

  STK.removeQueueRow = function (qid) {
    S.ei.queue = (S.ei.queue || []).filter(function (x) { return x.qid !== qid; });
    saveEiCache();
    STK.drawRecvPending();
    STK.drawEImport();
  };

  STK.clearDoneQueue = function () {
    var before = (S.ei.queue || []).length;
    S.ei.queue = (S.ei.queue || []).filter(function (q) { return !(q.webReceived && q.exportedId); });
    var removed = before - S.ei.queue.length;
    saveEiCache();
    STK.drawRecvPending();
    STK.drawEImport();
    if (!removed) toast('ยังไม่มีรายการที่ทั้งยืนยันเข้าคลังและส่งออก .xls แล้ว');
  };

  STK.confirmQueueReceive = async function (andExport) {
    var selected = (S.ei.queue || []).filter(function (q) { return q.sel; });
    if (!selected.length) return fail('กรุณาติ๊กเลือกรายการในคิวส่วนที่ 3 อย่างน้อย 1 รายการ');
    var toReceive = selected.filter(function (q) { return !q.webReceived; });

    if (toReceive.length) {
      var btn = $('eiWebBtn'), btn2 = $('eiBothBtn');
      if (btn) btn.disabled = true;
      if (btn2) btn2.disabled = true;
      var okCount = 0;
      try {
        for (var i = 0; i < toReceive.length; i++) {
          var q = toReceive[i];
          if (!(Number(q.qty) > 0)) { await fail('จำนวนรับของ "' + q.name + '" ต้องมากกว่า 0'); break; }
          var r = await call('stockReceive', {
            itemId: q.itemId, kind: q.kind || 'รับเข้า', company: q.company || '', brand: q.brand || '', pack: q.pack || '',
            lotNo: q.lotNo || '', expiry: q.expiry || '', received: q.received || today(),
            qty: Number(q.qty), price: Number(q.price) || 0, orderRow: q.orderRow || '', note: q.note || ''
          });
          if (!r || !r.success) { await fail((r && r.error) || ('รับเข้าคลัง "' + q.name + '" ไม่สำเร็จ')); break; }
          q.webReceived = true;
          q.lotId = r.lotId || '';
          okCount++;
        }
      } finally {
        if (btn) btn.disabled = false;
        if (btn2) btn2.disabled = false;
      }
      saveEiCache();
      if (okCount > 0) {
        S.board = null; S.orders = null;
        await Promise.all([loadBoard(true), loadOrders(true)]);
        STK.drawRecvPending();
        STK.drawEImport();
      }
      if (okCount < toReceive.length) return;
      if (!andExport) await toast('ยืนยันรับเข้าคลังสำเร็จ ' + okCount + ' ล็อตแล้ว');
    } else if (!andExport) {
      return toast('รายการที่เลือกยืนยันรับเข้าคลังไปหมดแล้ว');
    }

    if (andExport) await STK.exportEImport();
  };

  STK.exportEImport = async function () {
    if (typeof XlsWriter === 'undefined' || !XlsWriter.downloadEImport) {
      return fail('ไม่พบโมดูล XlsWriter.downloadEImport (กรุณารีเฟรชหน้าเว็บ)');
    }
    var selected = (S.ei.queue || []).filter(function (q) { return q.sel; });
    if (!selected.length) return fail('กรุณาติ๊กเลือกรายการที่ต้องการสร้างไฟล์ E-Import อย่างน้อย 1 รายการ');

    var instockId = (($('eiInstockId') && $('eiInstockId').value) || '').trim();
    if (!instockId) return fail('กรุณาระบุเลขที่ใบรับอ้างอิง (InstockID) เช่น SO-6911-00001');
    var label = (($('eiLabel') && $('eiLabel').value) || 'ทันตกรรมวังทอง').trim();

    var lines = [];
    var missingCpn = [];
    selected.forEach(function (q) {
      var cpn = String(q.cpn || '').trim().toUpperCase();
      if (cpn === 'DN00353') cpn = 'DT00228';
      if (!cpn) { missingCpn.push(q.name); return; }
      lines.push({
        qid: q.qid,
        InstockID: instockId,
        ProductID: cpn,
        ProductName: q.name,
        LotDetail: String(q.pack || '').trim() || undefined,
        Quantity: Number(q.qty) || 0,
        UnitCost: Number(q.price) || 0,
        LotNumber: String(q.lotNo || '').trim(),
        ExpDate: String(q.expiry || '').trim()
      });
    });

    if (missingCpn.length) {
      return fail('รายการต่อไปนี้ยังไม่มีรหัส CPN (ProductID): ' + missingCpn.join(', '));
    }
    if (!lines.length) return fail('ไม่พบรายการที่เลือก');

    var fname = XlsWriter.downloadEImport(lines, instockId, label, new Date());
    selected.forEach(function (q) { q.exportedId = instockId; });
    saveEiCache();
    var nextId = nextInstockId(instockId);
    if ($('eiInstockId')) $('eiInstockId').value = nextId;
    STK.drawEImport();
    await toast('ดาวน์โหลดไฟล์ ' + fname + ' (' + lines.length + ' รายการ · 5 ชีต) แล้ว');
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

  // ---------- สั่งซื้อวัสดุ (HosStock) ----------
  var UNIT_TH = { box: 'กล่อง', pcs: 'ชิ้น', pack: 'แพ็ค', pck: 'แพ็ค', set: 'ชุด', bot: 'ขวด', roll: 'ม้วน', rol: 'ม้วน', role: 'ม้วน', pair: 'คู่', gal: 'แกลลอน', sheet: 'แผ่น' };
  function unitTh(u) {
    var k = String(u || '').trim().toLowerCase().replace(/\./g, '');
    return UNIT_TH[k] || String(u || '').trim();
  }
  function copyLine(name, qty, unit, th) { return name + ' ' + nf(qty) + ' ' + (th ? unitTh(unit) : String(unit || '')); }
  function copyText(t) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(t);
    return new Promise(function (res, rej) {
      var ta = document.createElement('textarea');
      ta.value = t; ta.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(ta); ta.select();
      try { if (document.execCommand('copy')) res(); else rej(new Error('copy failed')); } catch (e) { rej(e); }
      document.body.removeChild(ta);
    });
  }
  async function doCopy(lines) {
    if (!lines.length) return fail('ยังไม่ได้เลือกรายการที่จะคัดลอก');
    var text = lines.join('\n');
    try { await copyText(text); }
    catch (e) {
      return Swal.fire({ title: 'คัดลอกอัตโนมัติไม่ได้ ให้คัดลอกข้อความนี้เอง', html: '<textarea readonly class="swal2-textarea" style="height:160px">' + esc(text) + '</textarea>' });
    }
    toast('คัดลอก ' + lines.length + ' รายการแล้ว');
  }
  function useThai() { var c = $('copyTh'); return c ? c.checked : true; }
  function priceMsg(planPrice, price, qty, warn) {
    if (!(price > 0)) return '';
    if (!(planPrice > 0)) {
      return '<div class="mt-1 p-2 rounded-lg bg-slate-50 text-slate-600">ไม่มีราคาแผนอ้างอิง · ราคาที่ซื้อ <b>' + nf(price) + '</b> บาท/หน่วย' + (qty > 0 ? ' (รวม <b>' + nf(price * qty) + '</b> บาท)' : '') + '</div>';
    }
    var diff = price - planPrice, pct = Math.round(diff / planPrice * 1000) / 10;
    var cls = pct > warn ? 'bg-red-50 text-red-700' : (diff > 0 ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700');
    var word = diff > 0 ? 'สูงกว่าแผน' : (diff < 0 ? 'ต่ำกว่าแผน' : 'เท่ากับแผน');
    return '<div class="mt-1 p-2 rounded-lg ' + cls + '">ราคาแผน ' + nf(planPrice) + ' → ราคาที่ซื้อ <b>' + nf(price) + '</b> · <b>' + word + (diff ? ' ' + nf(Math.abs(diff)) + ' (' + (diff > 0 ? '+' : '-') + Math.abs(pct) + '%)' : '') + '</b>' +
      (qty > 0 ? ' · รวมซื้อ <b>' + nf(price * qty) + '</b> บาท' + (diff ? ' (' + (diff > 0 ? 'เกินแผน ' : 'ประหยัด ') + nf(Math.abs(diff * qty)) + ' บาท)' : '') : '') + '</div>';
  }
  function diffCell(o, warn) {
    if (o.diff === null) return '<span class="text-gray-300">-</span>';
    var cls = o.diffPct > warn ? 'text-red-600 font-medium' : (o.diff > 0 ? 'text-amber-600' : (o.diff < 0 ? 'text-green-600' : 'text-gray-500'));
    return '<span class="' + cls + '">' + (o.diff > 0 ? '+' : '') + nf(o.diff) + '<span class="text-[11px]"> (' + (o.diffPct > 0 ? '+' : '') + o.diffPct + '%)</span></span>';
  }

  function formatGroupedCopy(items) {
    var groups = {};
    items.forEach(function (x) {
      var c = String(x.company || 'ไม่ระบุบริษัท').trim() || 'ไม่ระบุบริษัท';
      if (!groups[c]) groups[c] = [];
      groups[c].push('- ' + x.line);
    });
    return Object.keys(groups).sort(function (a, b) {
      return a.localeCompare(b, 'th');
    }).map(function (c) {
      return '[' + c + ']\n' + groups[c].join('\n');
    }).join('\n\n');
  }
  async function copyGroupedItems(items, countLabel) {
    if (!items.length) return fail('ยังไม่ได้เลือกรายการที่จะคัดลอก');
    var text = formatGroupedCopy(items);
    try { await copyText(text); }
    catch (e) {
      return Swal.fire({ title: 'คัดลอกอัตโนมัติไม่ได้ ให้คัดลอกข้อความนี้เอง', html: '<textarea readonly class="swal2-textarea" style="height:180px">' + esc(text) + '</textarea>' });
    }
    toast('คัดลอกแยกตามบริษัทแล้ว ' + (countLabel || items.length) + ' รายการ');
  }
  async function renderOrders() {
    await loadOrders(true);
    S.sel = {};
    var st = ['all'].concat(S.orders.statuses);
    var fy = Number(S.orders.fy);
    var alertCnt = getAlertStockItems().length;
    var sortOpts = [['row_desc', 'ล่าสุด (แถวใหม่สุด)'], ['company_asc', 'เรียงตามชื่อบริษัท (ก-ฮ / A-Z)']];
    body('<div class="flex flex-wrap items-center gap-2 mb-3"><input id="oq" placeholder="ค้นหารายการ / บริษัท" value="' + esc(S.of.q) + '" oninput="STK.filterOrders()" class="' + INPUT + ' md:w-56">' +
      '<select id="os" onchange="STK.filterOrders()" class="border rounded-lg px-3 py-1.5 text-sm">' + st.map(function (s) { return '<option value="' + esc(s) + '"' + (S.of.status === s ? ' selected' : '') + '>' + (s === 'all' ? 'ทุกสถานะ' : esc(s)) + '</option>'; }).join('') + '</select>' +
      '<button type="button" onclick="STK.openOrderCheck()" class="' + BTN + 'bg-amber-500 text-white hover:bg-amber-600 font-medium shadow-sm"><i class="fa-solid fa-triangle-exclamation mr-1"></i>ตรวจสอบวัสดุใกล้หมด / หมด / หมดอายุ (' + alertCnt + ')</button>' +
      '<button type="button" onclick="STK.orderForm(0)" class="' + BTN + 'bg-blue-500 text-white hover:bg-blue-600"><i class="fa-solid fa-plus mr-1"></i>เพิ่มรายการสั่งซื้อ</button>' +
      '<button type="button" onclick="STK.copySel()" class="' + BTN + 'bg-emerald-500 text-white hover:bg-emerald-600"><i class="fa-regular fa-copy mr-1"></i>คัดลอกที่เลือก (<span id="selN">0</span>)</button>' +
      '<button type="button" onclick="STK.createSet && STK.createSet()" class="' + BTN + 'bg-indigo-500 text-white hover:bg-indigo-600"><i class="fa-solid fa-layer-group mr-1"></i>สร้างชุดจัดซื้อจากที่เลือก</button>' +
      '<label class="flex items-center gap-1 text-sm text-gray-600"><input type="checkbox" id="copyTh" checked> แปลหน่วยเป็นไทย</label></div>' +
      '<div class="flex flex-wrap items-center justify-between gap-2 mb-1">' +
        '<p class="text-xs text-gray-500">ปีงบ ' + fy + ' · นับยอดสั่งเทียบแผนตั้งแต่ 1 ต.ค. ' + (fy - 1) + ' เป็นต้นไป เฉพาะสถานะ "สั่งสินค้าแล้ว" ขึ้นไป (ใบเสนอราคาไม่นับ) · เตือนเมื่อราคาสูงกว่าแผนเกิน ' + nf(S.orders.warnPct) + '%</p>' +
        '<div class="flex items-center gap-1.5 text-xs"><span class="text-gray-500">เรียงตาราง:</span><select id="oSort" onchange="STK.filterOrders()" class="border rounded-lg px-2 py-1 bg-white">' +
          sortOpts.map(function (o) { return '<option value="' + o[0] + '"' + ((S.of.sort || 'row_desc') === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') +
        '</select></div>' +
      '</div>' +
      '<div id="ocmp" class="text-sm mb-2"></div>' +
      '<div class="overflow-x-auto"><table class="w-full text-sm border-collapse"><thead class="bg-gray-100"><tr><th class="' + TH + '"><input type="checkbox" aria-label="เลือกทั้งหมด" onchange="STK.selAll(this.checked)"></th>' +
      ['แถว', 'วันที่สั่ง', 'รายการ', 'บริษัท', 'จำนวน', 'ราคาที่ซื้อ', 'ราคาแผน', 'ส่วนต่าง', 'สถานะ', ''].map(function (h) { return '<th class="' + TH + '">' + h + '</th>'; }).join('') + '</tr></thead><tbody id="obody"></tbody></table></div>');
    drawOrders();
  }
  STK.filterOrders = function () {
    S.of.q = $('oq').value;
    S.of.status = $('os').value;
    if ($('oSort')) S.of.sort = $('oSort').value;
    drawOrders();
  };
  function updateSelN() { var n = Object.keys(S.sel).filter(function (k) { return S.sel[k]; }).length; if ($('selN')) $('selN').textContent = n; }
  STK.toggleSel = function (row, on) { S.sel[row] = on; updateSelN(); };
  STK.selAll = function (on) { (S.shown || []).forEach(function (o) { S.sel[o.row] = on; }); drawOrders(); };
  function selectedOrders() { return S.orders.orders.filter(function (o) { return S.sel[o.row]; }); }
  STK.copySel = function () {
    var th = useThai();
    var list = selectedOrders().map(function (o) {
      return { company: o.company || 'ไม่ระบุบริษัท', line: copyLine(o.name, o.qty, o.unit, th) };
    });
    copyGroupedItems(list, list.length);
  };
  STK.copyOne = function (row) {
    var o = S.orders.orders.filter(function (x) { return x.row === row; })[0];
    if (o) doCopy([copyLine(o.name, o.qty, o.unit, useThai())]);
  };
  function drawOrders() {
    var q = S.of.q.trim().toLowerCase(), warn = S.orders.warnPct;
    var sortBy = S.of.sort || 'row_desc';
    var rows = S.orders.orders.filter(function (o) {
      if (S.of.status !== 'all' && o.status !== S.of.status) return false;
      return !q || (o.name + ' ' + o.company + ' ' + o.p151).toLowerCase().indexOf(q) >= 0;
    });
    if (sortBy === 'company_asc') {
      rows.sort(function (a, b) {
        return String(a.company || 'ฮฮฮ').localeCompare(String(b.company || 'ฮฮฮ'), 'th') || (b.row - a.row);
      });
    } else {
      rows.sort(function (a, b) { return b.row - a.row; });
    }
    S.shown = rows;
    var sum = 0, n = 0;
    rows.forEach(function (o) { if (o.diff !== null) { sum += o.diff * o.qty; n++; } });
    $('ocmp').innerHTML = n ? 'เทียบราคากับแผน ' + n + ' รายการที่แสดง: รวม<b class="' + (sum > 0 ? 'text-red-600' : 'text-green-600') + '"> ' + (sum > 0 ? 'สูงกว่าแผน ' : (sum < 0 ? 'ต่ำกว่าแผน ' : 'เท่ากับแผน ')) + nf(Math.abs(sum)) + ' บาท</b>' : '';
    $('obody').innerHTML = rows.map(function (o) {
      var cls = o.status === 'ตรวจรับแล้ว' || o.status === 'ได้รับสินค้าแล้ว' ? 'bg-green-100 text-green-700' : (o.status === 'ได้รับใบเสนอราคาแล้ว' ? 'bg-gray-100 text-gray-600' : 'bg-blue-100 text-blue-700');
      var it = null;
      S.board.items.forEach(function (x) { if (x.p151 && x.p151 === o.p151) it = x; });
      return '<tr class="border-t hover:bg-gray-50"><td class="p-2"><input type="checkbox" aria-label="เลือกแถว ' + o.row + '"' + (S.sel[o.row] ? ' checked' : '') + ' onchange="STK.toggleSel(' + o.row + ',this.checked)"></td>' +
        '<td class="p-2 text-xs">' + o.row + '</td><td class="p-2 text-xs whitespace-nowrap">' + fd(o.ordered) + '</td><td class="p-2">' + esc(o.name) + '<div class="text-[11px] text-gray-400">' + esc(o.p151) + '</div></td><td class="p-2">' + esc(o.company) + '</td>' +
        '<td class="p-2 text-right whitespace-nowrap">' + nf(o.qty) + ' ' + esc(o.unit) + '</td><td class="p-2 text-right">' + nf(o.price) + '</td>' +
        '<td class="p-2 text-right text-gray-500">' + (o.planPrice > 0 ? nf(o.planPrice) : '-') + '</td><td class="p-2 text-right whitespace-nowrap">' + diffCell(o, warn) + '</td>' +
        '<td class="p-2"><span class="px-2 py-0.5 rounded-full text-xs whitespace-nowrap ' + cls + '">' + esc(o.status) + '</span></td>' +
        '<td class="p-2 whitespace-nowrap"><button type="button" onclick="STK.copyOne(' + o.row + ')" class="text-xs text-emerald-600 underline mr-2">คัดลอก</button>' +
        '<button type="button" onclick="STK.orderForm(' + o.row + ')" class="text-xs text-blue-600 underline mr-2">แก้ไข</button>' +
        (it ? '<button type="button" onclick="STK.go(\'recv\',{item:\'' + it.id + '\',order:' + o.row + '})" class="text-xs text-green-600 underline mr-2">รับของ</button>' : '') +
        '<button type="button" onclick="STK.delOrder(' + o.row + ')" class="text-xs text-red-500 underline">ลบ</button></td></tr>';
    }).join('') || '<tr><td colspan="11" class="p-4 text-center text-gray-400">ไม่พบรายการ</td></tr>';
    updateSelN();
  }
  // ---------- ตรวจสอบวัสดุใกล้หมด / หมด / ใกล้หมดอายุ / หมดอายุ เพื่อสั่งซื้อ ----------
  function getAlertStockItems() {
    var items = (S.board && S.board.items) ? S.board.items : [];
    return items.filter(function (it) {
      return it.status === 'หมด' || it.status === 'ใกล้หมด' || it.nearQty > 0 || it.expQty > 0;
    });
  }

  var alertFilter = 'all';
  var alertSel = {};
  STK.openOrderCheck = function () {
    alertFilter = 'all';
    alertSel = {};
    modal('ตรวจสอบวัสดุที่ หมด / ใกล้หมด / ใกล้หมดอายุ / หมดอายุแล้ว',
      '<div class="space-y-3">' +
        '<div class="text-xs text-gray-500">ติ๊กเลือกรายการที่ต้องการสั่งซื้อ แล้วกด <b>"สั่งซื้อรายการที่เลือก"</b> เพื่อกรอกรายละเอียดการสั่งซื้อแบบแนวนอน</div>' +
        '<div class="flex flex-wrap items-center gap-2">' +
          '<input id="chkAlertQ" oninput="STK.renderAlertList()" placeholder="ค้นหาชื่อ / รหัส D / P151..." class="' + INPUT + ' md:w-64">' +
          '<div id="chkAlertTabs" class="flex flex-wrap gap-1.5 text-xs"></div>' +
        '</div>' +
        '<div class="overflow-x-auto max-h-[52vh] border rounded-lg">' +
          '<table class="w-full text-sm border-collapse">' +
            '<thead class="bg-gray-100 text-xs text-gray-600 sticky top-0">' +
              '<tr>' +
                '<th class="' + TH + ' text-center w-9"><input type="checkbox" id="chkAlertAll" onchange="STK.toggleAllAlerts(this.checked)"></th>' +
                '<th class="' + TH + '">รายการวัสดุ</th>' +
                '<th class="' + TH + ' text-right">คงเหลือ / Min</th>' +
                '<th class="' + TH + ' text-center">สถานะสต็อก / วันหมดอายุ</th>' +
                '<th class="' + TH + ' text-right">สั่งแล้ว / แผนปี ' + esc(S.orders && S.orders.fy || '') + '</th>' +
                '<th class="' + TH + ' text-right">แนะนำสั่ง</th>' +
              '</tr>' +
            '</thead>' +
            '<tbody id="chkAlertBody" class="divide-y"></tbody>' +
          '</table>' +
        '</div>' +
        '<div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t">' +
          '<div class="text-xs text-gray-600">เลือกไว้ <b id="chkAlertCount" class="text-blue-700">0</b> รายการ</div>' +
          '<div class="flex gap-2">' +
            '<button type="button" onclick="STK.close()" class="' + BTN + 'bg-gray-100 hover:bg-gray-200">ปิด</button>' +
            '<button type="button" id="btnProceedAlertOrder" onclick="STK.proceedAlertOrders()" disabled class="' + BTN + 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 font-medium"><i class="fa-solid fa-cart-plus mr-1"></i>สั่งซื้อรายการที่เลือก (<span id="chkAlertBtnN">0</span>)</button>' +
          '</div>' +
        '</div>' +
      '</div>', 'xl');
    STK.renderAlertList();
  };

  STK.setAlertFilter = function (f) { alertFilter = f; STK.renderAlertList(); };
  STK.toggleAlertItem = function (id, on) { alertSel[id] = on; updateAlertSelCount(); };
  STK.toggleAllAlerts = function (on) {
    getFilteredAlerts().forEach(function (it) { alertSel[it.id] = on; });
    STK.renderAlertList();
  };
  function getFilteredAlerts() {
    var q = ($('chkAlertQ') && $('chkAlertQ').value.trim().toLowerCase()) || '';
    return getAlertStockItems().filter(function (it) {
      if (q && (it.name + ' ' + it.id + ' ' + it.p151 + ' ' + it.cpn).toLowerCase().indexOf(q) < 0) return false;
      if (alertFilter === 'out') return it.status === 'หมด';
      if (alertFilter === 'low') return it.status === 'ใกล้หมด';
      if (alertFilter === 'nearExp') return it.nearQty > 0;
      if (alertFilter === 'expired') return it.expQty > 0;
      return true;
    });
  }
  function updateAlertSelCount() {
    var n = Object.keys(alertSel).filter(function (k) { return alertSel[k]; }).length;
    if ($('chkAlertCount')) $('chkAlertCount').textContent = n;
    if ($('chkAlertBtnN')) $('chkAlertBtnN').textContent = n;
    if ($('btnProceedAlertOrder')) $('btnProceedAlertOrder').disabled = n === 0;
  }
  STK.renderAlertList = function () {
    var all = getAlertStockItems();
    var cnt = {
      all: all.length,
      out: all.filter(function (x) { return x.status === 'หมด'; }).length,
      low: all.filter(function (x) { return x.status === 'ใกล้หมด'; }).length,
      nearExp: all.filter(function (x) { return x.nearQty > 0; }).length,
      expired: all.filter(function (x) { return x.expQty > 0; }).length
    };
    var tabs = [
      ['all', 'ทั้งหมด (' + cnt.all + ')', 'bg-slate-800 text-white', 'bg-gray-100 text-gray-700'],
      ['out', 'หมด (' + cnt.out + ')', 'bg-red-600 text-white', 'bg-red-50 text-red-700 border border-red-200'],
      ['low', 'ใกล้หมด (' + cnt.low + ')', 'bg-amber-500 text-white', 'bg-amber-50 text-amber-800 border border-amber-200'],
      ['nearExp', 'ใกล้หมดอายุ (' + cnt.nearExp + ')', 'bg-orange-500 text-white', 'bg-orange-50 text-orange-800 border border-orange-200'],
      ['expired', 'หมดอายุแล้ว (' + cnt.expired + ')', 'bg-rose-600 text-white', 'bg-rose-50 text-rose-700 border border-rose-200']
    ];
    if ($('chkAlertTabs')) {
      $('chkAlertTabs').innerHTML = tabs.map(function (t) {
        return '<button type="button" onclick="STK.setAlertFilter(\'' + t[0] + '\')" class="px-2.5 py-1 rounded-full font-medium ' + (alertFilter === t[0] ? t[2] : t[3]) + '">' + t[1] + '</button>';
      }).join('');
    }
    var rows = getFilteredAlerts();
    if ($('chkAlertBody')) {
      $('chkAlertBody').innerHTML = rows.map(function (it) {
        var badges = [];
        if (it.status === 'หมด') badges.push('<span class="px-2 py-0.5 rounded-full text-xs bg-red-100 text-red-700 font-medium">หมด</span>');
        if (it.status === 'ใกล้หมด') badges.push('<span class="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800 font-medium">ใกล้หมด</span>');
        if (it.nearQty > 0) badges.push('<span class="px-2 py-0.5 rounded-full text-xs bg-orange-100 text-orange-800 font-medium">ใกล้หมดอายุ ' + fd(it.nearest) + '</span>');
        if (it.expQty > 0) badges.push('<span class="px-2 py-0.5 rounded-full text-xs bg-rose-100 text-rose-800 font-medium">หมดอายุ ' + nf(it.expQty) + '</span>');
        if (it.ordered > 0) badges.push('<span class="px-1.5 py-0.5 rounded text-[11px] bg-sky-50 text-sky-700 border border-sky-200">สั่งแล้ว ' + nf(it.ordered) + '</span>');
        var target = it.min > 0 ? (it.min * 2) : 1;
        var suggest = Math.max(1, Math.ceil(target - (it.usable || 0)));
        var planStr = it.planQty === null ? '-' : (nf(it.ordered) + ' / ' + nf(it.planQty));
        return '<tr class="hover:bg-gray-50">' +
          '<td class="p-2 text-center"><input type="checkbox" ' + (alertSel[it.id] ? 'checked' : '') + ' onchange="STK.toggleAlertItem(\'' + esc(it.id) + '\',this.checked)"></td>' +
          '<td class="p-2"><div class="font-medium">' + esc(it.name) + '</div><div class="text-[11px] text-gray-400">' + esc(it.id) + ' · ' + esc(it.p151 || 'ไม่มี P151') + '</div></td>' +
          '<td class="p-2 text-right whitespace-nowrap"><b class="' + (it.usable <= 0 ? 'text-red-600' : 'text-amber-600') + '">' + nf(it.usable) + '</b> / ' + nf(it.min) + ' ' + esc(it.unit) + '</td>' +
          '<td class="p-2 text-center space-x-1">' + badges.join(' ') + '</td>' +
          '<td class="p-2 text-right text-xs whitespace-nowrap">' + planStr + ' ' + esc(it.unit) + '</td>' +
          '<td class="p-2 text-right font-semibold text-blue-700 whitespace-nowrap">' + nf(suggest) + ' ' + esc(it.unit) + '</td>' +
        '</tr>';
      }).join('') || '<tr><td colspan="6" class="p-6 text-center text-gray-400">ไม่มีรายการวัสดุที่ใกล้หมด / หมด / ใกล้หมดอายุ</td></tr>';
    }
    updateAlertSelCount();
  };
  STK.proceedAlertOrders = function () {
    var picks = getAlertStockItems().filter(function (it) { return alertSel[it.id]; });
    if (!picks.length) return;
    STK.close();
    STK.orderForm(0, picks);
  };

  // ---------- ฟอร์มสั่งซื้อ (แก้ไขรายแถว หรือ เพิ่มแบบแนวนอนหลายรายการ) ----------
  var batchOrderRows = [];
  STK.orderForm = async function (row, preItems) {
    await loadComps();
    if (row) {
      var o = S.orders.orders.filter(function (x) { return x.row === row; })[0];
      var it = null;
      if (o) S.board.items.forEach(function (x) { if (x.p151 === o.p151 && o.p151) it = x; });
      if (o && !it) S.board.items.forEach(function (x) { if (!it && o.name && x.name === o.name) it = x; });
      var stOpts = S.orders.statuses.map(function (s) { return '<option' + ((o ? o.status : 'สั่งสินค้าแล้ว') === s ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('');
      var planPriceVal = (it && it.planPrice > 0) ? it.planPrice : (o && o.planPrice > 0 ? o.planPrice : 0);
      var unitLabel = (o && o.unit) || (it && it.unit) || 'หน่วย';
      modal('แก้ไขรายการสั่งซื้อ (แถว ' + row + ')',
        '<div class="grid grid-cols-1 md:grid-cols-2 gap-3">' +
        '<div class="md:col-span-2"><label class="text-xs text-gray-500">วัสดุ</label><input id="oItem" list="stkItems" value="' + esc(it ? itemLabel(it) : '') + '" onchange="STK.orderCheck(' + row + ',true)" class="' + INPUT + '"></div>' +
        '<div><label class="text-xs text-gray-500">บริษัท</label><input id="oCompany" list="stkComps" value="' + esc(o ? o.company : '') + '" class="' + INPUT + '"></div>' +
        '<div><label class="text-xs text-gray-500">สถานะ</label><select id="oStatus" onchange="STK.orderCheck(' + row + ')" class="' + INPUT + '">' + stOpts + '</select></div>' +
        '<div><label class="text-xs text-gray-500">จำนวนสั่ง (' + esc(unitLabel) + ')</label><input id="oQty" type="number" min="0" step="any" value="' + esc(o ? o.qty : '') + '" oninput="STK.orderCheck(' + row + ')" class="' + INPUT + '"></div>' +
        '<div id="oPlanBox" class="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex flex-col justify-center">' +
          '<div class="text-xs text-gray-500">ราคาแผน/หน่วย (ใช้อ้างอิงเทียบราคา)</div>' +
          '<div class="mt-0.5 flex items-center justify-between gap-2">' +
            '<span id="oPlanVal" class="font-semibold text-slate-700">' + (planPriceVal > 0 ? nf(planPriceVal) + ' บาท/' + esc(unitLabel) : 'ไม่มีในแผน') + '</span>' +
            '<button type="button" id="oUsePlanBtn" onclick="STK.usePlanPrice(' + row + ')" class="px-2 py-0.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 text-xs ' + (planPriceVal > 0 ? '' : 'hidden') + '">ใช้ราคาแผน</button>' +
          '</div>' +
        '</div>' +
        '<div class="md:col-span-2"><label class="text-xs font-medium text-blue-700">ราคาที่ซื้อ/หน่วย (บาท รวม VAT) — กรอกราคาที่ซื้อเทียบกับราคาแผน</label><input id="oPrice" type="number" min="0" step="any" placeholder="กรอกราคาที่ซื้อจริง (บาท/หน่วย)" value="' + esc(o && o.price > 0 ? o.price : '') + '" oninput="STK.orderCheck(' + row + ')" class="' + INPUT + ' border-blue-300 font-medium"></div>' +
        '<div><label class="text-xs text-gray-500">วันที่แจ้ง</label><input id="oNotified" type="date" value="' + esc(o ? o.notified : today()) + '" class="' + INPUT + '"></div>' +
        '<div><label class="text-xs text-gray-500">วันที่สั่ง</label><input id="oOrdered" type="date" value="' + esc(o ? o.ordered : today()) + '" class="' + INPUT + '"></div>' +
        '<div class="md:col-span-2"><label class="text-xs text-gray-500">หมายเหตุ</label><input id="oNote" value="' + esc(o ? o.note : '') + '" class="' + INPUT + '"></div>' +
        '<div id="oCheck" class="md:col-span-2 text-sm"></div></div>' +
        '<div class="mt-4 flex flex-wrap gap-2"><button type="button" id="oBtn" onclick="STK.orderSave(' + row + ')" class="' + BTN + 'bg-blue-500 text-white hover:bg-blue-600">บันทึก</button>' +
        '<button type="button" onclick="STK.orderCopy()" class="' + BTN + 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200"><i class="fa-regular fa-copy mr-1"></i>คัดลอกชื่อ+จำนวน</button>' +
        '<button type="button" onclick="STK.close()" class="' + BTN + 'bg-gray-100 hover:bg-gray-200">ยกเลิก</button></div>');
      STK.orderCheck(row);
      return;
    }

    batchOrderRows = (preItems && preItems.length) ? preItems.map(function (it) {
      var target = it.min > 0 ? (it.min * 2) : 1;
      var suggest = Math.max(1, Math.ceil(target - (it.usable || 0)));
      return { itemText: itemLabel(it), company: '', qty: suggest, price: '', note: '' };
    }) : [{ itemText: '', company: '', qty: '', price: '', note: '' }];

    var stOptsNew = S.orders.statuses.map(function (s) { return '<option' + (s === 'สั่งสินค้าแล้ว' ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('');
    modal('เพิ่มรายการสั่งซื้อ (กรอกแนวนอนหลายรายการพร้อมกัน)',
      '<div class="space-y-3">' +
        '<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 p-3 rounded-xl bg-slate-50 border border-slate-200">' +
          '<div>' +
            '<div class="flex items-center justify-between"><label class="text-xs text-gray-600 font-medium">บริษัทหลัก (ช่วยกรอก)</label><button type="button" onclick="STK.applyCompToAllRows()" class="text-[11px] text-blue-600 hover:underline">ใส่ให้ทุกแถว</button></div>' +
            '<input id="boComp" list="stkComps" placeholder="เลือกหรือกรอกแยกในตาราง" class="' + INPUT + ' mt-1">' +
          '</div>' +
          '<div><label class="text-xs text-gray-600 font-medium">สถานะ</label><select id="boStatus" onchange="STK.recalcBatchOrderRows()" class="' + INPUT + ' mt-1">' + stOptsNew + '</select></div>' +
          '<div><label class="text-xs text-gray-600 font-medium">วันที่แจ้ง</label><input id="boNotified" type="date" value="' + today() + '" class="' + INPUT + ' mt-1"></div>' +
          '<div><label class="text-xs text-gray-600 font-medium">วันที่สั่ง</label><input id="boOrdered" type="date" value="' + today() + '" class="' + INPUT + ' mt-1"></div>' +
        '</div>' +
        '<div class="overflow-x-auto border rounded-xl max-h-[48vh]">' +
          '<table class="w-full text-sm border-collapse">' +
            '<thead class="bg-gray-100 text-xs text-gray-600 sticky top-0">' +
              '<tr>' +
                '<th class="' + TH + ' text-center w-8">#</th>' +
                '<th class="' + TH + ' min-w-[220px]">วัสดุ (พิมพ์ค้นหา)</th>' +
                '<th class="' + TH + ' min-w-[150px]">บริษัท (กรอกแยกได้)</th>' +
                '<th class="' + TH + ' text-right w-24">จำนวนสั่ง</th>' +
                '<th class="' + TH + ' text-right w-28">ราคาที่ซื้อ/หน่วย</th>' +
                '<th class="' + TH + ' text-right w-24">รวมเงิน</th>' +
                '<th class="' + TH + ' min-w-[190px]">เทียบแผน &amp; ราคาแผน</th>' +
                '<th class="' + TH + ' min-w-[120px]">หมายเหตุ</th>' +
                '<th class="' + TH + ' w-8"></th>' +
              '</tr>' +
            '</thead>' +
            '<tbody id="boRowsBody" class="divide-y"></tbody>' +
          '</table>' +
        '</div>' +
        '<div class="flex flex-wrap items-center justify-between gap-2">' +
          '<div class="flex flex-wrap gap-2">' +
            '<button type="button" onclick="STK.addBatchOrderRow()" class="' + BTN + 'bg-gray-100 hover:bg-gray-200 text-xs font-medium"><i class="fa-solid fa-plus mr-1"></i>เพิ่มรายการ</button>' +
            '<button type="button" onclick="STK.sortBatchByCompany()" class="' + BTN + 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 text-xs font-medium"><i class="fa-solid fa-arrow-down-a-z mr-1"></i>เรียงตามชื่อบริษัท</button>' +
          '</div>' +
          '<div id="boSummary" class="text-sm text-gray-600"></div>' +
        '</div>' +
        '<div class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t">' +
          '<button type="button" onclick="STK.copyBatchOrderRows()" class="' + BTN + 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200"><i class="fa-regular fa-copy mr-1"></i>คัดลอกชื่อ+จำนวน (แยกตามบริษัท)</button>' +
          '<div class="flex gap-2">' +
            '<button type="button" onclick="STK.close()" class="' + BTN + 'bg-gray-100 hover:bg-gray-200">ยกเลิก</button>' +
            '<button type="button" id="boSaveBtn" onclick="STK.orderBatchSave()" class="' + BTN + 'bg-blue-600 text-white hover:bg-blue-700 font-medium"><i class="fa-solid fa-check mr-1"></i>บันทึกทั้งหมด</button>' +
          '</div>' +
        '</div>' +
      '</div>', 'xl');
    STK.renderBatchOrderRows();
  };

  function syncBatchFromDom() {
    var trs = document.querySelectorAll('#boRowsBody tr');
    trs.forEach(function (tr, i) {
      if (!batchOrderRows[i]) return;
      batchOrderRows[i].itemText = tr.querySelector('.bo-item').value;
      batchOrderRows[i].company = tr.querySelector('.bo-comp').value;
      batchOrderRows[i].qty = tr.querySelector('.bo-qty').value;
      batchOrderRows[i].price = tr.querySelector('.bo-price').value;
      batchOrderRows[i].note = tr.querySelector('.bo-note').value;
    });
  }
  STK.applyCompToAllRows = function () {
    syncBatchFromDom();
    var c = ($('boComp') && $('boComp').value.trim()) || '';
    batchOrderRows.forEach(function (r) { r.company = c; });
    STK.renderBatchOrderRows();
  };
  STK.sortBatchByCompany = function () {
    syncBatchFromDom();
    batchOrderRows.sort(function (a, b) {
      return String(a.company || 'ฮฮฮ').localeCompare(String(b.company || 'ฮฮฮ'), 'th');
    });
    STK.renderBatchOrderRows();
  };
  STK.addBatchOrderRow = function () {
    syncBatchFromDom();
    var defComp = ($('boComp') && $('boComp').value.trim()) || '';
    batchOrderRows.push({ itemText: '', company: defComp, qty: '', price: '', note: '' });
    STK.renderBatchOrderRows();
  };
  STK.removeBatchOrderRow = function (i) {
    syncBatchFromDom();
    batchOrderRows.splice(i, 1);
    if (!batchOrderRows.length) batchOrderRows.push({ itemText: '', company: '', qty: '', price: '', note: '' });
    STK.renderBatchOrderRows();
  };
  STK.onPickBatchItem = function (i) {
    syncBatchFromDom();
    STK.renderBatchOrderRows();
  };
  STK.useBatchPlanPrice = function (i) {
    syncBatchFromDom();
    var r = batchOrderRows[i];
    if (!r) return;
    var it = parseItem(r.itemText);
    if (!it || !(it.planPrice > 0)) return;
    r.price = it.planPrice;
    STK.renderBatchOrderRows();
  };
  STK.recalcBatchOrderRows = function () {
    syncBatchFromDom();
    STK.renderBatchOrderRows();
  };
  function batchCmpHtml(it, q, p, i) {
    if (!it) return '<span class="text-xs text-gray-400">เลือกวัสดุเพื่อเทียบแผน</span>';
    var warn = S.orders ? S.orders.warnPct : 5;
    var qtyPart = '';
    if (!it.p151 || it.planQty === null) {
      qtyPart = '<div class="text-gray-400">ไม่มีจำนวนในแผน</div>';
    } else {
      var after = Math.round(((it.ordered || 0) + q) * 10000) / 10000;
      var overQ = after > it.planQty;
      qtyPart = '<div class="' + (overQ ? 'text-red-600 font-medium' : 'text-green-700') + '">แผน ' + nf(it.planQty) + ' · สั่งแล้ว ' + nf(it.ordered) + ' → ' + nf(after) + (overQ ? ' (เกินแผน)' : '') + '</div>';
    }
    var pricePart = '';
    if (it.planPrice > 0) {
      var diffBadge = '';
      if (p > 0) {
        var diff = Math.round((p - it.planPrice) * 100) / 100;
        var pct = Math.round((p - it.planPrice) / it.planPrice * 1000) / 10;
        if (pct > warn) diffBadge = ' <b class="text-red-600">(+' + pct + '%)</b>';
        else if (diff > 0) diffBadge = ' <span class="text-amber-600">(+' + pct + '%)</span>';
        else if (diff < 0) diffBadge = ' <span class="text-green-600">(' + pct + '%)</span>';
        else diffBadge = ' <span class="text-slate-600">(เท่าแผน)</span>';
      }
      pricePart = '<div class="text-gray-500 flex flex-wrap items-center gap-1"><span>ราคาแผน ' + nf(it.planPrice) + ' บ.</span>' +
        '<button type="button" onclick="STK.useBatchPlanPrice(' + i + ')" class="px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200 text-[10px]">ใช้ราคาแผน</button>' +
        diffBadge + '</div>';
    } else if (p > 0) {
      pricePart = '<div class="text-gray-400">ไม่มีราคาแผน</div>';
    }
    return '<div class="text-xs space-y-0.5">' + qtyPart + pricePart + '</div>';
  }
  STK.renderBatchOrderRows = function () {
    var bodyEl = $('boRowsBody');
    if (!bodyEl) return;
    bodyEl.innerHTML = batchOrderRows.map(function (r, i) {
      var it = parseItem(r.itemText);
      var q = Number(r.qty) || 0, p = Number(r.price) || 0, sub = q * p;
      return '<tr>' +
        '<td class="p-2 text-center text-xs text-gray-400">' + (i + 1) + '</td>' +
        '<td class="p-1.5"><input class="bo-item ' + INPUT + '" list="stkItems" value="' + esc(r.itemText) + '" onchange="STK.onPickBatchItem(' + i + ')" placeholder="พิมพ์ชื่อ/รหัสวัสดุ"></td>' +
        '<td class="p-1.5"><input class="bo-comp ' + INPUT + '" list="stkComps" value="' + esc(r.company) + '" placeholder="เลือก/พิมพ์บริษัท"></td>' +
        '<td class="p-1.5"><input class="bo-qty ' + INPUT + ' text-right font-medium" type="number" min="0" step="any" value="' + esc(r.qty) + '" oninput="STK.updateBatchTotals()"></td>' +
        '<td class="p-1.5"><input class="bo-price ' + INPUT + ' text-right" type="number" min="0" step="any" value="' + esc(r.price) + '" placeholder="กรอกราคาซื้อ" oninput="STK.updateBatchTotals()"></td>' +
        '<td class="p-2 text-right font-medium text-gray-700 bo-sub">' + (sub > 0 ? nf(sub) : '-') + '</td>' +
        '<td class="p-2 bo-cmp">' + batchCmpHtml(it, q, p, i) + '</td>' +
        '<td class="p-1.5"><input class="bo-note ' + INPUT + ' text-xs" value="' + esc(r.note) + '" placeholder="หมายเหตุ"></td>' +
        '<td class="p-2 text-center"><button type="button" onclick="STK.removeBatchOrderRow(' + i + ')" class="text-red-500 hover:text-red-700"><i class="fa-solid fa-xmark"></i></button></td>' +
      '</tr>';
    }).join('');
    STK.updateBatchTotals();
  };
  STK.updateBatchTotals = function () {
    syncBatchFromDom();
    var totalMoney = 0, validCount = 0;
    document.querySelectorAll('#boRowsBody tr').forEach(function (tr, i) {
      var r = batchOrderRows[i], it = parseItem(r.itemText);
      var q = Number(r.qty) || 0, p = Number(r.price) || 0, sub = q * p;
      tr.querySelector('.bo-sub').textContent = sub > 0 ? nf(sub) : '-';
      tr.querySelector('.bo-cmp').innerHTML = batchCmpHtml(it, q, p, i);
      if (it && q > 0) { totalMoney += sub; validCount++; }
    });
    if ($('boSummary')) $('boSummary').innerHTML = 'พร้อมบันทึก <b>' + validCount + '</b> รายการ · รวมเงิน <b class="text-blue-700">' + nf(totalMoney) + ' บาท</b>';
  };
  STK.copyBatchOrderRows = function () {
    syncBatchFromDom();
    var defComp = ($('boComp') && $('boComp').value.trim()) || '';
    var th = useThai();
    var valid = batchOrderRows.map(function (r) {
      var it = parseItem(r.itemText), q = Number(r.qty) || 0;
      if (!it || !(q > 0)) return null;
      return {
        company: String(r.company || defComp || 'ไม่ระบุบริษัท').trim(),
        line: copyLine(it.name, q, it.unit, th)
      };
    }).filter(Boolean);
    copyGroupedItems(valid, valid.length);
  };
  STK.orderBatchSave = async function () {
    syncBatchFromDom();
    var defComp = ($('boComp') && $('boComp').value.trim()) || '';
    var status = $('boStatus').value, notified = $('boNotified').value, ordered = $('boOrdered').value;
    var valid = batchOrderRows.map(function (r) {
      var it = parseItem(r.itemText), q = Number(r.qty) || 0;
      return (it && q > 0) ? { it: it, company: String(r.company || defComp).trim(), qty: q, price: r.price, note: r.note } : null;
    }).filter(Boolean);
    if (!valid.length) return fail('กรุณาเลือกวัสดุและระบุจำนวนสั่งอย่างน้อย 1 รายการ');

    var btn = $('boSaveBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>กำลังบันทึก...'; }
    var saved = 0, sharedOverReason = '';
    try {
      for (var i = 0; i < valid.length; i++) {
        var x = valid[i];
        var p = { row: 0, itemId: x.it.id, company: x.company, qty: x.qty, price: x.price, status: status, ordered: ordered, notified: notified, note: x.note };
        if (sharedOverReason) { p.confirmOver = true; p.overReason = sharedOverReason; }
        var res = await call('stockSaveOrder', p);
        if (!res) break;
        if (!res.success && res.needConfirm) {
          var parts = ['<b>' + esc(x.it.name) + '</b>'];
          if (res.check) parts.push('ยอดสั่งเกินแผน: แผน ' + nf(res.check.planQty) + ' · สั่งแล้ว ' + nf(res.check.ordered) + ' · หลังสั่ง ' + nf(res.check.after));
          if (res.priceCheck) parts.push('ราคาสูงกว่าแผน: ราคาแผน ' + nf(res.priceCheck.planPrice) + ' → กรอก ' + nf(res.priceCheck.price) + ' (+' + res.priceCheck.pct + '%)');
          var c = await Swal.fire({
            icon: 'warning', title: 'ต้องยืนยันก่อนบันทึก (' + (i + 1) + '/' + valid.length + ')',
            html: '<div class="text-sm text-left">' + parts.join('<br>') + '</div>',
            input: 'text', inputPlaceholder: 'เหตุผล เช่น ราคาตลาดขึ้น / ใช้เพิ่ม (ใช้ร่วมกับแถวที่เกินแผนได้)',
            showCancelButton: true, confirmButtonText: 'ยืนยันบันทึก', cancelButtonText: 'ข้ามรายการนี้',
            inputValidator: function (v) { if (!String(v || '').trim()) return 'กรุณาใส่เหตุผล'; }
          });
          if (!c.isConfirmed) continue;
          sharedOverReason = c.value;
          p.confirmOver = true; p.overReason = c.value;
          res = await call('stockSaveOrder', p);
        }
        if (res && res.success) saved++;
        else if (res && res.error) fail(x.it.name + ': ' + res.error);
      }
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-check mr-1"></i>บันทึกทั้งหมด'; }
    }
    if (saved > 0) {
      STK.close(); S.board = null;
      await toast('บันทึกสั่งซื้อสำเร็จ ' + saved + ' รายการ');
      await loadBoard(true);
      renderOrders();
    }
  };
  STK.orderCopy = function () {
    var it = parseItem($('oItem').value), q = Number($('oQty').value);
    if (!it) return fail('เลือกวัสดุก่อน');
    if (!(q > 0)) return fail('ใส่จำนวนสั่งก่อน');
    doCopy([copyLine(it.name, q, it.unit, true)]);
  };
  STK.usePlanPrice = function (row) {
    var it = parseItem($('oItem') && $('oItem').value);
    if (!it || !(it.planPrice > 0)) return;
    if ($('oPrice')) $('oPrice').value = it.planPrice;
    STK.orderCheck(row);
  };
  STK.orderCheck = function (row) {
    var it = parseItem($('oItem') && $('oItem').value);
    var pv = $('oPlanVal'), pb = $('oUsePlanBtn');
    if (pv) pv.textContent = (it && it.planPrice > 0) ? (nf(it.planPrice) + ' บาท/' + (it.unit || 'หน่วย')) : 'ไม่มีในแผน';
    if (pb) pb.classList.toggle('hidden', !(it && it.planPrice > 0));
    var el = $('oCheck');
    if (!el) return;
    if (!it) { el.innerHTML = ''; return; }
    var q = Number($('oQty').value) || 0, price = Number($('oPrice').value) || 0;
    var pmsg = priceMsg(it.planPrice, price, q, S.orders.warnPct);
    if (!it.p151 || it.planQty === null) {
      el.innerHTML = '<div class="text-amber-600">ไม่มีรายการนี้ในแผนปี ' + esc((S.orders && S.orders.fy) || '') + '</div>' + pmsg;
      return;
    }
    var ORDERED_ST = ['สั่งสินค้าแล้ว', 'รอรับสินค้า', 'ได้รับสินค้าแล้ว', 'รอตรวจรับ', 'ตรวจรับแล้ว'];
    var fy = Number((S.orders && S.orders.fy) || (S.board && S.board.cfg && S.board.cfg.FY) || 2569);
    var fyStart = (fy - 1) + '-10-01';
    var orderedExcl = 0;
    if (S.orders && Array.isArray(S.orders.orders)) {
      S.orders.orders.forEach(function (x) {
        if (row && x.row === row) return;
        if (x.p151 !== it.p151 || ORDERED_ST.indexOf(x.status) < 0) return;
        var ds = x.ordered || x.recorded || x.notified;
        if (ds && ds < fyStart) return;
        orderedExcl += Number(x.qty) || 0;
      });
      orderedExcl = Math.round(orderedExcl * 10000) / 10000;
    } else {
      orderedExcl = it.ordered || 0;
    }
    var after = Math.round((orderedExcl + q) * 10000) / 10000;
    var over = after > it.planQty;
    var counted = ORDERED_ST.indexOf($('oStatus').value) >= 0;
    el.innerHTML = '<div class="p-2 rounded-lg ' + (over && counted ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700') + '">แผนปี ' + esc(fy) + ': ' + nf(it.planQty) + ' ' + esc(it.unit || '') + ' · สั่งสะสมแล้ว ' + nf(orderedExcl) + ' · หลังสั่งรอบนี้ ' + nf(after) +
      (counted ? (over ? ' → <b>เกินแผน</b>' : ' → อยู่ในแผน') : ' (สถานะนี้ยังไม่นับเป็นยอดสั่ง)') + '</div>' + pmsg;
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
      var parts = [];
      if (r.check) parts.push('<b>ยอดสั่งเกินแผน</b><br>แผน ' + nf(r.check.planQty) + ' · สั่งแล้ว ' + nf(r.check.ordered) + ' · หลังสั่งรอบนี้ ' + nf(r.check.after));
      if (r.priceCheck) parts.push('<b>ราคาสูงกว่าแผน</b><br>ราคาแผน ' + nf(r.priceCheck.planPrice) + ' → ราคาที่กรอก ' + nf(r.priceCheck.price) + ' (+' + r.priceCheck.pct + '% · รวมเกิน ' + nf(r.priceCheck.diffTotal) + ' บาท)');
      var c = await Swal.fire({ icon: 'warning', title: 'ต้องยืนยันก่อนบันทึก', html: '<div class="text-sm text-left">' + parts.join('<hr class="my-2">') + '</div>',
        input: 'text', inputPlaceholder: 'เหตุผล เช่น ราคาตลาดขึ้น / ใช้เพิ่ม', showCancelButton: true, confirmButtonText: 'ยืนยันบันทึก', cancelButtonText: 'กลับไปแก้',
        inputValidator: function (v) { if (!String(v || '').trim()) return 'กรุณาใส่เหตุผล'; } });
      if (!c.isConfirmed) return;
      p.confirmOver = true; p.overReason = c.value;
      r = await call('stockSaveOrder', p);
      if (!r) return;
    }
    if (!r.success) return fail(r.error);
    STK.close();
    S.board = null;
    await toast('บันทึกแล้ว');
    await loadBoard(true);
    renderOrders();
  };
  STK.delOrder = async function (row) {
    var c = await Swal.fire({ title: 'ลบรายการสั่งซื้อแถว ' + row + '?', text: 'ล้างข้อมูลในแถวนี้ ย้อนกลับไม่ได้', icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: 'ลบ', cancelButtonText: 'ยกเลิก' });
    if (!c.isConfirmed) return;
    var r = await call('stockDeleteOrder', row);
    if (!r) return;
    if (!r.success) return fail(r.error);
    S.board = null;
    await loadBoard(true);
    renderOrders();
  };

  // ---------- แผนประจำปี ----------
  async function renderPlan(sheetOpt) {
    S.plan = await call('stockGetPlan', sheetOpt || (S.pf && S.pf.sheet) || '');
    if (!S.plan) return;
    if (!S.pf.mode) S.pf.mode = 'active';
    var sheets = (S.plan.planSheets && S.plan.planSheets.length) ? S.plan.planSheets : [S.plan.sheet];
    var sheetSelHtml = sheets.length > 1
      ? '<select id="pSheetSel" onchange="STK.switchPlanSheet(this.value)" class="border rounded-lg px-2.5 py-1.5 text-xs bg-white font-medium text-gray-700">' +
        sheets.map(function (sh) {
          var isAct = sh === S.plan.activeSheet;
          return '<option value="' + esc(sh) + '"' + (sh === S.plan.sheet ? ' selected' : '') + '>ชีต: ' + esc(sh) + (isAct ? ' (ใช้งานอยู่)' : ' (แผนปีก่อน)') + '</option>';
        }).join('') + '</select>'
      : '<span class="text-sm text-gray-500">ชีต <b>' + esc(S.plan.sheet) + '</b></span>';

    var filterModes = [
      ['active', 'รายการในแผน (ซ่อนที่ยกเลิก)'],
      ['buy', 'เฉพาะที่แผนซื้อ > 0'],
      ['all', 'ทั้งหมด (รวมที่ยกเลิก/ซ้ำ)']
    ];
    var modeSelHtml = '<select id="pModeSel" onchange="STK.filterPlan()" class="border rounded-lg px-2.5 py-1.5 text-xs bg-white text-gray-700">' +
      filterModes.map(function (m) {
        return '<option value="' + m[0] + '"' + (S.pf.mode === m[0] ? ' selected' : '') + '>' + m[1] + '</option>';
      }).join('') + '</select>';

    var fyNum = Number(S.plan.fy) || 2570;
    // ถ้ากำลังเปิดดูชีตสำรองปีเก่า เช่น Plan_2569 ให้แสดงเลขปีตามชื่อชีตนั้น
    var mShFy = String(S.plan.sheet || '').match(/(25\d{2})/);
    if (mShFy) fyNum = Number(mShFy[1]);
    var fyPrev = String(fyNum - 1), fyCur = String(fyNum);

    body('<div class="flex flex-wrap items-center justify-between gap-2 mb-3">' +
      '<div class="flex flex-wrap items-center gap-2">' +
        '<input id="pq" placeholder="ค้นหารายการ / รหัส P151" value="' + esc(S.pf.q) + '" oninput="STK.filterPlan()" class="' + INPUT + ' md:w-64">' +
        modeSelHtml +
        '<span class="text-sm text-gray-500">ปีงบ <b>' + esc(fyCur) + '</b></span>' +
        sheetSelHtml +
      '</div>' +
      '<div class="flex flex-wrap items-center gap-2">' +
        '<button type="button" onclick="STK.downloadPlanTemplate()" class="' + BTN + 'bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 font-medium shadow-sm"><i class="fa-solid fa-download mr-1.5"></i>ดาวน์โหลด Template แผน (.xlsx)</button>' +
        '<button type="button" onclick="STK.openImportPlan()" class="' + BTN + 'bg-indigo-600 text-white hover:bg-indigo-700 font-medium shadow-sm"><i class="fa-solid fa-file-import mr-1.5"></i>อัปโหลดแผนปีใหม่ (เก็บยอดซื้อปีก่อนอัตโนมัติ)</button>' +
      '</div>' +
      '</div>' +
      '<div id="ptotal" class="text-sm mb-2"></div><div class="overflow-x-auto"><table class="w-full text-sm border-collapse">' +
      '<thead class="bg-gray-100">' +
        '<tr class="border-b border-gray-200 text-[11px]">' +
          '<th colspan="3" class="p-1.5 text-left text-gray-500 font-semibold">ข้อมูลรายการวัสดุ (Col A..H)</th>' +
          '<th colspan="3" class="p-1.5 text-center bg-slate-200/70 text-slate-700 font-semibold border-x border-gray-200">ปริมาณการซื้อปีก่อน (ปี ' + esc(fyPrev) + ' · Col I..K)</th>' +
          '<th colspan="3" class="p-1.5 text-center bg-indigo-100/80 text-indigo-900 font-semibold border-r border-gray-200">ประมาณการปี ' + esc(fyCur) + ' (Col L..N)</th>' +
          '<th colspan="4" class="p-1.5 text-center text-gray-500 font-semibold">ติดตามการสั่งซื้อจริง</th>' +
        '</tr>' +
        '<tr>' +
          [
            'Code',
            'รายการ',
            'หน่วยนับ',
            'ปริมาณซื้อ (จำนวน)',
            'ราคาต่อหน่วย (บาท)',
            'มูลค่าการซื้อ (บาท)',
            'ปริมาณซื้อ (จำนวน)',
            'ราคาต่อหน่วย (บาท)',
            'มูลค่าการซื้อ (บาท)',
            'สั่งสะสม',
            'ราคาสั่งเฉลี่ย',
            'เทียบแผน',
            ''
          ].map(function (h, idx) {
            var extraCls = (idx >= 3 && idx <= 5) ? ' bg-slate-100/80 text-slate-700' : ((idx >= 6 && idx <= 8) ? ' bg-indigo-50/70 text-indigo-900' : '');
            return '<th class="' + TH + extraCls + '">' + h + '</th>';
          }).join('') +
        '</tr>' +
      '</thead><tbody id="pbody"></tbody></table></div>');
    drawPlan();
  }
  STK.switchPlanSheet = function (shName) {
    S.pf.sheet = shName;
    renderPlan(shName);
  };
  STK.filterPlan = function () {
    S.pf.q = $('pq').value;
    if ($('pModeSel')) S.pf.mode = $('pModeSel').value;
    drawPlan();
  };
  function drawPlan() {
    var q = S.pf.q.trim().toLowerCase();
    var mode = S.pf.mode || 'active';
    var rows = S.plan.rows.filter(function (r) {
      if (q && (r.name + ' ' + r.code).toLowerCase().indexOf(q) < 0) return false;
      var isCancelled = /\(\s*(ยกเลิก|ซ้ำ)/i.test(r.name) && !(r.qty > 0);
      if (mode === 'active' && isCancelled) return false;
      if (mode === 'buy' && !(r.qty > 0)) return false;
      return true;
    });
    var total = rows.reduce(function (s, r) { return s + r.value; }, 0);
    var act = 0, atPlan = 0;
    rows.forEach(function (r) { act += r.orderedValue || 0; atPlan += (r.ordered || 0) * (r.price || 0); });
    var gap = act - atPlan;
    $('ptotal').innerHTML = 'แสดง <b>' + rows.length + '</b> จาก ' + S.plan.rows.length + ' รายการ · มูลค่าแผนรวม <b>' + nf(total) + '</b> บาท' +
      (act > 0 ? '<br>สั่งจริงสะสม <b>' + nf(act) + '</b> บาท · ถ้าซื้อจำนวนเดียวกันที่ราคาแผน ' + nf(atPlan) + ' บาท → <b class="' + (gap > 0 ? 'text-red-600' : 'text-green-600') + '">' + (gap > 0 ? 'สูงกว่าแผน ' : 'ต่ำกว่าแผน ') + nf(Math.abs(gap)) + ' บาท</b>' : '');
    $('pbody').innerHTML = rows.map(function (r) {
      var pQty = (r.prevQty !== undefined && r.prevQty !== null && r.prevQty !== '') ? r.prevQty : (r.h68 || r.prevPlanQty || 0);
      var pPrice = (r.prevPrice !== undefined && r.prevPrice !== null && r.prevPrice !== '') ? r.prevPrice : (r.prevPlanPrice || 0);
      var pVal = (r.prevValue !== undefined && r.prevValue !== null && r.prevValue !== '') ? r.prevValue : (pQty && pPrice ? pQty * pPrice : 0);
      return '<tr class="border-t hover:bg-gray-50">' +
        '<td class="p-2 text-xs whitespace-nowrap font-mono">' + esc(r.code) + (r.no ? '<div class="text-[10px] text-gray-400">ลำดับ ' + esc(r.no) + '</div>' : '') + '</td>' +
        '<td class="p-2">' + esc(r.name) + (r.type ? '<div class="text-[11px] text-gray-400">' + esc(r.type) + '</div>' : '') + '</td>' +
        '<td class="p-2 text-xs">' + esc(r.unit) + '</td>' +
        '<td class="p-2 text-right font-medium text-slate-700 bg-slate-50/70">' + (pQty ? nf(pQty) : '-') + '</td>' +
        '<td class="p-2 text-right text-xs text-slate-600 bg-slate-50/70">' + (pPrice ? nf(pPrice) : '-') + '</td>' +
        '<td class="p-2 text-right text-xs font-medium text-slate-700 bg-slate-50/70">' + (pVal ? nf(pVal) : '-') + '</td>' +
        '<td class="p-2 text-right font-semibold text-indigo-700 bg-indigo-50/30">' + nf(r.qty) + '</td>' +
        '<td class="p-2 text-right bg-indigo-50/30">' + nf(r.price) + '</td>' +
        '<td class="p-2 text-right font-medium bg-indigo-50/30">' + nf(r.value) + '</td>' +
        '<td class="p-2 text-right ' + (r.ordered > r.qty ? 'text-red-600 font-medium' : '') + '">' + nf(r.ordered) + '</td>' +
        (function () {
          if (!(r.ordered > 0)) return '<td class="p-2 text-right text-gray-300">-</td><td class="p-2 text-right text-gray-300">-</td>';
          var avg = r.orderedValue / r.ordered, pct = r.price > 0 ? Math.round((avg - r.price) / r.price * 1000) / 10 : null;
          var cls = pct === null ? 'text-gray-500' : (pct > S.plan.warnPct ? 'text-red-600 font-medium' : (pct > 0 ? 'text-amber-600' : (pct < 0 ? 'text-green-600' : 'text-gray-500')));
          return '<td class="p-2 text-right">' + nf(avg) + '</td><td class="p-2 text-right ' + cls + '">' + (pct === null ? '-' : (pct > 0 ? '+' : '') + pct + '%') + '</td>';
        })() +
        '<td class="p-2"><button type="button" onclick="STK.planEdit(' + r.row + ')" class="text-xs text-blue-600 underline">แก้ไข</button></td></tr>';
    }).join('') || '<tr><td colspan="13" class="p-4 text-center text-gray-400">ไม่พบรายการ</td></tr>';
  }
  STK.planEdit = function (row) {
    var r = S.plan.rows.filter(function (x) { return x.row === row; })[0];
    if (!r) return;
    var fyNum = Number(S.plan.fy) || 2570;
    var fyPrev = String(fyNum - 1), fyCur = String(fyNum);
    var pQty = (r.prevQty !== undefined && r.prevQty !== null) ? r.prevQty : (r.h68 || 0);
    var pPrice = (r.prevPrice !== undefined && r.prevPrice !== null) ? r.prevPrice : (r.prevPlanPrice || 0);
    function f(id, label, v) { return '<div><label class="text-xs text-gray-500">' + label + '</label><input id="' + id + '" type="number" step="any" value="' + esc(v) + '" oninput="STK.planCalc()" class="' + INPUT + '"></div>'; }
    if (r.format === 'v70_hist' || r.format === 'v70') {
      modal('แก้แผนปี ' + esc(fyCur) + ': ' + esc(r.name),
        '<div class="text-xs text-gray-500 mb-2">' + esc(r.code) + (r.no ? ' · ลำดับแผน ' + esc(r.no) : '') + ' · หน่วย ' + esc(r.unit) + '</div>' +
        '<div class="grid grid-cols-2 gap-3 p-2.5 rounded-lg bg-slate-50 border border-slate-200 mb-3">' +
          '<div class="col-span-2 text-[11px] font-semibold text-slate-600">ปริมาณการซื้อปีก่อน (ปี ' + esc(fyPrev) + ' · Col I..K)</div>' +
          f('pPrevQty', 'ปริมาณการซื้อปีก่อน (จำนวน) [Col I]', pQty) +
          f('pPrevPrice', 'ราคาต่อหน่วยปีก่อน (บาท) [Col J]', pPrice) +
        '</div>' +
        '<div class="grid grid-cols-2 gap-3 p-2.5 rounded-lg bg-indigo-50/50 border border-indigo-100">' +
          '<div class="col-span-2 text-[11px] font-semibold text-indigo-800">ประมาณการปี ' + esc(fyCur) + ' (Col L..N)</div>' +
          f('pQty', 'ปริมาณการซื้อ (จำนวน) [Col L]', r.qty) +
          f('pPrice', 'ราคาต่อหน่วย (บาท) [Col M]', r.price) +
          '<input id="pNote" type="hidden" value="' + esc(r.note || '') + '">' +
        '</div>' +
        '<div id="pVal" class="text-sm mt-3 font-medium text-indigo-700"></div>' +
        '<div class="mt-3 flex gap-2"><button type="button" onclick="STK.planSave(' + row + ')" class="' + BTN + 'bg-blue-500 text-white hover:bg-blue-600">บันทึก</button><button type="button" onclick="STK.close()" class="' + BTN + 'bg-gray-100 hover:bg-gray-200">ยกเลิก</button></div>');
    } else {
      modal('แก้แผน: ' + esc(r.name), '<div class="text-xs text-gray-500 mb-2">' + esc(r.code) + ' · หน่วย ' + esc(r.unit) + '</div><div class="grid grid-cols-2 gap-3">' +
        f('pCarry', 'ยกยอดมา', r.carry) + f('pUsage', 'ประมาณการใช้', r.usage) + f('pQty', 'ปริมาณการซื้อ (K)', r.qty) + f('pPrice', 'ราคาต่อหน่วย (L)', r.price) +
        f('pQ1', 'งวดที่ 1 (บาท)', r.q1) + f('pQ2', 'งวดที่ 2 (บาท)', r.q2) + f('pQ3', 'งวดที่ 3 (บาท)', r.q3) + f('pQ4', 'งวดที่ 4 (บาท)', r.q4) +
        '<div class="col-span-2"><label class="text-xs text-gray-500">หมายเหตุ</label><input id="pNote" value="' + esc(r.note) + '" class="' + INPUT + '"></div></div>' +
        '<div id="pVal" class="text-sm mt-3"></div><div class="mt-3 flex gap-2"><button type="button" onclick="STK.planSave(' + row + ')" class="' + BTN + 'bg-blue-500 text-white hover:bg-blue-600">บันทึก</button><button type="button" onclick="STK.close()" class="' + BTN + 'bg-gray-100 hover:bg-gray-200">ยกเลิก</button></div>');
    }
    STK.planCalc();
  };
  STK.planCalc = function () { $('pVal').innerHTML = 'มูลค่าการซื้อปีนี้ = ' + nf((Number($('pQty').value) || 0) * (Number($('pPrice').value) || 0)) + ' บาท (คำนวณอัตโนมัติ)'; };
  STK.planSave = async function (row) {
    var r = S.plan.rows.filter(function (x) { return x.row === row; })[0];
    var p = {
      row: row,
      code: r.code,
      sheet: S.plan.sheet,
      prevQty: $('pPrevQty') ? $('pPrevQty').value : (r.prevQty || r.h68 || 0),
      prevPrice: $('pPrevPrice') ? $('pPrevPrice').value : (r.prevPrice || 0),
      h68: $('pPrevQty') ? $('pPrevQty').value : r.h68,
      carry: $('pCarry') ? $('pCarry').value : r.carry,
      usage: $('pUsage') ? $('pUsage').value : $('pQty').value,
      qty: $('pQty').value,
      price: $('pPrice').value,
      q1: $('pQ1') ? $('pQ1').value : 0,
      q2: $('pQ2') ? $('pQ2').value : 0,
      q3: $('pQ3') ? $('pQ3').value : 0,
      q4: $('pQ4') ? $('pQ4').value : 0,
      note: $('pNote') ? $('pNote').value : ''
    };
    var res = await call('stockSavePlanRow', p);
    if (!res) return;
    if (!res.success) return fail(res.error);
    STK.close(); S.board = null;
    await toast('บันทึกแผนแล้ว');
    renderPlan(S.plan.sheet);
  };

  function ensureXlsxLib() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      s.onload = function () { resolve(window.XLSX); };
      s.onerror = function () { reject(new Error('ไม่สามารถโหลดไลบรารีอ่านไฟล์ Excel ได้')); };
      document.head.appendChild(s);
    });
  }

  // ดาวน์โหลดไฟล์แม่แบบ (Template .xlsx) 14 คอลัมน์ (A..N) ตามโครงสร้างที่ออกแบบ
  STK.downloadPlanTemplate = async function () {
    try {
      var XLSX = await ensureXlsxLib();
      var nextFy = ($('impPlanFy') && $('impPlanFy').value.trim()) || ((S.plan && S.plan.fy) ? String(Number(S.plan.fy) || 2570) : '2570');
      var row1 = ['', '', '', '', '', '', '', '', '', '', '', '', '', ''];
      var row2 = ['', 'ลำดับ', 'ลำดับ', 'รายการ', 'หมวด', 'ประเภท', 'ประเภทย่อย', 'ขนาดบรรจุ', 'ปริมาณการซื้อปีก่อน', '', '', 'ประมาณการปี ' + nextFy, '', ''];
      var row3 = ['Code', 'แผน', 'แผน*', '', '', '', '', 'หรือ', 'ปริมาณการซื้อ', 'ราคาต่อหน่วย', 'มูลค่าการซื้อ', 'ปริมาณการซื้อ', 'ราคาต่อหน่วย', 'มูลค่าการซื้อ'];
      var row4 = ['', 'ต้นปี', '', '', '', '', '', 'หน่วยนับ', '(จำนวน)', '(บาท)', '(บาท)', '(จำนวน)', '(บาท)', '(บาท)'];
      var aoa = [row1, row2, row3, row4];
      var srcRows = (S.plan && S.plan.rows && S.plan.rows.length) ? S.plan.rows : [];
      srcRows.forEach(function (r, idx) {
        var isCanc = /\(\s*(ยกเลิก|ซ้ำ)/i.test(r.name);
        var seqInit = r.seqInit !== undefined && r.seqInit !== '' ? r.seqInit : (isCanc ? '' : (r.no || (idx + 1)));
        var seqPlan = r.seqPlan !== undefined && r.seqPlan !== '' ? r.seqPlan : seqInit;
        aoa.push([
          r.code || '',
          seqInit,
          seqPlan,
          r.name || '',
          r.category || 'วัสดุทันตกรรม',
          r.mainType || r.type || '',
          r.subType || r.type || '',
          r.unit || '',
          '', '', '', // Col I..K ปริมาณการซื้อปีก่อน (เว้นว่างได้ โค้ดจะดึงปีก่อนมาเติมให้อัตโนมัติตอนอัปโหลด)
          r.qty || '',
          r.price || '',
          r.value || ''
        ]);
      });
      var ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!merges'] = [
        { s: { r: 1, c: 8 }, e: { r: 1, c: 10 } },
        { s: { r: 1, c: 11 }, e: { r: 1, c: 13 } }
      ];
      ws['!cols'] = [
        { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 42 },
        { wch: 16 }, { wch: 22 }, { wch: 24 }, { wch: 16 },
        { wch: 16 }, { wch: 16 }, { wch: 16 },
        { wch: 16 }, { wch: 16 }, { wch: 16 }
      ];
      var wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Plan_Template');
      XLSX.writeFile(wb, 'Template_แผนจัดซื้อวัสดุทันตกรรม_' + nextFy + '.xlsx');
      toast('ดาวน์โหลดไฟล์แม่แบบ (Template .xlsx) แล้ว');
    } catch (e) {
      fail('ไม่สามารถสร้างไฟล์ Template ได้: ' + (e.message || e));
    }
  };

  var parsedPlanRows = [];
  var lastTemplateCheck = null;

  STK.openImportPlan = function () {
    parsedPlanRows = [];
    lastTemplateCheck = null;
    var curSheet = (S.plan && S.plan.activeSheet) || (S.board && S.board.cfg && S.board.cfg.PLAN_SHEET) || 'Plan';
    var defaultNewFy = (S.plan && S.plan.fy) ? String(S.plan.fy) : '2570';
    modal('อัปโหลดแผนจัดซื้อประจำปีตาม Template (เลื่อนเก็บยอดซื้อปีก่อนอัตโนมัติ)',
      '<div class="space-y-3 text-sm">' +
        '<div class="p-3 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-950 text-xs leading-relaxed">' +
          '<div class="flex flex-wrap items-center justify-between gap-2 mb-1.5">' +
            '<b class="text-indigo-900"><i class="fa-solid fa-table-columns mr-1"></i>โครงสร้างตารางชีต <code>Plan</code> และ Template มาตรฐาน (14 คอลัมน์ A..N):</b>' +
            '<button type="button" onclick="STK.downloadPlanTemplate()" class="px-2.5 py-1 rounded bg-white border border-indigo-300 text-indigo-700 hover:bg-indigo-100 font-semibold shadow-sm"><i class="fa-solid fa-download mr-1"></i>ดาวน์โหลดไฟล์แม่แบบ (Template .xlsx)</button>' +
          '</div>' +
          '<div class="grid grid-cols-1 md:grid-cols-3 gap-1.5 text-[11px] text-indigo-900 bg-white/80 p-2 rounded border border-indigo-100">' +
            '<div>• <b>Col A..H (ข้อมูลรายการ):</b><br><code>Code</code>, <code>ลำดับแผนต้นปี</code>, <code>ลำดับแผน*</code>, <code>รายการ</code>, <code>หมวด</code>, <code>ประเภท</code>, <code>ประเภทย่อย</code>, <code>ขนาดบรรจุ/หน่วยนับ</code></div>' +
            '<div>• <b>Col I..K (ปริมาณการซื้อปีก่อน):</b><br><code>ปริมาณการซื้อ (จำนวน)</code>, <code>ราคาต่อหน่วย (บาท)</code>, <code>มูลค่าการซื้อ (บาท)</code> <span class="text-emerald-700 font-semibold">(โค้ดดึงปีก่อนมาใส่ให้อัตโนมัติ)</span></div>' +
            '<div>• <b>Col L..N (ประมาณการปีใหม่):</b><br><code>ปริมาณการซื้อ (จำนวน)</code>, <code>ราคาต่อหน่วย (บาท)</code>, <code>มูลค่าการซื้อ (บาท)</code> <span class="text-indigo-700 font-semibold">(นำข้อมูลจากไฟล์ใหม่มาใส่พร้อมระบุเลขปี)</span></div>' +
          '</div>' +
        '</div>' +
        '<div><label class="block text-xs font-medium text-gray-600 mb-1">1. เลือกไฟล์ Excel / CSV แผนประจำปีที่จัดทำตาม Template (.xlsx, .xls, .csv)</label>' +
          '<input type="file" id="impPlanFile" accept=".xlsx,.xls,.csv" onchange="STK.onPlanFileChange(this)" class="' + INPUT + ' bg-white"></div>' +
        '<div id="impPlanSheetPickWrap" class="hidden"><label class="block text-xs font-medium text-gray-600 mb-1">เลือกเวิร์กชีตในไฟล์ Excel</label>' +
          '<select id="impPlanExcelSheet" onchange="STK.parseSelectedExcelSheet()" class="' + INPUT + '"></select></div>' +
        '<div class="grid grid-cols-1 md:grid-cols-3 gap-3">' +
          '<div><label class="block text-xs font-medium text-gray-600 mb-1">2. ระบุปีงบประมาณของแผนใหม่ (พ.ศ.)</label>' +
            '<input id="impPlanFy" value="' + esc(defaultNewFy) + '" oninput="STK.refreshImportPreviewLabels()" placeholder="เช่น 2570 หรือ 2571" class="' + INPUT + ' font-semibold text-indigo-700"></div>' +
          '<div><label class="block text-xs font-medium text-gray-600 mb-1">3. ชีตที่จะบันทึกแผน</label>' +
            '<input id="impPlanTarget" value="' + esc(curSheet) + '" placeholder="Plan" class="' + INPUT + '">' +
            '<div class="text-[11px] text-gray-400 mt-0.5">ใช้ <code>Plan</code> (ระบบสำรองปีเก่าเป็น <code>Plan_ปีเก่า</code> ให้เอง)</div></div>' +
          '<div><label class="block text-xs font-medium text-gray-600 mb-1">4. การดึงข้อมูลใส่ช่อง "ปริมาณการซื้อปีก่อน" (Col I..K)</label>' +
            '<select id="impPlanHistMode" onchange="STK.refreshImportPreviewLabels()" class="' + INPUT + '">' +
              '<option value="shift">ดึงยอดการซื้อ+ราคา+มูลค่าจากแผนปีก่อนอัตโนมัติ (แนะนำ)</option>' +
              '<option value="actual">ดึงยอดสั่งซื้อจริงของปีก่อนมาเก็บ</option>' +
              '<option value="keep">คงตัวเลขช่องซื้อปีก่อนตามเดิม (อัปเดตเฉพาะปีใหม่)</option>' +
            '</select></div>' +
        '</div>' +
        '<div class="flex flex-col gap-1.5 pt-1">' +
          '<label class="inline-flex items-center gap-2 text-xs text-gray-700 cursor-pointer"><input type="checkbox" id="impPlanBackup" checked class="rounded text-indigo-600"> สำรองชีตแผนปีก่อนไว้เป็นชีตแยกอัตโนมัติ (เช่น <code>Plan_2569</code>)</label>' +
          '<label class="inline-flex items-center gap-2 text-xs text-gray-700 cursor-pointer"><input type="checkbox" id="impPlanActive" checked class="rounded text-indigo-600"> ตั้งเป็นแผนปีงบประมาณปัจจุบันทันที (อัปเดต StockConfig อัตโนมัติ)</label>' +
          '<label class="inline-flex items-center gap-2 text-xs text-gray-700 cursor-pointer"><input type="checkbox" id="impPlanSyncDb" checked class="rounded text-indigo-600"> ซิงค์รายการวัสดุที่มีรหัส P151 ใหม่เข้าชีต Database อัตโนมัติ</label>' +
        '</div>' +
        '<div id="impPlanPreview" class="p-3 rounded-lg border border-dashed border-gray-200 text-xs text-gray-400 text-center">เลือกไฟล์ Excel/CSV ที่ตรงตาม Template เพื่อตรวจสอบความถูกต้องก่อนอัปโหลด</div>' +
        '<div class="flex justify-end gap-2 pt-2">' +
          '<button type="button" id="btnConfirmImportPlan" onclick="STK.submitImportPlan()" disabled class="' + BTN + 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40">ยืนยันอัปโหลดแผนและเก็บยอดซื้อปีก่อน</button>' +
          '<button type="button" onclick="STK.close()" class="' + BTN + 'bg-gray-100 hover:bg-gray-200">ยกเลิก</button>' +
        '</div>' +
      '</div>', true);
  };

  // ตรวจสอบความถูกต้องของไฟล์ตาม Template (รองรับทั้ง Template 14 คอลัมน์ A..N ที่ออกแบบ และไฟล์แผน 11 คอลัมน์ A..K)
  function validateAndParsePlanTemplate(aoa) {
    var num = function (v) {
      if (v === '' || v === null || v === undefined) return 0;
      var x = Number(String(v).replace(/,/g, '').trim());
      return isNaN(x) ? 0 : x;
    };
    if (!aoa || !aoa.length) {
      return { valid: false, errors: ['ไฟล์ว่างเปล่า ไม่มีข้อมูลตาราง'], rows: [] };
    }

    // ค้นหาแถวหัวตารางที่มีคำว่า Code ในคอลัมน์ A (อาจอยู่ที่แถว 1..5)
    var codeRowIdx = -1;
    var detectedFy = '';
    for (var i = 0; i < Math.min(8, aoa.length); i++) {
      var r0 = aoa[i] || [];
      var rowJoined = r0.join(' ');
      var mFyHdr = rowJoined.match(/ประมาณการปี\s*(\d{4})/);
      if (mFyHdr) detectedFy = mFyHdr[1];
      var cA = String(r0[0] || '').trim();
      if (/^code$/i.test(cA)) {
        codeRowIdx = i;
      }
    }

    // รวมข้อความหัวตารางแถว 1..5 ของแต่ละคอลัมน์เพื่อตรวจสอบชื่อคอลัมน์แบบแยกหลายบรรทัด (เช่น แถว 2..4)
    var maxHdrRow = codeRowIdx >= 0 ? Math.min(aoa.length - 1, codeRowIdx + 1) : Math.min(4, aoa.length - 1);
    var colHeaders = [];
    for (var c = 0; c < 15; c++) {
      var parts = [];
      for (var hr = 0; hr <= maxHdrRow; hr++) {
        var cellTxt = String((aoa[hr] && aoa[hr][c]) || '').trim();
        if (cellTxt) parts.push(cellTxt);
      }
      colHeaders[c] = parts.join(' ');
    }

    var errors = [];
    if (codeRowIdx < 0) {
      var foundColBCode = false;
      for (var k = 0; k < Math.min(15, aoa.length); k++) {
        var rk = aoa[k] || [];
        if (/^P151[-0-9]+/i.test(String(rk[1] || '').trim()) && !/^P151[-0-9]+/i.test(String(rk[0] || '').trim())) {
          foundColBCode = true;
          break;
        }
      }
      if (foundColBCode) {
        errors.push('ไฟล์นี้เป็นรูปแบบเก่า (รหัส P151 อยู่คอลัมน์ B) กรุณาใช้ไฟล์ตาม Template มาตรฐาน (รหัส P151 อยู่คอลัมน์ A)');
      } else {
        errors.push('ไม่พบหัวตารางมาตรฐานของ Template (คอลัมน์ A ต้องเป็น "Code", คอลัมน์ D = "รายการ", คอลัมน์ H = "ขนาดบรรจุ หรือ หน่วยนับ")');
      }
    } else {
      if (!/รายการ/i.test(colHeaders[3])) errors.push('คอลัมน์ D ต้องเป็น "รายการ" (พบ: "' + (colHeaders[3] || '-') + '")');
      if (!/หน่วย|ขนาดบรรจุ/i.test(colHeaders[7])) errors.push('คอลัมน์ H ต้องเป็น "ขนาดบรรจุ หรือ หน่วยนับ" (พบ: "' + (colHeaders[7] || '-') + '")');
      if (!/ปริมาณ|จำนวน/i.test(colHeaders[8]) && !/ปริมาณ|จำนวน/i.test(colHeaders[11])) {
        errors.push('ไม่พบคอลัมน์ "ปริมาณการซื้อ (จำนวน)" ในคอลัมน์ I หรือ L');
      }
    }

    if (errors.length) {
      return { valid: false, errors: errors, rows: [], detectedFy: detectedFy };
    }

    // ตรวจสอบว่าเป็นไฟล์ 14 คอลัมน์ (Col I..K = ปีก่อน, Col L..N = ประมาณการปีใหม่) หรือ 11 คอลัมน์ (Col I..K = ประมาณการปีใหม่)
    var is14ColLayout = /ปีก่อน/.test(colHeaders[8]) || /ประมาณการปี|ปริมาณการซื้อ/.test(colHeaders[11]);

    // เช็กว่าในไฟล์ 14 คอลัมน์ ผู้ใช้ใส่ตัวเลขแผนใหม่ไว้ที่ Col L..N หรือใส่ไว้ที่ Col I..K
    var sumColL = 0, sumColI = 0;
    (aoa || []).forEach(function (r) {
      if (!r || !/^P151[-0-9]+/i.test(String(r[0] || '').trim())) return;
      sumColI += num(r[8]) + num(r[10]);
      sumColL += num(r[11]) + num(r[13]);
    });

    var out = [];
    (aoa || []).forEach(function (r) {
      if (!r || !r.length) return;
      var c0 = String(r[0] === undefined ? '' : r[0]).trim();
      if (!/^P151[-0-9]+/i.test(c0)) return;

      var seqInit = String(r[1] !== '' && r[1] !== undefined ? r[1] : '').trim();
      var seqPlan = String(r[2] !== '' && r[2] !== undefined ? r[2] : seqInit).trim();
      var no70 = seqInit || seqPlan;

      if (is14ColLayout && (sumColL > 0 || sumColI === 0)) {
        // กรณีไฟล์ 14 คอลัมน์ (Col I..K = ปริมาณซื้อปีก่อน, Col L..N = ประมาณการปีใหม่)
        var pQty = num(r[8]), pPrice = num(r[9]);
        var pVal = num(r[10]) > 0 ? num(r[10]) : Math.round(pQty * pPrice * 10000) / 10000;
        var qtyNew = num(r[11]), priceNew = num(r[12]);
        var valNew = num(r[13]) > 0 ? num(r[13]) : Math.round(qtyNew * priceNew * 10000) / 10000;
        out.push({
          no: no70, seqInit: seqInit, seqPlan: seqPlan, code: c0,
          name: String(r[3] || '').trim(),
          category: String(r[4] || 'วัสดุทันตกรรม').trim(),
          mainType: String(r[5] || '').trim(),
          subType: String(r[6] || '').trim(),
          type: String(r[6] || r[5] || r[4] || '').trim(),
          unit: String(r[7] || '').trim(),
          prevQty: pQty, prevPrice: pPrice, prevValue: pVal,
          hasHistory: (pQty > 0 || pVal > 0), // ถ้าเว้นว่าง Col I..K ไว้ ระบบจะดึงข้อมูลปีก่อนจากชีตเดิมมาเติมให้อัตโนมัติ!
          carry: 0, usage: qtyNew, qty: qtyNew, price: priceNew, value: valNew,
          q1: 0, q2: 0, q3: 0, q4: 0,
          note: String(r[14] || '').trim()
        });
        return;
      }

      // กรณีไฟล์ 11 คอลัมน์ (Col I..K = ปริมาณการซื้อ, ราคาต่อหน่วย, มูลค่าการซื้อ ของปีใหม่)
      // โค้ดจะดึงข้อมูลการซื้อปีก่อนไปเก็บใน Col I..K (ปริมาณการซื้อปีก่อน) อัตโนมัติ และนำตัวเลขชุดนี้ไปใส่ใน Col L..N (ประมาณการปีใหม่)!
      var qty70 = num(r[8]), price70 = num(r[9]);
      var val70 = num(r[10]) > 0 ? num(r[10]) : Math.round(qty70 * price70 * 10000) / 10000;
      out.push({
        no: no70,
        seqInit: seqInit,
        seqPlan: seqPlan,
        code: c0,
        name: String(r[3] || '').trim(),
        category: String(r[4] || 'วัสดุทันตกรรม').trim(),
        mainType: String(r[5] || '').trim(),
        subType: String(r[6] || '').trim(),
        type: String(r[6] || r[5] || r[4] || '').trim(),
        unit: String(r[7] || '').trim(),
        prevQty: 0, prevPrice: 0, prevValue: 0,
        hasHistory: false, // ให้เซิร์ฟเวอร์ดึงยอดการซื้อ+ราคา+มูลค่าของปีก่อนหน้าไปเก็บใน Col I..K อัตโนมัติ
        carry: 0,
        usage: qty70,
        qty: qty70,
        price: price70,
        value: val70,
        q1: 0, q2: 0, q3: 0, q4: 0,
        note: String(r[11] || '').trim()
      });
    });

    if (!out.length) {
      return { valid: false, errors: ['ไม่พบรายการที่มีรหัส P151-xxxxxx ในคอลัมน์ A'], rows: [], detectedFy: detectedFy };
    }
    return { valid: true, errors: [], rows: out, detectedFy: detectedFy };
  }

  STK.refreshImportPreviewLabels = function () {
    if (lastTemplateCheck) renderImportPreview(lastTemplateCheck.sourceLabel);
  };

  function renderImportPreview(sourceLabel) {
    var prev = $('impPlanPreview'), btn = $('btnConfirmImportPlan');
    if (lastTemplateCheck && !lastTemplateCheck.valid) {
      if (prev) {
        prev.innerHTML = '<div class="text-left p-2 rounded bg-red-50 border border-red-200 text-red-700">' +
          '<div class="font-semibold mb-1"><i class="fa-solid fa-circle-xmark mr-1"></i>ไฟล์ไม่ตรงตาม Template มาตรฐาน ไม่สามารถอัปโหลดได้:</div>' +
          '<ul class="list-disc pl-5 space-y-0.5 text-xs">' +
            lastTemplateCheck.errors.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') +
          '</ul>' +
          '<div class="mt-2 pt-2 border-t border-red-200 flex items-center justify-between">' +
            '<span class="text-[11px] text-red-600">กรุณาใช้ไฟล์ที่ตรงตาม Template มาตรฐาน</span>' +
            '<button type="button" onclick="STK.downloadPlanTemplate()" class="px-2.5 py-1 rounded bg-white border border-red-300 text-red-700 hover:bg-red-100 text-xs font-semibold"><i class="fa-solid fa-download mr-1"></i>ดาวน์โหลดไฟล์แม่แบบ (.xlsx)</button>' +
          '</div>' +
        '</div>';
      }
      if (btn) btn.disabled = true;
      return;
    }
    if (!parsedPlanRows.length) {
      if (prev) prev.innerHTML = '<span class="text-red-500">ไม่พบแถวที่มีรหัส P151 กรุณาตรวจสอบไฟล์หรือเลือกเวิร์กชีตอื่น</span>';
      if (btn) btn.disabled = true;
      return;
    }
    var fyInput = ($('impPlanFy') && $('impPlanFy').value.trim()) || '2570';
    var fyNum = /^\d{4}$/.test(fyInput) ? Number(fyInput) : 2570;
    var fyPrev = String(fyNum - 1), fyNew = String(fyNum);
    var histMode = ($('impPlanHistMode') && $('impPlanHistMode').value) || 'shift';

    // สร้าง Map ของข้อมูลแผนปัจจุบันในหน้าเว็บเพื่อแสดงตัวอย่างการเลื่อนยอดปีก่อนหน้าเข้า Col I..K อัตโนมัติ
    var curMap = {};
    if (S.plan && Array.isArray(S.plan.rows)) {
      S.plan.rows.forEach(function (r) { curMap[String(r.code || '').toUpperCase()] = r; });
    }

    var activeRows = parsedPlanRows.filter(function (x) { return !(/\(\s*(ยกเลิก|ซ้ำ)/i.test(x.name) && !(x.qty > 0)); });
    var buyRows = parsedPlanRows.filter(function (x) { return x.qty > 0; });
    var sumVal = parsedPlanRows.reduce(function (s, x) { return s + (Number(x.value) || 0); }, 0);
    var sampleRows = buyRows.length ? buyRows.slice(0, 5) : activeRows.slice(0, 5);
    var sampleHtml = sampleRows.map(function (x) {
      var old = curMap[String(x.code || '').toUpperCase()];
      var pQty = x.prevQty || 0, pPrice = x.prevPrice || 0, pVal = x.prevValue || 0;
      if (!x.hasHistory && old) {
        pQty = histMode === 'keep' ? (old.prevQty || old.h68 || 0) : (old.prevPlanQty || old.qty || old.prevQty || old.h68 || 0);
        pPrice = histMode === 'keep' ? (old.prevPrice || 0) : (old.prevPlanPrice || old.price || old.prevPrice || 0);
        pVal = pQty * pPrice;
      }
      return '<tr class="border-t">' +
        '<td class="p-1.5 text-xs font-mono">' + esc(x.code) + '</td>' +
        '<td class="p-1.5 text-xs text-center">' + esc(x.no || '-') + '</td>' +
        '<td class="p-1.5 text-xs">' + esc(x.name) + '</td>' +
        '<td class="p-1.5 text-xs">' + esc(x.unit) + '</td>' +
        '<td class="p-1.5 text-xs text-right font-semibold text-slate-700 bg-slate-50">' + (pQty ? nf(pQty) : '-') + '</td>' +
        '<td class="p-1.5 text-xs text-right text-slate-600 bg-slate-50">' + (pPrice ? nf(pPrice) : '-') + '</td>' +
        '<td class="p-1.5 text-xs text-right text-slate-700 bg-slate-50">' + (pVal ? nf(pVal) : '-') + '</td>' +
        '<td class="p-1.5 text-xs text-right font-semibold text-indigo-700 bg-indigo-50/50">' + nf(x.qty) + '</td>' +
        '<td class="p-1.5 text-xs text-right bg-indigo-50/50">' + nf(x.price) + '</td>' +
        '<td class="p-1.5 text-xs text-right font-medium bg-indigo-50/50">' + nf(x.value) + '</td>' +
      '</tr>';
    }).join('');
    if (prev) {
      prev.innerHTML = '<div class="text-left">' +
        '<div class="flex flex-wrap justify-between items-center mb-1.5 text-emerald-700 font-medium">' +
          '<span><i class="fa-solid fa-circle-check mr-1"></i>ผ่านการตรวจสอบ Template (' + esc(sourceLabel || 'ไฟล์ถูกต้อง') + '): ทั้งหมด <b>' + nf(parsedPlanRows.length, 0) + '</b> รหัส (ในแผน <b>' + nf(activeRows.length, 0) + '</b> · ซื้อจริง <b>' + nf(buyRows.length, 0) + '</b> รายการ)</span>' +
          '<span>มูลค่าประมาณการปี ' + esc(fyNew) + ' รวม <b>' + nf(sumVal) + '</b> บาท</span>' +
        '</div>' +
        '<div class="text-[11px] text-indigo-900 bg-indigo-50/70 px-2.5 py-1.5 rounded border border-indigo-100 mb-2">' +
          '📌 <b>การจัดคอลัมน์ลงชีต <code>Plan</code> (14 คอลัมน์ A..N):</b> คอลัมน์ <b>I..K</b> = <code>ปริมาณการซื้อปีก่อน (จำนวน, ราคาต่อหน่วย, มูลค่าการซื้อ)</code> [ดึงอัตโนมัติ] · คอลัมน์ <b>L..N</b> = <code>ประมาณการปี ' + esc(fyNew) + ' (จำนวน, ราคาต่อหน่วย, มูลค่าการซื้อ)</code> [จากไฟล์ใหม่]' +
        '</div>' +
        '<div class="overflow-x-auto border rounded-lg bg-white"><table class="w-full text-left border-collapse"><thead class="bg-gray-50 text-[11px] text-gray-500">' +
          '<tr class="border-b"><th colspan="4" class="p-1.5">ข้อมูลวัสดุ (Col A..H)</th><th colspan="3" class="p-1.5 text-center bg-slate-100 text-slate-700 border-x">ปริมาณการซื้อปีก่อน (Col I..K · ดึงอัตโนมัติ)</th><th colspan="3" class="p-1.5 text-center bg-indigo-100/70 text-indigo-900">ประมาณการปี ' + esc(fyNew) + ' (Col L..N · ไฟล์ใหม่)</th></tr>' +
          '<tr><th class="p-1.5">Code</th><th class="p-1.5 text-center">ลำดับ</th><th class="p-1.5">รายการ (ตัวอย่าง 5 รายการ)</th><th class="p-1.5">หน่วย</th>' +
          '<th class="p-1.5 text-right bg-slate-50 text-slate-700">จำนวน</th><th class="p-1.5 text-right bg-slate-50 text-slate-700">ราคา</th><th class="p-1.5 text-right bg-slate-50 text-slate-700">มูลค่า</th>' +
          '<th class="p-1.5 text-right bg-indigo-50/70 text-indigo-900">จำนวน</th><th class="p-1.5 text-right bg-indigo-50/70 text-indigo-900">ราคา</th><th class="p-1.5 text-right bg-indigo-50/70 text-indigo-900">มูลค่า</th>' +
        '</tr></thead><tbody>' + sampleHtml + '</tbody></table></div>' +
      '</div>';
    }
    if (btn) btn.disabled = false;
  }

  function parseCsvTextToAoa(text) {
    var rows = [];
    var lines = String(text || '').split(/\r?\n/);
    lines.forEach(function (line) {
      if (!line.trim()) return;
      var cells = [];
      var cur = '', inQ = false;
      for (var i = 0; i < line.length; i++) {
        var ch = line[i];
        if (ch === '"') {
          if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
          else inQ = !inQ;
        } else if (ch === ',' && !inQ) {
          cells.push(cur); cur = '';
        } else {
          cur += ch;
        }
      }
      cells.push(cur);
      rows.push(cells);
    });
    return rows;
  }

  var currentWb = null;
  STK.onPlanFileChange = async function (input) {
    if (!input || !input.files || !input.files.length) return;
    var file = input.files[0];
    var prev = $('impPlanPreview');
    if (prev) prev.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>กำลังอ่านและตรวจสอบโครงสร้างไฟล์ ' + esc(file.name) + '...';
    try {
      var mFy = file.name.match(/(25\d{2})/) || file.name.match(/แผน\s*(\d{2})/) || file.name.match(/plan[_\s-]*(\d{2,4})/i);
      if (mFy && $('impPlanFy')) {
        $('impPlanFy').value = mFy[1].length === 2 ? ('25' + mFy[1]) : mFy[1];
      }
      if (/\.csv$/i.test(file.name)) {
        var text = await file.text();
        var chk = validateAndParsePlanTemplate(parseCsvTextToAoa(text));
        if (chk.detectedFy && $('impPlanFy')) $('impPlanFy').value = chk.detectedFy;
        chk.sourceLabel = file.name;
        lastTemplateCheck = chk;
        parsedPlanRows = chk.rows;
        if ($('impPlanSheetPickWrap')) $('impPlanSheetPickWrap').classList.add('hidden');
        renderImportPreview(file.name);
        return;
      }
      var XLSX = await ensureXlsxLib();
      var buf = await file.arrayBuffer();
      currentWb = XLSX.read(buf, { type: 'array' });
      var wrap = $('impPlanSheetPickWrap'), sel = $('impPlanExcelSheet');
      if (currentWb.SheetNames.length > 1 && wrap && sel) {
        wrap.classList.remove('hidden');
        sel.innerHTML = currentWb.SheetNames.map(function (n) { return '<option value="' + esc(n) + '">' + esc(n) + '</option>'; }).join('');
      } else if (wrap) {
        wrap.classList.add('hidden');
      }
      STK.parseSelectedExcelSheet();
    } catch (e) {
      if (prev) prev.innerHTML = '<span class="text-red-500">อ่านไฟล์ไม่สำเร็จ: ' + esc(e.message || String(e)) + '</span>';
    }
  };

  STK.parseSelectedExcelSheet = function () {
    if (!currentWb || !window.XLSX) return;
    var sel = $('impPlanExcelSheet');
    var shName = (sel && sel.value) || currentWb.SheetNames[0];
    var ws = currentWb.Sheets[shName];
    var aoa = window.XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    var chk = validateAndParsePlanTemplate(aoa);
    if (chk.detectedFy && $('impPlanFy')) $('impPlanFy').value = chk.detectedFy;
    chk.sourceLabel = 'ชีต ' + shName;
    lastTemplateCheck = chk;
    parsedPlanRows = chk.rows;
    renderImportPreview('ชีต ' + shName);
  };

  STK.submitImportPlan = async function () {
    if (!parsedPlanRows.length) return fail('ยังไม่มีข้อมูลแผนที่จะนำเข้า');
    var fy = ($('impPlanFy') && $('impPlanFy').value.trim()) || '2570';
    var targetSheet = ($('impPlanTarget') && $('impPlanTarget').value.trim()) || 'Plan';
    var historyMode = ($('impPlanHistMode') && $('impPlanHistMode').value) || 'shift';
    var backupOldPlan = $('impPlanBackup') ? $('impPlanBackup').checked : true;
    var setActive = $('impPlanActive') ? $('impPlanActive').checked : true;
    var syncDb = $('impPlanSyncDb') ? $('impPlanSyncDb').checked : true;

    var res = await call('stockImportPlan', {
      fy: fy,
      targetSheet: targetSheet,
      historyMode: historyMode,
      backupOldPlan: backupOldPlan,
      setActive: setActive,
      syncDb: syncDb,
      rows: parsedPlanRows
    });
    if (!res) return;
    if (!res.success) return fail(res.error);
    STK.close();
    S.board = null;
    S.plan = null;
    S.pf.sheet = res.sheet;
    await Swal.fire({
      icon: 'success',
      title: 'อัปเดตแผนประจำปีสำเร็จ',
      html: '<div class="text-sm text-left space-y-1.5">' +
        '<div>• ชีตแผนใหม่: <b>' + esc(res.sheet) + '</b> (ปีงบ <b>' + esc(res.fy) + '</b>)</div>' +
        (res.backupSheet ? '<div>• สำรองแผนปีก่อนไว้ที่ชีต: <b class="text-indigo-600">' + esc(res.backupSheet) + '</b> (สลับดูย้อนหลังได้)</div>' : '') +
        '<div>• นำเข้าแผนใหม่ทั้งหมด: <b>' + nf(res.importedCount, 0) + '</b> รายการ</div>' +
        '<div>• ดึงยอดการใช้ปีก่อนมาใส่ในแผนใหม่: <b>' + nf(res.carriedHistoryCount || 0, 0) + '</b> รายการ</div>' +
        (res.addedDb ? '<div>• เพิ่มรหัส P151 ใหม่เข้า Database: <b>' + res.addedDb + '</b> รายการ</div>' : '') +
        '</div>'
    });
    await loadBoard(true);
    renderPlan(res.sheet);
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
      '<div class="overflow-x-auto"><table class="w-full text-sm border-collapse"><thead class="bg-gray-100"><tr>' + ['รหัส', 'CPN', 'P151', 'รายการ', 'หน่วย', 'ขนาดบรรจุ', 'rate/เดือน', 'min', ''].map(function (h) { return '<th class="' + TH + '">' + h + '</th>'; }).join('') + '</tr></thead><tbody id="dbody"></tbody></table></div><p id="dcount" class="text-xs text-gray-400 mt-2"></p>');
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
      return '<tr class="border-t hover:bg-gray-50"><td class="p-2 text-xs">' + esc(i.id) + '</td><td class="p-2 text-xs">' + esc(i.cpn) + '</td><td class="p-2 text-xs">' + esc(i.p151 || '-') + '</td><td class="p-2">' + esc(i.name) + '</td><td class="p-2 text-xs">' + esc(i.unit) + '</td><td class="p-2 text-xs font-mono">' + esc(i.pack || '-') + '</td><td class="p-2 text-right">' + nf(i.rate) + '</td><td class="p-2 text-right">' + nf(i.min) + '</td>' +
        '<td class="p-2"><button type="button" onclick="STK.dbEdit(' + i.row + ')" class="text-xs text-blue-600 underline">แก้ไข</button></td></tr>';
    }).join('') || '<tr><td colspan="9" class="p-4 text-center text-gray-400">ไม่พบรายการ</td></tr>';
    $('dcount').textContent = 'แสดง ' + rows.length + ' จาก ' + S.db.items.length + ' รายการ';
  }
  STK.dbEdit = function (row) {
    var i = row ? S.db.items.filter(function (x) { return x.row === row; })[0] : { cpn: '', p151: '', name: '', unit: '', pack: '', rate: null, min: null, spec: '', purpose: '' };
    function f(id, label, v, type, cls) { return '<div class="' + (cls || '') + '"><label class="text-xs text-gray-500">' + label + '</label><input id="' + id + '" type="' + (type || 'text') + '" step="any" value="' + esc(v === null || v === undefined ? '' : v) + '" class="' + INPUT + '"></div>'; }
    modal(row ? 'แก้ไขวัสดุ ' + esc(i.id) : 'เพิ่มวัสดุใหม่', '<div class="grid grid-cols-2 gap-3">' +
      f('bName', 'ชื่อรายการ', i.name, 'text', 'col-span-2') + f('bCpn', 'รหัส CPN', i.cpn) + f('bP151', 'รหัส P151', i.p151) + f('bUnit', 'หน่วยนับ', i.unit) + f('bPack', 'ขนาดบรรจุ (เช่น 1x1, 1x6)', i.pack) + f('bRate', 'rate/เดือน', i.rate, 'number') + f('bMin', 'min (จุดสั่งซื้อ)', i.min, 'number') +
      '<div class="col-span-2"><label class="text-xs text-gray-500">คุณสมบัติทั่วไป / คุณลักษณะ (หนึ่งบรรทัดต่อหนึ่งข้อ — ใช้ในเอกสารกำหนดคุณลักษณะ)</label><textarea id="bSpec" rows="6" class="' + INPUT + '">' + esc(i.spec) + '</textarea></div>' +
      '<div class="col-span-2"><label class="text-xs text-gray-500">วัตถุประสงค์ในการใช้งาน (ข้อความต่อจากชื่อรายการ เช่น &quot;ใช้ในงานทันตกรรมเพื่อ…&quot;)</label><textarea id="bPurpose" rows="3" class="' + INPUT + '">' + esc(i.purpose) + '</textarea></div></div>' +
      '<div class="mt-3 flex gap-2"><button type="button" onclick="STK.dbSave(' + row + ')" class="' + BTN + 'bg-blue-500 text-white hover:bg-blue-600">บันทึก</button><button type="button" onclick="STK.close()" class="' + BTN + 'bg-gray-100 hover:bg-gray-200">ยกเลิก</button></div>');
  };
  STK.dbSave = async function (row) {
    var r = await call('stockSaveDb', { row: row || 0, name: $('bName').value, cpn: $('bCpn').value, p151: $('bP151').value, unit: $('bUnit').value, pack: $('bPack').value, rate: $('bRate').value, min: $('bMin').value, spec: $('bSpec').value, purpose: $('bPurpose').value });
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
      f('cWarn', 'เตือนเมื่อราคาที่ซื้อสูงกว่าราคาแผนเกิน (%)', S.cfg.PRICE_WARN_PCT, 'เกินเกณฑ์นี้ต้องใส่เหตุผลก่อนบันทึก (เฉพาะสถานะที่นับเป็นยอดสั่ง)') +
      f('cHosp', 'รหัสหน่วยของโรงพยาบาล', S.cfg.HOSPITAL_CODE, 'แสดงป้าย "ใช้ภายใน รพ." ในรายการหน่วยตอนจ่ายออก') + f('cMail', 'อีเมลผู้รับแจ้งเตือน (คั่นด้วย ,)', S.cfg.ALERT_EMAILS, 'เว้นว่าง = ใช้อีเมลของรหัส 00001') + '</div>' +
      '<div class="mt-3 flex flex-wrap gap-2"><button type="button" onclick="STK.cfgSave()" class="' + BTN + 'bg-blue-500 text-white hover:bg-blue-600">บันทึกการตั้งค่า</button>' +
      '<button type="button" onclick="STK.testMail()" class="' + BTN + 'bg-gray-100 hover:bg-gray-200"><i class="fa-solid fa-envelope mr-1"></i>ส่งอีเมลสรุปทดสอบ</button>' +
      '<button type="button" onclick="STK.setup()" class="' + BTN + 'bg-gray-100 hover:bg-gray-200">ตรวจ/เตรียมชีตอีกครั้ง</button></div>' +
      '<div class="mt-4 p-3 rounded-lg bg-blue-50 text-sm text-blue-800">แจ้งเตือนอัตโนมัติทุกเช้า: เปิด Apps Script เลือกฟังก์ชัน <code>stockInstallTrigger</code> แล้วกด Run ครั้งเดียว (ระบบจะส่งอีเมลเฉพาะวันที่มีของใกล้หมดหรือใกล้หมดอายุ)</div>' +
      '<h4 class="font-medium mt-6 mb-2">รายชื่อบริษัท (' + S.comps.length + ')</h4><div class="flex gap-2 mb-2"><input id="cNew" placeholder="ชื่อบริษัทใหม่" class="' + INPUT + '"><button type="button" onclick="STK.addComp()" class="' + BTN + 'bg-blue-500 text-white hover:bg-blue-600 whitespace-nowrap">เพิ่ม</button></div>' +
      '<div class="text-sm text-gray-600 flex flex-wrap gap-1">' + S.comps.map(function (c) { return '<span class="px-2 py-0.5 bg-gray-100 rounded-full">' + esc(c) + '</span>'; }).join('') + '</div>' +
      '<div id="staffSection" class="mt-8"></div></div>');
    if (STK.renderStaffSection) STK.renderStaffSection();
  }
  STK.cfgSave = async function () {
    var r = await call('stockSaveConfig', { FY: $('cFY').value.trim(), PLAN_SHEET: $('cPlan').value.trim(), EXPIRY_DAYS: $('cExp').value.trim(), MIN_MONTHS: $('cMonths').value.trim(), PRICE_WARN_PCT: $('cWarn').value.trim(), HOSPITAL_CODE: $('cHosp').value.trim(), ALERT_EMAILS: $('cMail').value.trim() });
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

  // ส่งต่อตัวช่วยให้ stock-docs.js ใช้ร่วมกัน
  STK._ = { S: S, call: call, modal: modal, body: body, esc: esc, nf: nf, fd: fd, today: today, fail: fail, toast: toast, loadBoard: loadBoard,
    unitTh: unitTh, INPUT: INPUT, BTN: BTN, TH: TH, $: $ };

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
    btn.className = 'px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full text-sm font-medium shadow-sm transition';
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
