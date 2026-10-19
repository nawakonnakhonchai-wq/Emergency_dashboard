# สถิติอุบัติเหตุนิคมฯ — EMCC

ศูนย์เฝ้าระวังคุณภาพสิ่งแวดล้อม และความปลอดภัย (Environmental Monitoring and Control Center : EMCC)

แดชบอร์ดสถิติการเกิดอุบัติเหตุในพื้นที่นิคมอุตสาหกรรมและท่าเรือ เป็นเว็บ static ใช้กับ GitHub Pages ได้ทันที ไม่ต้อง build

## ข้อมูล

- เมื่อเปิดหน้าเว็บ เบราว์เซอร์จะดึง**ข้อมูลสด**จากเลเยอร์ `Emergency_Case` บน ArcGIS Online โดยตรง
  `https://services5.arcgis.com/XbJa06Lil6auloCa/arcgis/rest/services/Emergency_Case/FeatureServer/0`
- ถ้าเชื่อมต่อ ArcGIS ไม่ได้ จะใช้ไฟล์สำรอง `data/emergency_case.json` แทน แถบด้านบนจะแจ้งว่ากำลังใช้ข้อมูลชุดไหน
- จะอัปเดตไฟล์สำรองเมื่อไหร่ก็ได้ วางไฟล์ JSON ที่เป็นอาร์เรย์ของแถว หรือไฟล์ GeoJSON ที่ export จาก ArcGIS ทับไฟล์เดิมได้เลย

> ข้อมูลนี้มีชื่อบริษัทและรายละเอียดผู้บาดเจ็บ/เสียชีวิต หาก repo เป็น public ทุกคนจะเปิดดูได้

## ขึ้น GitHub Pages

1. สร้าง repository ใหม่บน GitHub เช่น `ieat-dashboard`
2. อัปโหลดไฟล์ทั้งหมดในโฟลเดอร์นี้ ได้แก่ `index.html`, `assets/`, `data/`, `.nojekyll` (ลากไฟล์ใส่หน้า repo ผ่าน **Add file → Upload files** ได้)
3. ไปที่ **Settings → Pages** ตรง Source เลือก **Deploy from a branch** เลือก branch `main` และโฟลเดอร์ `/ (root)` แล้วกด Save
4. รอประมาณ 1–2 นาที เว็บจะอยู่ที่ `https://<ชื่อผู้ใช้>.github.io/ieat-dashboard/`

## ทดสอบบนเครื่อง

```bash
python3 -m http.server 8000
# เปิด http://localhost:8000
```

## โครงสร้างไฟล์

| ไฟล์ | หน้าที่ |
| --- | --- |
| `index.html` | โครงหน้าเว็บ |
| `assets/style.css` | ธีมสว่างและเลย์เอาต์ |
| `assets/auth.js` | หน้าล็อกอิน (กั้นหน้า) และรายชื่อบัญชีผู้ใช้ |
| `assets/app.js` | โหลดข้อมูล ตัวกรอง กราฟ (d3) แผนที่ (Leaflet + Esri) และตาราง |
| `data/emergency_case.json` | ข้อมูลสำรอง 279 เหตุ ปีงบประมาณ 2561–2569 |

## ปรับแต่ง

- **สีประเภทเหตุ** แก้ตัวแปร `--t-fire`, `--t-chem` และตัวอื่นๆ ใน `assets/style.css`
- **ลำดับและชื่อประเภทเหตุ** แก้ `TYPES` ใน `assets/app.js`

## หน้าล็อกอิน

ก่อนเข้าแดชบอร์ดต้องกรอกชื่อผู้ใช้และรหัสผ่าน ข้อมูลจะถูกโหลดหลังล็อกอินสำเร็จเท่านั้น

- ถ้าไม่ติ๊ก "จดจำการเข้าสู่ระบบ" จะต้องล็อกอินใหม่เมื่อปิดแท็บ ถ้าติ๊กจะจำไว้ 7 วัน
- กด **ออกจากระบบ** ที่มุมขวาบนเพื่อออก

> **ข้อจำกัด:** นี่เป็นการกั้นหน้าเว็บฝั่งเบราว์เซอร์เท่านั้น ไม่ได้ปกป้องข้อมูลจริง ผู้ที่รู้ URL ยังเปิด `data/emergency_case.json` และเลเยอร์ ArcGIS ได้โดยตรง

### เพิ่มหรือเปลี่ยนรหัสผ่าน

ระบบเก็บเฉพาะค่า hash (SHA-256) ของ `ชื่อผู้ใช้:รหัสผ่าน:emcc-dashboard` ไว้ใน `USERS` ของ `assets/auth.js` ไม่เก็บรหัสผ่านจริง

1. เปิดหน้าเว็บใดก็ได้ กด F12 ไปที่แท็บ Console แล้ววางคำสั่งนี้ (แก้ชื่อผู้ใช้และรหัสผ่าน ชื่อผู้ใช้ใช้ตัวพิมพ์เล็ก)

   ```js
   (async (u, p) => console.log(u + ": '" + [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${u}:${p}:emcc-dashboard`)))].map(b => b.toString(16).padStart(2, '0')).join('') + "',"))('ชื่อผู้ใช้', 'รหัสผ่าน')
   ```

2. คัดลอกบรรทัดที่ได้ไปวางใน `USERS` ของ `assets/auth.js` (ลบบัญชีที่ไม่ใช้แล้วออกได้)
3. เพิ่มเลข `?v=` ของ `auth.js` ใน `index.html` แล้ว commit
