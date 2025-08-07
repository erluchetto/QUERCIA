// api/contact.js

import fetch from 'node-fetch';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const ses = new SESClient({ region: process.env.AWS_REGION });

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const { name, email, comment, token } = req.body || {};
    if (!name || !email || !comment || !token) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    // 1) Verify reCAPTCHA
    const recRes = await fetch(
      'https://www.google.com/recaptcha/api/siteverify',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `secret=${process.env.RECAPTCHA_SECRET}&response=${token}`
      }
    );
    const recData = await recRes.json();
    if (!recData.success) {
      return res.status(400).json({ error: 'reCAPTCHA verification failed' });
    }

    // 2) Send via SES
    const params = {
      Destination: { ToAddresses: ['laquerciamusic@gmail.com'] },
      Message: {
        Body: { Text: { Data: `Name: ${name}\nEmail: ${email}\nComment:\n${comment}` } },
        Subject: { Data: 'New Contact Form Submission' }
      },
      Source: process.env.SES_FROM_ADDRESS
    };
    await ses.send(new SendEmailCommand(params));

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('🛑 Handler error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
