import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../api.js';

const M = ({ icon, className = '', style }) => (
  <span className={`material-symbols-outlined ${className}`} style={style}>{icon}</span>
);

/* ═══════════════════════════════════════════════════════════
   TESTBENCH PAGE — Security invariant verification
   ═══════════════════════════════════════════════════════════ */
export default function TestbenchPage() {
  const [scenarios, setScenarios] = useState([]);
  const [results, setResults] = useState([]);
  const [suiteResult, setSuiteResult] = useState(null);
  const [running, setRunning] = useState('');
  const [expandedRun, setExpandedRun] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/api/testbench/scenarios').then(d => setScenarios(d.scenarios || [])).catch(e => setError(e.message));
    api('/api/testbench/results?limit=20').then(d => setResults(d.results || [])).catch(() => {});
  }, []);

  async function runSingle(scenarioId) {
    setRunning(scenarioId);
    setError('');
    try {
      const r = await api('/api/testbench/run', { method: 'POST', body: JSON.stringify({ scenarioId }) });
      setResults(prev => [r, ...prev]);
      setExpandedRun(r.runId);
    } catch (e) { setError(e.message); }
    setRunning('');
  }

  async function runSuite() {
    setRunning('suite');
    setError('');
    setSuiteResult(null);
    try {
      const r = await api('/api/testbench/run-suite', { method: 'POST' });
      setSuiteResult(r);
      setResults(r.results || []);
    } catch (e) { setError(e.message); }
    setRunning('');
  }

  const categoryColors = { safe: 'var(--success)', attack: 'var(--error)', control: 'var(--warning)' };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {/* Header */}
      <div className="text-center mb-8">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: 'linear-gradient(135deg, var(--secondary), var(--primary-container))', boxShadow: '0 0 30px rgba(166,230,255,0.2)' }}>
          <M icon="science" style={{ fontSize: 32, color: 'var(--on-secondary)' }} />
        </div>
        <h2 className="text-2xl font-bold font-headline tracking-tight">Security Testbench</h2>
        <p className="text-sm mt-2 max-w-lg mx-auto" style={{ color: 'var(--on-surface-variant)' }}>
          Run attack scenarios against the TokenFlow engine and validate 12 security invariants.
        </p>
      </div>

      {/* Explanation Card */}
      <div className="card p-6 mb-8">
        <div className="flex items-start gap-4">
          <div className="p-2.5 rounded-xl flex-shrink-0" style={{ background: 'rgba(166,230,255,0.1)' }}>
            <M icon="info" style={{ fontSize: 20, color: 'var(--secondary)' }} />
          </div>
          <div>
            <h4 className="text-sm font-bold font-headline mb-2">How the Testbench Works</h4>
            <p className="text-xs leading-relaxed mb-3" style={{ color: 'var(--on-surface-variant)' }}>
              Each scenario spawns a complete agent workflow with capability tokens, then asserts security invariants against the execution result. Attack scenarios intentionally attempt unauthorized cross-service access to verify that TokenFlow’s guardrails hold.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex items-center gap-2 p-2.5 rounded-lg" style={{ background: 'var(--surface-container-high)', border: '1px solid rgba(70,69,85,0.1)' }}>
                <M icon="play_circle" style={{ fontSize: 14, color: 'var(--primary)' }} />
                <span className="text-[10px]" style={{ color: 'var(--on-surface-variant)' }}>Launches a real workflow with tokens</span>
              </div>
              <div className="flex items-center gap-2 p-2.5 rounded-lg" style={{ background: 'var(--surface-container-high)', border: '1px solid rgba(70,69,85,0.1)' }}>
                <M icon="security" style={{ fontSize: 14, color: 'var(--warning)' }} />
                <span className="text-[10px]" style={{ color: 'var(--on-surface-variant)' }}>Verifies token scope & access control</span>
              </div>
              <div className="flex items-center gap-2 p-2.5 rounded-lg" style={{ background: 'var(--surface-container-high)', border: '1px solid rgba(70,69,85,0.1)' }}>
                <M icon="check_circle" style={{ fontSize: 14, color: 'var(--success)' }} />
                <span className="text-[10px]" style={{ color: 'var(--on-surface-variant)' }}>Asserts invariants pass/fail</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl text-sm" style={{ background: 'rgba(147,0,10,0.2)', color: 'var(--error)', border: '1px solid rgba(255,180,171,0.2)' }}>
          <M icon="error" style={{ fontSize: 14 }} /> {error}
        </div>
      )}

      {/* Run Suite Button */}
      <div className="flex justify-center mb-8">
        <button onClick={runSuite} disabled={running === 'suite'} className="btn-primary px-8 py-3">
          <M icon="play_arrow" style={{ fontSize: 20 }} />
          {running === 'suite' ? 'Running Full Suite…' : 'Run All 7 Scenarios'}
        </button>
      </div>

      {/* Suite Summary */}
      {suiteResult && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className={`card p-6 ${suiteResult.status === 'passed' ? 'card-glow-primary' : 'card-glow-error'}`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <M icon={suiteResult.status === 'passed' ? 'check_circle' : 'cancel'} style={{ fontSize: 28, color: suiteResult.status === 'passed' ? 'var(--success)' : 'var(--error)' }} />
                <div>
                  <h3 className="text-lg font-bold font-headline">Suite {suiteResult.status === 'passed' ? 'Passed' : 'Failed'}</h3>
                  <p className="text-xs font-mono" style={{ color: 'var(--on-surface-variant)' }}>{suiteResult.summary?.durationMs}ms</p>
                </div>
              </div>
              <div className="flex gap-3">
                <div className="text-center">
                  <p className="text-xl font-bold font-headline" style={{ color: 'var(--success)' }}>{suiteResult.summary?.passed}</p>
                  <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--outline)' }}>Passed</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold font-headline" style={{ color: 'var(--error)' }}>{suiteResult.summary?.failed}</p>
                  <p className="text-[9px] font-bold uppercase tracking-widest" style={{ color: 'var(--outline)' }}>Failed</p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Scenario Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-8">
        {scenarios.map((sc, idx) => {
          const catColor = categoryColors[sc.category] || 'var(--outline)';
          const matchingResult = results.find(r => r.scenarioId === sc.id || r.scenario_id === sc.id);

          return (
            <motion.div key={sc.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.05 }}
              className="card p-5 flex flex-col">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg" style={{ background: `color-mix(in srgb, ${catColor} 12%, transparent)` }}>
                    <M icon={sc.malicious ? 'gpp_bad' : sc.category === 'control' ? 'tune' : 'verified_user'} style={{ fontSize: 16, color: catColor }} />
                  </div>
                  <span className="text-[8px] font-bold uppercase tracking-[0.15em] px-2 py-0.5 rounded" style={{ background: `color-mix(in srgb, ${catColor} 10%, transparent)`, color: catColor }}>{sc.category}</span>
                </div>
                {matchingResult && (
                  <span className="text-[8px] font-bold uppercase tracking-[0.15em] px-2 py-0.5 rounded" style={{
                    background: matchingResult.status === 'passed' ? 'rgba(52,211,153,0.1)' : 'rgba(255,180,171,0.1)',
                    color: matchingResult.status === 'passed' ? 'var(--success)' : 'var(--error)',
                  }}>{matchingResult.status}</span>
                )}
              </div>
              <h4 className="text-sm font-bold font-headline mb-1">{sc.name}</h4>
              <p className="text-xs mb-3 flex-1" style={{ color: 'var(--on-surface-variant)' }}>{sc.description}</p>
              <p className="text-[10px] mb-3 italic" style={{ color: 'var(--outline)' }}>{sc.incident_mapping}</p>
              <button onClick={() => runSingle(sc.id)} disabled={!!running}
                className="btn-ghost w-full text-xs py-2" style={{ padding: '0.5rem 1rem' }}>
                <M icon="play_arrow" style={{ fontSize: 14 }} />
                {running === sc.id ? 'Running…' : 'Run Test'}
              </button>
            </motion.div>
          );
        })}
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="card p-6">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <M icon="assignment_turned_in" style={{ color: 'var(--primary)', fontSize: 18 }} />
              <h3 className="text-sm font-bold uppercase tracking-[0.1em] font-headline">Test Results</h3>
            </div>
            <span className="text-[10px] font-mono" style={{ color: 'var(--outline)' }}>{results.length} result{results.length !== 1 ? 's' : ''}</span>
          </div>
          <p className="text-xs mb-5" style={{ color: 'var(--on-surface-variant)' }}>Click a result row to expand assertion details</p>

          {/* Table Header */}
          <div className="grid gap-3 px-4 py-2 mb-2" style={{ gridTemplateColumns: '28px 2fr 0.8fr 0.6fr 0.6fr 0.5fr 28px' }}>
            <span />
            <span className="text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--outline)' }}>Scenario</span>
            <span className="text-[9px] font-bold uppercase tracking-[0.2em]" style={{ color: 'var(--outline)' }}>Run ID</span>
            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-center" style={{ color: 'var(--outline)' }}>Passed</span>
            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-center" style={{ color: 'var(--outline)' }}>Failed</span>
            <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-right" style={{ color: 'var(--outline)' }}>Duration</span>
            <span />
          </div>

          <div className="space-y-2 max-h-[calc(100vh-500px)] overflow-auto pr-1">
            {results.map((r, idx) => {
              const isExpanded = expandedRun === (r.runId || r.id);
              const assertions = r.assertions || (r.summary?.assertions) || [];
              const passed = typeof r.passed === 'number' ? r.passed : r.summary?.passed || 0;
              const failed = typeof r.failed === 'number' ? r.failed : r.summary?.failed || 0;

              return (
                <motion.div key={r.runId || r.id || idx} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.03 }}>
                  <div
                    className="grid gap-3 items-center px-4 py-3.5 rounded-xl cursor-pointer transition-all hover:ring-1"
                    style={{
                      gridTemplateColumns: '28px 2fr 0.8fr 0.6fr 0.6fr 0.5fr 28px',
                      background: r.status === 'passed' ? 'var(--surface-container-high)' : 'rgba(255,180,171,0.04)',
                      border: r.status === 'passed' ? '1px solid rgba(70,69,85,0.12)' : '1px solid rgba(255,180,171,0.15)',
                      '--tw-ring-color': 'rgba(196,192,255,0.3)',
                    }}
                    onClick={() => setExpandedRun(isExpanded ? null : (r.runId || r.id))}
                  >
                    <M icon={r.status === 'passed' ? 'check_circle' : r.status === 'error' ? 'error' : 'cancel'}
                      style={{ fontSize: 18, color: r.status === 'passed' ? 'var(--success)' : 'var(--error)' }} />
                    <div className="min-w-0">
                      <p className="text-xs font-bold truncate" style={{ color: 'var(--on-surface)' }}>{r.scenarioName || r.scenario_name}</p>
                    </div>
                    <p className="text-[10px] font-mono truncate" style={{ color: 'var(--outline)' }}>{(r.runId || r.id || '').slice(0, 12)}</p>
                    <p className="text-xs font-bold text-center" style={{ color: 'var(--success)' }}>{passed}</p>
                    <p className="text-xs font-bold text-center" style={{ color: failed > 0 ? 'var(--error)' : 'var(--outline)' }}>{failed}</p>
                    <p className="text-[10px] font-mono text-right" style={{ color: 'var(--outline)' }}>{r.durationMs || r.duration_ms}ms</p>
                    <M icon={isExpanded ? 'expand_less' : 'expand_more'} style={{ fontSize: 16, color: 'var(--outline)' }} />
                  </div>

                  <AnimatePresence>
                    {isExpanded && assertions.length > 0 && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden">
                        <div className="p-4 space-y-2 ml-6 border-l-2" style={{ borderColor: r.status === 'passed' ? 'rgba(52,211,153,0.3)' : 'rgba(255,180,171,0.3)' }}>
                          {assertions.map((a, ai) => (
                            <div key={a.id || ai} className="flex items-start gap-3 p-3 rounded-lg" style={{ background: 'var(--surface-container-low)', border: '1px solid rgba(70,69,85,0.08)' }}>
                              <M icon={a.passed ? 'check_circle' : 'cancel'} style={{ fontSize: 14, color: a.passed ? 'var(--success)' : 'var(--error)', marginTop: 2 }} />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold">{a.name}</p>
                                <p className="text-[10px] mt-0.5" style={{ color: 'var(--on-surface-variant)' }}>{a.description}</p>
                                <div className="mt-2 grid grid-cols-2 gap-2">
                                  <div>
                                    <p className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: 'var(--outline)' }}>Expected</p>
                                    <p className="text-[10px] font-mono" style={{ color: 'var(--on-surface-variant)' }}>{a.expected}</p>
                                  </div>
                                  <div>
                                    <p className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: 'var(--outline)' }}>Actual</p>
                                    <p className="text-[10px] font-mono" style={{ color: a.passed ? 'var(--success)' : 'var(--error)' }}>{a.actual}</p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Empty State */}
      {results.length === 0 && !suiteResult && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="mb-4 p-4 rounded-2xl" style={{ background: 'var(--surface-container-high)' }}>
            <M icon="science" style={{ fontSize: 28, color: 'var(--outline)' }} />
          </div>
          <p className="text-sm max-w-xs mb-2" style={{ color: 'var(--on-surface-variant)' }}>No test results yet.</p>
          <p className="text-xs" style={{ color: 'var(--outline)' }}>Run a single scenario or the full suite to validate security invariants.</p>
        </div>
      )}
    </motion.div>
  );
}
