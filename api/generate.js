const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).send('Only POST requests allowed');
  
  try {
    // Launch Chrome in Vercel's serverless environment
    const browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport,
      executablePath: await chromium.executablePath(),
      headless: chromium.headless,
    });
    
    const page = await browser.newPage();
    
    // Load the HTML sent by your Telegram bot
    await page.setContent(req.body.html, { waitUntil: 'networkidle0' });
    
    // Convert to PDF and preserve all your beautiful CSS colors
    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    
    await browser.close();
    
    // Send the raw PDF file back to the bot
    res.setHeader('Content-Type', 'application/pdf');
    res.send(pdf);
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}