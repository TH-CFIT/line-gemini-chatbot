// api/index.js

// โหลด Environment Variables สำหรับการพัฒนาในเครื่อง (local development)
// Vercel จะจัดการ Environment Variables ให้เองเมื่อ Deploy
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

// นำเข้า LINE Bot SDK และ Google Generative AI SDK
const line = require('@line/bot-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// กำหนดค่า Channel Secret และ Channel Access Token จาก Environment Variables
// (ค่าเหล่านี้จะถูกตั้งค่าใน Vercel Dashboard หรือในไฟล์ .env.local สำหรับ local)
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

// สร้าง LINE client
const client = new line.Client(config);

// กำหนดค่า Gemini API Key จาก Environment Variables
const geminiApiKey = process.env.GEMINI_API_KEY;

// ตรวจสอบว่ามี Gemini API Key หรือไม่
if (!geminiApiKey) {
  console.error('GEMINI_API_KEY is not set. Please set the environment variable.');
  // คุณอาจจะเลือกที่จะ throw error หรือจัดการอย่างอื่น
}

// สร้าง Gemini client
const genAI = new GoogleGenerativeAI(geminiApiKey);

// เลือกโมเดล Gemini ที่จะใช้ (เช่น gemini-pro)
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

// ฟังก์ชันสำหรับประมวลผลข้อความจาก LINE
async function handleEvent(event) {
  // ตรวจสอบว่าเป็นข้อความประเภท text และเป็นข้อความจากผู้ใช้
  if (event.type === 'message' && event.message.type === 'text') {
    const userMessage = event.message.text;
    console.log(`Received message from user: ${userMessage}`);

    let replyText = 'ขออภัยค่ะ ไม่สามารถประมวลผลคำขอได้ในขณะนี้'; // ข้อความตอบกลับเริ่มต้น

    try {
      // ส่งข้อความของผู้ใช้ไปยัง Gemini API
      const result = await model.generateContent(userMessage);
      const response = await result.response;
      const geminiText = response.text(); // ดึงข้อความตอบกลับจาก Gemini

      if (geminiText) {
        replyText = geminiText;
      }
    } catch (error) {
      console.error('Error calling Gemini API:', error);
      // ในกรณีที่เกิดข้อผิดพลาดกับ Gemini API
      replyText = 'ขออภัยค่ะ เกิดข้อผิดพลาดในการเชื่อมต่อกับ AI';
    }

    // ตอบกลับข้อความไปยัง LINE
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: replyText,
    });
  }

  // หากไม่ใช่ข้อความประเภท text หรือไม่ใช่ message event ที่ต้องการ
  return Promise.resolve(null);
}

// ฟังก์ชันหลักสำหรับ Serverless Function ของ Vercel
// Vercel จะเรียกใช้ฟังก์ชันนี้เมื่อมี HTTP Request เข้ามา
module.exports = async (req, res) => {
  if (req.method === 'POST') {
    try {
      // ตรวจสอบ Signature ของ Webhook เพื่อความปลอดภัย
      // (สำคัญมาก! เพื่อยืนยันว่า Request มาจาก LINE จริงๆ)
      const signature = req.headers['x-line-signature'];
      const body = JSON.stringify(req.body); // ต้องแปลง body เป็น string ก่อน verify

      if (!line.validateSignature(body, config.channelSecret, signature)) {
        console.warn('Invalid LINE signature.');
        res.status(403).send('Forbidden');
        return;
      }

      // ประมวลผลแต่ละ Event ที่ LINE ส่งมา
      // LINE อาจส่งหลาย Event มาใน Request เดียวกัน
      const events = req.body.events;
      const results = await Promise.all(events.map(handleEvent));

      // ส่งสถานะกลับไปว่าประมวลผลสำเร็จ
      res.status(200).json({
        success: true,
        results: results,
      });

    } catch (error) {
      console.error('Error processing LINE webhook:', error);
      res.status(500).json({
        success: false,
        message: 'Internal Server Error',
        error: error.message,
      });
    }
  } else {
    // สำหรับ Request ประเภทอื่นที่ไม่ใช่ POST (เช่น GET)
    // อาจใช้สำหรับทดสอบว่า Server ทำงานอยู่หรือไม่
    res.status(200).send('LINE Chatbot is running!');
  }
};
