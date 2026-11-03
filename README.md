# LINE Expense Tracker (Google Apps Script + Gemini AI)

บอทบันทึกรายรับ-รายจ่ายผ่าน LINE Official Account อัตโนมัติ โดยใช้ Gemini 3.8 Flash ในการแปลงข้อความภาษาธรรมชาติ บันทึกข้อมูลลง Google Sheets และสรุปยอดประจำเดือนแยกตามหมวดหมู่

## ฟีเจอร์การทำงาน
- **Natural Language Parsing**: พิมพ์ข้อความบันทึกรายการได้ตามธรรมชาติ เช่น `กินข้าว 50`, `ค่ารถ 40`
- **AI Categorization**: แยกประเภท (รายรับ/รายจ่าย) และหมวดหมู่อัตโนมัติด้วย Gemini 3.8 Flash
- **Cloud Storage**: บันทึกข้อมูลแบบเรียลไทม์ลง Google Sheets แท็บ `Transactions`
- **Monthly Summary**: พิมพ์ `สรุป` เพื่อดูรายงานยอดรวมและแจกแจงแยกหมวดหมู่ประจำเดือน

## สถาปัตยกรรมระบบ (Architecture)
LINE Messaging API -> Google Apps Script (Web App) -> Gemini API -> Google Sheets

## การติดตั้งและการตั้งค่า (Setup)
1. โคลนหรือคัดลอกโค้ด `Code.js` ไปวางใน Google Apps Script ที่ผูกกับ Google Sheets
2. สร้างชีตแท็บ `Transactions` พร้อมหัวตาราง: `วันที่`, `ประเภท`, `หมวดหมู่`, `รายการ`, `จำนวนเงิน`, `เดือน-ปี`
3. ตั้งค่า **Script Properties** ใน Apps Script:
   - `LINE_ACCESS_TOKEN`: Channel Access Token จาก LINE Developers
   - `GEMINI_API_KEY`: API Key จาก Google AI Studio
4. Deploy แบบ Web App (ตั้งค่าสิทธิ์ Anyone/ทุกคน) และนำ URL ไปใส่ใน LINE Webhook URL
