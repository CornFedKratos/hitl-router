import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = 'HITL-AI-DLC <don@s3technology.io>';
const ADMIN_EMAIL = process.env.ADMIN_NOTIFY_EMAIL || 'don@s3technology.io';
const SITE_URL = process.env.SITE_URL || 'https://hitl-aidlc.s3technology.io';

/**
 * Send a notification email. Never throws — logs errors and returns false.
 * @param {'lead_captured'|'lead_abandoned'|'human_led'|'phase0_complete'|'phase0_complete_human_led'|'resume_link'} type
 * @param {object} data
 * @returns {Promise<boolean>}
 */
export async function sendNotification(type, data) {
  try {
    if (!process.env.RESEND_API_KEY) {
      console.warn('RESEND_API_KEY not set — skipping notification:', type);
      return false;
    }

    const email = buildEmail(type, data);
    if (!email) return false;

    await resend.emails.send(email);
    return true;
  } catch (err) {
    console.error(`Notification failed (${type}):`, err.message);
    return false;
  }
}

function buildEmail(type, data) {
  switch (type) {
    case 'lead_captured':
      return {
        from: FROM,
        to: ADMIN_EMAIL,
        subject: `New Lead: ${data.lead_name || data.lead_email || 'Unknown'}`,
        html: `
          <h2>New Lead Captured</h2>
          <p><strong>Name:</strong> ${esc(data.lead_name || '—')}</p>
          <p><strong>Email:</strong> ${esc(data.lead_email || '—')}</p>
          <p><strong>Problem:</strong> ${esc(data.problem || 'Not yet provided')}</p>
          <p><strong>Session:</strong> ${esc(data.session_id || '—')}</p>
          <p><strong>Time:</strong> ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })}</p>
          <p><a href="${SITE_URL}/admin">Open Lead Dashboard</a></p>
        `,
      };

    case 'lead_abandoned':
      return {
        from: FROM,
        to: ADMIN_EMAIL,
        subject: `Abandoned Session: ${data.lead_name || data.lead_email || 'Unknown'}`,
        html: `
          <h2>Session Abandoned</h2>
          <p><strong>Name:</strong> ${esc(data.lead_name || '—')}</p>
          <p><strong>Email:</strong> ${esc(data.lead_email || '—')}</p>
          <p><strong>Problem:</strong> ${esc(data.problem || 'Not provided')}</p>
          <p><strong>Partial Answers:</strong></p>
          <ul>${data.partial_answers ? Object.entries(data.partial_answers).map(([k, v]) => `<li><strong>${esc(k)}:</strong> ${esc(v)}</li>`).join('') : '<li>None captured</li>'}</ul>
          <p><strong>Session:</strong> ${esc(data.session_id || '—')}</p>
          <p><strong>Time:</strong> ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })}</p>
          <p><a href="${SITE_URL}/admin">Open Lead Dashboard</a></p>
        `,
      };

    case 'human_led':
      return {
        from: FROM,
        to: ADMIN_EMAIL,
        subject: `\uD83D\uDFE1 Human-Led Lead: ${data.lead_name || data.lead_email || 'Unknown'}`,
        html: `
          <h2>Human-Led Engagement Requested</h2>
          <p><strong>Name:</strong> ${esc(data.name || data.lead_name || '—')}</p>
          <p><strong>Email:</strong> ${esc(data.email || data.lead_email || '—')}</p>
          <p><strong>Problem:</strong> ${esc(data.problem || '—')}</p>
          <p><strong>Message:</strong> ${esc(data.message || 'No additional message')}</p>
          <p><strong>Session:</strong> ${esc(data.session_id || '—')}</p>
          <p><strong>Time:</strong> ${new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' })}</p>
          <p><a href="${SITE_URL}/admin">Open Lead Dashboard</a></p>
        `,
      };

    case 'phase0_complete':
      if (!data.lead_email) return null;
      return {
        from: FROM,
        to: data.lead_email,
        subject: 'Your project session is confirmed — here\'s what\'s next',
        html: `
          <h2>Phase 0 Complete</h2>
          <p>Your session has been saved. Here's a summary of what you told us:</p>
          <ul>
            <li><strong>Problem:</strong> ${esc(data.problem || '—')}</li>
            <li><strong>Solution:</strong> ${esc(data.solution || '—')}</li>
            <li><strong>Audience:</strong> ${esc(data.audience || '—')}</li>
          </ul>
          <p><strong>Session ID:</strong> ${esc(data.session_id || '—')}</p>
          ${data.session_id ? `<p><a href="${SITE_URL}/api/launcher?session=${data.session_id}">Download your project launcher</a></p>` : ''}
          <h3>What happens next?</h3>
          <p>Your project is ready for Phase 1 — detailed specification. Open the launcher file in Claude Code to continue building with the HITL-AI-DLC framework.</p>
          <p>Questions? Reply to this email or reach out at <a href="mailto:don@s3technology.io">don@s3technology.io</a>.</p>
          <p style="color:#888;font-size:12px;">S3 Technology &middot; HITL-AI-DLC</p>
        `,
      };

    case 'phase0_complete_human_led':
      if (!data.lead_email) return null;
      return {
        from: FROM,
        to: data.lead_email,
        subject: 'We received your request — Don will be in touch',
        html: `
          <h2>Your Request Has Been Received</h2>
          <p>Thanks for telling us about your project. Here's what you shared:</p>
          <ul>
            <li><strong>Problem:</strong> ${esc(data.problem || '—')}</li>
            <li><strong>Audience:</strong> ${esc(data.audience || '—')}</li>
          </ul>
          <h3>What happens next?</h3>
          <p>Don from S3 Technology will reach out within <strong>1 business day</strong> to discuss your project and next steps.</p>
          <p>In the meantime, learn more about us at <a href="https://s3technology.io">s3technology.io</a>.</p>
          <p>Questions? Reply to this email or reach out at <a href="mailto:don@s3technology.io">don@s3technology.io</a>.</p>
          <p style="color:#888;font-size:12px;">S3 Technology &middot; HITL-AI-DLC</p>
        `,
      };

    case 'resume_link':
      if (!data.lead_email || !data.resume_token) return null;
      return {
        from: FROM,
        to: data.lead_email,
        subject: 'Your project session is saved — pick up where you left off',
        html: `
          <h2>Your Session Is Saved</h2>
          ${data.lead_name ? `<p>Hi ${esc(data.lead_name)},</p>` : ''}
          <p>You started telling us about your project. Here's what we have so far:</p>
          ${data.problem ? `<p><strong>Problem:</strong> ${esc(data.problem)}</p>` : ''}
          <p>Pick up where you left off — your answers are saved for 7 days:</p>
          <p><a href="${SITE_URL}?resume=${data.resume_token}" style="display:inline-block;background:#3B9FE7;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Continue Your Session</a></p>
          <p style="color:#888;font-size:12px;">This link expires in 7 days. If it's expired, you can start a new session at <a href="${SITE_URL}">${SITE_URL}</a>.</p>
          <p style="color:#888;font-size:12px;">S3 Technology &middot; HITL-AI-DLC</p>
        `,
      };

    case 'payment_received':
      return {
        from: FROM,
        to: ADMIN_EMAIL,
        subject: `Payment received: ${data.lead_name || data.lead_email || 'Unknown'} — $${Math.round((data.amount || 0) / 100)}`,
        html: `
          <h2>Payment Received</h2>
          <p><strong>Name:</strong> ${esc(data.lead_name || '—')}</p>
          <p><strong>Email:</strong> ${esc(data.lead_email || '—')}</p>
          <p><strong>Amount:</strong> $${Math.round((data.amount || 0) / 100)}</p>
          <p><strong>Tier:</strong> ${esc(data.tier || '—')}</p>
          <p><strong>Problem:</strong> ${esc(data.problem || '—')}</p>
          <p><strong>Session:</strong> ${esc(data.session_id || '—')}</p>
          <p>Build engine is running. Artifacts will be delivered to the lead automatically.</p>
          <p><a href="${SITE_URL}/admin">Open Lead Dashboard</a></p>
        `,
      };

    case 'build_complete':
      return {
        from: FROM,
        to: ADMIN_EMAIL,
        subject: `Build complete: ${data.lead_name || data.lead_email || 'Unknown'} — ${data.tier || 'unknown tier'}`,
        html: `
          <h2>Build Complete</h2>
          <p><strong>Name:</strong> ${esc(data.lead_name || '—')}</p>
          <p><strong>Email:</strong> ${esc(data.lead_email || '—')}</p>
          <p><strong>Problem:</strong> ${esc(data.problem || '—')}</p>
          <p><strong>Tier:</strong> ${esc(data.tier || '—')}</p>
          <p><strong>Payment:</strong> $${Math.round((data.payment_amount || 0) / 100)}</p>
          <p>Artifacts have been delivered to the lead. Check if they need hosting or ongoing support.</p>
          <p><a href="${SITE_URL}/admin">Open Lead Dashboard</a></p>
        `,
      };

    case 'nurture':
      if (!data.lead_email) return null;
      return {
        from: FROM,
        to: data.lead_email,
        replyTo: 'don@s3technology.io',
        subject: 'Still thinking about your project?',
        html: `
          ${data.lead_name ? `<p>Hi ${esc(data.lead_name)},</p>` : '<p>Hi,</p>'}
          <p>A couple days ago you told us about ${esc(data.problem || 'your project')}.</p>
          <p>These decisions take time — totally normal.</p>
          <p>If you're ready to take the next step, your 3 project directions are still saved:</p>
          ${data.resume_token ? `<p><a href="${SITE_URL}?resume=${data.resume_token}" style="display:inline-block;background:#3B9FE7;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">View Your Directions</a></p>` : ''}
          <p>Or just reply to this email — I read every one.</p>
          <p style="margin-top:24px;">
            <strong>Don Schminkey</strong><br>
            Founder, S3 Technology<br>
            <a href="mailto:don@s3technology.io" style="color:#3B9FE7;">don@s3technology.io</a><br>
            <a href="https://s3technology.io" style="color:#3B9FE7;">s3technology.io</a>
          </p>
          <p style="color:#888;font-size:12px;">S3 Technology &middot; HITL-AI-DLC</p>
        `,
      };

    case 'mockup_retry_exhausted':
      return {
        from: FROM,
        to: ADMIN_EMAIL,
        subject: `Mockup generation failed: ${data.lead_name || data.lead_email || 'Unknown'}`,
        html: `
          <h2>Mockup Generation Failed (Retry Limit Reached)</h2>
          <p>A lead's mockup generation failed after ${data.retry_count || 2} attempts.</p>
          <p><strong>Name:</strong> ${esc(data.lead_name || '—')}</p>
          <p><strong>Email:</strong> ${esc(data.lead_email || '—')}</p>
          <p><strong>Problem:</strong> ${esc(data.problem || '—')}</p>
          <p><strong>Session:</strong> ${esc(data.session_id || '—')}</p>
          <p>The lead has been told you'll follow up. Check the session in the dashboard.</p>
          <p><a href="${SITE_URL}/admin">Open Lead Dashboard</a></p>
        `,
      };

    case 'recovery_link':
      if (!data.lead_email || !data.recovery_token) return null;
      return {
        from: FROM,
        to: data.lead_email,
        subject: 'Access your HITL-AI-DLC session from this device',
        html: `
          <h2>Session Recovery Link</h2>
          <p>You requested access to your project session from another device.</p>
          <p>Click below to restore your session:</p>
          <p><a href="${SITE_URL}?recover=${data.recovery_token}" style="display:inline-block;background:#3B9FE7;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;">Open My Session</a></p>
          <p style="color:#888;font-size:12px;">This link expires when your session expires (7 days from creation). If it's expired, start a new session at <a href="${SITE_URL}">${SITE_URL}</a>.</p>
          <p style="color:#888;font-size:12px;">S3 Technology &middot; HITL-AI-DLC</p>
        `,
      };

    default:
      console.warn('Unknown notification type:', type);
      return null;
  }
}

function esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
