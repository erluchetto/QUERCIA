// api/contact.js — CommonJS handler using AWS SES with your SES_FROM_ADDRESS
// Uses SES_TO_ADDRESS if set; otherwise sends to SES_FROM_ADDRESS.

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const { name, email, message, token } = req.body || {};
    if (!name || !email || !message || !token) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }

    // 1) Verify Google reCAPTCHA
    const verifyRes = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: process.env.RECAPTCHA_SECRET,
        response: token
      })
    });
    const verifyData = await verifyRes.json();

    // For v3, check score; for v2, score is undefined (that’s okay).
    if (!verifyData.success || (typeof verifyData.score === 'number' && verifyData.score < 0.5)) {
      res.status(400).json({ error: 'reCAPTCHA validation failed' });
      return;
    }

    // 2) Send via AWS SES (ESM-only SDK via dynamic import in CommonJS)
    const { SESClient, SendEmailCommand } = await import('@aws-sdk/client-ses');

    const region = process.env.AWS_REGION || 'eu-west-1';
    const client = new SESClient({ region });

    const fromAddress = process.env.SES_FROM_ADDRESS; // must be SES-verified
    const toAddress = process.env.SES_TO_ADDRESS || fromAddress; // Option A: fallback to same address

    if (!fromAddress) {
      res.status(500).json({ error: 'Missing SES_FROM_ADDRESS env var' });
      return;
    }

    const plainText = `Name: ${name}\nEmail: ${email}\n\n${message}`;
    const htmlBody = `<p><b>Name:</b> ${escapeHtml(name)}</p>
                      <p><b>Email:</b> ${escapeHtml(email)}</p>
                      <p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>`;

    const params = {
      Destination: { ToAddresses: [toAddress] },
      Message: {
        Subject: { Data: `New contact from ${name}` },
        Body: {
          Text: { Data: plainText },
          Html: { Data: htmlBody }
        }
      },
      Source: fromAddress,
      ReplyToAddresses: [email]
    };

    await client.send(new SendEmailCommand(params));
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
