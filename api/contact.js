// api/contact.js  — CommonJS handler on Vercel with AWS SES (ESM via dynamic import)

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

    // 1) Verify Google reCAPTCHA (v2 or v3)
    const verifyRes = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: process.env.RECAPTCHA_SECRET,
        response: token
      })
    });
    const verifyData = await verifyRes.json();

    // For v3, also check score; for v2, score is undefined (that’s fine).
    if (!verifyData.success || (typeof verifyData.score === 'number' && verifyData.score < 0.5)) {
      res.status(400).json({ error: 'reCAPTCHA validation failed' });
      return;
    }

    // 2) Send the email via AWS SES (ESM-only package loaded via dynamic import)
    const { SESClient, SendEmailCommand } = await import('@aws-sdk/client-ses');

    const region = process.env.AWS_REGION || 'eu-west-1'; // set yours in Vercel
    const client = new SESClient({ region });

    const plainText = `Name: ${name}\nEmail: ${email}\n\n${message}`;
    const htmlBody = `<p><b>Name:</b> ${escapeHtml(name)}</p>
                      <p><b>Email:</b> ${escapeHtml(email)}</p>
                      <p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>`;

    const params = {
      Destination: { ToAddresses: [process.env.CONTACT_TO] },
      Message: {
        Subject: { Data: `New contact from ${name}` },
        Body: {
          Text: { Data: plainText },
          Html: { Data: htmlBody }
        }
      },
      Source: process.env.CONTACT_FROM, // must be a verified SES identity
      ReplyToAddresses: [email]
    };

    await client.send(new SendEmailCommand(params));

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};

// Simple HTML escape to avoid breaking your email markup
function escapeHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

