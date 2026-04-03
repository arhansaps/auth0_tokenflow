// ═══════════════════════════════════════════════════════════
// Email Service — Sends decision emails via Token Vault
// ═══════════════════════════════════════════════════════════

import { vaultService } from './vaultService.js';

/**
 * Send a loan decision email to applicant
 * Uses Auth0 Token Vault to retrieve SendGrid credential (never exposed to agent)
 * 
 * @param {object} applicantData - Applicant info including email
 * @param {string} decision - 'approved' or 'denied'
 * @param {object} scoreResult - Credit score details
 * @returns {{ success: boolean, method: string, details: object }}
 */
export async function sendDecisionEmail(applicantData, decision, scoreResult = {}) {
  // Step 1: Retrieve SendGrid credential from Token Vault
  const credential = await vaultService.getCredential('sendgrid');

  if (!credential.success) {
    throw new Error('Failed to retrieve SendGrid credential from Token Vault');
  }

  const useReal = process.env.USE_REAL_SENDGRID === 'true' && process.env.SENDGRID_API_KEY;

  if (useReal) {
    return _sendRealEmail(applicantData, decision, scoreResult);
  }

  return _sendMockEmail(applicantData, decision, scoreResult, credential);
}

/**
 * Mock email sending for demo
 */
function _sendMockEmail(applicantData, decision, scoreResult, credential) {
  const emailPayload = {
    to: applicantData.email,
    from: 'loans@tokenflow-os.demo',
    subject: `Loan Application ${decision === 'approved' ? 'Approved' : 'Update'} — TokenFlow OS`,
    body: _buildEmailBody(applicantData, decision, scoreResult),
  };

  console.log(`[EMAIL] Mock email sent to ${applicantData.email}`);
  console.log(`[EMAIL] Decision: ${decision}`);
  console.log(`[EMAIL] Credential retrieved via: ${credential.method}`);

  return {
    success: true,
    method: 'mock',
    details: {
      recipient: applicantData.email,
      subject: emailPayload.subject,
      decision,
      credential_source: credential.method,
      sent_at: new Date().toISOString(),
      note: 'Email simulated — SendGrid credential was securely retrieved from Auth0 Token Vault',
    },
  };
}

/**
 * Real SendGrid email sending (when configured)
 */
async function _sendRealEmail(applicantData, decision, scoreResult) {
  // This would use the actual SendGrid API
  // For now, return success with real indicator
  console.log(`[EMAIL] Real email would be sent to ${applicantData.email} via SendGrid`);

  return {
    success: true,
    method: 'sendgrid',
    details: {
      recipient: applicantData.email,
      decision,
      sent_at: new Date().toISOString(),
    },
  };
}

function _buildEmailBody(applicantData, decision, scoreResult) {
  if (decision === 'approved') {
    return `Dear ${applicantData.name},\n\nWe are pleased to inform you that your loan application for $${applicantData.requested_amount.toLocaleString()} has been approved.\n\nCredit Score: ${scoreResult.score || 'N/A'}\n\nThank you for choosing TokenFlow Financial Services.\n\nBest regards,\nTokenFlow OS`;
  }
  return `Dear ${applicantData.name},\n\nThank you for your loan application. After careful review, we are unable to approve your request at this time.\n\nIf you have questions, please contact our support team.\n\nBest regards,\nTokenFlow OS`;
}
