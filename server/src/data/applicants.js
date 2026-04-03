// ═══════════════════════════════════════════════════════════
// Mock Applicant Data for Demo
// ═══════════════════════════════════════════════════════════

// Applicant that WILL trigger bias flag (flagged ZIP + low confidence)
export const APPLICANT_FLAGGED = {
  id: 'APP-001',
  name: 'Jordan Williams',
  email: 'jordan.williams@example.com',
  zip_code: '48201',          // Detroit — flagged ZIP
  income: 72000,
  requested_amount: 25000,
  employment_status: 'employed',
  employment_years: 5,
  dob: '1988-03-15',
  ssn_last4: '7823',
};

// Applicant that will pass cleanly
export const APPLICANT_CLEAN = {
  id: 'APP-002',
  name: 'Sarah Chen',
  email: 'sarah.chen@example.com',
  zip_code: '94102',          // San Francisco — not flagged
  income: 95000,
  requested_amount: 30000,
  employment_status: 'employed',
  employment_years: 8,
  dob: '1990-07-22',
  ssn_last4: '4156',
};

// Additional test applicants
export const APPLICANT_EDGE = {
  id: 'APP-003',
  name: 'Marcus Rivera',
  email: 'marcus.rivera@example.com',
  zip_code: '90210',          // Beverly Hills — flagged ZIP (high income area bias)
  income: 45000,
  requested_amount: 50000,
  employment_status: 'self-employed',
  employment_years: 2,
  dob: '1995-11-08',
  ssn_last4: '3391',
};

export const ALL_APPLICANTS = [APPLICANT_FLAGGED, APPLICANT_CLEAN, APPLICANT_EDGE];

export function getApplicantById(id) {
  return ALL_APPLICANTS.find(a => a.id === id) || null;
}
