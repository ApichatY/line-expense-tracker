// ==========================================
// 1. ตั้งค่า API KEYS (ใส่ค่าของคุณตรงนี้)
// ==========================================
const SCRIPT_PROPERTIES = PropertiesService.getScriptProperties();
const LINE_ACCESS_TOKEN = SCRIPT_PROPERTIES.getProperty("LINE_ACCESS_TOKEN");
const GEMINI_API_KEY = SCRIPT_PROPERTIES.getProperty("GEMINI_API_KEY");
// ==========================================
// 2. ฟังก์ชันหลักสำหรับรับข้อความจาก LINE Webhook
// ==========================================
function doPost(e) {
  let replyToken = "";
  try {
    const data = JSON.parse(e.postData.contents);
    const event = data.events && data.events[0];

    // ตรวจสอบว่ามีอีเวนต์และเป็นข้อความตัวอักษรหรือไม่
    if (!event || event.type !== 'message' || event.message.type !== 'text') {
      return ContentService.createTextOutput("OK");
    }

    replyToken = event.replyToken;
    const userMessage = event.message.text.trim();

    // กรณีที่ 1: ตรวจพบคำว่า "สรุป" หรือ "summary"
    if (userMessage.includes("สรุป") || userMessage.toLowerCase().includes("summary")) {
      const summaryText = getMonthlySummary();
      replyLine(replyToken, summaryText);
      return ContentService.createTextOutput("OK");
    }

    // กรณีที่ 2: ให้ Gemini แปลงข้อความเป็นข้อมูลรายรับ-รายจ่าย
    const parsedData = parseExpenseWithGemini(userMessage);

    if (!parsedData || parsedData.length === 0) {
      replyLine(replyToken, "ขออภัยครับ ไม่สามารถระบุรายการได้ กรุณาลองพิมพ์ใหม่อีกครั้ง เช่น 'กะเพราไข่ดาว 60' หรือพิมพ์ 'สรุป'");
      return ContentService.createTextOutput("OK");
    }

    // กรณีที่ 3: นำข้อมูลบันทึกลง Google Sheet แท็บ Transactions
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName("Transactions");

    if (!sheet) {
      replyLine(replyToken, "เกิดข้อผิดพลาด: ไม่พบแท็บชื่อ 'Transactions' ใน Google Sheets");
      return ContentService.createTextOutput("OK");
    }

    let replyMsg = "บันทึกข้อมูลเรียบร้อยแล้วครับ:\n";

    parsedData.forEach(item => {
      const monthYear = item.date.substring(0, 7); // จัดรูปแบบ เช่น 2026-10
      sheet.appendRow([
        item.date,
        item.type,
        item.category,
        item.item,
        item.amount,
        monthYear
      ]);
      replyMsg += `• ${item.item} (${item.category}) ${item.type} ${item.amount} บาท\n`;
    });

    replyLine(replyToken, replyMsg.trim());
    return ContentService.createTextOutput("OK");

  } catch (err) {
    // หากเกิด Error ขึ้น ระบบจะพิมพ์แจ้งเตือนเข้าไปในห้องแชท LINE ทันที
    if (replyToken) {
      replyLine(replyToken, "เกิดข้อผิดพลาดในการทำงาน: " + err.message);
    }
    return ContentService.createTextOutput("Error: " + err.message);
  }
}

// ==========================================
// 3. ฟังก์ชันเรียก Gemini API สกัดข้อมูลเป็น JSON
// ==========================================
// ฟังก์ชันเรียก Gemini API สกัดข้อมูลเป็น JSON
function parseExpenseWithGemini(userText) {
  const today = Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyy-MM-dd");
  const prompt = `
คุณเป็นผู้ช่วยบันทึกรายรับ-รายจ่าย จงแปลงข้อความต่อไปนี้ให้อยู่ในรูปแบบ JSON Array เท่านั้น ห้ามใส่คำอธิบายเพิ่มเติม
วันที่ปัจจุบันคือ: ${today}

กฎการจัดหมวดหมู่:
- type: มีแค่ "รายรับ" หรือ "รายจ่าย"
- category: ระบุหมวดหมู่สั้นๆ เช่น อาหาร, เดินทาง, ช้อปปิ้ง, ค่าห้อง, เงินเดือน, บันเทิง, อื่นๆ
- item: ชื่อรายการ
- amount: จำนวนเงินเป็นตัวเลขเท่านั้น
- date: รูปแบบ YYYY-MM-DD (ถ้าไม่ได้ระบุ ให้ใช้วันที่ปัจจุบัน)

ตัวอย่าง Output:
[
  {"date": "2026-10-28", "type": "รายจ่าย", "category": "อาหาร", "item": "ข้าวกะเพรา", "amount": 60}
]

ข้อความที่ต้องแปลง: "${userText}"
`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${GEMINI_API_KEY}`;
  
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: "application/json" }
  };

  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  const res = UrlFetchApp.fetch(url, options);
  const json = JSON.parse(res.getContentText());

  if (json.error) {
    throw new Error(json.error.message);
  }

  const replyContent = json.candidates[0].content.parts[0].text;
  return JSON.parse(replyContent);
}

// ==========================================
// 4. ฟังก์ชันคำนวณและสรุปยอดประจำเดือน
// ==========================================
// ฟังก์ชันดึงสรุปยอดรายเดือนแบบครอบคลุมการตัดช่องว่างและการเทียบสตริง
// ฟังก์ชันดึงค่าสรุปจากชีต Summary มาตอบโดยตรง
// ฟังก์ชันสรุปยอดรายเดือนแบบแยกหมวดหมู่ (อ่านค่าตามหน้าจอชีตตรงๆ)
function getMonthlySummary() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("Transactions");
  
  if (!sheet) {
    return "ไม่พบแท็บชีตที่ชื่อ 'Transactions'";
  }

  // ใช้ getDisplayValues เพื่ออ่านค่าตัวอักษรจริงบนหน้าจอชีต ป้องกันปัญหาเรื่อง format วันที่/ตัวเลข
  const data = sheet.getDataRange().getDisplayValues();
  const currentMonth = Utilities.formatDate(new Date(), "Asia/Bangkok", "yyyy-MM");
  
  let totalIncome = 0;
  let totalExpense = 0;
  const incomeCategories = {};
  const expenseCategories = {};

  // วนลูปอ่านข้อมูลตั้งแต่แถวที่ 2 เป็นต้นไป (ข้ามหัวตาราง)
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const type = (row[1] || "").trim();         // คอลัมน์ B: ประเภท
    const category = (row[2] || "อื่นๆ").trim(); // คอลัมน์ C: หมวดหมู่
    const amountStr = (row[4] || "").replace(/[^0-9.]/g, ""); // คอลัมน์ E: จำนวนเงิน
    const amount = parseFloat(amountStr) || 0;
    const rowMonth = (row[5] || "").trim();     // คอลัมน์ F: เดือน-ปี

    // ตรวจสอบว่าตรงกับเดือนปัจจุบัน เช่น "2026-11"
    if (rowMonth.includes(currentMonth)) {
      if (type.includes("รายรับ")) {
        totalIncome += amount;
        incomeCategories[category] = (incomeCategories[category] || 0) + amount;
      } else if (type.includes("รายจ่าย")) {
        totalExpense += amount;
        expenseCategories[category] = (expenseCategories[category] || 0) + amount;
      }
    }
  }

  const net = totalIncome - totalExpense;

  // จัดรูปแบบหมวดหมู่รายรับ
  let incomeDetails = "";
  for (const cat in incomeCategories) {
    incomeDetails += `   ▫️ ${cat}: +${incomeCategories[cat].toLocaleString()} บาท\n`;
  }

  // จัดรูปแบบหมวดหมู่รายจ่าย
  let expenseDetails = "";
  for (const cat in expenseCategories) {
    expenseDetails += `   ▫️ ${cat}: -${expenseCategories[cat].toLocaleString()} บาท\n`;
  }

  // สร้างข้อความตอบกลับ
  let message = `📊 สรุปยอดประจำเดือน (${currentMonth})\n\n`;
  
  message += `🟢 รวมรายรับ: +${totalIncome.toLocaleString()} บาท\n`;
  if (incomeDetails) {
    message += incomeDetails;
  }
  
  message += `\n🔴 รวมรายจ่าย: -${totalExpense.toLocaleString()} บาท\n`;
  if (expenseDetails) {
    message += expenseDetails;
  }
  
  message += `--------------------\n` +
             `💰 ยอดสุทธิคงเหลือ: ${net.toLocaleString()} บาท`;

  return message;
}
// ==========================================
// 5. ฟังก์ชันส่งข้อความตอบกลับไปยัง LINE
// ==========================================
function replyLine(replyToken, text) {
  const url = "https://api.line.me/v2/bot/message/reply";
  const payload = {
    replyToken: replyToken,
    messages: [{ type: "text", text: text }]
  };

  UrlFetchApp.fetch(url, {
    method: "post",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + LINE_ACCESS_TOKEN
    },
    payload: JSON.stringify(payload)
  });
}
