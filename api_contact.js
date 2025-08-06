// api/contact.js

const fetch = require('node-fetch');
const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses');

// Initialize AWS SES client
const ses = new SESClient({ region: process.env.AWS_REGION });

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  let body;
  try {
    body = JSON.parse(req.body);
  } catch (err) {
    res.status(400).json({ error: 'Invalid JSON' });
    return;
  }

  const { name, email, comment, token } = body;
  if (!name || !email || !comment || !token) {
    res.status(400).json({ error: 'Missing fields' });
    return;
  }

  // Verify reCAPTCHA
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
    res.status(400).json({ error: 'reCAPTCHA verification failed' });
    return;
  }

  // Prepare SES email parameters
  const params = {
    Destination: {
      ToAddresses: ['laquerciamusic@gmail.com'],
    },
    Message: {
      Body: {
        Text: { Data: `Name: ${name}\nEmail: ${email}\nComment:\n${comment}` },
      },
      Subject: { Data: 'New Contact Form Submission' },
    },
    Source: process.env.SES_FROM_ADDRESS, // verified sender email in SES
  };

  try {
    // Send email via AWS SES
    const command = new SendEmailCommand(params);
    await ses.send(command);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('SES error:', error);
    res.status(500).json({ error: 'Email sending failed' });
  }
};
