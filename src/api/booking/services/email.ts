/**
 * Email Service — Compagni di Viaggio Cercasi
 *
 * Minimal, clean email templates. White-first design with subtle brand accents.
 * Brand palette: Orange #cf5827 · Teal #45828a
 */

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:1337';
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'info@compagnidiviaggiocercasi.it';
const BRAND = 'Compagni di Viaggio Cercasi';
const LOGO_URL = 'https://res.cloudinary.com/daz1m90yx/image/upload/v1772196404/brand/email/logo.png';

const C = {
  orange: '#cf5827',
  teal: '#45828a',
  green: '#059669',
  amber: '#b45309',
  red: '#b91c1c',
  bg: '#f9fafb',       // very subtle gray
  card: '#ffffff',
  border: '#f0f0f0',
  textPrimary: '#111827',
  textSecondary: '#6b7280',
  textMuted: '#9ca3af',
  divider: '#e5e7eb',
};

// ─── Base Layout ─────────────────────────────────────────────────
function base(content: string, preheader: string = ''): string {
  return `<!DOCTYPE html>
<html lang="it">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>${BRAND}</title>
</head>
<body style="margin:0;padding:0;background:${C.bg};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;">${preheader}</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg};">
<tr><td align="center" style="padding:40px 16px;">

<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

  <!-- Logo -->
  <tr><td align="center" style="padding:0 0 32px;">
    <a href="${FRONTEND_URL}" style="text-decoration:none;">
      <img src="${LOGO_URL}" alt="${BRAND}" width="160" style="display:block;max-width:160px;height:auto;border:0;" />
    </a>
  </td></tr>

  <!-- Card -->
  <tr><td style="background:${C.card};border-radius:12px;border:1px solid ${C.border};">
    ${content}
  </td></tr>

  <!-- Footer -->
  <tr><td style="padding:32px 0;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center">
        <p style="margin:0 0 12px;font-size:12px;color:${C.textMuted};line-height:1.6;">
          Viaggiare insieme è più bello. Sempre.
        </p>
        <p style="margin:0 0 12px;font-size:12px;color:${C.textMuted};">
          <a href="${FRONTEND_URL}/viaggi" style="color:${C.textSecondary};text-decoration:none;">Viaggi</a>
          &nbsp;·&nbsp;
          <a href="${FRONTEND_URL}/profilo" style="color:${C.textSecondary};text-decoration:none;">Profilo</a>
          &nbsp;·&nbsp;
          <a href="${FRONTEND_URL}" style="color:${C.textSecondary};text-decoration:none;">Home</a>
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

// ─── Components ──────────────────────────────────────────────────

function header(emoji: string, title: string, subtitle: string): string {
  return `
    <td style="padding:40px 40px 24px;text-align:center;">
      <div style="font-size:40px;margin-bottom:12px;">${emoji}</div>
      <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:${C.textPrimary};line-height:1.3;">${title}</h1>
      <p style="margin:0;font-size:14px;color:${C.textSecondary};line-height:1.5;">${subtitle}</p>
    </td>`;
}

function btn(text: string, url: string, color: string = C.orange): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px auto 0;">
      <tr><td style="background:${color};border-radius:8px;padding:12px 28px;">
        <a href="${url}" style="color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;display:block;">${text}</a>
      </td></tr>
    </table>`;
}

function infoBlock(rows: string): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${C.divider};border-radius:8px;margin:16px 0;">
      <tr><td style="padding:16px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${rows}
        </table>
      </td></tr>
    </table>`;
}

function infoRow(label: string, value: string, isLast: boolean = false): string {
  const border = isLast ? '' : `border-bottom:1px solid ${C.divider};`;
  return `
    <tr>
      <td style="padding:8px 0;${border}font-size:13px;color:${C.textSecondary};">${label}</td>
      <td style="padding:8px 0;${border}font-size:13px;font-weight:600;color:${C.textPrimary};text-align:right;">${value}</td>
    </tr>`;
}

function note(text: string, color: string = C.teal): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-left:3px solid ${color};margin:20px 0;">
      <tr><td style="padding:12px 16px;">
        <p style="margin:0;font-size:13px;color:${C.textSecondary};line-height:1.6;">${text}</p>
      </td></tr>
    </table>`;
}

function listItem(title: string, desc: string): string {
  return `
    <tr><td style="padding:8px 0;">
      <p style="margin:0;font-size:13px;font-weight:600;color:${C.textPrimary};">${title}</p>
      <p style="margin:2px 0 0;font-size:13px;color:${C.textSecondary};line-height:1.5;">${desc}</p>
    </td></tr>`;
}

function sectionLabel(text: string): string {
  return `<p style="margin:24px 0 8px;font-size:11px;font-weight:700;color:${C.textMuted};text-transform:uppercase;letter-spacing:1px;">${text}</p>`;
}

function amountBlock(amount: string, label: string, color: string = C.textPrimary): string {
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
      <tr><td style="text-align:center;padding:20px;">
        <p style="margin:0;font-size:32px;font-weight:700;color:${color};letter-spacing:-0.5px;">${amount}</p>
        <p style="margin:4px 0 0;font-size:12px;color:${C.textMuted};">${label}</p>
      </td></tr>
    </table>`;
}

function fmt(amount: number): string {
  return `€${amount.toFixed(2).replace('.', ',')}`;
}

function fmtDate(dateStr: string): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' });
}

function body(padding: string = '32px 40px'): string {
  return `padding:${padding};`;
}


// ═══════════════════════════════════════════════════════════════════
//  1. WELCOME
// ═══════════════════════════════════════════════════════════════════

function welcomeHtml(userName: string): string {
  const content = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>${header('🌍', `Benvenuto, ${userName}!`, 'La tua prossima avventura inizia qui.')}</tr>
      <tr><td style="${body()}">

        <p style="margin:0 0 20px;font-size:14px;color:${C.textSecondary};line-height:1.7;">
          Siamo felici di averti con noi. <strong style="color:${C.textPrimary};">${BRAND}</strong> è una community di persone che crede che i viaggi più belli siano quelli condivisi.
        </p>

        ${sectionLabel('Cosa puoi fare')}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${listItem('Esplora i viaggi', 'Sfoglia le destinazioni curate e trova quella perfetta per te.')}
          ${listItem('Trova compagni', 'Conosci altri viaggiatori con le tue stesse passioni.')}
          ${listItem('Prenota in sicurezza', 'Pagamenti protetti e rate flessibili.')}
        </table>

        ${btn('Esplora i viaggi →', `${FRONTEND_URL}/viaggi`)}

        ${note('Se hai domande, scrivici su Instagram o tramite il form di contatto — rispondiamo sempre entro 24 ore.')}

      </td></tr>
    </table>`;
  return base(content, `Benvenuto nella community di ${BRAND}!`);
}


// ═══════════════════════════════════════════════════════════════════
//  2. EMAIL CONFIRMATION
// ═══════════════════════════════════════════════════════════════════

function confirmationHtml(userName: string, confirmUrl: string): string {
  const content = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>${header('✉️', 'Conferma il tuo account', 'Un ultimo passaggio per completare la registrazione.')}</tr>
      <tr><td style="${body()}">
        <p style="margin:0 0 20px;font-size:14px;color:${C.textSecondary};line-height:1.7;">
          Ciao <strong style="color:${C.textPrimary};">${userName}</strong>, clicca il pulsante qui sotto per confermare il tuo indirizzo email.
        </p>
        ${btn('Conferma il mio account →', confirmUrl, C.teal)}
        ${note('Se non hai creato tu questo account, puoi ignorare questa email in sicurezza.')}
      </td></tr>
    </table>`;
  return base(content, 'Conferma il tuo indirizzo email.');
}


// ═══════════════════════════════════════════════════════════════════
//  3. PASSWORD RESET
// ═══════════════════════════════════════════════════════════════════

function passwordResetHtml(userName: string, resetUrl: string): string {
  const content = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>${header('🔐', 'Reset Password', 'Nessun problema, succede a tutti.')}</tr>
      <tr><td style="${body()}">
        <p style="margin:0 0 20px;font-size:14px;color:${C.textSecondary};line-height:1.7;">
          Ciao <strong style="color:${C.textPrimary};">${userName}</strong>, clicca qui sotto per scegliere una nuova password.
        </p>
        ${btn('Reimposta la password →', resetUrl, C.textPrimary)}
        ${note('Questo link è valido per 24 ore. Se non hai richiesto il reset, ignora questa email.')}
      </td></tr>
    </table>`;
  return base(content, 'Reimposta la tua password.');
}


// ═══════════════════════════════════════════════════════════════════
//  4. BOOKING CONFIRMED
// ═══════════════════════════════════════════════════════════════════

interface BookingEmailData {
  userName: string;
  tripTitle: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
  participantsCount: number;
  totalPrice: number;
  depositPrice?: number;
  paymentSteps?: any[];
}

function bookingConfirmedHtml(d: BookingEmailData): string {
  let stepsHtml = '';
  if (d.paymentSteps && d.paymentSteps.length > 0) {
    const rows = d.paymentSteps.map((s: any, i: number) => {
      const status = s.status === 'paid'
        ? `✓ Pagato`
        : s.dueDate ? `Scad. ${fmtDate(s.dueDate)}` : 'In attesa';
      return infoRow(
        s.name || `Rata ${i + 1}`,
        `${fmt(Number(s.amount))} · ${status}`,
        i === d.paymentSteps!.length - 1
      );
    }).join('');
    stepsHtml = `${sectionLabel('Piano di pagamento')}${infoBlock(rows)}`;
  }

  const content = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>${header('✓', 'Prenotazione confermata', d.tripTitle)}</tr>
      <tr><td style="${body()}">

        <p style="margin:0 0 20px;font-size:14px;color:${C.textSecondary};line-height:1.7;">
          Ciao <strong style="color:${C.textPrimary};">${d.userName}</strong>, la tua prenotazione è confermata. Ecco il riepilogo.
        </p>

        ${infoBlock(
    infoRow('Destinazione', d.destination || '—')
    + infoRow('Partenza', fmtDate(d.startDate || ''))
    + infoRow('Ritorno', fmtDate(d.endDate || ''))
    + infoRow('Partecipanti', String(d.participantsCount))
    + infoRow('Totale', fmt(d.totalPrice), true)
  )}

        ${stepsHtml}

        ${sectionLabel('Prossimi passi')}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${listItem('Aggiornamenti via email', 'Riceverai promemoria per i pagamenti e suggerimenti per prepararti.')}
          ${listItem('Documenti', 'Verifica che passaporto e visti siano in regola.')}
          ${listItem('Programma', 'Consulta l\'itinerario completo dal tuo profilo.')}
        </table>

        ${btn('Vai al profilo →', `${FRONTEND_URL}/profilo`)}

        ${note('Puoi cancellare gratuitamente entro 48 ore dalla conferma.')}

      </td></tr>
    </table>`;
  return base(content, `Prenotazione confermata per "${d.tripTitle}".`);
}


// ═══════════════════════════════════════════════════════════════════
//  5. PAYMENT RECEIPT
// ═══════════════════════════════════════════════════════════════════

function paymentReceiptHtml(d: BookingEmailData, stepName: string, stepAmount: number): string {
  const paid = (d.paymentSteps || [])
    .filter((s: any) => s.status === 'paid')
    .reduce((sum: number, s: any) => sum + Number(s.amount), 0);
  const remaining = Math.max(0, d.totalPrice - paid);
  const pct = d.totalPrice > 0 ? Math.round((paid / d.totalPrice) * 100) : 100;

  const progressBar = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
      <tr><td>
        <div style="background:${C.divider};border-radius:4px;height:6px;overflow:hidden;">
          <div style="background:${C.teal};height:100%;width:${pct}%;border-radius:4px;"></div>
        </div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:6px;">
          <tr>
            <td style="font-size:11px;color:${C.textSecondary};">Pagato: ${fmt(paid)}</td>
            <td style="font-size:11px;color:${C.textMuted};text-align:right;">Rimanente: ${fmt(remaining)}</td>
          </tr>
        </table>
      </td></tr>
    </table>`;

  const content = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>${header('✓', 'Pagamento ricevuto', stepName)}</tr>
      <tr><td style="${body()}">

        <p style="margin:0 0 16px;font-size:14px;color:${C.textSecondary};line-height:1.7;">
          Ciao <strong style="color:${C.textPrimary};">${d.userName}</strong>, il tuo pagamento è stato registrato.
        </p>

        ${amountBlock(fmt(stepAmount), stepName, C.green)}

        ${infoBlock(
    infoRow('Viaggio', d.tripTitle)
    + infoRow('Importo', fmt(stepAmount))
    + infoRow('Data', fmtDate(new Date().toISOString()), true)
  )}

        ${progressBar}

        ${remaining > 0
      ? note(`Restano ${fmt(remaining)} da saldare. Trovi le scadenze nel tuo profilo.`)
      : note('Hai completato tutti i pagamenti per questo viaggio. Non ti resta che preparare la valigia!')
    }

        ${btn('Vai al profilo →', `${FRONTEND_URL}/profilo`, C.teal)}

      </td></tr>
    </table>`;
  return base(content, `Pagamento di ${fmt(stepAmount)} ricevuto per "${d.tripTitle}".`);
}


// ═══════════════════════════════════════════════════════════════════
//  6. BOOKING CANCELLED
// ═══════════════════════════════════════════════════════════════════

function bookingCancelledHtml(d: BookingEmailData): string {
  const content = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>${header('—', 'Prenotazione cancellata', d.tripTitle)}</tr>
      <tr><td style="${body()}">

        <p style="margin:0 0 20px;font-size:14px;color:${C.textSecondary};line-height:1.7;">
          Ciao <strong style="color:${C.textPrimary};">${d.userName}</strong>, la tua prenotazione è stata cancellata.
        </p>

        ${infoBlock(
    infoRow('Destinazione', d.destination || '—')
    + infoRow('Date', `${fmtDate(d.startDate || '')} → ${fmtDate(d.endDate || '')}`)
    + infoRow('Importo', fmt(d.totalPrice), true)
  )}

        <p style="margin:20px 0;font-size:14px;color:${C.textSecondary};line-height:1.7;">
          Ci dispiace vederti andare. Speriamo di rivederti presto su una delle nostre prossime avventure.
        </p>

        ${btn('Scopri i prossimi viaggi →', `${FRONTEND_URL}/viaggi`, C.teal)}

      </td></tr>
    </table>`;
  return base(content, `Prenotazione cancellata per "${d.tripTitle}".`);
}


// ═══════════════════════════════════════════════════════════════════
//  7. INSTALLMENT REMINDER
// ═══════════════════════════════════════════════════════════════════

function installmentReminderHtml(d: BookingEmailData, stepName: string, stepAmount: number, dueDate: string, isUrgent: boolean): string {
  const emoji = isUrgent ? '⚠' : '🔔';
  const title = isUrgent ? 'Rata in scadenza oggi' : 'Promemoria pagamento';
  const subtitle = `${stepName} — ${d.tripTitle}`;

  const content = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>${header(emoji, title, subtitle)}</tr>
      <tr><td style="${body()}">

        <p style="margin:0 0 16px;font-size:14px;color:${C.textSecondary};line-height:1.7;">
          Ciao <strong style="color:${C.textPrimary};">${d.userName}</strong>,
          ${isUrgent
      ? `la rata <strong>${stepName}</strong> scade <strong>oggi</strong>. Effettua il pagamento per mantenere il tuo posto.`
      : `la rata <strong>${stepName}</strong> è in scadenza il <strong>${fmtDate(dueDate)}</strong>.`
    }
        </p>

        ${amountBlock(fmt(stepAmount), `Scadenza: ${fmtDate(dueDate)}`, isUrgent ? C.amber : C.textPrimary)}

        ${infoBlock(
      infoRow('Viaggio', d.tripTitle)
      + infoRow('Partenza', fmtDate(d.startDate || ''))
      + infoRow('Rata', stepName)
      + infoRow('Importo', fmt(stepAmount), true)
    )}

        ${btn('Paga ora →', `${FRONTEND_URL}/profilo`, isUrgent ? C.amber : C.orange)}

        ${isUrgent
      ? note('Il mancato pagamento entro oggi potrebbe comportare la cancellazione della prenotazione.')
      : note('Puoi pagare in qualsiasi momento dal tuo profilo, anche prima della scadenza.')
    }

      </td></tr>
    </table>`;
  return base(content, `${isUrgent ? 'URGENTE' : 'Promemoria'}: ${stepName} — ${fmt(stepAmount)}`);
}


// ═══════════════════════════════════════════════════════════════════
//  8. TRIP PREPARATION SERIES
// ═══════════════════════════════════════════════════════════════════

function tripReminderHtml(d: BookingEmailData, daysUntil: number): string {
  const configs: Record<number, { emoji: string; title: string; items: { t: string; d: string }[] }> = {
    30: {
      emoji: '📋',
      title: 'Manca un mese alla partenza',
      items: [
        { t: 'Documenti', d: 'Verifica che passaporto e visti siano validi per tutta la durata del viaggio.' },
        { t: 'Assicurazione', d: 'Attiva un\'assicurazione di viaggio se non l\'hai ancora fatto.' },
        { t: 'Salute', d: 'Controlla se servono vaccinazioni per la destinazione.' },
        { t: 'Connettività', d: 'Valuta una eSIM o un piano roaming.' },
      ],
    },
    14: {
      emoji: '🎒',
      title: 'Due settimane alla partenza',
      items: [
        { t: 'Abbigliamento', d: 'Controlla il meteo e prepara outfit versatili.' },
        { t: 'Tecnologia', d: 'Caricabatterie, adattatori, power bank.' },
        { t: 'Itinerario', d: 'Rileggi il programma giorno per giorno.' },
        { t: 'Zaino da giorno', d: 'Borraccia, crema solare, cappellino.' },
      ],
    },
    7: {
      emoji: '✈️',
      title: 'Una settimana alla partenza',
      items: [
        { t: 'Meteo', d: 'Controlla le previsioni e aggiusta la valigia.' },
        { t: 'Check finale', d: 'Documenti, assicurazione, valigia — tutto pronto?' },
        { t: 'Spazio foto', d: 'Libera spazio sul telefono per foto e video.' },
        { t: 'Gruppo', d: 'Verrai aggiunto al gruppo WhatsApp del viaggio.' },
      ],
    },
    1: {
      emoji: '🚀',
      title: 'Domani si parte!',
      items: [
        { t: 'Punto di ritrovo', d: 'Controlla orario e luogo di incontro nel programma.' },
        { t: 'Contatto d\'emergenza', d: 'Salva il numero del tour leader dal gruppo WhatsApp.' },
        { t: 'Riposo', d: 'Domani sarà intenso. Vai a letto presto!' },
        { t: 'Buon viaggio!', d: 'Non pensare a nulla — ci pensiamo noi. Goditi ogni momento.' },
      ],
    },
  };

  const config = configs[daysUntil] || configs[7];
  const greetings: Record<number, string> = {
    30: 'Il conto alla rovescia è iniziato! Ecco come prepararti.',
    14: 'Due settimane volano — assicurati di avere tutto pronto.',
    7: 'Manca davvero poco. Ultimi preparativi!',
    1: 'L\'attesa è finita. Domani inizia la tua avventura!',
  };

  const content = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr>${header(config.emoji, config.title, d.tripTitle)}</tr>
      <tr><td style="${body()}">

        <p style="margin:0 0 20px;font-size:14px;color:${C.textSecondary};line-height:1.7;">
          Ciao <strong style="color:${C.textPrimary};">${d.userName}</strong>, ${greetings[daysUntil] || greetings[7]}
        </p>

        ${infoBlock(
    infoRow('Destinazione', d.destination || '—')
    + infoRow('Partenza', fmtDate(d.startDate || ''))
    + infoRow('Ritorno', fmtDate(d.endDate || ''))
    + infoRow('Mancano', `${daysUntil} ${daysUntil === 1 ? 'giorno' : 'giorni'}`, true)
  )}

        ${sectionLabel('Checklist')}
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          ${config.items.map(item => listItem(item.t, item.d)).join('')}
        </table>

        ${btn('Vai al profilo →', `${FRONTEND_URL}/profilo`)}

      </td></tr>
    </table>`;
  return base(content, `${config.title} — ${d.tripTitle}`);
}


// ═══════════════════════════════════════════════════════════════════
//  PUBLIC API
// ═══════════════════════════════════════════════════════════════════

async function sendEmail(strapi: any, to: string, subject: string, html: string): Promise<void> {
  try {
    await strapi.plugin('email').service('email').send({
      to,
      from: FROM_EMAIL,
      subject,
      html,
    });
    console.log(`[Email] ✅ Sent "${subject}" to ${to}`);
  } catch (err: any) {
    console.error(`[Email] ❌ Failed "${subject}" to ${to}:`, err.message);
  }
}

export default {
  // ── HTML Generators (for /preview-email) ──────────────────────
  sendWelcomeEmailHtml: (name: string) => welcomeHtml(name),
  sendEmailConfirmationHtml: (name: string, url: string) => confirmationHtml(name, url),
  sendPasswordResetHtml: (name: string, url: string) => passwordResetHtml(name, url),
  sendBookingConfirmedHtml: (d: BookingEmailData) => bookingConfirmedHtml(d),
  sendPaymentReceiptHtml: (d: BookingEmailData, n: string, a: number) => paymentReceiptHtml(d, n, a),
  sendBookingCancelledHtml: (d: BookingEmailData) => bookingCancelledHtml(d),
  sendInstallmentReminderHtml: (d: BookingEmailData, n: string, a: number, dt: string, u: boolean) => installmentReminderHtml(d, n, a, dt, u),
  sendTripReminderHtml: (d: BookingEmailData, days: number) => tripReminderHtml(d, days),

  // ── Send Functions ────────────────────────────────────────────
  async sendWelcomeEmail(strapi: any, email: string, name: string) {
    await sendEmail(strapi, email, `Benvenuto, ${name}!`, welcomeHtml(name));
  },
  async sendEmailConfirmation(strapi: any, email: string, name: string, url: string) {
    await sendEmail(strapi, email, 'Conferma il tuo account', confirmationHtml(name, url));
  },
  async sendPasswordReset(strapi: any, email: string, name: string, url: string) {
    await sendEmail(strapi, email, 'Reset Password', passwordResetHtml(name, url));
  },
  async sendBookingConfirmed(strapi: any, email: string, d: BookingEmailData) {
    await sendEmail(strapi, email, `Prenotazione confermata — ${d.tripTitle}`, bookingConfirmedHtml(d));
  },
  async sendPaymentReceipt(strapi: any, email: string, d: BookingEmailData, stepName: string, stepAmount: number) {
    await sendEmail(strapi, email, `Pagamento ricevuto — ${fmt(stepAmount)}`, paymentReceiptHtml(d, stepName, stepAmount));
  },
  async sendBookingCancelled(strapi: any, email: string, d: BookingEmailData) {
    await sendEmail(strapi, email, `Prenotazione cancellata — ${d.tripTitle}`, bookingCancelledHtml(d));
  },
  async sendInstallmentReminder(strapi: any, email: string, d: BookingEmailData, stepName: string, stepAmount: number, dueDate: string, isUrgent: boolean) {
    const subj = isUrgent
      ? `Rata in scadenza oggi — ${fmt(stepAmount)}`
      : `Promemoria: ${stepName} entro il ${fmtDate(dueDate)}`;
    await sendEmail(strapi, email, subj, installmentReminderHtml(d, stepName, stepAmount, dueDate, isUrgent));
  },
  async sendTripReminder(strapi: any, email: string, d: BookingEmailData, daysUntil: number) {
    const titles: Record<number, string> = {
      30: 'Manca un mese a',
      14: 'Due settimane a',
      7: 'Una settimana a',
      1: 'Domani si parte per',
    };
    const prefix = titles[daysUntil] || 'Il viaggio si avvicina:';
    await sendEmail(strapi, email, `${prefix} ${d.tripTitle}`, tripReminderHtml(d, daysUntil));
  },
};
