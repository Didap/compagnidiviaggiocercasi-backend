import { factories } from '@strapi/strapi';

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:1337';
const BRAND = 'Compagni di Viaggio Cercasi';
const LOGO_URL = `${BACKEND_URL}/logo.png`;

const C = {
    orange: '#cf5827',
    teal: '#45828a',
    bg: '#f9fafb',
    card: '#ffffff',
    border: '#f0f0f0',
    textPrimary: '#111827',
    textSecondary: '#6b7280',
    textMuted: '#9ca3af',
    divider: '#e5e7eb',
};

function buildContactEmailHtml(name: string, email: string, subject: string, message: string): string {
    return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Nuovo messaggio — ${BRAND}</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};">
<tr><td align="center" style="padding:40px 16px;">

<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

  <!-- Logo -->
  <tr><td align="center" style="padding:0 0 32px;">
    <img src="${LOGO_URL}" alt="${BRAND}" width="160" style="display:block;max-width:160px;height:auto;border:0;" />
  </td></tr>

  <!-- Card -->
  <tr><td style="background:${C.card};border-radius:12px;border:1px solid ${C.border};">

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <!-- Header -->
      <tr><td style="padding:40px 40px 24px;text-align:center;">
        <div style="font-size:40px;margin-bottom:12px;">✉️</div>
        <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:${C.textPrimary};line-height:1.3;">Nuovo messaggio dal sito</h1>
        <p style="margin:0;font-size:14px;color:${C.textSecondary};line-height:1.5;">${subject || 'Messaggio dal form di contatto'}</p>
      </td></tr>

      <!-- Body -->
      <tr><td style="padding:0 40px 32px;">

        <!-- Sender Info -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.divider};border-radius:8px;margin:16px 0;">
          <tr><td style="padding:16px 20px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td style="padding:8px 0;border-bottom:1px solid ${C.divider};font-size:13px;color:${C.textSecondary};">Da</td>
                <td style="padding:8px 0;border-bottom:1px solid ${C.divider};font-size:13px;font-weight:600;color:${C.textPrimary};text-align:right;">${name}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;border-bottom:1px solid ${C.divider};font-size:13px;color:${C.textSecondary};">Email</td>
                <td style="padding:8px 0;border-bottom:1px solid ${C.divider};font-size:13px;font-weight:600;color:${C.orange};text-align:right;">
                  <a href="mailto:${email}" style="color:${C.orange};text-decoration:none;">${email}</a>
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0;font-size:13px;color:${C.textSecondary};">Oggetto</td>
                <td style="padding:8px 0;font-size:13px;font-weight:600;color:${C.textPrimary};text-align:right;">${subject || '—'}</td>
              </tr>
            </table>
          </td></tr>
        </table>

        <!-- Message -->
        <p style="margin:24px 0 8px;font-size:11px;font-weight:700;color:${C.textMuted};text-transform:uppercase;letter-spacing:1px;">Messaggio</p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-left:3px solid ${C.orange};margin:8px 0;">
          <tr><td style="padding:16px 20px;">
            <p style="margin:0;font-size:14px;color:${C.textPrimary};line-height:1.7;white-space:pre-wrap;">${message}</p>
          </td></tr>
        </table>

        <!-- Reply Button -->
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 0;">
          <tr><td style="background:${C.orange};border-radius:8px;padding:12px 28px;">
            <a href="mailto:${email}?subject=Re: ${subject || 'Contatto'}" style="color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;display:block;">Rispondi a ${name} →</a>
          </td></tr>
        </table>

      </td></tr>
    </table>

  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:32px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center">
        <p style="margin:0 0 12px;font-size:12px;color:${C.textMuted};line-height:1.6;">
          Questa email è stata generata dal form di contatto del sito.
        </p>
        <p style="margin:0;font-size:11px;color:${C.textMuted};">
          © ${new Date().getFullYear()} ${BRAND}
        </p>
      </td></tr>
    </table>
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

export default factories.createCoreController('api::contact-message.contact-message' as any, ({ strapi }) => ({
    async create(ctx) {
        // 1. Save the message using the core controller behavior
        const response = await super.create(ctx);

        // 2. Extract the data submitted
        const { name, email, subject, message } = response.data;

        // 3. Send styled email to the admin
        try {
            await strapi.plugin('email').service('email').send({
                to: process.env.RESEND_FROM_EMAIL || 'info@compagnidiviaggiocercasi.it',
                from: process.env.RESEND_FROM_EMAIL || 'info@compagnidiviaggiocercasi.it',
                replyTo: email,
                subject: `Nuovo messaggio dal sito: ${subject || 'Contatto'}`,
                html: buildContactEmailHtml(name, email, subject, message),
            });
            console.log('Contact email sent successfully via Resend');
        } catch (err) {
            console.error('Failed to send contact notification email:', err);
        }

        return response;
    }
}));
