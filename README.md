# สถิติอุบัติเหตุนิคมฯ — IEAT EMCC

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
| `assets/app.js` | โหลดข้อมูล ตัวกรอง กราฟ (d3) แผนที่ (Leaflet + Esri) และตาราง |
| `data/emergency_case.json` | ข้อมูลสำรอง 279 เหตุ ปีงบประมาณ 2561–2569 |

## ปรับแต่ง

- **สีประเภทเหตุ** แก้ตัวแปร `--t-fire`, `--t-chem` และตัวอื่นๆ ใน `assets/style.css`
- **ลำดับและชื่อประเภทเหตุ** แก้ `TYPES` ใน `assets/app.js`
