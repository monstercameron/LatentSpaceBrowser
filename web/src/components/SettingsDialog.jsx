import { useEffect, useRef, useState } from 'react';
import { TEXT_SIZES, getSettings, saveSettings } from '../lib/settings.js';
import { MODELS, STYLES } from '../services/models.js';

function Choice({ name, value, checked, onChange, title, hint }) {
  return (
    <label className="choice">
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} className="sr-only" />
      <span className="block text-sm font-semibold">{title}</span>
      {hint && <span className="block text-[0.8125rem] leading-snug text-muted">{hint}</span>}
    </label>
  );
}

export function SettingsDialog({ onClose }) {
  const dialogRef = useRef(null);
  const [form, setForm] = useState(getSettings);
  const [showKey, setShowKey] = useState(false);
  const set = (field) => (event) => setForm((prev) => ({ ...prev, [field]: event.target.value }));

  // A native modal dialog brings focus trapping, Escape and the backdrop for free.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog.open) dialog.showModal();
  }, []);

  const save = (event) => {
    event.preventDefault();
    saveSettings(form);
    onClose();
  };

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(event) => event.target === dialogRef.current && onClose()}
      aria-labelledby="settings-title"
      className="w-[calc(100%-2rem)] max-w-md rounded-xl border border-edge bg-card p-0 text-ink shadow-2xl"
    >
      <form onSubmit={save} className="space-y-5 p-6">
        <div>
          <h2 id="settings-title" className="font-serif text-2xl font-bold">Settings</h2>
          <p className="mt-1 text-sm text-muted">
            LatentSpace runs on Cerebras with your own key. The key stays in this browser.
          </p>
        </div>

        <div>
          <label htmlFor="api-key" className="label">Cerebras API key</label>
          <div className="flex gap-2">
            <input
              id="api-key"
              type={showKey ? 'text' : 'password'}
              value={form.apiKey}
              onChange={set('apiKey')}
              placeholder="csk-..."
              autoComplete="off"
              spellCheck="false"
              className="field min-w-0 font-mono"
            />
            <button type="button" className="btn shrink-0" aria-pressed={showKey} onClick={() => setShowKey(!showKey)}>
              {showKey ? 'Hide' : 'Show'}
            </button>
          </div>
          <p className="mt-1.5 text-[0.8125rem] text-muted">
            No key yet?{' '}
            <a href="https://cloud.cerebras.ai/" target="_blank" rel="noopener noreferrer" className="text-link underline">
              Get one from Cerebras
            </a>
          </p>
        </div>

        <fieldset>
          <legend className="label">Model</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {MODELS.map((model) => (
              <Choice
                key={model.id}
                name="model"
                value={model.id}
                checked={form.model === model.id}
                onChange={set('model')}
                title={model.label}
                hint={`${model.hint} · $${model.input} in / $${model.output} out per 1M`}
              />
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="label">Article length</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {Object.entries(STYLES).map(([id, style]) => (
              <Choice
                key={id}
                name="style"
                value={id}
                checked={form.style === id}
                onChange={set('style')}
                title={style.label}
                hint={style.hint}
              />
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="label">Text size</legend>
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(TEXT_SIZES).map(([id, size]) => (
              <Choice
                key={id}
                name="textSize"
                value={id}
                checked={form.textSize === id}
                onChange={set('textSize')}
                title={size.label}
              />
            ))}
          </div>
        </fieldset>

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn">Cancel</button>
          <button type="submit" className="btn btn-primary">Save</button>
        </div>
      </form>
    </dialog>
  );
}
