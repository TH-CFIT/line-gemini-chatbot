// api/index.js

// Load Environment Variables for local development.
// Vercel handles Environment Variables automatically when deployed.
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

// Import LINE Bot SDK and Google Generative AI SDK.
const line = require('@line/bot-sdk');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Define Channel Secret and Channel Access Token from Environment Variables.
// (These values will be set in the Vercel Dashboard or in .env.local for local testing.)
const config = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.LINE_CHANNEL_SECRET,
};

// Create LINE client.
const client = new line.Client(config);

// Define Gemini API Key from Environment Variables.
const geminiApiKey = process.env.GEMINI_API_KEY;

// Check if Gemini API Key is set.
if (!geminiApiKey) {
  console.error('GEMINI_API_KEY is not set. Please set the environment variable.');
  // You might choose to throw an error or handle it differently.
}

// Create Gemini client.
const genAI = new GoogleGenerativeAI(geminiApiKey);

// Select the Gemini model to use.
// Using 'gemini-1.5-flash' for general text generation, as 'gemini-pro' might not be available in all regions or for all API versions.
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

// Function to process messages from LINE.
async function handleEvent(event) {
  // Check if the message is of type 'text' and from a user.
  if (event.type === 'message' && event.message.type === 'text') {
    const userMessage = event.message.text;
    console.log(`Received message from user: ${userMessage}`);

    let replyText = 'ขออภัยค่ะ ไม่สามารถประมวลผลคำขอได้ในขณะนี้'; // Default reply message.

    try {
      // Send the user's message to the Gemini API.
      const result = await model.generateContent(userMessage);
      const response = await result.response;
      const geminiText = response.text(); // Extract the reply text from Gemini.

      if (geminiText) {
        replyText = geminiText;
      }
    } catch (error) {
      console.error('Error calling Gemini API:', error);
      // In case of an error with the Gemini API.
      replyText = 'ขออภัยค่ะ เกิดข้อผิดพลาดในการเชื่อมต่อกับ AI';
    }

    // Reply to the message on LINE.
    return client.replyMessage(event.replyToken, {
      type: 'text',
      text: replyText,
    });
  }

  // If it's not a text message or a desired message event, resolve with null.
  return Promise.resolve(null);
}

// Main function for the Vercel Serverless Function.
// Vercel will call this function when an HTTP Request comes in.
module.exports = async (req, res) => {
  if (req.method === 'POST') {
    try {
      // Verify the Webhook Signature for security.
      // (Very important! To confirm the Request truly comes from LINE.)
      const signature = req.headers['x-line-signature'];
      const body = JSON.stringify(req.body); // Must convert body to string before verifying.

      if (!line.validateSignature(body, config.channelSecret, signature)) {
        console.warn('Invalid LINE signature.');
        res.status(403).send('Forbidden');
        return;
      }

      // Process each Event sent by LINE.
      // LINE might send multiple Events in a single Request.
      const events = req.body.events;
      const results = await Promise.all(events.map(handleEvent));

      // Send a success status back.
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
    // For other Request types that are not POST (e.g., GET).
    // Can be used to test if the server is running.
    res.status(200).send('LINE Chatbot is running!');
  }
};
