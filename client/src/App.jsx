import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertTriangle,
  BadgeCheck,
  Database,
  Flame,
  Gauge,
  Play,
  RefreshCcw,
  ShieldAlert,
  ShieldCheck,
  SquareActivity,
  TimerReset,
  Wifi,
  Workflow,
} from 'lucide-react';
import { api, getWebSocketUrl } from './api.js';

const STEP_ORDER = [
  'READ_APPLICANT_DATA',
  'RUN_CREDIT_SCORE',
  'APPROVE_OR_DENY',
  'SEND_DECISION_EMAIL',
];

const STATUS_STYLES = {
  idle: 'border-slate-800 bg-slate-950/70 text-slate-500',
  pending: 'border-slate-700 bg-slate-900 text-slate-300',
  active: 'border-cyan-500/70 bg-cyan-500/12 text-cyan-200 shadow-[0_0_22px_rgba(34,211,238,0.2)]',
  burned: 'border-emerald-500/70 bg-emerald-500/12 text-emerald-200 shadow-[0_0_22px_rgba(16,185,129,0.18)]',
  revoked: 'border-rose-500/70 bg-rose-500/12 text-rose-200 shadow-[0_0_22px_rgba(244,63,94,0.18)]',
  flagged: 'border-amber-400/80 bg-amber-400/14 text-amber-100 shadow-[0_0_26px_rgba(245,158,11,0.2)]',
};

const EVENT_STYLES = {
  MINTED: 'text-cyan-300',
  ACTIVATED: 'text-sky-300',
  BURNED: 'text-emerald-300',
  REVOKED: 'text-rose-300',
  FLAGGED: 'text-amber-300',
  EXPIRED: 'text-rose-300',
};

export default function App() {
  const [overview, setOverview] = useState(null);
  const [health, setHealth] = useState(null);
  const [applicants, setApplicants] = useState([]);
  const [selectedApplicant, setSelectedApplicant] = useState('APP-001');
  const [selectedWorkflowId, setSelectedWorkflowId] = useState(null);
  const [chain, setChain] = useState([]);
  const [audit, setAudit] = useState([]);
  const [busyAction, setBusyAction] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [socketState, setSocketState] = useState('connecting');
  const refreshTimeoutRef = useRef(null);

  const workflows = overview?.workflows || [];
  const currentWorkflow = workflows.find((workflow) => workflow.id === selectedWorkflowId) || workflows[0] || null;
  const reviewQueue = overview?.reviewQueue || [];
  const currentReview = reviewQueue.find((item) => item.workflowId === selectedWorkflowId) || reviewQueue[0] || null;
  const credentials = overview?.credentials || [];

  const tokensByAction = new Map(chain.map((token) => [token.action_type, token]));
  const chainNodes = STEP_ORDER.map((action, index) => {
    const token = tokensByAction.get(action);
    return {
      id: token?.id || `${action}-${index}`,
      action,
      status: token?.status || 'idle',
      mintedAt: token?.minted_at || null,
      token,
    };
  });

  async function loadDashboard(preferredWorkflowId) {
    const [overviewResponse, healthResponse, applicantResponse] = await Promise.all([
      api('/api/dashboard/overview'),
      api('/api/health'),
      api('/api/workflows/applicants/list'),
    ]);

    setOverview(overviewResponse);
    setHealth(healthResponse);
    setApplicants(applicantResponse.applicants || []);

    if (preferredWorkflowId) {
      setSelectedWorkflowId(preferredWorkflowId);
      return;
    }

    setSelectedWorkflowId((current) => {
      if (current && overviewResponse.workflows.some((workflow) => workflow.id === current)) {
        return current;
      }
      return overviewResponse.workflows[0]?.id || null;
    });
  }

  async function loadWorkflowDetails(workflowId) {
    if (!workflowId) {
      setChain([]);
      setAudit([]);
      return;
    }

    const [chainResponse, auditResponse] = await Promise.all([
      api(`/api/tokens/chain/${workflowId}`),
      api(`/api/tokens/audit?workflowId=${workflowId}`),
    ]);

    setChain(chainResponse.chain || []);
    setAudit(auditResponse.audit_log || []);
  }

  useEffect(() => {
    loadDashboard().catch((loadError) => setError(loadError.message));
  }, []);

  useEffect(() => {
    loadWorkflowDetails(selectedWorkflowId).catch((loadError) => setError(loadError.message));
  }, [selectedWorkflowId]);

  useEffect(() => {
    const socket = new WebSocket(getWebSocketUrl());

    socket.addEventListener('open', () => setSocketState('live'));
    socket.addEventListener('close', () => setSocketState('offline'));
    socket.addEventListener('error', () => setSocketState('degraded'));
    socket.addEventListener('message', (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.type === 'BIAS_FLAG') {
          setNotice('Bias anomaly detected. Review queue updated.');
        }
      } catch {
        // Ignore malformed messages.
      }

      window.clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = window.setTimeout(() => {
        loadDashboard()
          .then(() => loadWorkflowDetails(selectedWorkflowId))
          .catch((loadError) => setError(loadError.message));
      }, 250);
    });

    return () => {
      window.clearTimeout(refreshTimeoutRef.current);
      socket.close();
    };
  }, [selectedWorkflowId]);

  useEffect(() => {
    if (!notice && !error) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setNotice('');
      setError('');
    }, 4200);

    return () => window.clearTimeout(timeoutId);
  }, [notice, error]);

  async function withBusyState(name, fn) {
    setBusyAction(name);
    setError('');
    try {
      await fn();
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setBusyAction('');
    }
  }

  function handleStartWorkflow() {
    withBusyState('start', async () => {
      const response = await api('/api/workflows/start', {
        method: 'POST',
        body: JSON.stringify({ applicantId: selectedApplicant }),
      });

      setNotice(`Workflow ${response.workflowId} started.`);
      await loadDashboard(response.workflowId);
      await loadWorkflowDetails(response.workflowId);
    });
  }

  function handleResume(workflowId) {
    withBusyState('resume', async () => {
      await api(`/api/workflows/${workflowId}/resume`, { method: 'POST' });
      setNotice('Workflow resumed.');
      await loadDashboard(workflowId);
      await loadWorkflowDetails(workflowId);
    });
  }

  function handleRevoke(workflowId) {
    withBusyState('revoke', async () => {
      await api(`/api/workflows/${workflowId}/revoke`, { method: 'POST' });
      setNotice('Workflow revoked.');
      await loadDashboard(workflowId);
      await loadWorkflowDetails(workflowId);
    });
  }

  function handleKill(workflowId) {
    if (!workflowId) {
      return;
    }

    withBusyState('kill', async () => {
      await api(`/api/workflows/${workflowId}/kill`, { method: 'POST' });
      setNotice('Kill switch engaged.');
      await loadDashboard(workflowId);
      await loadWorkflowDetails(workflowId);
    });
  }

  function handleRefresh() {
    withBusyState('refresh', async () => {
      await loadDashboard();
      await loadWorkflowDetails(selectedWorkflowId);
      setNotice('Mission data refreshed.');
    });
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(34,211,238,0.08),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(245,158,11,0.08),transparent_20%),linear-gradient(180deg,#020617_0%,#020617_42%,#111827_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen max-w-[1600px] flex-col px-4 py-4 md:px-6 lg:px-8">
        <header className="grid gap-4 border border-slate-800 bg-slate-950/85 px-5 py-5 shadow-[0_0_0_1px_rgba(15,23,42,0.65),0_30px_80px_rgba(2,6,23,0.55)] backdrop-blur xl:grid-cols-[1.15fr_0.85fr]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <span className="border border-cyan-400/40 bg-cyan-400/10 px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.28em] text-cyan-200">
                Authorized to Act
              </span>
              <span className="border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.28em] text-amber-200">
                Loan Runtime Demo
              </span>
            </div>
            <div className="max-w-4xl space-y-3">
              <p className="font-mono text-xs uppercase tracking-[0.32em] text-slate-400">TokenFlow OS Mission Control</p>
              <h1 className="max-w-5xl text-4xl font-semibold tracking-tight text-white md:text-6xl">
                Capability-gated AI execution with human interruption built into the flow.
              </h1>
              <p className="max-w-3xl text-sm leading-7 text-slate-400 md:text-base">
                Every agent step is minted as a single-use token, streamed into an immutable audit trail, and paused the moment
                confidence or geography suggests possible bias.
              </p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-2">
            <MetricTile icon={<Workflow className="h-4 w-4" />} label="Workflows" value={String(workflows.length).padStart(2, '0')} tone="cyan" detail="Tracked chains" />
            <MetricTile icon={<ShieldAlert className="h-4 w-4" />} label="Review Queue" value={String(reviewQueue.length).padStart(2, '0')} tone="amber" detail="Paused for humans" />
            <MetricTile icon={<Database className="h-4 w-4" />} label="Vault Links" value={String(credentials.length).padStart(2, '0')} tone="emerald" detail="Token Vault records" />
            <MetricTile icon={<Wifi className="h-4 w-4" />} label="Realtime" value={socketState.toUpperCase()} tone={socketState === 'live' ? 'emerald' : 'amber'} detail="WebSocket status" />
          </div>
        </header>

        <AnimatePresence>
          {(notice || error) && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className={`mt-4 border px-4 py-3 font-mono text-sm ${error ? 'border-rose-500/40 bg-rose-500/10 text-rose-100' : 'border-cyan-500/40 bg-cyan-500/10 text-cyan-100'}`}
            >
              {error || notice}
            </motion.div>
          )}
        </AnimatePresence>

        <main className="mt-4 grid flex-1 gap-4 xl:grid-cols-[300px_minmax(0,1fr)_360px]">
          <motion.aside initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col gap-4 border border-slate-800 bg-slate-950/80 p-4">
            <section className="space-y-4 border border-slate-800 bg-slate-950/60 p-4">
              <PanelHeading icon={<Play className="h-4 w-4" />} title="Launch Demo" subtitle="Trigger the loan workflow" />
              <div className="space-y-3">
                <label className="space-y-2 text-sm text-slate-400">
                  <span className="font-mono uppercase tracking-[0.22em] text-slate-500">Applicant</span>
                  <select value={selectedApplicant} onChange={(event) => setSelectedApplicant(event.target.value)} className="w-full border border-slate-700 bg-slate-950 px-3 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400">
                    {applicants.map((applicant) => (
                      <option key={applicant.id} value={applicant.id}>
                        {applicant.name} ({applicant.zip_code})
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" onClick={handleStartWorkflow} disabled={busyAction === 'start'} className="w-full border border-cyan-400/50 bg-cyan-400/12 px-4 py-3 font-mono text-sm uppercase tracking-[0.2em] text-cyan-100 transition hover:bg-cyan-400/18 disabled:cursor-not-allowed disabled:opacity-50">
                  {busyAction === 'start' ? 'Starting...' : 'Start Loan Chain'}
                </button>
                <button type="button" onClick={handleRefresh} disabled={busyAction === 'refresh'} className="flex w-full items-center justify-center gap-2 border border-slate-700 px-4 py-3 font-mono text-sm uppercase tracking-[0.2em] text-slate-300 transition hover:border-slate-500 hover:text-white disabled:opacity-50">
                  <RefreshCcw className="h-4 w-4" />
                  Refresh
                </button>
              </div>
            </section>

            <section className="space-y-4 border border-slate-800 bg-slate-950/60 p-4">
              <PanelHeading icon={<SquareActivity className="h-4 w-4" />} title="Workflow Queue" subtitle="Select an active or historical run" />
              <div className="max-h-[320px] space-y-2 overflow-auto pr-1">
                {workflows.length === 0 && <EmptyState label="No workflows yet. Start the demo to mint the first chain." />}
                {workflows.map((workflow) => (
                  <button key={workflow.id} type="button" onClick={() => setSelectedWorkflowId(workflow.id)} className={`w-full border px-3 py-3 text-left transition ${workflow.id === currentWorkflow?.id ? 'border-cyan-400/60 bg-cyan-400/10' : 'border-slate-800 bg-slate-950/70 hover:border-slate-600'}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-slate-500">{workflow.id}</p>
                        <p className="mt-1 text-sm font-medium text-white">{workflow.name}</p>
                      </div>
                      <StatusPill status={workflow.status} />
                    </div>
                    <p className="mt-2 text-xs text-slate-400">{workflow.applicant_data?.name || 'Unknown applicant'} - step {workflow.current_step}</p>
                  </button>
                ))}
              </div>
            </section>

            <section className="space-y-4 border border-slate-800 bg-slate-950/60 p-4">
              <PanelHeading icon={<Database className="h-4 w-4" />} title="Token Vault" subtitle="Credentials visible by name only" />
              <div className="space-y-2">
                {credentials.map((credential) => (
                  <div key={credential.id} className="flex items-center justify-between border border-slate-800 bg-slate-950/70 px-3 py-2">
                    <div>
                      <p className="text-sm text-slate-200">{credential.display_name}</p>
                      <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-slate-500">{credential.connection_type}</p>
                    </div>
                    <span className="text-xs uppercase tracking-[0.24em] text-emerald-300">{credential.status}</span>
                  </div>
                ))}
              </div>
            </section>
          </motion.aside>

          <div className="grid gap-4">
            <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="border border-slate-800 bg-slate-950/80 p-4">
              <PanelHeading icon={<Workflow className="h-4 w-4" />} title="Live Token Chain" subtitle="Single-use capability tokens driving the current workflow" />
              <div className="mt-5 overflow-x-auto">
                <div className="min-w-[880px]">
                  <div className="grid grid-cols-4 gap-4">
                    {chainNodes.map((node, index) => (
                      <motion.div key={node.id} layout initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }} className={`relative border p-4 ${STATUS_STYLES[node.status] || STATUS_STYLES.idle}`}>
                        {index < chainNodes.length - 1 && <div className="absolute left-[calc(100%+8px)] top-1/2 hidden h-px w-4 bg-slate-700 md:block" />}
                        <p className="font-mono text-[11px] uppercase tracking-[0.24em] text-slate-500">Token {String(index + 1).padStart(2, '0')}</p>
                        <h3 className="mt-4 text-lg font-semibold text-white">{formatAction(node.action)}</h3>
                        <div className="mt-4 flex items-center justify-between gap-3">
                          <StatusPill status={node.status} />
                          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-slate-500">{node.token?.id || 'awaiting mint'}</p>
                        </div>
                        <p className="mt-3 text-xs leading-6 text-slate-400">{node.mintedAt ? formatTimestamp(node.mintedAt) : 'Token will be minted only after policy and parent-chain checks pass.'}</p>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.section>

            <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
              <motion.section initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="border border-slate-800 bg-slate-950/80 p-4">
                <PanelHeading icon={<TimerReset className="h-4 w-4" />} title="Audit Log Feed" subtitle="Immutable token lifecycle events with timestamps and actors" />
                <div className="mt-4 max-h-[520px] space-y-2 overflow-auto pr-1">
                  {audit.length === 0 && <EmptyState label="Audit events will stream here once a workflow starts." />}
                  {audit.map((entry) => (
                    <motion.div key={`${entry.id}-${entry.timestamp}`} initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} className="grid gap-2 border border-slate-800 bg-slate-950/70 px-4 py-3 md:grid-cols-[auto_1fr_auto]">
                      <span className={`font-mono text-xs uppercase tracking-[0.22em] ${EVENT_STYLES[entry.event_type] || 'text-slate-300'}`}>{entry.event_type}</span>
                      <div className="text-sm text-slate-300">
                        <p>{describeAuditEntry(entry)}</p>
                        <p className="mt-1 font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">{entry.token_id}</p>
                      </div>
                      <div className="text-right text-xs text-slate-500">
                        <p>{formatTimestamp(entry.timestamp)}</p>
                        <p className="mt-1 uppercase tracking-[0.24em]">{entry.actor}</p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </motion.section>

              <div className="grid gap-4">
                <motion.section initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="border border-slate-800 bg-slate-950/80 p-4">
                  <PanelHeading icon={<Gauge className="h-4 w-4" />} title="Runtime Status" subtitle="Current workflow, policy threshold, and chain health" />
                  <div className="mt-4 grid gap-3">
                    <InfoRow label="Selected workflow" value={currentWorkflow?.id || 'none'} />
                    <InfoRow label="Applicant" value={currentWorkflow?.applicant_data?.name || 'not started'} />
                    <InfoRow label="State" value={currentWorkflow?.status || 'idle'} />
                    <InfoRow label="Current step" value={currentWorkflow ? String(currentWorkflow.current_step) : '0'} />
                    <InfoRow label="Fairness threshold" value="0.20" />
                    <InfoRow label="Auth mode" value={health?.auth0 || 'loading'} />
                  </div>
                  <button type="button" onClick={() => handleKill(currentWorkflow?.id)} disabled={!currentWorkflow || busyAction === 'kill'} className="mt-5 flex w-full items-center justify-center gap-2 border border-rose-500/40 bg-rose-500/10 px-4 py-3 font-mono text-sm uppercase tracking-[0.2em] text-rose-100 transition hover:bg-rose-500/16 disabled:cursor-not-allowed disabled:opacity-40">
                    <Flame className="h-4 w-4" />
                    {busyAction === 'kill' ? 'Halting...' : 'Kill Switch'}
                  </button>
                </motion.section>

                <motion.section initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} className="border border-slate-800 bg-slate-950/80 p-4">
                  <PanelHeading icon={<AlertTriangle className="h-4 w-4" />} title="Human Review Panel" subtitle="Intervene the moment a confidence anomaly or flagged ZIP appears" />
                  {currentReview ? (
                    <div className="mt-4 space-y-4">
                      <div className="border border-amber-400/30 bg-amber-400/10 p-4">
                        <p className="font-mono text-xs uppercase tracking-[0.24em] text-amber-200">Flagged workflow</p>
                        <h3 className="mt-2 text-xl font-semibold text-white">{currentReview.workflowName}</h3>
                        <p className="mt-2 text-sm leading-7 text-slate-300">{currentReview.review?.summary || 'Manual intervention required.'}</p>
                      </div>
                      <div className="grid gap-3 text-sm text-slate-300 md:grid-cols-2">
                        <ReviewFact label="Applicant" value={currentReview.applicant?.name} />
                        <ReviewFact label="ZIP code" value={currentReview.applicant?.zip_code} />
                        <ReviewFact label="Score" value={String(currentReview.review?.score ?? currentReview.review?.scoreResult?.score ?? 'n/a')} />
                        <ReviewFact label="Confidence" value={formatConfidence(currentReview.review?.confidence ?? currentReview.review?.scoreResult?.confidence)} />
                      </div>
                      <div className="space-y-2">
                        {(currentReview.review?.flags || []).map((flag) => (
                          <div key={flag.type} className="border border-slate-800 bg-slate-950/70 px-3 py-3 text-sm text-slate-300">
                            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-amber-200">{flag.type}</p>
                            <p className="mt-1 leading-6">{flag.message}</p>
                          </div>
                        ))}
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        <button type="button" onClick={() => handleResume(currentReview.workflowId)} disabled={busyAction === 'resume'} className="border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 font-mono text-sm uppercase tracking-[0.2em] text-emerald-100 transition hover:bg-emerald-500/16 disabled:opacity-50">
                          {busyAction === 'resume' ? 'Resuming...' : 'Resume Chain'}
                        </button>
                        <button type="button" onClick={() => handleRevoke(currentReview.workflowId)} disabled={busyAction === 'revoke'} className="border border-rose-500/40 bg-rose-500/10 px-4 py-3 font-mono text-sm uppercase tracking-[0.2em] text-rose-100 transition hover:bg-rose-500/16 disabled:opacity-50">
                          {busyAction === 'revoke' ? 'Revoking...' : 'Revoke Chain'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 border border-slate-800 bg-slate-950/70 p-4 text-sm leading-7 text-slate-400">
                      No workflow is currently paused for human review. Start applicant <span className="font-mono text-amber-200">APP-001</span> to trigger the ZIP-code anomaly path.
                    </div>
                  )}
                </motion.section>
              </div>
            </div>
          </div>

          <motion.aside initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="flex flex-col gap-4 border border-slate-800 bg-slate-950/80 p-4">
            <section className="space-y-4 border border-slate-800 bg-slate-950/60 p-4">
              <PanelHeading icon={<ShieldCheck className="h-4 w-4" />} title="Capability Rules" subtitle="What the agent cannot do" />
              <ul className="space-y-3 text-sm leading-7 text-slate-300">
                <li>Every action is single-use and dies once consumed.</li>
                <li>Future steps cannot mint until the parent token burns cleanly.</li>
                <li>Reviewers can pause, resume, revoke, or kill any chain in flight.</li>
                <li>Credentials stay in Auth0 Token Vault; only brokered actions leave the backend.</li>
              </ul>
            </section>

            <section className="space-y-4 border border-slate-800 bg-slate-950/60 p-4">
              <PanelHeading icon={<BadgeCheck className="h-4 w-4" />} title="Workflow Snapshot" subtitle="Current applicant and token summary" />
              {currentWorkflow ? (
                <div className="space-y-3 text-sm text-slate-300">
                  <div className="border border-slate-800 bg-slate-950/70 p-3">
                    <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">Applicant</p>
                    <p className="mt-2 text-lg text-white">{currentWorkflow.applicant_data?.name}</p>
                    <p className="mt-1 text-slate-400">{currentWorkflow.applicant_data?.employment_status} - ${Number(currentWorkflow.applicant_data?.requested_amount || 0).toLocaleString()}</p>
                  </div>
                  <div className="grid gap-2">
                    {Object.entries(currentWorkflow.token_summary || {}).map(([status, count]) => (
                      <div key={status} className="flex items-center justify-between border border-slate-800 bg-slate-950/70 px-3 py-2">
                        <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">{status}</span>
                        <span className="text-sm text-white">{count}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <EmptyState label="Workflow telemetry appears here once a chain is active." />
              )}
            </section>
          </motion.aside>
        </main>
      </div>
    </div>
  );
}

function MetricTile({ icon, label, value, tone, detail }) {
  const toneClass = {
    cyan: 'border-cyan-400/30 bg-cyan-400/8 text-cyan-100',
    amber: 'border-amber-400/30 bg-amber-400/8 text-amber-100',
    emerald: 'border-emerald-400/30 bg-emerald-400/8 text-emerald-100',
  }[tone];

  return (
    <div className={`border px-4 py-4 ${toneClass}`}>
      <div className="flex items-center justify-between text-xs uppercase tracking-[0.22em]">
        <span className="font-mono">{label}</span>
        {icon}
      </div>
      <p className="mt-6 text-3xl font-semibold tracking-tight">{value}</p>
      <p className="mt-2 text-xs uppercase tracking-[0.22em] text-slate-400">{detail}</p>
    </div>
  );
}

function PanelHeading({ icon, title, subtitle }) {
  return (
    <div>
      <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.24em] text-slate-500">
        {icon}
        {title}
      </p>
      <p className="mt-2 text-sm text-slate-400">{subtitle}</p>
    </div>
  );
}

function StatusPill({ status }) {
  return <span className={`inline-flex items-center border px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.24em] ${STATUS_STYLES[status] || STATUS_STYLES.idle}`}>{status}</span>;
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-4 border border-slate-800 bg-slate-950/70 px-3 py-2">
      <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">{label}</span>
      <span className="text-sm text-white">{value}</span>
    </div>
  );
}

function ReviewFact({ label, value }) {
  return (
    <div className="border border-slate-800 bg-slate-950/70 px-3 py-3">
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-slate-500">{label}</p>
      <p className="mt-2 text-base text-white">{value || 'n/a'}</p>
    </div>
  );
}

function EmptyState({ label }) {
  return <div className="border border-dashed border-slate-800 bg-slate-950/70 px-4 py-5 text-sm leading-7 text-slate-500">{label}</div>;
}

function formatAction(action) {
  return action
    .split('_')
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ');
}

function formatTimestamp(value) {
  if (!value) {
    return 'n/a';
  }

  return new Date(value).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function describeAuditEntry(entry) {
  const details = entry.details || {};

  if (entry.event_type === 'FLAGGED') {
    return details.summary || 'Bias review triggered.';
  }
  if (entry.event_type === 'REVOKED') {
    return details.reason || 'Token revoked.';
  }
  if (entry.event_type === 'MINTED') {
    return `Token minted for ${formatAction(details.actionType || 'UNKNOWN')}.`;
  }
  if (entry.event_type === 'BURNED') {
    return 'Token consumed and burned after action execution.';
  }
  if (entry.event_type === 'ACTIVATED') {
    return 'Token moved from pending to active.';
  }

  return 'Lifecycle event recorded.';
}

function formatConfidence(value) {
  if (typeof value !== 'number') {
    return 'n/a';
  }

  return `${(value * 100).toFixed(1)}%`;
}
