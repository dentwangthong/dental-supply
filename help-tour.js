// =====================================================
// help-tour.js — ปุ่ม "?" สอนใช้งานทีละขั้นตอน ของแต่ละหน้า
// วางคู่กับ index.html ใน GitHub repo แล้วเพิ่มบรรทัดนี้ใน index.html
//   <script src="help-tour.js"></script>
// (วางต่อจาก <script src="gas-api.js"></script> ได้เลย)
// ไม่ต้องใช้ไลบรารีเพิ่ม
// =====================================================
(function () {
  'use strict';

  var Z = 10050; // สูงกว่าตัวหมุนโหลด (9999) และ SweetAlert

  // ---------- สไตล์ ----------
  var css = '' +
    '#helpFab{position:fixed;right:16px;bottom:16px;width:48px;height:48px;border-radius:50%;border:0;' +
    'background:#b3cde0;color:#fff;font-size:22px;font-weight:600;box-shadow:0 4px 14px rgba(0,0,0,.2);' +
    'cursor:pointer;z-index:9000;font-family:inherit}' +
    '#helpFab:hover{background:#8fb5d1}' +
    '#helpFab.pulse{animation:helpPulse 1.6s ease-out infinite}' +
    '@keyframes helpPulse{0%{box-shadow:0 0 0 0 rgba(179,205,224,.9)}100%{box-shadow:0 0 0 18px rgba(179,205,224,0)}}' +
    '#tourBlock{position:fixed;inset:0;z-index:' + Z + ';background:transparent}' +
    '#tourSpot{position:fixed;z-index:' + (Z + 1) + ';border-radius:10px;pointer-events:none;' +
    'box-shadow:0 0 0 9999px rgba(30,41,59,.62),0 0 0 3px #b3cde0 inset;transition:all .18s ease}' +
    '#tourTip{position:fixed;z-index:' + (Z + 2) + ';width:min(92vw,350px);background:#fff;border-radius:14px;' +
    'box-shadow:0 10px 40px rgba(0,0,0,.28);padding:16px 16px 12px;font-family:inherit;color:#4a4a4a}' +
    '#tourTip .t-top{display:flex;justify-content:space-between;align-items:flex-start;gap:8px}' +
    '#tourTip .t-title{font-weight:600;font-size:16px;color:#374151;line-height:1.35}' +
    '#tourTip .t-x{border:0;background:transparent;font-size:20px;line-height:1;color:#9ca3af;cursor:pointer;padding:0 2px}' +
    '#tourTip .t-x:hover{color:#4b5563}' +
    '#tourTip .t-body{font-size:14px;line-height:1.6;margin:8px 0 12px}' +
    '#tourTip .t-body b{color:#374151}' +
    '#tourTip .t-bar{height:4px;background:#e5e7eb;border-radius:4px;overflow:hidden;margin-bottom:10px}' +
    '#tourTip .t-bar>i{display:block;height:100%;background:#b3cde0;transition:width .2s}' +
    '#tourTip .t-foot{display:flex;align-items:center;justify-content:space-between;gap:8px}' +
    '#tourTip .t-count{font-size:12px;color:#9ca3af}' +
    '#tourTip .t-btns{display:flex;gap:6px}' +
    '#tourTip button.t-b{font-family:inherit;font-size:13px;border-radius:8px;padding:6px 14px;cursor:pointer;border:1px solid #d1d5db;background:#fff;color:#4b5563}' +
    '#tourTip button.t-b:hover{background:#f3f4f6}' +
    '#tourTip button.t-p{background:#60a5fa;border-color:#60a5fa;color:#fff}' +
    '#tourTip button.t-p:hover{background:#3b82f6}' +
    '#tourTip button:disabled{opacity:.4;cursor:default}';
  var st = document.createElement('style');
  st.textContent = css;
  document.head.appendChild(st);

  // ---------- ตัวช่วย ----------
  function getEl(t) {
    if (!t) return null;
    try { return typeof t === 'function' ? t() : document.querySelector(t); } catch (e) { return null; }
  }
  function isVisible(el) {
    if (!el) return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  function S(target, title, text, before) {
    return { target: target, title: title, text: text, before: before };
  }
  function g(id) { return document.getElementById(id); }

  // ---------- เนื้อหาคู่มือของแต่ละหน้า ----------
  function currentTabId() {
    var ids = ['reqTab', 'dlTab', 'repairTab', 'adminTab'];
    for (var i = 0; i < ids.length; i++) {
      var el = g(ids[i]);
      if (el && !el.classList.contains('hidden')) return ids[i];
    }
    return 'reqTab';
  }

  function stepsFor(tabId) {
    var out = [];

    if (tabId === 'reqTab') {
      var editing = (typeof editingRow !== 'undefined') && !!editingRow;

      out.push(S(null, '📦 คู่มือ: ส่งเบิกวัสดุ',
        'หน้านี้ใช้ส่งรายการเบิกวัสดุให้ฝ่ายพัสดุ มี <b>2 วิธี</b> คือ <b>อัปโหลดไฟล์ Excel</b> (เบิกปกติ) และ <b>เบิกฉุกเฉิน</b> (เลือกรายการผ่านเว็บ) ไปดูทีละขั้นตอนกันเลย'));

      out.push(S('#reqUnitCode', 'ขั้นที่ 1: กรอกรหัสหน่วยบริการ',
        'พิมพ์ <b>รหัสหน่วยบริการ 5 หลัก</b> ของหน่วยตัวเอง ถ้ากรอกไม่ครบ 5 หลัก ระบบจะเติมเลข 0 ข้างหน้าให้เอง'));
      out.push(S('#reqUnitName', 'ขั้นที่ 2: ตรวจชื่อหน่วย',
        'ชื่อหน่วยจะขึ้นให้<b>อัตโนมัติ</b> ช่องนี้แก้เองไม่ได้ ถ้าชื่อไม่ขึ้นแสดงว่ารหัสผิด ให้ตรวจรหัสอีกครั้ง'));
      out.push(S(function () { return g('btnModeUpload').parentElement; }, 'ขั้นที่ 3: เลือกวิธีเบิก',
        'กดสลับได้ที่แถบนี้ <b>อัปโหลดไฟล์ Excel</b> สำหรับเบิกปกติ ส่วน <b>เบิกฉุกเฉิน</b> ใช้เมื่อต้องการเลือกวัสดุผ่านหน้าเว็บโดยไม่ต้องมีไฟล์'));

      if (!editing) {
        out.push(S('#reqFile', 'วิธีที่ 1: แนบไฟล์ Excel',
          'กด <b>เลือกไฟล์</b> แล้วเลือกไฟล์ Excel (.xls หรือ .xlsx) ที่ส่งออกจากโปรแกรม CPN ซึ่งปกติเก็บอยู่ในโฟลเดอร์ <b>C:\\Poolsoft\\Order2Hos</b>',
          function () { if (typeof setReqMode === 'function') setReqMode('upload'); }));
        out.push(S('#reqModeUpload button[type=submit]', 'วิธีที่ 1: กดส่งข้อมูล',
          'กด <b>ส่งข้อมูลเบิกวัสดุ</b> แล้วรอจนขึ้นข้อความ <b>"สำเร็จ"</b> ห้ามปิดหน้าก่อนขึ้นข้อความ ระบบจะแจ้งอีเมลไปที่ฝ่ายพัสดุให้อัตโนมัติ'));
      }

      out.push(S(function () { return g('btnModeEmergency'); }, 'วิธีที่ 2: เบิกฉุกเฉิน',
        'กดปุ่มนี้เพื่อเลือกวัสดุผ่านหน้าเว็บ ระบบจะสร้างไฟล์สำหรับนำเข้า CPN และ<b>ใบเบิก (PDF)</b> ให้เอง ไม่ต้องทำไฟล์เอง',
        function () { if (typeof setReqMode === 'function') setReqMode('emergency'); }));
      out.push(S(function () { var e = g('st_recvName'); return e ? e.closest('.border') : null; }, 'วิธีที่ 2: ผู้ลงนามในใบเบิก',
        'ชื่อและตำแหน่งผู้ลงนามจะ<b>ขึ้นอัตโนมัติ</b>ตามหน่วยบริการ แก้ไขได้ถ้าไม่ตรง และเมื่อกดส่งเบิก ระบบจะ<b>บันทึกทับค่าเดิม</b>ของหน่วยนี้ (ผู้ลงนามอื่น ๆ กดที่ลูกศรด้านล่างเพื่อเปิดดู)'));
      out.push(S('#emSearch', 'วิธีที่ 2: ค้นหาวัสดุ',
        'พิมพ์ส่วนหนึ่งของ<b>ชื่อวัสดุ</b>เพื่อกรองรายการด้านล่าง'));
      out.push(S(function () { var b = g('btnFavOnly'); return b ? b.parentElement : null; }, 'วิธีที่ 2: รายการโปรด',
        'กดรูป <b>⭐ ดาว</b> ที่หน้ารายการเพื่อเก็บเป็นรายการโปรดของหน่วย (รายการโปรดจะขึ้นก่อนเสมอ) กด <b>เฉพาะรายการโปรด</b> เพื่อกรอง หรือกด <b>เพิ่มโปรดทั้งหมดลงตะกร้า</b> เพื่อเบิกของที่ใช้ประจำได้ทีเดียว'));
      out.push(S('#emList', 'วิธีที่ 2: เลือกวัสดุ',
        'กดปุ่ม <b>+ เพิ่ม</b> ข้างรายการที่ต้องการ กดซ้ำจะเพิ่มจำนวนทีละ 1'));
      out.push(S('#emCart', 'วิธีที่ 2: ตรวจตะกร้า',
        'รายการที่เลือกจะมาอยู่ที่นี่ ใช้ปุ่ม <b>-</b> และ <b>+</b> ปรับจำนวน ถ้ากด - จนเหลือ 0 รายการจะถูกเอาออก'));
      out.push(S('#btnSubmitEm', 'วิธีที่ 2: ส่งเบิกและรับใบเบิก',
        'กดปุ่มเขียวเพื่อส่งเบิก เมื่อสำเร็จจะมีหน้าต่างให้กด <b>ดาวน์โหลดใบเบิก (PDF)</b> เก็บไว้พิมพ์หรือแนบเอกสาร ถ้าส่งผิดไปแก้ไขได้ที่หน้า <b>รับวัสดุ (ค้นหา)</b>'));
      out.push(S(null, '🎉 เรียบร้อย',
        'กดปุ่ม <b>?</b> มุมขวาล่างเมื่อไรก็ได้เพื่อดูคู่มือของหน้านั้นอีกครั้ง'));
      return out;
    }

    if (tabId === 'dlTab') {
      out.push(S(null, '📥 คู่มือ: รับวัสดุ (ค้นหา)',
        'หน้านี้ใช้ดูสถานะรายการที่เบิกไป ดาวน์โหลดเอกสาร และแก้ไขรายการล่าสุด'));
      out.push(S('#dlUnitCode', 'ขั้นที่ 1: กรอกรหัสหน่วยบริการ',
        'พิมพ์รหัสหน่วยบริการ 5 หลัก ชื่อหน่วยจะขึ้นในช่องข้าง ๆ'));
      out.push(S('#dlTab button[onclick="searchMaterialFiles()"]', 'ขั้นที่ 2: กดค้นหา',
        'กดปุ่ม <b>ค้นหา</b> เพื่อดึงประวัติการเบิกของหน่วย เรียงจากรายการใหม่ไปเก่า'));
      out.push(S('#downloadResultsContainer', 'ขั้นที่ 3: อ่านผลลัพธ์',
        '<b>สถานะ</b> สีเหลืองคือรอจัดของ สีเขียวคือจัดของแล้ว/สำเร็จ<br>' +
        '<b>ใบเบิกของ</b> และ <b>ใบอนุมัติ</b> กดปุ่มสีน้ำเงินเพื่อดาวน์โหลด<br>' +
        '<b>ดาวน์โหลดไฟล์ Excel</b> คือไฟล์ที่ฝ่ายพัสดุตอบกลับมา'));
      out.push(S('#downloadResultsContainer', 'ขั้นที่ 4: แก้ไขรายการ',
        'ปุ่มสีเหลือง <b>แก้ไขรายการ</b> จะขึ้นเฉพาะ<b>รายการล่าสุด</b>ที่ส่งผ่านเบิกฉุกเฉิน สถานะยัง <b>"รอจัดของ"</b> และฝ่ายพัสดุ<b>ยังไม่แนบใบอนุมัติ</b> กดแล้วระบบจะพาไปหน้าส่งเบิกพร้อมรายการเดิม แก้เสร็จกดบันทึกเพื่อเขียนทับของเดิม'));
      out.push(S(null, '🎉 เรียบร้อย',
        'กดปุ่ม <b>?</b> มุมขวาล่างเมื่อไรก็ได้เพื่อดูคู่มืออีกครั้ง'));
      return out;
    }

    if (tabId === 'repairTab') {
      out.push(S(null, '🛠️ คู่มือ: แจ้งซ่อม',
        'หน้านี้ใช้แจ้งเครื่องมือหรืออุปกรณ์ที่ชำรุด ให้ผู้รับผิดชอบทราบ'));
      out.push(S('#repUnitCode', 'ขั้นที่ 1: กรอกรหัสหน่วยบริการ',
        'พิมพ์รหัสหน่วยบริการ 5 หลัก ชื่อหน่วยจะขึ้นอัตโนมัติ ถ้าไม่ขึ้นให้ตรวจรหัสอีกครั้ง'));
      out.push(S('#repIssue', 'ขั้นที่ 2: บอกอาการ',
        'อธิบาย<b>อาการ/ปัญหา</b>ให้ชัดเจน เช่น ชื่อเครื่อง อาการที่เกิด และเริ่มเป็นเมื่อไร ช่างจะได้เตรียมอุปกรณ์ถูก'));
      out.push(S('#repairForm button[type=submit]', 'ขั้นที่ 3: ส่งข้อมูล',
        'กด <b>ส่งข้อมูลแจ้งซ่อม</b> แล้วรอข้อความ "สำเร็จ" ระบบจะแจ้งอีเมลไปที่ผู้ดูแลให้อัตโนมัติ'));
      out.push(S(null, '🎉 เรียบร้อย',
        'กดปุ่ม <b>?</b> มุมขวาล่างเมื่อไรก็ได้เพื่อดูคู่มืออีกครั้ง'));
      return out;
    }

    // adminTab
    var loggedIn = g('adminDashboard') && !g('adminDashboard').classList.contains('hidden');
    if (!loggedIn) {
      out.push(S(null, '🔒 คู่มือ: Admin',
        'หน้านี้สำหรับเจ้าหน้าที่ที่ดูแลการจ่ายของและงานซ่อมเท่านั้น'));
      out.push(S('#adminPin', 'ขั้นที่ 1: กรอกรหัสผ่าน',
        'พิมพ์<b>รหัสผ่าน Admin</b> (ระบบตรวจรหัสที่เซิร์ฟเวอร์ ถ้าพิมพ์ผิดจะรอสักครู่ก่อนแจ้งผล)'));
      out.push(S('#adminLogin button', 'ขั้นที่ 2: เข้าสู่ระบบ',
        'กด <b>เข้าสู่ระบบ</b> เมื่อเข้าได้แล้ว กดปุ่ม ? อีกครั้งเพื่อดูวิธีใช้เมนูต่าง ๆ'));
      return out;
    }

    out.push(S(null, '🗂️ คู่มือ: Admin Dashboard',
      'หน้านี้ใช้จัดการรายการเบิกวัสดุและงานแจ้งซ่อมทั้งหมด'));
    out.push(S(function () { var b = document.querySelector('#adminDashboard button[onclick*="loadAdminData(\'req\')"]'); return b ? b.parentElement : null; },
      'ขั้นที่ 1: เลือกเมนู',
      '<b>เมนูจ่ายของ (เบิก)</b> ดูรายการเบิกของทุกหน่วย<br><b>เมนูแจ้งซ่อม</b> ดูรายการแจ้งซ่อม กดปุ่มเพื่อโหลดข้อมูลมาแสดงในตาราง'));
    out.push(S('#adminTableContainer', 'ขั้นที่ 2: จัดการรายการเบิก',
      'เปลี่ยน<b>สถานะ</b> พิมพ์<b>หมายเหตุ</b> แนบ<b>ไฟล์ตอบกลับ</b>และ<b>ใบอนุมัติเบิกของ</b> แล้วกด <b>บันทึก & เมล</b> ระบบจะส่งอีเมลแจ้งหน่วยบริการให้ทันที<br>' +
      '<b>หมายเหตุ:</b> เมื่อแนบใบอนุมัติแล้ว หน่วยบริการจะแก้ไขรายการไม่ได้อีก'));
    out.push(S('#adminTableContainer', 'ขั้นที่ 3: ลบไฟล์และลบรายการ',
      'ไอคอน 🗑 ข้างลิงก์ไฟล์ใบเบิก/ใบอนุมัติ ลบเฉพาะ<b>ไฟล์</b>เพื่อคืนพื้นที่ Drive (รายการยังอยู่) ส่วนปุ่มแดงท้ายแถวลบ<b>ทั้งรายการ</b>พร้อมไฟล์ทั้งหมด ลบแล้วกู้คืนไม่ได้'));
    out.push(S('#adminDashboard button[onclick="logoutAdmin()"]', 'ขั้นที่ 4: ออกจากระบบ',
      'เมื่อใช้งานเสร็จกด <b>ออกจากระบบ</b> โดยเฉพาะถ้าใช้เครื่องที่คนอื่นใช้ร่วมกัน'));
    return out;
  }

  // ---------- ตัวเล่นทัวร์ ----------
  var T = { on: false, steps: [], i: 0, block: null, spot: null, tip: null, restoreMode: null, timer: null };

  function build() {
    T.block = document.createElement('div'); T.block.id = 'tourBlock';
    T.spot = document.createElement('div'); T.spot.id = 'tourSpot';
    T.tip = document.createElement('div'); T.tip.id = 'tourTip';
    T.tip.setAttribute('role', 'dialog');
    document.body.appendChild(T.block);
    document.body.appendChild(T.spot);
    document.body.appendChild(T.tip);
  }

  function start() {
    if (T.on) return;
    T.steps = stepsFor(currentTabId());
    if (!T.steps.length) return;
    T.on = true; T.i = 0;
    T.restoreMode = (typeof currentReqMode !== 'undefined') ? currentReqMode : null;
    try { localStorage.setItem('dentalHelpSeen', '1'); } catch (e) {}
    var fab = g('helpFab'); if (fab) fab.classList.remove('pulse');
    build();
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    document.addEventListener('keydown', onKey);
    show(0);
  }

  function stop() {
    if (!T.on) return;
    T.on = false;
    clearTimeout(T.timer);
    window.removeEventListener('resize', reposition);
    window.removeEventListener('scroll', reposition, true);
    document.removeEventListener('keydown', onKey);
    [T.block, T.spot, T.tip].forEach(function (n) { if (n && n.parentNode) n.parentNode.removeChild(n); });
    // คืนโหมดเดิมของฟอร์มเบิก ถ้าทัวร์ได้สลับโหมดไป
    try {
      var editing = (typeof editingRow !== 'undefined') && !!editingRow;
      if (T.restoreMode && typeof currentReqMode !== 'undefined' && currentReqMode !== T.restoreMode && !editing && typeof setReqMode === 'function') {
        setReqMode(T.restoreMode);
      }
    } catch (e) {}
    window.scrollTo({ top: 0 });
  }

  function onKey(e) {
    if (e.key === 'Escape') stop();
    else if (e.key === 'ArrowRight') next();
    else if (e.key === 'ArrowLeft') prev();
  }
  function next() { if (T.i < T.steps.length - 1) show(T.i + 1); else stop(); }
  function prev() { if (T.i > 0) show(T.i - 1); }

  function show(i) {
    T.i = i;
    var s = T.steps[i];
    if (s.before) { try { s.before(); } catch (e) {} }
    renderTip(s);
    clearTimeout(T.timer);
    // รอให้หน้าอัปเดตเสร็จ (เช่น สลับโหมด) แล้วค่อยเลื่อน/วางตำแหน่ง
    T.timer = setTimeout(function () {
      var el = getEl(s.target);
      if (isVisible(el)) {
        try { el.scrollIntoView({ block: 'center', behavior: 'auto' }); } catch (e) {}
      }
      reposition();
    }, 80);
  }

  function renderTip(s) {
    var n = T.steps.length, i = T.i;
    T.tip.innerHTML =
      '<div class="t-top"><div class="t-title">' + s.title + '</div>' +
      '<button type="button" class="t-x" aria-label="ปิดคู่มือ" data-a="close">×</button></div>' +
      '<div class="t-body">' + s.text + '</div>' +
      '<div class="t-bar"><i style="width:' + Math.round(((i + 1) / n) * 100) + '%"></i></div>' +
      '<div class="t-foot"><span class="t-count">' + (i + 1) + ' / ' + n + '</span>' +
      '<div class="t-btns">' +
      '<button type="button" class="t-b" data-a="prev"' + (i === 0 ? ' disabled' : '') + '>ย้อนกลับ</button>' +
      '<button type="button" class="t-b t-p" data-a="next">' + (i === n - 1 ? 'เสร็จสิ้น' : 'ถัดไป') + '</button>' +
      '</div></div>';
    T.tip.onclick = function (ev) {
      var a = ev.target && ev.target.getAttribute && ev.target.getAttribute('data-a');
      if (a === 'next') next(); else if (a === 'prev') prev(); else if (a === 'close') stop();
    };
  }

  function reposition() {
    if (!T.on) return;
    var s = T.steps[T.i];
    var el = getEl(s.target);
    var vw = window.innerWidth, vh = window.innerHeight;
    var tw = T.tip.offsetWidth, th = T.tip.offsetHeight;
    var left, top;

    if (isVisible(el)) {
      var r = el.getBoundingClientRect(), pad = 6;
      T.spot.style.display = 'block';
      T.spot.style.top = (r.top - pad) + 'px';
      T.spot.style.left = (r.left - pad) + 'px';
      T.spot.style.width = (r.width + pad * 2) + 'px';
      T.spot.style.height = (r.height + pad * 2) + 'px';

      if (vh - r.bottom >= th + 20) top = r.bottom + 14;
      else if (r.top >= th + 20) top = r.top - th - 14;
      else top = Math.max(8, vh - th - 10);
      left = r.left + r.width / 2 - tw / 2;
    } else {
      // ไม่มีเป้าหมาย (หน้าต้อนรับ) → แสดงกลางจอ และทำฉากหลังมืด
      T.spot.style.display = 'block';
      T.spot.style.top = (vh / 2) + 'px';
      T.spot.style.left = (vw / 2) + 'px';
      T.spot.style.width = '0px';
      T.spot.style.height = '0px';
      top = (vh - th) / 2;
      left = (vw - tw) / 2;
    }
    left = Math.min(Math.max(8, left), Math.max(8, vw - tw - 8));
    top = Math.min(Math.max(8, top), Math.max(8, vh - th - 8));
    T.tip.style.left = left + 'px';
    T.tip.style.top = top + 'px';
  }

  // ---------- ปุ่ม ? ----------
  function init() {
    if (g('helpFab')) return;
    var b = document.createElement('button');
    b.id = 'helpFab';
    b.type = 'button';
    b.title = 'วิธีใช้งานหน้านี้';
    b.setAttribute('aria-label', 'วิธีใช้งานหน้านี้');
    b.textContent = '?';
    b.onclick = start;
    document.body.appendChild(b);
    // ครั้งแรกที่เข้าเว็บ ให้ปุ่มกะพริบเรียกความสนใจ
    try { if (!localStorage.getItem('dentalHelpSeen')) b.classList.add('pulse'); } catch (e) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.startHelpTour = start; // เรียกจากที่อื่นได้ เช่น <button onclick="startHelpTour()">
})();
