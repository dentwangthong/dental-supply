/*!
 * xls-writer.js
 * 1) สร้างไฟล์ Excel 97-2003 (.xls / BIFF8) พร้อม Name Box (Defined Name: qryClientOrderExport)
 * 2) สร้างหน้าพิมพ์/บันทึก PDF "ใบเบิกวัสดุทันตกรรม" ขนาด A4 (เลขอารบิก)
 * ไม่ต้องใช้ไลบรารีภายนอก ใช้ได้ทั้งในเบราว์เซอร์ (GitHub Pages) และ Google Apps Script
 */
(function (root) {
  'use strict';

  var MAX_REC = 8224;          // ขนาดข้อมูลสูงสุดต่อ record ของ BIFF8
  var MAX_STR = 4000;          // จำกัดความยาวข้อความต่อเซลล์ (ให้อยู่ใน record เดียว)

  // ---------- ตัวช่วยเขียนไบต์ ----------
  function Buf() { this.a = []; }
  Buf.prototype.u8 = function (v) { this.a.push(v & 0xFF); return this; };
  Buf.prototype.u16 = function (v) { this.a.push(v & 0xFF, (v >>> 8) & 0xFF); return this; };
  Buf.prototype.u32 = function (v) {
    this.a.push(v & 0xFF, (v >>> 8) & 0xFF, (v >>> 16) & 0xFF, (v >>> 24) & 0xFF); return this;
  };
  Buf.prototype.f64 = function (v) {
    var dv = new DataView(new ArrayBuffer(8)); dv.setFloat64(0, v, true);
    for (var i = 0; i < 8; i++) this.a.push(dv.getUint8(i));
    return this;
  };
  Buf.prototype.bytes = function (arr) { for (var i = 0; i < arr.length; i++) this.a.push(arr[i] & 0xFF); return this; };
  Buf.prototype.utf16 = function (s) {
    for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); this.a.push(c & 0xFF, (c >>> 8) & 0xFF); }
    return this;
  };
  Buf.prototype.latin1 = function (s) { for (var i = 0; i < s.length; i++) this.a.push(s.charCodeAt(i) & 0xFF); return this; };

  function isLatin1(s) { for (var i = 0; i < s.length; i++) if (s.charCodeAt(i) > 0xFF) return false; return true; }

  function rec(type, body) {
    var b = body instanceof Buf ? body.a : (body || []);
    if (b.length > MAX_REC) throw new Error('BIFF record 0x' + type.toString(16) + ' เกินขนาด');
    var out = new Buf().u16(type).u16(b.length);
    out.a = out.a.concat(b);
    return out.a;
  }

  // ---------- record ส่วนกลางของสมุดงาน ----------
  function bof(dt) { return rec(0x0809, new Buf().u16(0x0600).u16(dt).u16(0x4F5A).u16(0x07CD).u32(0x000200C9).u32(0x00000806)); }

  function font(name) {
    var b = new Buf().u16(220).u16(0).u16(0x7FFF).u16(400).u16(0).u8(0).u8(0).u8(0xDE /* Thai */).u8(0);
    b.u8(name.length).u8(1).utf16(name);
    return rec(0x0031, b);
  }

  function xf(isStyle) {
    var b = new Buf().u16(0).u16(0);              // ifnt, ifmt
    b.u16(isStyle ? 0xFFF5 : 0x0001);             // style XF / cell XF (parent = 0)
    b.u8(0x20).u8(0).u8(0).u8(isStyle ? 0x00 : 0x00);
    b.u32(0).u32(0).u16(0x20C0);                  // borders / fill (none)
    return rec(0x00E0, b);
  }

  function writeAccess(user) {
    var b = new Buf().u16(user.length).u8(0).latin1(user);
    while (b.a.length < 112) b.u8(0x20);
    return rec(0x005C, b);
  }

  function boundSheet(name, pos) {
    var b = new Buf().u32(pos).u8(0).u8(0).u8(name.length).u8(1).utf16(name);
    return rec(0x0085, b);
  }

  function nameRecord(n, nSheets) {
    var nm = String(n.name);
    var compressed = isLatin1(nm);
    var formula = new Buf().u8(0x3B)                       // ptgArea3d (reference)
      .u16(n.sheet || 0)                                    // ixti -> XTI ของชีตนั้น
      .u16(n.r1).u16(n.r2).u16(n.c1 & 0xFF).u16(n.c2 & 0xFF); // แถว/คอลัมน์แบบ absolute ($A$1)
    var b = new Buf().u16(0).u8(0).u8(nm.length).u16(formula.a.length)
      .u16(0).u16(0).u8(0).u8(0).u8(0).u8(0);               // ixals, itab(0 = global), cch* = 0
    b.u8(compressed ? 0 : 1);
    if (compressed) b.latin1(nm); else b.utf16(nm);
    b.bytes(formula.a);
    if ((n.sheet || 0) >= nSheets) throw new Error('Name ' + nm + ' อ้างชีตที่ไม่มี');
    return rec(0x0018, b);
  }

  // SST + EXTSST (ต้องรู้ตำแหน่งเริ่มของ SST ในสตรีม)
  function sstRecords(strings, totalRefs, startPos) {
    var out = [];
    var dsst = Math.max(8, Math.floor(strings.length / 128) + 1);
    var ext = new Buf().u16(dsst);
    var cur = new Buf().u32(totalRefs).u32(strings.length);
    var curStart = startPos, isFirst = true;

    function flush() {
      var r = rec(isFirst ? 0x00FC : 0x003C, cur);
      out = out.concat(r); curStart += r.length; isFirst = false; cur = new Buf();
    }
    for (var i = 0; i < strings.length; i++) {
      var s = strings[i];
      var need = 3 + s.length * 2;
      if (cur.a.length + need > MAX_REC) flush();
      if (i % dsst === 0) {
        var offInRec = 4 + cur.a.length;
        ext.u32(curStart + offInRec).u16(offInRec).u16(0);
      }
      cur.u16(s.length).u8(1).utf16(s);
    }
    flush();
    out = out.concat(rec(0x00FF, ext));
    return out;
  }

  // ---------- ชีต ----------
  function sheetStream(sheet, sstIndex) {
    var rows = sheet.rows || [];
    var nRows = rows.length, nCols = 0, i, j;
    for (i = 0; i < nRows; i++) nCols = Math.max(nCols, (rows[i] || []).length);

    var s = [].concat(bof(0x0010));
    s = s.concat(rec(0x000D, new Buf().u16(1)));             // CALCMODE auto
    s = s.concat(rec(0x0055, new Buf().u16(10)));            // DEFCOLWIDTH
    var widths = sheet.colWidths || [];
    for (j = 0; j < widths.length; j++) {
      if (widths[j]) s = s.concat(rec(0x007D, new Buf().u16(j).u16(j).u16(Math.round(widths[j] * 256)).u16(15).u16(0).u16(0)));
    }
    s = s.concat(rec(0x0200, new Buf().u32(0).u32(nRows).u16(0).u16(nCols).u16(0))); // DIMENSIONS

    for (i = 0; i < nRows; i++) {
      var row = rows[i] || [];
      for (j = 0; j < row.length; j++) {
        var v = row[j];
        if (v === null || v === undefined || v === '') continue;
        if (typeof v === 'number' && isFinite(v)) {
          s = s.concat(rec(0x0203, new Buf().u16(i).u16(j).u16(15).f64(v)));
        } else {
          s = s.concat(rec(0x00FD, new Buf().u16(i).u16(j).u16(15).u32(sstIndex(String(v)))));
        }
      }
    }
    s = s.concat(rec(0x023E, new Buf().u16(0x06B6).u16(0).u16(0).u32(0x40).u16(0).u16(0).u32(0))); // WINDOW2
    s = s.concat(rec(0x000A, []));                           // EOF
    return s;
  }

  // ---------- สมุดงาน (Workbook stream) ----------
  function buildWorkbookStream(opts) {
    var sheets = opts.sheets, names = opts.names || [];
    if (!sheets || !sheets.length) throw new Error('ต้องมีอย่างน้อย 1 ชีต');

    var strings = [], map = {}, refs = 0;
    function sstIndex(str) {
      if (str.length > MAX_STR) str = str.substring(0, MAX_STR);
      refs++;
      if (!Object.prototype.hasOwnProperty.call(map, str)) { map[str] = strings.length; strings.push(str); }
      return map[str];
    }
    var sheetStreams = sheets.map(function (sh) { return sheetStream(sh, sstIndex); });

    var g = [];
    g = g.concat(bof(0x0005));
    g = g.concat(rec(0x00E1, new Buf().u16(0x04B0)));        // INTERFACEHDR
    g = g.concat(rec(0x00C1, new Buf().u16(0)));             // MMS
    g = g.concat(rec(0x00E2, []));                           // INTERFACEEND
    g = g.concat(writeAccess('XlsWriter'));
    g = g.concat(rec(0x0042, new Buf().u16(0x04B0)));        // CODEPAGE = UTF-16
    g = g.concat(rec(0x0161, new Buf().u16(0)));             // DSF
    g = g.concat(rec(0x013D, (function () { var b = new Buf(); sheets.forEach(function (_, k) { b.u16(k); }); return b; })())); // TABID
    g = g.concat(rec(0x0019, new Buf().u16(0)));             // WINDOWPROTECT
    g = g.concat(rec(0x0012, new Buf().u16(0)));             // PROTECT
    g = g.concat(rec(0x0013, new Buf().u16(0)));             // PASSWORD
    g = g.concat(rec(0x003D, new Buf().u16(0).u16(0).u16(0x4000).u16(0x2000).u16(0x0038).u16(0).u16(0).u16(1).u16(600))); // WINDOW1
    g = g.concat(rec(0x0040, new Buf().u16(0)));             // BACKUP
    g = g.concat(rec(0x008D, new Buf().u16(0)));             // HIDEOBJ
    g = g.concat(rec(0x0022, new Buf().u16(0)));             // DATEMODE 1900
    g = g.concat(rec(0x000E, new Buf().u16(1)));             // PRECISION
    g = g.concat(rec(0x01B7, new Buf().u16(0)));             // REFRESHALL
    g = g.concat(rec(0x00DA, new Buf().u16(0)));             // BOOKBOOL
    for (var f = 0; f < 4; f++) g = g.concat(font(opts.font || 'Tahoma'));
    for (var x = 0; x < 15; x++) g = g.concat(xf(true));     // style XF 0-14
    g = g.concat(xf(false));                                 // cell XF 15 (ใช้กับทุกเซลล์)
    g = g.concat(rec(0x0293, new Buf().u16(0x8000).u8(0).u8(0xFF))); // STYLE: Normal
    g = g.concat(rec(0x0160, new Buf().u16(0)));             // USESELFS

    var bsPos = [];
    sheets.forEach(function (sh) { bsPos.push(g.length); g = g.concat(boundSheet(sh.name, 0)); });

    g = g.concat(rec(0x008C, new Buf().u16(66).u16(66)));    // COUNTRY = Thailand
    if (names.length) {
      g = g.concat(rec(0x01AE, new Buf().u16(sheets.length).u16(0x0401)));      // SUPBOOK (internal)
      var xt = new Buf().u16(sheets.length);
      sheets.forEach(function (_, k) { xt.u16(0).u16(k).u16(k); });
      g = g.concat(rec(0x0017, xt));                                            // EXTERNSHEET
      names.forEach(function (n) { g = g.concat(nameRecord(n, sheets.length)); }); // NAME
    }
    g = g.concat(sstRecords(strings, refs, g.length));
    g = g.concat(rec(0x000A, []));                           // EOF

    var pos = g.length;
    sheets.forEach(function (_, k) {
      var p = bsPos[k] + 4;
      g[p] = pos & 0xFF; g[p + 1] = (pos >>> 8) & 0xFF; g[p + 2] = (pos >>> 16) & 0xFF; g[p + 3] = (pos >>> 24) & 0xFF;
      pos += sheetStreams[k].length;
    });
    var all = g;
    sheetStreams.forEach(function (s) { all = all.concat(s); });
    return all;
  }

  // ---------- OLE Compound File (ไฟล์ .xls เป็นไฟล์ชนิดนี้) ----------
  function buildCfb(stream) {
    var SEC = 512, ENDCHAIN = 0xFFFFFFFE, FREE = 0xFFFFFFFF, FATSECT = 0xFFFFFFFD;
    var data = stream.slice();
    while (data.length < 4096) data.push(0);                // ให้ใหญ่กว่า mini-stream cutoff
    while (data.length % SEC) data.push(0);
    var nData = data.length / SEC, nDir = 1, nFat = 1;
    while (nFat * 128 < nData + nDir + nFat) nFat++;
    if (nFat > 109) throw new Error('ไฟล์ใหญ่เกินไป');
    var dirStart = nData, fatStart = nData + nDir;

    var h = new Buf();
    h.bytes([0xD0, 0xCF, 0x11, 0xE0, 0xA1, 0xB1, 0x1A, 0xE1]);
    for (var i = 0; i < 16; i++) h.u8(0);
    h.u16(0x003E).u16(0x0003).u16(0xFFFE).u16(9).u16(6);
    for (i = 0; i < 6; i++) h.u8(0);
    h.u32(0).u32(nFat).u32(dirStart).u32(0).u32(4096).u32(ENDCHAIN).u32(0).u32(ENDCHAIN).u32(0);
    for (i = 0; i < 109; i++) h.u32(i < nFat ? fatStart + i : FREE);

    function dirEntry(name, type, child, start, size) {
      var d = new Buf();
      var nm = name ? name : '';
      d.utf16(nm); while (d.a.length < 64) d.u8(0);
      d.u16(nm ? (nm.length + 1) * 2 : 0).u8(type).u8(type ? 1 : 0);
      d.u32(FREE).u32(FREE).u32(child);
      for (var k = 0; k < 16; k++) d.u8(0);
      d.u32(0); for (k = 0; k < 16; k++) d.u8(0);
      d.u32(start).u32(size).u32(0);
      return d.a;
    }
    var dir = [].concat(
      dirEntry('Root Entry', 5, 1, ENDCHAIN, 0),
      dirEntry('Workbook', 2, FREE, 0, stream.length < 4096 ? 4096 : stream.length),
      dirEntry('', 0, FREE, 0, 0),
      dirEntry('', 0, FREE, 0, 0)
    );

    var fat = new Buf();
    for (i = 0; i < nData; i++) fat.u32(i === nData - 1 ? ENDCHAIN : i + 1);
    fat.u32(ENDCHAIN);                                       // directory sector
    for (i = 0; i < nFat; i++) fat.u32(FATSECT);
    while (fat.a.length < nFat * SEC) fat.u32(FREE);

    var total = h.a.length + data.length + dir.length + fat.a.length;
    var out = new Uint8Array(total), o = 0;
    [h.a, data, dir, fat.a].forEach(function (part) { out.set(part, o); o += part.length; });
    return out;
  }

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function pad2(n) { return String(n).length < 2 ? '0' + n : String(n); }

  function formatDateDDMMYYYYBE(dateInput) {
    if (typeof dateInput === 'string') {
      var s = dateInput.trim();
      // ถ้าอยู่ในรูป dd-MM-yyyy อยู่แล้ว
      var mDash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
      if (mDash) {
        var y1 = Number(mDash[3]);
        if (y1 < 2400) y1 += 543;
        return pad2(Number(mDash[1])) + '-' + pad2(Number(mDash[2])) + '-' + y1;
      }
      // ถ้าอยู่ในรูป d/M/yyyy หรือ dd/MM/yyyy
      var mSlash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (mSlash) {
        var y2 = Number(mSlash[3]);
        if (y2 < 2400) y2 += 543;
        return pad2(Number(mSlash[1])) + '-' + pad2(Number(mSlash[2])) + '-' + y2;
      }
    }
    var d = (dateInput instanceof Date && !isNaN(dateInput)) ? dateInput : new Date();
    return pad2(d.getDate()) + '-' + pad2(d.getMonth() + 1) + '-' + (d.getFullYear() + 543);
  }

  var TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
                   'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];

  function formatThaiDate(dateInput) {
    if (typeof dateInput === 'string') {
      var s = dateInput.trim();
      var mSlash = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (mSlash) {
        var y = Number(mSlash[3]);
        if (y < 2400) y += 543;
        var mIdx = Number(mSlash[2]) - 1;
        if (mIdx >= 0 && mIdx < 12) return Number(mSlash[1]) + ' ' + TH_MONTHS[mIdx] + ' ' + y;
      }
      var mDash = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
      if (mDash) {
        var y2 = Number(mDash[3]);
        if (y2 < 2400) y2 += 543;
        var mIdx2 = Number(mDash[2]) - 1;
        if (mIdx2 >= 0 && mIdx2 < 12) return Number(mDash[1]) + ' ' + TH_MONTHS[mIdx2] + ' ' + y2;
      }
    }
    var d = (dateInput instanceof Date && !isNaN(dateInput)) ? dateInput : new Date();
    return d.getDate() + ' ' + TH_MONTHS[d.getMonth()] + ' ' + (d.getFullYear() + 543);
  }

  var XlsWriter = {
    /** คืนค่า Uint8Array ของไฟล์ .xls */
    build: function (opts) { return buildCfb(buildWorkbookStream(opts)); },

    formatDateDDMMYYYYBE: formatDateDDMMYYYYBE,
    formatThaiDate: formatThaiDate,

    /** ดาวน์โหลดไฟล์ในเบราว์เซอร์ */
    download: function (bytes, filename) {
      var blob = new Blob([bytes], { type: 'application/vnd.ms-excel' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = filename;
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    },

    /** base64 (สำหรับส่งผ่าน API / Apps Script) */
    toBase64: function (bytes) {
      var s = '';
      for (var i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return (typeof btoa === 'function') ? btoa(s) : Utilities.base64Encode(Array.prototype.map.call(bytes, function (b) { return b > 127 ? b - 256 : b; }));
    },

    /**
     * สร้างชื่อไฟล์มาตรฐาน: {รหัสหน่วยเบิก}_ใบเบิกสินค้า ประเภท วัสดุทันตกรรม {dd-MM-yyyy(พ.ศ.)}.xls
     * เช่น 07595_ใบเบิกสินค้า ประเภท วัสดุทันตกรรม 12-11-2569.xls
     */
    formatFileName: function (unitCode, dateStrOrDate) {
      var code = String(unitCode || '').trim();
      if (/^\d+$/.test(code) && code.length < 5) {
        while (code.length < 5) code = '0' + code;
      }
      var dStr = formatDateDDMMYYYYBE(dateStrOrDate);
      return (code ? code + '_' : '') + 'ใบเบิกสินค้า ประเภท วัสดุทันตกรรม ' + dStr + '.xls';
    },

    /**
     * ใบเบิกสินค้าแบบ qryClientOrderExport (9 คอลัมน์ + Name Box ครอบตารางพอดี)
     * รองรับทั้งคีย์แบบ ProductID/ToOrder (จากชีต รับข้อมูล) และ productId/toOrder
     */
    buildClientOrder: function (items) {
      var NAME = 'qryClientOrderExport';
      var rows = [['ProductID', 'ProductName', 'MediUnitID', 'PackID', 'UseRate', 'MinStock', 'MaxStock', 'OnStock', 'ToOrder']];
      (items || []).forEach(function (it) {
        var pid = it.ProductID != null ? it.ProductID : (it.productId || '');
        var pname = it.ProductName != null ? it.ProductName : (it.productName || '');
        var muid = it.MediUnitID != null ? it.MediUnitID : (it.mediUnitId == null ? '' : it.mediUnitId);
        var rawPack = it.PackID != null ? it.PackID : (it.packId == null ? '' : it.packId);
        rawPack = String(rawPack).trim();
        var formattedPack = (rawPack && /^\d+$/.test(rawPack) && rawPack.length < 3) ? ('000' + rawPack).slice(-3) : rawPack;
        var toOrder = it.ToOrder != null ? it.ToOrder : it.toOrder;

        rows.push([
          String(pid),
          String(pname),
          String(muid),
          String(formattedPack),
          Number(it.UseRate != null ? it.UseRate : it.useRate) || 0,
          Number(it.MinStock != null ? it.MinStock : it.minStock) || 0,
          Number(it.MaxStock != null ? it.MaxStock : it.maxStock) || 0,
          Number(it.OnStock != null ? it.OnStock : it.onStock) || 0,
          Number(toOrder) || 0
        ]);
      });
      return this.build({
        sheets: [{ name: NAME, rows: rows, colWidths: [11, 40, 11, 8, 9, 9, 9, 9, 9] }],
        names: [{ name: NAME, sheet: 0, r1: 0, c1: 0, r2: rows.length - 1, c2: 8 }]
      });
    },

    /**
     * ดาวน์โหลดไฟล์ .xls สำหรับโปรแกรม CPN ทันที
     */
    downloadClientOrder: function (items, unitCode, dateStrOrDate) {
      var bytes = this.buildClientOrder(items);
      var fname = this.formatFileName(unitCode, dateStrOrDate);
      this.download(bytes, fname);
      return fname;
    },

    /**
     * สร้าง HTML หน้ากระดาษ A4 "ใบเบิกวัสดุทันตกรรม" (แบบ B: เลขอารบิก พร้อมพิมพ์ / Save as PDF)
     */
    buildRequisitionHtml: function (docData) {
      var d = docData || {};
      var unitName = d.unitName || '';
      var thaiDateText = d.thaiDateText || '';
      var items = Array.isArray(d.items) ? d.items : [];
      var s = d.staff || {};

      var totalRows = Math.max(5, items.length);
      var rowsHtml = '';
      for (var i = 0; i < totalRows; i++) {
        var it = items[i];
        var unitLabel = it ? (it.MediUnitName || it.PackName || '') : '';
        var qtyLabel = it && (Number(it.ToOrder) > 0) ? String(Number(it.ToOrder)) : '';
        rowsHtml += '<tr>' +
          '<td class="c">' + (it ? (i + 1) : '&nbsp;') + '</td>' +
          '<td class="l">' + (it ? escHtml(it.ProductName || '') : '&nbsp;') + '</td>' +
          '<td class="c">' + (it ? escHtml(unitLabel) : '&nbsp;') + '</td>' +
          '<td class="r">&nbsp;</td>' +
          '<td class="c">' + escHtml(qtyLabel) + '</td>' +
          '<td class="c">&nbsp;</td>' +
          '<td class="r">&nbsp;</td>' +
          '</tr>';
      }

      var recvName = s.recvName ? '( ' + escHtml(s.recvName) + ' )' : '(........................................................)';
      var recvPos = 'ตำแหน่ง ' + (s.recvPos ? escHtml(s.recvPos) : '........................................................');
      var dirName = s.dirName ? '( ' + escHtml(s.dirName) + ' )' : '(........................................................)';
      var dirPos = escHtml(s.dirPos || 'ผู้อำนวยการโรงพยาบาลส่งเสริมสุขภาพตำบล');
      var distName = s.distName ? '( ' + escHtml(s.distName) + ' )' : '(........................................................)';
      var distPos = escHtml(s.distPos || 'สาธารณสุขอำเภอวังทอง');
      var ctrlName = s.ctrlName ? '( ' + escHtml(s.ctrlName) + ' )' : '( ทพญ.ฐานิดา ปุญญฤทธิ์ )';
      var ctrlPos = escHtml(s.ctrlPos || 'ปฏิบัติหน้าที่แทนเจ้าหน้าที่ผู้ควบคุมคลังพัสดุ');
      var headName = s.headName ? '( ' + escHtml(s.headName) + ' )' : '( ทพญ.นิศา ทองนพคุณ )';
      var headPos = escHtml(s.headPos || 'ปฏิบัติหน้าที่หัวหน้าเจ้าหน้าที่ผู้ควบคุมคลังพัสดุ');

      var title = 'ใบเบิกวัสดุทันตกรรม_' + (d.unitCode || '') + '_' + (d.xlsDateStr || '');

      return '<!DOCTYPE html>\n<html lang="th">\n<head>\n<meta charset="UTF-8">\n' +
        '<title>' + escHtml(title) + '</title>\n' +
        '<link href="https://fonts.googleapis.com/css2?family=Sarabun:wght@400;600;700&display=swap" rel="stylesheet">\n' +
        '<style>\n' +
        '  * { box-sizing: border-box; }\n' +
        '  body { margin: 0; background: #f3f4f6; font-family: "Sarabun", "TH SarabunPSK", Tahoma, sans-serif; color: #111; font-size: 14px; }\n' +
        '  .toolbar { position: sticky; top: 0; z-index: 50; background: #1e293b; color: #fff; padding: 10px 18px; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; box-shadow: 0 2px 8px rgba(0,0,0,0.18); }\n' +
        '  .toolbar-title { font-size: 14px; font-weight: 600; }\n' +
        '  .toolbar-btns { display: flex; gap: 8px; flex-wrap: wrap; }\n' +
        '  .btn { border: 0; border-radius: 6px; padding: 7px 14px; font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }\n' +
        '  .btn-print { background: #2563eb; color: #fff; }\n' +
        '  .btn-print:hover { background: #1d4ed8; }\n' +
        '  .btn-close { background: #475569; color: #fff; }\n' +
        '  .btn-close:hover { background: #334155; }\n' +
        '  .page { width: 210mm; min-height: 297mm; margin: 18px auto; background: #fff; padding: 14mm 15mm; box-shadow: 0 4px 20px rgba(0,0,0,0.12); }\n' +
        '  .hdr { text-align: center; line-height: 1.55; margin-bottom: 14px; }\n' +
        '  .hdr .t1 { font-size: 18px; font-weight: 700; }\n' +
        '  .hdr .t2 { font-size: 14px; font-weight: 700; }\n' +
        '  table.req { width: 100%; border-collapse: collapse; margin-bottom: 22px; font-size: 13.5px; }\n' +
        '  table.req th, table.req td { border: 1px solid #000; padding: 5px 7px; height: 27px; vertical-align: middle; }\n' +
        '  table.req th { font-weight: 700; text-align: center; background: #fafafa; }\n' +
        '  td.c { text-align: center; }\n' +
        '  td.l { text-align: left; }\n' +
        '  td.r { text-align: right; }\n' +
        '  .sign-grid { display: grid; grid-template-columns: 1fr 1fr; column-gap: 18px; margin-top: 14px; font-size: 13px; line-height: 1.65; }\n' +
        '  .sign-col { text-align: center; }\n' +
        '  .sign-block { margin-bottom: 26px; }\n' +
        '  .sign-head { font-weight: 700; margin-bottom: 18px; }\n' +
        '  .sign-head-spacer { height: 21px; margin-bottom: 18px; }\n' +
        '  @page { size: A4 portrait; margin: 12mm 14mm; }\n' +
        '  @media print {\n' +
        '    body { background: #fff; }\n' +
        '    .toolbar { display: none !important; }\n' +
        '    .page { width: 100%; min-height: auto; margin: 0; padding: 0; box-shadow: none; }\n' +
        '  }\n' +
        '</style>\n</head>\n<body>\n' +
        '  <div class="toolbar">\n' +
        '    <div class="toolbar-title">📄 ใบเบิกวัสดุทันตกรรม — ' + escHtml(unitName) + '</div>\n' +
        '    <div class="toolbar-btns">\n' +
        '      <button type="button" class="btn btn-print" onclick="window.print()">🖨️ พิมพ์ / บันทึกเป็น PDF</button>\n' +
        '      <button type="button" class="btn btn-close" onclick="window.close()">✕ ปิดหน้าต่าง</button>\n' +
        '    </div>\n' +
        '  </div>\n' +
        '  <div class="page">\n' +
        '    <div class="hdr">\n' +
        '      <div class="t1">ใบเบิกวัสดุทันตกรรม</div>\n' +
        '      <div class="t2">วันที่เบิก ' + escHtml(thaiDateText) + '</div>\n' +
        '      <div class="t2">โรงพยาบาลวังทอง</div>\n' +
        '      <div class="t2">' + escHtml(unitName) + '</div>\n' +
        '      <div class="t2">เบิกจาก งานพัสดุ ฝ่ายทันตกรรม</div>\n' +
        '    </div>\n' +
        '    <table class="req">\n' +
        '      <thead>\n' +
        '        <tr>\n' +
        '          <th style="width:7%">ลำดับ</th>\n' +
        '          <th style="width:41%">รายการ</th>\n' +
        '          <th style="width:10%">หน่วย</th>\n' +
        '          <th style="width:12%">ราคาต่อหน่วย</th>\n' +
        '          <th style="width:10%">จำนวนเบิก</th>\n' +
        '          <th style="width:10%">จำนวนจ่าย</th>\n' +
        '          <th style="width:10%">จำนวนเงิน</th>\n' +
        '        </tr>\n' +
        '      </thead>\n' +
        '      <tbody>' + rowsHtml + '</tbody>\n' +
        '    </table>\n' +
        '    <div class="sign-grid">\n' +
        '      <div class="sign-col">\n' +
        '        <div class="sign-block">\n' +
        '          <div class="sign-head">ได้รับของตามรายการที่จ่ายครบถ้วนแล้ว</div>\n' +
        '          <div>ลงชื่อ........................................................</div>\n' +
        '          <div>' + recvName + '</div>\n' +
        '          <div>' + recvPos + '</div>\n' +
        '        </div>\n' +
        '        <div class="sign-block">\n' +
        '          <div>ลงชื่อ........................................................</div>\n' +
        '          <div>' + dirName + '</div>\n' +
        '          <div>' + dirPos + '</div>\n' +
        '        </div>\n' +
        '        <div class="sign-block">\n' +
        '          <div>ลงชื่อ........................................................</div>\n' +
        '          <div>' + distName + '</div>\n' +
        '          <div>' + distPos + '</div>\n' +
        '        </div>\n' +
        '      </div>\n' +
        '      <div class="sign-col">\n' +
        '        <div class="sign-block">\n' +
        '          <div class="sign-head">ตรวจสอบแล้วสมควรเบิกได้</div>\n' +
        '          <div>ลงชื่อ..............................................................</div>\n' +
        '          <div>' + ctrlName + '</div>\n' +
        '          <div>' + ctrlPos + '</div>\n' +
        '        </div>\n' +
        '        <div class="sign-block">\n' +
        '          <div>ลงชื่อ..............................................................</div>\n' +
        '          <div>' + headName + '</div>\n' +
        '          <div>' + headPos + '</div>\n' +
        '        </div>\n' +
        '      </div>\n' +
        '    </div>\n' +
        '  </div>\n' +
        '</body>\n</html>';
    },

    /**
     * เปิดหน้าต่างพิมพ์ใบเบิกวัสดุทันตกรรม (A4)
     */
    openRequisitionPrintWindow: function (docData, targetWin) {
      var html = this.buildRequisitionHtml(docData);
      var w = targetWin || window.open('', '_blank');
      if (!w) {
        alert('เบราว์เซอร์บล็อกหน้าต่างป๊อปอัป กรุณาอนุญาตป๊อปอัปสำหรับเว็บนี้');
        return null;
      }
      w.document.open();
      w.document.write(html);
      w.document.close();
      return w;
    }
  };

  root.XlsWriter = XlsWriter;
})(typeof window !== 'undefined' ? window : this);
