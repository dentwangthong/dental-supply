// =====================================================
// gas-api.js — วางคู่กับ index.html ใน GitHub repo
// จำลอง google.script.run ให้โค้ดเดิมทำงานต่อได้โดยไม่ต้องแก้ทีละจุด
// =====================================================

// ▼▼ แก้เป็น URL ของ Web app ที่ได้จากการ Deploy (ลงท้ายด้วย /exec) ▼▼
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbwKLVsM_VOdX3HkNiG0dPLr2Eqk_XH6Z6KVAQe4bBcyOlPsF_8sRejTt9bI1tnShxHF/exec';

// ฟังก์ชันที่ต้องแนบ PIN Admin (ต้องตรงกับ API_ADMIN_FUNCS ใน Api.gs)
const GAS_ADMIN_FUNCS = new Set([
  'getAdminData',
  'updateRequisitionStatus',
  'deleteRequisitionFile',
  'deleteRequisition',
  'updateRepairStatus',
  'deleteRepair'
]);

let GAS_ADMIN_PIN = ''; // เก็บในหน่วยความจำเท่านั้น รีเฟรชหน้าแล้วหาย

async function gasCall(fn, args) {
  const payload = { fn: fn, args: args || [] };
  if (GAS_ADMIN_FUNCS.has(fn)) payload.pin = GAS_ADMIN_PIN;

  const res = await fetch(GAS_API_URL, {
    method: 'POST',
    // ใช้ text/plain เพื่อเลี่ยง CORS preflight (GAS ไม่รองรับ OPTIONS)
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ (' + res.status + ')');

  let json;
  try { json = await res.json(); }
  catch (e) { throw new Error('เซิร์ฟเวอร์ตอบกลับผิดรูปแบบ (ตรวจว่า Deploy เป็น "Anyone" และใช้ URL /exec)'); }

  if (!json.ok) throw new Error(json.error || 'เกิดข้อผิดพลาด');
  return json.data;
}

// เข้า/ออกระบบ Admin (ตรวจ PIN ที่เซิร์ฟเวอร์)
async function adminLoginApi(pin) {
  const ok = await gasCall('adminLogin', [pin]);
  GAS_ADMIN_PIN = ok ? pin : '';
  return ok;
}
function adminLogoutApi() { GAS_ADMIN_PIN = ''; }

// ตัวจัดการ error เริ่มต้น (กรณีโค้ดเดิมไม่ได้ใส่ withFailureHandler)
function gasDefaultFail(err) {
  const msg = (err && err.message) ? err.message : String(err);
  if (typeof hideLoader === 'function') hideLoader();
  if (window.Swal) Swal.fire('ข้อผิดพลาด', msg, 'error');
  else alert(msg);
}

// จำลอง google.script.run.withSuccessHandler(...).withFailureHandler(...).ชื่อฟังก์ชัน(...args)
window.google = window.google || {};
window.google.script = {
  get run() {
    let onOk = function () {};
    let onFail = gasDefaultFail;
    const proxy = new Proxy({}, {
      get(_, name) {
        if (name === 'then') return undefined;
        if (name === 'withSuccessHandler') return function (f) { onOk = f; return proxy; };
        if (name === 'withFailureHandler') return function (f) { onFail = f; return proxy; };
        return function () {
          const args = Array.prototype.slice.call(arguments);
          gasCall(String(name), args).then(
            function (r) { onOk(r); },
            function (e) { onFail(e); }
          );
        };
      }
    });
    return proxy;
  }
};
