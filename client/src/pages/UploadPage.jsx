import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../api.js';

const M = ({ icon, className = '', style }) => (
  <span className={`material-symbols-outlined ${className}`} style={style}>{icon}</span>
);

/* ═══════════════════════════════════════════════════════════
   UPLOAD PAGE — Workflow upload with validation & preview
   ═══════════════════════════════════════════════════════════ */
export default function UploadPage({ setPage }) {
  const [templates, setTemplates] = useState([]);
  const [uploaded, setUploaded] = useState([]);
  const [jsonInput, setJsonInput] = useState('');
  const [preview, setPreview] = useState(null);
  const [errors, setErrors] = useState([]);
  const [uploadResult, setUploadResult] = useState(null);
  const [busy, setBusy] = useState('');
  const fileInputRef = useRef(null);

  useEffect(() => {
    api('/api/workflows/templates').then(d => setTemplates(d.templates || [])).catch(() => {});
    api('/api/workflows/upload').then(d => setUploaded(d.workflows || [])).catch(() => {});
  }, []);

  function handleFileSelect(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setJsonInput(ev.target.result);
      tryParse(ev.target.result);
    };
    reader.readAsText(file);
  }

  function tryParse(text) {
    setErrors([]);
    setPreview(null);
    setUploadResult(null);
    try {
      const parsed = JSON.parse(text);
      setPreview(parsed);
    } catch {
      setErrors(['Invalid JSON — please check your syntax.']);
    }
  }

  function handleJsonChange(e) {
    setJsonInput(e.target.value);
    if (e.target.value.trim()) {
      tryParse(e.target.value);
    } else {
      setPreview(null);
      setErrors([]);
    }
  }

  function loadTemplate(template) {
    const json = JSON.stringify(template.definition, null, 2);
    setJsonInput(json);
    tryParse(json);
  }

  async function handleUpload() {
    if (!preview) return;
    setBusy('upload');
    setErrors([]);
    setUploadResult(null);
    try {
      const r = await api('/api/workflows/upload', {
        method: 'POST',
        body: JSON.stringify({ definition: preview }),
      });
      setUploadResult(r);
      // Refresh uploaded list
      const list = await api('/api/workflows/upload');
      setUploaded(list.workflows || []);
    } catch (e) {
      // Try to parse validation errors
      try {
        const payload = JSON.parse(e.message);
        setErrors(payload.errors || [e.message]);
      } catch {
        setErrors([e.message]);
      }
    }
    setBusy('');
  }

  async function handleRunUploaded(id) {
    setBusy(`run-${id}`);
    try {
      await api(`/api/workflows/upload/${id}/run`, { method: 'POST' });
      setPage('chain');
    } catch (e) {
      setErrors([e.message]);
    }
    setBusy('');
  }

  const actionMeta = {
    READ_OBJECT: { msym: 'database', color: 'var(--primary)', label: 'Read Object' },
    CALL_INTERNAL_API: { msym: 'api', color: 'var(--secondary)', label: 'Call Internal API' },
    WRITE_OBJECT: { msym: 'save', color: 'var(--warning)', label: 'Write Object' },
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      {/* Header */}
      <div className="text-center mb-8">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: 'linear-gradient(135deg, var(--primary), var(--primary-container))', boxShadow: '0 0 30px rgba(196,192,255,0.2)' }}>
          <M icon="upload_file" style={{ fontSize: 32, color: 'var(--on-primary)' }} />
        </div>
        <h2 className="text-2xl font-bold font-headline tracking-tight">Upload Workflow</h2>
        <p className="text-sm mt-2 max-w-lg mx-auto" style={{ color: 'var(--on-surface-variant)' }}>
          Define custom workflows in JSON. Each step is validated against the TokenFlow policy engine.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left: Input */}
        <div className="space-y-4">
          {/* Templates */}
          <div className="card p-5">
            <h3 className="text-sm font-bold uppercase tracking-[0.1em] font-headline mb-3">Starter Templates</h3>
            <div className="space-y-2">
              {templates.map(t => (
                <button key={t.id} onClick={() => loadTemplate(t)}
                  className="w-full text-left p-3 rounded-xl transition-all" style={{ background: 'var(--surface-container-high)', border: '1px solid rgba(70,69,85,0.12)' }}>
                  <div className="flex items-center gap-2 mb-1">
                    <M icon="description" style={{ fontSize: 14, color: 'var(--primary)' }} />
                    <p className="text-xs font-bold">{t.name}</p>
                  </div>
                  <p className="text-[10px]" style={{ color: 'var(--on-surface-variant)' }}>{t.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* File Upload */}
          <div className="upload-dropzone" onClick={() => fileInputRef.current?.click()}>
            <input ref={fileInputRef} type="file" accept=".json" onChange={handleFileSelect} style={{ display: 'none' }} />
            <M icon="cloud_upload" style={{ fontSize: 32, color: 'var(--primary)' }} />
            <p className="text-sm font-bold mt-2">Drop a JSON file or click to browse</p>
            <p className="text-[10px]" style={{ color: 'var(--outline)' }}>Accepts .json workflow definitions</p>
          </div>

          {/* JSON Editor */}
          <div className="card p-5">
            <h3 className="text-sm font-bold uppercase tracking-[0.1em] font-headline mb-3">JSON Editor</h3>
            <textarea
              value={jsonInput}
              onChange={handleJsonChange}
              placeholder={'{\n  "name": "My Workflow",\n  "description": "...",\n  "steps": [\n    {\n      "action": "READ_OBJECT",\n      "service": "gcs",\n      "resource": "data/input.json",\n      "actionVerb": "read"\n    }\n  ]\n}'}
              className="upload-editor"
              rows={12}
            />
          </div>

          {/* Errors */}
          <AnimatePresence>
            {errors.length > 0 && (
              <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="p-4 rounded-xl space-y-1" style={{ background: 'rgba(147,0,10,0.15)', border: '1px solid rgba(255,180,171,0.2)' }}>
                {errors.map((err, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs" style={{ color: 'var(--error)' }}>
                    <M icon="error" style={{ fontSize: 14, marginTop: 1 }} /> {err}
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Upload Success */}
          {uploadResult && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="p-4 rounded-xl" style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)' }}>
              <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--success)' }}>
                <M icon="check_circle" style={{ fontSize: 14 }} /> Workflow uploaded: {uploadResult.name} ({uploadResult.id})
              </div>
            </motion.div>
          )}
        </div>

        {/* Right: Preview */}
        <div className="space-y-4">
          {preview ? (
            <div className="card p-6">
              <h3 className="text-sm font-bold uppercase tracking-[0.1em] font-headline mb-1">Preview</h3>
              <p className="text-xs mb-6" style={{ color: 'var(--on-surface-variant)' }}>Validate before uploading</p>

              <div className="mb-4">
                <p className="text-[9px] font-bold uppercase tracking-[0.2em] mb-1" style={{ color: 'var(--outline)' }}>Name</p>
                <p className="text-sm font-bold font-headline">{preview.name || '(unnamed)'}</p>
              </div>
              {preview.description && (
                <div className="mb-4">
                  <p className="text-[9px] font-bold uppercase tracking-[0.2em] mb-1" style={{ color: 'var(--outline)' }}>Description</p>
                  <p className="text-xs" style={{ color: 'var(--on-surface-variant)' }}>{preview.description}</p>
                </div>
              )}

              <p className="text-[9px] font-bold uppercase tracking-[0.2em] mb-3" style={{ color: 'var(--outline)' }}>Steps ({(preview.steps || []).length})</p>
              <div className="timeline">
                {(preview.steps || []).map((step, i) => {
                  const meta = actionMeta[step.action] || { msym: 'help', color: 'var(--outline)', label: step.action };
                  return (
                    <div key={i} className="timeline-node">
                      <div className="timeline-dot idle"><div className="ping" /></div>
                      <div className="card p-4" style={{ background: 'var(--surface-container-high)' }}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-[9px] font-bold tracking-[0.2em] uppercase" style={{ color: meta.color }}>Step {String(i + 1).padStart(2, '0')}</span>
                          <span className="text-[8px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded" style={{ background: `color-mix(in srgb, ${meta.color} 10%, transparent)`, color: meta.color }}>{step.actionVerb}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <M icon={meta.msym} style={{ fontSize: 14, color: meta.color }} />
                          <div>
                            <p className="text-xs font-bold font-headline">{meta.label}</p>
                            <p className="text-[10px] font-mono" style={{ color: 'var(--outline)' }}>{step.service} / {step.resource}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <button onClick={handleUpload} disabled={busy === 'upload' || errors.length > 0}
                className="btn-primary w-full mt-6 py-3">
                <M icon="cloud_upload" style={{ fontSize: 18 }} />
                {busy === 'upload' ? 'Uploading…' : 'Upload & Validate'}
              </button>
            </div>
          ) : (
            <div className="card p-6 flex flex-col items-center justify-center py-16">
              <div className="mb-4 p-4 rounded-2xl" style={{ background: 'var(--surface-container-high)' }}>
                <M icon="preview" style={{ fontSize: 28, color: 'var(--outline)' }} />
              </div>
              <p className="text-sm" style={{ color: 'var(--on-surface-variant)' }}>Enter JSON or select a template to preview</p>
            </div>
          )}

          {/* Uploaded Workflows */}
          {uploaded.length > 0 && (
            <div className="card p-5">
              <h3 className="text-sm font-bold uppercase tracking-[0.1em] font-headline mb-4">Uploaded Workflows</h3>
              <div className="space-y-2">
                {uploaded.map(u => (
                  <div key={u.id} className="flex items-center gap-3 p-3 rounded-xl" style={{ background: 'var(--surface-container-high)', border: '1px solid rgba(70,69,85,0.1)' }}>
                    <div className="p-1.5 rounded-lg" style={{ background: 'rgba(196,192,255,0.1)' }}>
                      <M icon="description" style={{ fontSize: 14, color: 'var(--primary)' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold truncate">{u.name}</p>
                      <p className="text-[10px] font-mono" style={{ color: 'var(--outline)' }}>{u.id}</p>
                    </div>
                    <button onClick={() => handleRunUploaded(u.id)} disabled={busy === `run-${u.id}`}
                      className="btn-ghost text-[10px] py-1 px-3" style={{ padding: '0.3rem 0.6rem' }}>
                      <M icon="play_arrow" style={{ fontSize: 12 }} /> Run
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
