// =====================================================
// stock-docs.js — ชุดจัดซื้อ, ออกเอกสาร (.docx), ทะเบียนคุมเอกสาร, ทะเบียนเจ้าหน้าที่/ผู้ลงนาม
// วางคู่กับ stock-ui.js ใน GitHub repo แล้วเพิ่มบรรทัดนี้ใน index.html (ต่อจาก stock-ui.js)
//   <script src="stock-docs.js"></script>
// แม่แบบ Word วางที่ templates/memo_appoint_officer.docx (โฟลเดอร์เดียวกับ index.html)
// ไม่ใช้ไลบรารีภายนอก: สร้างไฟล์ .docx ด้วยโค้ดในไฟล์นี้เอง
// =====================================================
(function () {
  'use strict';

  var STK = window.STK;
  if (!STK) { console.error('stock-docs.js ต้องโหลดหลัง stock-ui.js'); return; }

  var TEMPLATE_URL = 'templates/memo_appoint_officer.docx';
  var DOC_TYPE = 'ขออนุมัติแต่งตั้งเจ้าหน้าที่กำหนดคุณลักษณะและราคากลาง';
  var DOC_SUBJECT = 'ขออนุมัติให้เจ้าหน้าที่รับผิดชอบในการกำหนดรายละเอียดคุณลักษณะเฉพาะของพัสดุและราคากลาง';
  var D = { sets: [], reg: [], staff: [], cfg: {}, set: null };

  function U() { return STK._; }
  function $(id) { return document.getElementById(id); }

  // =====================================================
  // 1) ตัวช่วยภาษาไทย: เลขไทย / วันที่ / เงิน / จำนวนเงินเป็นตัวอักษร
  // =====================================================
  var TH_DIG = '๐๑๒๓๔๕๖๗๘๙';
  function thaiDigits(s) { return String(s).replace(/[0-9]/g, function (c) { return TH_DIG[Number(c)]; }); }
  var MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
  function thaiDate(iso) {
    var m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return '';
    return thaiDigits(Number(m[3]) + ' ' + MONTHS[Number(m[2]) - 1] + ' ' + (Number(m[1]) + 543));
  }
  function commas(s) { return s.replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function money(v) {
    v = Math.round(Number(v) * 100) / 100;
    var s = (v === Math.floor(v)) ? String(v) : v.toFixed(2);
    var parts = s.split('.');
    return thaiDigits(commas(parts[0]) + (parts[1] ? '.' + parts[1] : ''));
  }
  function plainNum(v) { return thaiDigits(String(Number(v))); }

  var DIG = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
  var POS = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];
  function six(n, tailOfBig) {
    var s = String(n), out = '', L = s.length;
    for (var i = 0; i < L; i++) {
      var d = Number(s[i]), p = L - i - 1;
      if (d === 0) continue;
      if (p === 1) out += (d === 1 ? '' : (d === 2 ? 'ยี่' : DIG[d])) + 'สิบ';
      else if (p === 0) out += (d === 1 && (L > 1 || tailOfBig)) ? 'เอ็ด' : DIG[d];
      else out += DIG[d] + POS[p];
    }
    return out;
  }
  function intText(n) {
    if (n === 0) return 'ศูนย์';
    var parts = [];
    while (n > 0) { parts.push(n % 1000000); n = Math.floor(n / 1000000); }
    var res = '';
    for (var k = 0; k < parts.length; k++) {
      var part = parts[parts.length - 1 - k];
      if (part) res += six(part, k === parts.length - 1 && k > 0) + (k < parts.length - 1 ? 'ล้าน' : '');
      else if (k < parts.length - 1) res += 'ล้าน';
    }
    return res;
  }
  function bahtText(x) {
    x = Math.round(Number(x) * 100) / 100;
    var baht = Math.floor(x + 1e-9), sat = Math.round((x - baht) * 100);
    return intText(baht) + 'บาท' + (sat === 0 ? 'ถ้วน' : intText(sat) + 'สตางค์');
  }

  // =====================================================
  // 2) อ่าน/เขียนไฟล์ .docx (ZIP) โดยไม่พึ่งไลบรารี
  // =====================================================
  var CRC_T = (function () {
    var t = [];
    for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; }
    return t;
  })();
  function crc32(b) { var c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) c = CRC_T[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function u16(b, o) { return b[o] | (b[o + 1] << 8); }
  function u32(b, o) { return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0; }

  function readZip(buf) {
    var b = new Uint8Array(buf), eocd = -1;
    for (var i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) { if (u32(b, i) === 0x06054b50) { eocd = i; break; } }
    if (eocd < 0) throw new Error('ไฟล์แม่แบบไม่ใช่ .docx ที่ถูกต้อง');
    var n = u16(b, eocd + 10), p = u32(b, eocd + 16), entries = [], dec = new TextDecoder();
    for (var k = 0; k < n; k++) {
      if (u32(b, p) !== 0x02014b50) throw new Error('โครงสร้างไฟล์แม่แบบเสียหาย');
      var nl = u16(b, p + 28), el = u16(b, p + 30), cl = u16(b, p + 32), lho = u32(b, p + 42), csize = u32(b, p + 20);
      var lnl = u16(b, lho + 26), lel = u16(b, lho + 28), ds = lho + 30 + lnl + lel;
      entries.push({ name: dec.decode(b.subarray(p + 46, p + 46 + nl)), method: u16(b, p + 10), time: u16(b, p + 12), date: u16(b, p + 14),
        crc: u32(b, p + 16), csize: csize, usize: u32(b, p + 24), raw: b.slice(ds, ds + csize) });
      p += 46 + nl + el + cl;
    }
    return entries;
  }
  async function inflateRaw(raw) {
    var ds = new DecompressionStream('deflate-raw');
    return new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(ds)).arrayBuffer());
  }
  async function entryBytes(e) { return e.method === 0 ? e.raw : inflateRaw(e.raw); }
  function writeZip(entries) {
    var enc = new TextEncoder(), chunks = [], central = [], offset = 0;
    entries.forEach(function (e) {
      var nb = enc.encode(e.name), h = new Uint8Array(30 + nb.length), dv = new DataView(h.buffer);
      dv.setUint32(0, 0x04034b50, true); dv.setUint16(4, 20, true); dv.setUint16(6, 0x0800, true); dv.setUint16(8, e.method, true);
      dv.setUint16(10, e.time, true); dv.setUint16(12, e.date, true); dv.setUint32(14, e.crc, true); dv.setUint32(18, e.csize, true);
      dv.setUint32(22, e.usize, true); dv.setUint16(26, nb.length, true); h.set(nb, 30);
      chunks.push(h, e.raw);
      var c = new Uint8Array(46 + nb.length), cv = new DataView(c.buffer);
      cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint16(8, 0x0800, true); cv.setUint16(10, e.method, true);
      cv.setUint16(12, e.time, true); cv.setUint16(14, e.date, true); cv.setUint32(16, e.crc, true); cv.setUint32(20, e.csize, true);
      cv.setUint32(24, e.usize, true); cv.setUint16(28, nb.length, true); cv.setUint32(42, offset, true); c.set(nb, 46);
      central.push(c); offset += h.length + e.raw.length;
    });
    var size = 0; central.forEach(function (c) { size += c.length; });
    var eo = new Uint8Array(22), ev = new DataView(eo.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, entries.length, true); ev.setUint16(10, entries.length, true); ev.setUint32(12, size, true); ev.setUint32(16, offset, true);
    return new Blob(chunks.concat(central, [eo]), { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }

  // =====================================================
  // 3) เติมข้อมูลลงแม่แบบ (ช่องแทนค่า {ชื่อ} และการวนซ้ำ {#items}...{/items})
  // =====================================================
  function escXml(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  // กรณีผู้ใช้แก้แม่แบบใน Word แล้ว Word แยกช่องแทนค่าออกเป็นหลายส่วน → รวมกลับให้
  function repairSplitTags(xml) {
    var isOpen = function (t) { return t.lastIndexOf('{') > t.lastIndexOf('}'); };
    return xml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, function (p) {
      var re = /(<w:t(?: [^>]*)?>)([^<]*)(<\/w:t>)/g, texts = [], m;
      while ((m = re.exec(p))) texts.push(m[2]);
      var changed = false;
      for (var i = 0; i < texts.length; i++) {
        var j = i + 1;
        while (isOpen(texts[i]) && j < texts.length) { texts[i] += texts[j]; texts[j] = ''; j++; changed = true; }
      }
      if (!changed) return p;
      var idx = 0;
      return p.replace(/(<w:t(?: [^>]*)?>)([^<]*)(<\/w:t>)/g, function (a, open, t, close) {
        return open.replace(/^<w:t>$/, '<w:t xml:space="preserve">') + texts[idx++] + close;
      });
    });
  }

  function fillTemplate(xml, data, rows) {
    xml = repairSplitTags(xml);
    var m = null, re = /<w:p[ >][\s\S]*?<\/w:p>/g, x;
    while ((x = re.exec(xml))) { if (x[0].indexOf('{#items}') >= 0) { m = x; break; } }
    if (!m) throw new Error('แม่แบบไม่มีบรรทัดรายการ {#items}…{/items}');
    var p = m[0], inner = p.match(/\{#items\}([\s\S]*?)\{\/items\}/);
    if (!inner) throw new Error('แม่แบบมี {#items} แต่ไม่พบ {/items} ในย่อหน้าเดียวกัน');
    var copies = rows.map(function (r) {
      var t = inner[1];
      Object.keys(r).forEach(function (k) { t = t.split('{' + k + '}').join(escXml(r[k])); });
      return p.replace(/\{#items\}[\s\S]*?\{\/items\}/, function () { return t; });
    }).map(function (c) { return c.replace(/ w14:paraId="[^"]*"| w14:textId="[^"]*"/g, ''); });
    var firstBm = true;
    var all = copies.join('').replace(/<w:bookmarkStart [^>]*\/>/g, function (b) { if (firstBm) { firstBm = false; return b; } return ''; });
    xml = xml.slice(0, m.index) + all + xml.slice(m.index + p.length);
    Object.keys(data).forEach(function (k) { xml = xml.split('{' + k + '}').join(escXml(data[k])); });
    var left = xml.match(/\{[#\/]?[a-z_0-9]+\}/g);
    if (left) throw new Error('แม่แบบมีช่องที่ระบบยังไม่รู้จัก: ' + Array.from(new Set(left)).join(' '));
    return xml;
  }

  async function buildDocx(F) {
    var res;
    try { res = await fetch(new URL(TEMPLATE_URL, document.baseURI).href, { cache: 'no-cache' }); } catch (e) { res = null; }
    if (!res || !res.ok) throw new Error('ไม่พบแม่แบบ ' + TEMPLATE_URL + ' (ต้องอัปโหลดไว้ใน GitHub โฟลเดอร์เดียวกับ index.html)');
    var entries = readZip(await res.arrayBuffer());
    var idx = -1;
    entries.forEach(function (e, i) { if (e.name === 'word/document.xml') idx = i; });
    if (idx < 0) throw new Error('แม่แบบไม่มี word/document.xml');
    var xml = new TextDecoder().decode(await entryBytes(entries[idx]));
    var built = buildData(F);
    xml = fillTemplate(xml, built.data, built.rows);
    var bytes = new TextEncoder().encode(xml);
    entries[idx] = { name: 'word/document.xml', method: 0, time: entries[idx].time, date: entries[idx].date, crc: crc32(bytes), csize: bytes.length, usize: bytes.length, raw: bytes };
    return writeZip(entries);
  }

  // F = ข้อมูลที่ผู้ใช้กรอก (เก็บเป็นค่าดิบ) → ค่าที่พิมพ์ลงเอกสาร (เลขไทยทั้งหมด)
  function lineAmount(it) { return Math.round(Number(it.qty) * Number(it.price) * 100) / 100; }
  function totalOf(items) { var t = 0; items.forEach(function (it) { t += lineAmount(it); }); return Math.round(t * 100) / 100; }
  function buildData(F) {
    var total = totalOf(F.items);
    var rows = F.items.map(function (it) {
      return { name: it.name, qty: plainNum(it.qty), unit: it.unit, price: money(it.price), amount: money(lineAmount(it)) };
    });
    var data = {
      doc_prefix: F.prefix, doc_no: thaiDigits(F.docNo), doc_date: thaiDate(F.docDate), n_items: plainNum(F.items.length), fy: thaiDigits(F.fy),
      total: money(total), total_text: bahtText(total), fund: F.fund, method: F.method,
      officer_name: F.officer.name, officer_pos: F.officer.pos, s1_name: F.s1.name, s1_pos: F.s1.pos, s2_name: F.s2.name, s2_pos: F.s2.pos,
      dir_name: F.dir.name, dir_pos: F.dir.pos, approve_date: thaiDate(F.approveDate)
    };
    return { data: data, rows: rows, total: total };
  }

  function download(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 10000);
  }
  function fileName(F) {
    var no = String(F.docNo).replace(/[๐-๙]/g, function (c) { return TH_DIG.indexOf(c); }).replace(/[\\\/:*?"<>|\s]+/g, '_');
    return 'ขออนุมัติแต่งตั้ง_' + no + '.docx';
  }

  // =====================================================
  // 4) ชุดจัดซื้อ (สร้างจากหน้า สั่งซื้อวัสดุ)
  // =====================================================
  STK.createSet = async function () {
    var u = U(), S = u.S;
    var rows = (S.orders ? S.orders.orders : []).filter(function (o) { return S.sel && S.sel[o.row]; });
    if (!rows.length) return u.fail('ติ๊กเลือกรายการสั่งซื้อที่ต้องการรวมเป็นชุดจัดซื้อก่อน');
    var noPrice = rows.filter(function (o) { return !(o.planPrice > 0); }).length;
    var list = rows.map(function (o) {
      return '<tr class="border-t"><td class="p-1">' + u.esc(o.name) + '</td><td class="p-1 text-right whitespace-nowrap">' + u.nf(o.qty) + ' ' + u.esc(o.unit) + '</td><td class="p-1 text-right">' + (o.planPrice > 0 ? u.nf(o.planPrice) : '<span class="text-red-500">ไม่มีราคาแผน</span>') + '</td></tr>';
    }).join('');
    u.modal('สร้างชุดจัดซื้อ (' + rows.length + ' รายการ)',
      '<table class="w-full text-sm mb-2"><thead class="bg-gray-100"><tr><th class="' + u.TH + '">รายการ</th><th class="' + u.TH + '">จำนวน</th><th class="' + u.TH + '">ราคาแผน/หน่วย</th></tr></thead><tbody>' + list + '</tbody></table>' +
      (noPrice ? '<p class="text-sm text-amber-700 mb-2">มี ' + noPrice + ' รายการที่ไม่มีราคาตามแผน ต้องกรอกราคาเองตอนทำเอกสาร</p>' : '') +
      '<input id="setNote" class="' + u.INPUT + ' mb-3" placeholder="หมายเหตุของชุด (ถ้ามี)">' +
      '<div class="flex gap-2"><button type="button" onclick="STK.createSetConfirm()" class="' + u.BTN + 'bg-indigo-500 text-white hover:bg-indigo-600">สร้างชุด</button><button type="button" onclick="STK.close()" class="' + u.BTN + 'bg-gray-100 hover:bg-gray-200">ยกเลิก</button></div>');
  };
  STK.createSetConfirm = async function () {
    var u = U(), S = u.S;
    var rows = Object.keys(S.sel).filter(function (k) { return S.sel[k]; }).map(Number);
    var r = await u.call('stockCreateSet', { orderRows: rows, note: $('setNote').value });
    if (!r) return;
    if (!r.success) return u.fail(r.error);
    STK.close();
    await u.toast('สร้างชุดจัดซื้อ ' + r.id + ' แล้ว');
    STK.go('docs', { open: r.id });
  };

  // =====================================================
  // 5) หน้า "เอกสาร": รายการชุด + ทะเบียนคุมเอกสาร
  // =====================================================
  STK.renderDocs = async function (arg) {
    var u = U();
    var res = await Promise.all([u.call('stockGetSets'), u.call('stockGetRegister'), u.call('stockGetStaff')]);
    if (!res[0] || !res[1] || !res[2]) return;
    D.sets = res[0]; D.reg = res[1]; D.staff = res[2].staff; D.cfg = res[2].cfg;
    if (arg && arg.open) return STK.docOpen(arg.open);
    drawDocsHome();
  };

  function drawDocsHome() {
    var u = U(), esc = u.esc, nf = u.nf;
    var active = D.staff.filter(function (s) { return s.active; });
    var warn = active.length === 0 ? '<div class="mb-3 p-3 rounded-lg bg-yellow-50 border border-yellow-200 text-sm text-yellow-800">ยังไม่มีรายชื่อเจ้าหน้าที่ในทะเบียน ไปที่ <b>ตั้งค่า</b> เพื่อเพิ่มรายชื่อและกำหนดผู้ลงนามก่อนออกเอกสาร</div>' : '';
    var sets = D.sets.map(function (s) {
      var st = s.status === 'ออกเอกสารแล้ว' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600';
      return '<tr class="border-t hover:bg-gray-50"><td class="p-2 text-xs">' + esc(s.id) + '</td><td class="p-2 text-xs whitespace-nowrap">' + esc(s.created) + '</td><td class="p-2 text-right">' + s.items.length + '</td>' +
        '<td class="p-2 text-right">' + nf(s.total) + '</td><td class="p-2"><span class="px-2 py-0.5 rounded-full text-xs ' + st + '">' + esc(s.status) + '</span></td><td class="p-2 text-xs">' + esc(s.note) + '</td>' +
        '<td class="p-2 whitespace-nowrap"><button type="button" onclick="STK.docOpen(\'' + s.id + '\')" class="text-xs text-blue-600 underline mr-2">ทำเอกสาร</button>' +
        (s.status === 'ออกเอกสารแล้ว' ? '' : '<button type="button" onclick="STK.setDelete(\'' + s.id + '\')" class="text-xs text-red-500 underline">ลบ</button>') + '</td></tr>';
    }).join('') || '<tr><td colspan="7" class="p-4 text-center text-gray-400">ยังไม่มีชุดจัดซื้อ — ไปที่ สั่งซื้อวัสดุ ติ๊กรายการแล้วกด "สร้างชุดจัดซื้อจากที่เลือก"</td></tr>';
    var regs = D.reg.map(function (r) {
      return '<tr class="border-t hover:bg-gray-50"><td class="p-2 text-xs">' + esc(r.id) + '</td><td class="p-2 whitespace-nowrap">' + esc(r.docNo) + '</td><td class="p-2 text-xs whitespace-nowrap">' + esc(r.docDate) + '</td>' +
        '<td class="p-2 text-xs">' + esc(r.type) + '</td><td class="p-2 text-right">' + r.nItems + '</td><td class="p-2 text-right">' + nf(r.total) + '</td><td class="p-2 text-xs">' + esc(r.officer) + '</td>' +
        '<td class="p-2 whitespace-nowrap">' + (r.data ? '<button type="button" onclick="STK.docRedownload(\'' + r.id + '\')" class="text-xs text-blue-600 underline">ดาวน์โหลดอีกครั้ง</button>' : '') + '</td></tr>';
    }).join('') || '<tr><td colspan="8" class="p-4 text-center text-gray-400">ยังไม่มีเอกสารในทะเบียน</td></tr>';
    var head = function (a) { return a.map(function (h) { return '<th class="' + u.TH + '">' + h + '</th>'; }).join(''); };
    u.body(warn + '<h3 class="text-lg font-medium mb-2"><i class="fa-solid fa-layer-group text-indigo-500 mr-2"></i>ชุดจัดซื้อ</h3><div class="overflow-x-auto mb-8"><table class="w-full text-sm border-collapse"><thead class="bg-gray-100"><tr>' +
      head(['รหัสชุด', 'สร้างเมื่อ', 'รายการ', 'มูลค่า (ราคาแผน)', 'สถานะ', 'หมายเหตุ', '']) + '</tr></thead><tbody>' + sets + '</tbody></table></div>' +
      '<h3 class="text-lg font-medium mb-2"><i class="fa-solid fa-book text-emerald-500 mr-2"></i>ทะเบียนคุมเอกสาร</h3><div class="overflow-x-auto"><table class="w-full text-sm border-collapse"><thead class="bg-gray-100"><tr>' +
      head(['รหัส', 'เลขที่หนังสือ', 'วันที่', 'ประเภท', 'รายการ', 'ยอดรวม (บาท)', 'ผู้เสนอแต่งตั้ง', '']) + '</tr></thead><tbody>' + regs + '</tbody></table></div>');
  }

  STK.setDelete = async function (id) {
    var u = U();
    var c = await Swal.fire({ title: 'ลบชุดจัดซื้อ ' + id + '?', text: 'รายการสั่งซื้อในแท็บ สั่งซื้อวัสดุ ไม่ถูกลบ', icon: 'warning', showCancelButton: true, confirmButtonColor: '#ef4444', confirmButtonText: 'ลบ', cancelButtonText: 'ยกเลิก' });
    if (!c.isConfirmed) return;
    var r = await u.call('stockDeleteSet', id);
    if (!r) return;
    if (!r.success) return u.fail(r.error);
    STK.renderDocs();
  };

  STK.docRedownload = async function (regId) {
    var u = U();
    var r = D.reg.filter(function (x) { return x.id === regId; })[0];
    if (!r || !r.data) return u.fail('ไม่มีข้อมูลเก็บไว้สำหรับสร้างไฟล์ใหม่');
    try {
      var F = JSON.parse(r.data);
      var blob = await buildDocx(F);
      download(blob, fileName(F));
    } catch (e) { u.fail(e.message || String(e)); }
  };

  // =====================================================
  // 6) ฟอร์มออกเอกสาร แบ่งเป็นการ์ดตามวรรค
  // =====================================================
  function staffOpts(list, selId) {
    return '<option value="">— เลือกจากทะเบียน —</option>' + list.map(function (s) {
      return '<option value="' + s.id + '"' + (s.id === selId ? ' selected' : '') + '>' + U().esc(s.name) + ' · ' + U().esc(s.pos) + '</option>';
    }).join('');
  }
  function staffById(id) { return D.staff.filter(function (s) { return s.id === id; })[0] || { name: '', pos: '' }; }

  STK.docOpen = async function (setId) {
    var u = U();
    if (!D.sets.length || !D.staff.length) { var res = await Promise.all([u.call('stockGetSets'), u.call('stockGetStaff')]); if (!res[0] || !res[1]) return; D.sets = res[0]; D.staff = res[1].staff; D.cfg = res[1].cfg; }
    var set = D.sets.filter(function (s) { return s.id === setId; })[0];
    if (!set) return u.fail('ไม่พบชุดจัดซื้อ ' + setId);
    D.set = set;
    var cfg = D.cfg, esc = u.esc, today = u.today();
    var active = D.staff.filter(function (s) { return s.active; });
    var officers = active.filter(function (s) { return s.officer; });
    var s1 = staffById(cfg.SIGN_S1), s2 = staffById(cfg.SIGN_S2), dr = staffById(cfg.SIGN_DIR);
    var fy = (u.S.board && u.S.board.cfg.FY) || set.fy;
    var card = function (title, inner) { return '<div class="border rounded-xl bg-white p-4 mb-4"><div class="text-sm font-medium text-gray-700 border-b pb-2 mb-3">' + title + '</div>' + inner + '</div>'; };
    var lab = function (t) { return '<label class="text-xs text-gray-500">' + t + '</label>'; };
    var inp = function (id, v, ph, type) { return '<input id="' + id + '" type="' + (type || 'text') + '" value="' + esc(v) + '" placeholder="' + esc(ph || '') + '" class="' + u.INPUT + '">'; };
    var itemRows = set.items.map(function (it) { return itemRowHtml({ name: it.name, qty: it.qty, unit: u.unitTh(it.unit), price: it.price }); }).join('');

    u.body('<div class="max-w-4xl"><div class="flex items-center justify-between mb-3"><h3 class="text-lg font-medium"><i class="fa-solid fa-file-word text-blue-500 mr-2"></i>' + esc(DOC_TYPE) + '<span class="text-sm text-gray-400 ml-2">ชุด ' + esc(set.id) + '</span></h3>' +
      '<button type="button" onclick="STK.go(\'docs\')" class="' + u.BTN + 'bg-gray-100 hover:bg-gray-200">← กลับ</button></div>' +
      card('วรรคที่ ๑ · หัวบันทึกข้อความ', '<p class="text-xs text-gray-500 mb-2">เรื่อง: ' + esc(DOC_SUBJECT) + '</p><div class="grid grid-cols-1 md:grid-cols-2 gap-3">' +
        '<div>' + lab('เลขที่หนังสือ — พิมพ์เฉพาะเลขลำดับต่อจาก <b>' + esc(cfg.DOC_PREFIX) + '</b>') + inp('fNo', '', 'เช่น 1476') + '<div id="fNoHint" class="text-xs mt-1"></div></div>' +
        '<div>' + lab('วันที่ (หัวเอกสาร)') + inp('fDate', today, '', 'date') + '</div></div>') +
      card('วรรคที่ ๒ · ต้นเรื่อง (รายการวัสดุ)', '<p class="text-xs text-gray-500 mb-2">ราคาต่อหน่วยดึงจากแผนประจำปี (แก้ได้ ต้องกรอกถ้าไม่มีราคาแผน) · ปีงบประมาณ ' + esc(fy) + '</p>' +
        '<div class="overflow-x-auto"><table class="w-full text-sm border-collapse"><thead class="bg-gray-100"><tr><th class="' + u.TH + '">รายการ</th><th class="' + u.TH + '" style="width:80px">จำนวน</th><th class="' + u.TH + '" style="width:90px">หน่วย</th><th class="' + u.TH + '" style="width:110px">ราคา/หน่วย</th><th class="' + u.TH + '" style="width:110px">เป็นเงิน</th><th class="' + u.TH + '" style="width:30px"></th></tr></thead><tbody id="fItems">' + itemRows + '</tbody></table></div>' +
        '<button type="button" onclick="STK.docAddRow()" class="mt-2 ' + u.BTN + 'bg-gray-100 hover:bg-gray-200 text-xs"><i class="fa-solid fa-plus mr-1"></i>เพิ่มบรรทัด</button>' +
        '<div id="fTotal" class="mt-3 p-2 rounded-lg bg-blue-50 text-sm text-blue-900"></div>' +
        '<div class="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3"><div>' + lab('แหล่งเงิน (ข้อความต่อจาก "ด้วย")') + inp('fFund', cfg.DOC_FUND) + '</div><div>' + lab('วิธีจัดซื้อ (ต่อจาก "โดยวิธี")') + inp('fMethod', cfg.DOC_METHOD) + '</div><div>' + lab('ปีงบประมาณ (พ.ศ.)') + inp('fFy', fy) + '</div></div>') +
      card('วรรคที่ ๓ · ข้อเท็จจริง', '<p class="text-sm text-gray-600">ข้อความคงที่ในแม่แบบ ระบบเติมเฉพาะจำนวนรายการ (<span id="fCount"></span> รายการ) ให้อัตโนมัติ</p>') +
      card('วรรคที่ ๔ · ข้อพิจารณา (ผู้เสนอแต่งตั้ง)', '<div class="grid grid-cols-1 md:grid-cols-3 gap-3"><div>' + lab('เลือกจากทะเบียน') + '<select id="fOffSel" onchange="STK.docPick(\'Off\')" class="' + u.INPUT + '">' + staffOpts(officers, '') + '</select></div>' +
        '<div>' + lab('ชื่อ-สกุล') + inp('fOffName', '') + '</div><div>' + lab('ตำแหน่ง') + inp('fOffPos', '') + '</div></div>' +
        (officers.length ? '' : '<p class="text-xs text-amber-700 mt-2">ยังไม่มีรายชื่อที่ติ๊ก "เป็นตัวเลือกผู้เสนอแต่งตั้ง" ในทะเบียน (พิมพ์เองได้)</p>')) +
      card('วรรคที่ ๕ · ลงนามและอนุมัติ', ['S1:เจ้าหน้าที่:' + (cfg.SIGN_S1 || ''), 'S2:หัวหน้าเจ้าหน้าที่:' + (cfg.SIGN_S2 || ''), 'Dir:ผู้อำนวยการ:' + (cfg.SIGN_DIR || '')].map(function (x) {
        var p = x.split(':'), cur = staffById(p[2]);
        return '<div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-2"><div>' + lab(p[1] + ' (เลือกจากทะเบียน)') + '<select id="f' + p[0] + 'Sel" onchange="STK.docPick(\'' + p[0] + '\')" class="' + u.INPUT + '">' + staffOpts(active, p[2]) + '</select></div>' +
          '<div>' + lab('ชื่อ-สกุล') + inp('f' + p[0] + 'Name', cur.name) + '</div><div>' + lab('ตำแหน่ง (แก้ได้ เช่น รักษาราชการแทน)') + inp('f' + p[0] + 'Pos', cur.pos) + '</div></div>';
      }).join('') + '<div class="mt-2 max-w-xs">' + lab('วันที่ท้ายเอกสาร (ผู้อำนวยการอนุมัติ)') + inp('fApprove', today, '', 'date') + '</div>') +
      '<div class="flex flex-wrap gap-2"><button type="button" id="fGen" onclick="STK.docGenerate()" class="' + u.BTN + 'bg-blue-500 text-white hover:bg-blue-600"><i class="fa-solid fa-file-arrow-down mr-1"></i>สร้างไฟล์ Word (.docx)</button>' +
      '<span class="text-xs text-gray-500 self-center">กดแล้วระบบบันทึกลงทะเบียนคุมเอกสารและดาวน์โหลดไฟล์ให้</span></div></div>');
    // ผูกการคำนวณ
    var body = $('fItems');
    body.addEventListener('input', docRecalc);
    $('fNo').addEventListener('input', docNoHint);
    docRecalc();
  };

  function itemRowHtml(it) {
    var u = U(), cls = u.INPUT;
    return '<tr class="border-t di"><td class="p-1"><input class="di-name ' + cls + '" value="' + u.esc(it.name) + '"></td><td class="p-1"><input class="di-qty ' + cls + '" type="number" min="0" step="any" value="' + u.esc(it.qty) + '"></td>' +
      '<td class="p-1"><input class="di-unit ' + cls + '" value="' + u.esc(it.unit) + '"></td><td class="p-1"><input class="di-price ' + cls + '" type="number" min="0" step="any" value="' + (it.price > 0 ? u.esc(it.price) : '') + '" placeholder="' + (it.price > 0 ? '' : 'กรอกราคา') + '"></td>' +
      '<td class="p-1 text-right di-amt text-sm"></td><td class="p-1 text-center"><button type="button" onclick="STK.docDelRow(this)" class="text-red-500" aria-label="ลบบรรทัด"><i class="fa-solid fa-xmark"></i></button></td></tr>';
  }
  STK.docAddRow = function () { $('fItems').insertAdjacentHTML('beforeend', itemRowHtml({ name: '', qty: '', unit: '', price: 0 })); docRecalc(); };
  STK.docDelRow = function (btn) { var tr = btn.closest('tr'); tr.parentNode.removeChild(tr); docRecalc(); };

  function readItems() {
    var out = [];
    document.querySelectorAll('#fItems tr.di').forEach(function (tr) {
      out.push({ name: tr.querySelector('.di-name').value.trim(), qty: Number(tr.querySelector('.di-qty').value), unit: tr.querySelector('.di-unit').value.trim(), price: Number(tr.querySelector('.di-price').value) });
    });
    return out;
  }
  function docRecalc() {
    var u = U(), items = readItems();
    document.querySelectorAll('#fItems tr.di').forEach(function (tr, i) {
      var it = items[i];
      tr.querySelector('.di-amt').textContent = (it.qty > 0 && it.price > 0) ? u.nf(lineAmount(it)) : '-';
    });
    var valid = items.filter(function (i) { return i.qty > 0 && i.price > 0; });
    var total = totalOf(valid);
    var c = $('fCount'); if (c) c.textContent = items.length;
    var t = $('fTotal');
    if (t) t.innerHTML = 'รวม ' + items.length + ' รายการ เป็นเงิน <b>' + u.nf(total) + '</b> บาท (' + (total > 0 ? bahtText(total) : '-') + ')';
  }
  var noTimer = null;
  function docNoHint() {
    clearTimeout(noTimer);
    noTimer = setTimeout(async function () {
      var el = $('fNoHint'), no = $('fNo') && $('fNo').value.trim();
      if (!el) return;
      if (!no) { el.innerHTML = ''; return; }
      var full = D.cfg.DOC_PREFIX + no;
      try {
        var r = await gasCall('stockCheckDocNo', [DOC_TYPE, full]);
        el.innerHTML = r.exists ? '<span class="text-red-600">เลขที่นี้เคยออกแล้ว (' + U().esc(r.regId) + ' · ' + U().esc(r.docDate) + ')</span>' : '<span class="text-green-600">ยังไม่เคยใช้</span>';
      } catch (e) { el.innerHTML = ''; }
    }, 400);
  }
  STK.docPick = function (key) {
    var id = $('f' + key + 'Sel').value, s = staffById(id);
    if (!id) return;
    $('f' + key + 'Name').value = s.name; $('f' + key + 'Pos').value = s.pos;
  };

  function readForm() {
    var v = function (id) { return $(id).value.trim(); };
    return {
      prefix: D.cfg.DOC_PREFIX, docNo: v('fNo'), docDate: v('fDate'), approveDate: v('fApprove'), fy: v('fFy'), fund: v('fFund'), method: v('fMethod'),
      items: readItems(), officer: { name: v('fOffName'), pos: v('fOffPos') }, s1: { name: v('fS1Name'), pos: v('fS1Pos') },
      s2: { name: v('fS2Name'), pos: v('fS2Pos') }, dir: { name: v('fDirName'), pos: v('fDirPos') }
    };
  }
  function validate(F) {
    var errs = [];
    if (!F.docNo) errs.push('ใส่เลขที่หนังสือ');
    if (!F.docDate) errs.push('เลือกวันที่หัวเอกสาร');
    if (!F.approveDate) errs.push('เลือกวันที่ท้ายเอกสาร');
    if (!/^\d{4}$/.test(F.fy)) errs.push('ปีงบประมาณต้องเป็น พ.ศ. 4 หลัก');
    if (!F.fund) errs.push('ใส่แหล่งเงิน');
    if (!F.method) errs.push('ใส่วิธีจัดซื้อ');
    if (!F.items.length) errs.push('ต้องมีรายการวัสดุอย่างน้อย 1 รายการ');
    F.items.forEach(function (it, i) {
      var n = 'บรรทัดที่ ' + (i + 1) + ': ';
      if (!it.name) errs.push(n + 'ใส่ชื่อรายการ');
      if (!(it.qty > 0)) errs.push(n + 'จำนวนต้องมากกว่า 0');
      if (!it.unit) errs.push(n + 'ใส่หน่วย');
      if (!(it.price > 0)) errs.push(n + 'ใส่ราคาต่อหน่วย (ไม่มีราคาตามแผน)');
    });
    [['officer', 'ผู้เสนอแต่งตั้ง'], ['s1', 'เจ้าหน้าที่'], ['s2', 'หัวหน้าเจ้าหน้าที่'], ['dir', 'ผู้อำนวยการ']].forEach(function (p) {
      if (!F[p[0]].name || !F[p[0]].pos) errs.push('ใส่ชื่อและตำแหน่งของ ' + p[1]);
    });
    return errs;
  }

  STK.docGenerate = async function () {
    var u = U(), F = readForm(), errs = validate(F);
    if (errs.length) return Swal.fire({ icon: 'warning', title: 'ข้อมูลยังไม่ครบ', html: '<div class="text-left text-sm">' + errs.map(function (e) { return '• ' + u.esc(e); }).join('<br>') + '</div>' });
    var full = F.prefix + F.docNo;
    $('fGen').disabled = true;
    try {
      var dup = null;
      try { dup = await gasCall('stockCheckDocNo', [DOC_TYPE, full]); } catch (e) { throw new Error('ตรวจเลขที่หนังสือไม่สำเร็จ: ' + e.message); }
      var allowDup = false;
      if (dup.exists) {
        var c = await Swal.fire({ icon: 'warning', title: 'เลขที่หนังสือซ้ำ', text: 'เลขที่นี้เคยออกแล้ว (' + dup.regId + ' · ' + dup.docDate + ') ต้องการออกซ้ำหรือไม่', showCancelButton: true, confirmButtonText: 'ออกซ้ำ', cancelButtonText: 'กลับไปแก้' });
        if (!c.isConfirmed) return;
        allowDup = true;
      }
      var blob = await buildDocx(F);              // สร้างไฟล์ก่อน ถ้าพลาดจะยังไม่บันทึกลงทะเบียน
      var built = buildData(F);
      var r = await u.call('stockRegisterDoc', { type: DOC_TYPE, docNo: thaiDigits(full), docDate: built.data.doc_date, subject: DOC_SUBJECT, setId: D.set ? D.set.id : '', nItems: F.items.length,
        total: built.total, officer: F.officer.name, s1: F.s1.name, s2: F.s2.name, dir: F.dir.name, fund: F.fund, method: F.method, data: JSON.stringify(F), allowDuplicate: allowDup });
      if (!r) return;
      if (!r.success) return u.fail(r.error);
      download(blob, fileName(F));
      await u.toast('บันทึกทะเบียน ' + r.regId + ' และดาวน์โหลดแล้ว');
      STK.go('docs');
    } catch (e) {
      u.fail(e.message || String(e));
    } finally { if ($('fGen')) $('fGen').disabled = false; }
  };

  // =====================================================
  // 7) ตั้งค่า: ทะเบียนเจ้าหน้าที่ + ผู้ลงนาม + ค่าเริ่มต้นเอกสาร
  // =====================================================
  STK.renderStaffSection = async function () {
    var u = U(), el = $('staffSection');
    if (!el) return;
    var r = await u.call('stockGetStaff');
    if (!r || !$('staffSection')) return;
    D.staff = r.staff; D.cfg = r.cfg;
    var esc = u.esc, cfg = r.cfg, active = r.staff.filter(function (s) { return s.active; });
    var rows = r.staff.map(function (s) {
      return '<tr class="border-t ' + (s.active ? '' : 'text-gray-400') + '"><td class="p-2 text-xs">' + esc(s.id) + '</td><td class="p-2">' + esc(s.name) + '</td><td class="p-2">' + esc(s.pos) + '</td>' +
        '<td class="p-2 text-center">' + (s.officer ? '✓' : '') + '</td><td class="p-2 text-center">' + (s.active ? 'ใช้งาน' : 'ปิดใช้งาน') + '</td>' +
        '<td class="p-2"><button type="button" onclick="STK.staffEdit(\'' + s.id + '\')" class="text-xs text-blue-600 underline">แก้ไข</button></td></tr>';
    }).join('') || '<tr><td colspan="6" class="p-3 text-center text-gray-400">ยังไม่มีรายชื่อ</td></tr>';
    var sel = function (id, label, cur) { return '<div><label class="text-xs text-gray-500">' + label + '</label><select id="' + id + '" class="' + u.INPUT + '">' + staffOpts(active, cur) + '</select></div>'; };
    el.innerHTML = '<h4 class="font-medium mb-2">เจ้าหน้าที่และผู้ลงนาม (สำหรับเอกสาร)</h4>' +
      '<div class="overflow-x-auto mb-2"><table class="w-full text-sm border-collapse"><thead class="bg-gray-100"><tr>' + ['รหัส', 'ชื่อ-สกุล', 'ตำแหน่ง', 'ผู้เสนอแต่งตั้งได้', 'สถานะ', ''].map(function (h) { return '<th class="' + u.TH + '">' + h + '</th>'; }).join('') + '</tr></thead><tbody>' + rows + '</tbody></table></div>' +
      '<button type="button" onclick="STK.staffEdit(\'\')" class="' + u.BTN + 'bg-blue-500 text-white hover:bg-blue-600 mb-4"><i class="fa-solid fa-plus mr-1"></i>เพิ่มรายชื่อ</button>' +
      '<div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">' + sel('cfS1', 'ผู้ลงนาม: เจ้าหน้าที่', cfg.SIGN_S1) + sel('cfS2', 'ผู้ลงนาม: หัวหน้าเจ้าหน้าที่', cfg.SIGN_S2) + sel('cfDir', 'ผู้อำนวยการ', cfg.SIGN_DIR) + '</div>' +
      '<div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3"><div><label class="text-xs text-gray-500">ส่วนหน้าเลขที่หนังสือ</label><input id="cfPrefix" value="' + esc(cfg.DOC_PREFIX) + '" class="' + u.INPUT + '"></div>' +
      '<div><label class="text-xs text-gray-500">แหล่งเงินเริ่มต้น</label><input id="cfFund" value="' + esc(cfg.DOC_FUND) + '" class="' + u.INPUT + '"></div>' +
      '<div><label class="text-xs text-gray-500">วิธีจัดซื้อเริ่มต้น</label><input id="cfMethod" value="' + esc(cfg.DOC_METHOD) + '" class="' + u.INPUT + '"></div></div>' +
      '<button type="button" onclick="STK.docCfgSave()" class="' + u.BTN + 'bg-blue-500 text-white hover:bg-blue-600">บันทึกผู้ลงนามและค่าเริ่มต้นเอกสาร</button>' +
      '<p class="text-xs text-gray-400 mt-2">ถ้ามีการโยกย้าย: เพิ่มคนใหม่ → เลือกเป็นผู้ลงนามแล้วบันทึก → ปิดใช้งานคนเดิม เอกสารที่ออกไปแล้วยังเก็บชื่อเดิมไว้ในทะเบียนคุมเอกสาร</p>';
  };
  STK.docCfgSave = async function () {
    var u = U();
    var r = await u.call('stockSaveDocConfig', { SIGN_S1: $('cfS1').value, SIGN_S2: $('cfS2').value, SIGN_DIR: $('cfDir').value, DOC_PREFIX: $('cfPrefix').value, DOC_FUND: $('cfFund').value, DOC_METHOD: $('cfMethod').value });
    if (!r) return;
    if (!r.success) return u.fail(r.error);
    await u.toast('บันทึกแล้ว');
    STK.renderStaffSection();
  };
  STK.staffEdit = function (id) {
    var u = U(), s = id ? D.staff.filter(function (x) { return x.id === id; })[0] : { id: '', name: '', pos: '', officer: false, active: true };
    u.modal(id ? 'แก้ไขรายชื่อ ' + u.esc(id) : 'เพิ่มรายชื่อเจ้าหน้าที่',
      '<div class="grid grid-cols-1 gap-3"><div><label class="text-xs text-gray-500">ชื่อ-สกุล (รวมคำนำหน้า)</label><input id="stName" value="' + u.esc(s.name) + '" class="' + u.INPUT + '"></div>' +
      '<div><label class="text-xs text-gray-500">ตำแหน่ง</label><input id="stPos" value="' + u.esc(s.pos) + '" class="' + u.INPUT + '"></div>' +
      '<label class="text-sm"><input type="checkbox" id="stOff"' + (s.officer ? ' checked' : '') + '> เป็นตัวเลือก "ผู้เสนอแต่งตั้ง" (ผู้กำหนดคุณลักษณะและราคากลาง)</label>' +
      '<label class="text-sm"><input type="checkbox" id="stAct"' + (s.active ? ' checked' : '') + '> ใช้งานอยู่ (เอาออกถ้าย้ายหรือพ้นหน้าที่ — ไม่ต้องลบ)</label></div>' +
      '<div class="mt-4 flex gap-2"><button type="button" onclick="STK.staffSave(\'' + id + '\')" class="' + u.BTN + 'bg-blue-500 text-white hover:bg-blue-600">บันทึก</button><button type="button" onclick="STK.close()" class="' + u.BTN + 'bg-gray-100 hover:bg-gray-200">ยกเลิก</button></div>');
  };
  STK.staffSave = async function (id) {
    var u = U();
    var r = await u.call('stockSaveStaff', { id: id, name: $('stName').value, pos: $('stPos').value, officer: $('stOff').checked, active: $('stAct').checked });
    if (!r) return;
    if (!r.success) return u.fail(r.error);
    STK.close();
    STK.renderStaffSection();
  };

  // เปิดให้ทดสอบ/ใช้ซ้ำได้
  STK._docs = { thaiDigits: thaiDigits, thaiDate: thaiDate, money: money, bahtText: bahtText, buildDocx: buildDocx, buildData: buildData };
})();
