import { useEffect, useRef, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Selector } from '@astryxdesign/core/Selector';
import { Switch } from '@astryxdesign/core/Switch';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { describeLanguage } from '../engine/translate.js';
import { DEPTHS, EFFORTS, MODELS, OPENAI_PRESETS, keyFor, openAiModel } from '../engine/models.js';
import { useOpenAiModels } from '../state/openaiModels.js';
import { applyLanguage, useT } from '../i18n/index.js';
import { CUSTOM, LANGUAGES, resolveLanguage } from '../i18n/languages.js';
import { engineSettings, saveSettings, useSettings } from '../state/settings.js';
import { addSpend } from '../state/spend.js';

// A text box for a dollar amount keeps what is typed ("0.") until it means a number.
function BudgetField({ value, t }) {
  const [text, setText] = useState(value ? String(value) : '');
  return (
    <TextInput
      label={t('settings.budget')}
      description={t('settings.budgetHint')}
      value={text}
      placeholder={t('settings.budgetPlaceholder')}
      onChange={(v) => {
        setText(v);
        const n = Number.parseFloat(v);
        saveSettings({ budget: Number.isFinite(n) && n > 0 ? n : 0 });
      }}
    />
  );
}

/**
 * Any language the reader types: the model says what it is (its name, native name, code and direction), then
 * translates the app into it. Costs a fraction of a cent, once; the translation is kept for next time.
 */
function CustomLanguage({ settings, t, focus }) {
  const [text, setText] = useState(settings.customLanguage?.name ?? '');
  const [status, setStatus] = useState(null); // { kind: 'working' | 'ready' | 'failed', text }
  const box = useRef(null);
  useEffect(() => {
    if (focus) box.current?.querySelector('input')?.focus();
  }, [focus]);

  const apply = async () => {
    const name = text.trim();
    if (!name) return;
    setStatus({ kind: 'working', text: t('settings.languageWorking', { name }) });
    try {
      const s = engineSettings();
      const info = await describeLanguage({ apiKey: keyFor(s, s.model), modelId: s.model, text: name });
      const language = resolveLanguage(CUSTOM, info);
      const result = await applyLanguage(language, { apiKey: keyFor(s, s.model), modelId: s.model });
      if (!result.ok) throw new Error(result.message);
      addSpend((info.cost ?? 0) + (result.cost ?? 0));
      saveSettings({ language: CUSTOM, customLanguage: { name: info.name, native: info.native, code: info.code, rtl: info.rtl } });
      setStatus({ kind: 'ready', text: t('settings.languageReady', { name: info.native || info.name }) });
    } catch (error) {
      setStatus({ kind: 'failed', text: t('settings.languageFailed', { message: error.message }) });
    }
  };

  return (
    <div ref={box}>
      <VStack gap={2}>
        <TextInput
          label={t('settings.languageCustom')}
          description={t('settings.languageCustomHint')}
          value={text}
          placeholder="Kiswahili, Tiếng Việt, 日本語…"
          onChange={setText}
          onEnter={apply}
          isLoading={status?.kind === 'working'}
        />
        <div className="lang-apply">
          <Button label={t('settings.languageApply')} size="sm" isDisabled={!text.trim() || status?.kind === 'working'} onClick={apply} />
          {status && (
            <Text type="supporting" color={status.kind === 'failed' ? 'primary' : 'secondary'} role="status">
              {status.text}
            </Text>
          )}
        </div>
      </VStack>
    </div>
  );
}

export function SettingsDialog({ onClose, focusLanguage }) {
  const settings = useSettings();
  const t = useT();
  // Cerebras's models, then every OpenAI model the key can use (from OpenAI's own list) at each reasoning effort,
  // newest first. A model already chosen stays in the list even if the list no longer has it.
  const openaiKey = settings.openaiKey || engineSettings().openaiKey; // the reader's key, or a developer's local one
  const openai = useOpenAiModels(openaiKey);
  const listed = openai.models.flatMap((m) => EFFORTS.filter((e) => e !== 'none').map((e) => `${m.id}:${e}`));
  const chosen = [settings.model, settings.linkModel].filter((id) => openAiModel(id));
  const openAiIds = [...new Set([...listed, ...chosen, ...OPENAI_PRESETS])];
  const modelOptions = [
    ...MODELS.filter((m) => m.provider === 'cerebras').map((m) => ({ value: m.id, label: m.label, description: t(`model.${m.id}`) })),
    ...openAiIds.map((id) => {
      const m = openAiModel(id);
      return { value: id, label: m.label, description: m.estimated ? t('model.estimated', { in: m.input, out: m.output }) : t('model.openai', { in: m.input, out: m.output }) };
    }),
  ];
  return (
    <Dialog isOpen onOpenChange={(open) => !open && onClose()} width={540} purpose="form">
      <DialogHeader title={t('settings.title')} onOpenChange={(open) => !open && onClose()} />
      <div className="settings">
        <VStack gap={4}>
          <div>
            <Text type="label" display="block">{t('settings.language')}</Text>
            <SegmentedControl label={t('settings.language')} value={settings.language} onChange={(language) => saveSettings({ language })}>
              {LANGUAGES.map((l) => (
                <SegmentedControlItem key={l.id} value={l.id} label={l.native} />
              ))}
              {settings.customLanguage && <SegmentedControlItem value={CUSTOM} label={settings.customLanguage.native} />}
            </SegmentedControl>
          </div>
          <CustomLanguage settings={settings} t={t} focus={focusLanguage} />
          <TextInput
            type="password"
            label={t('settings.key')}
            description={t('settings.keyHint')}
            value={settings.apiKey}
            placeholder="csk-…"
            onChange={(apiKey) => saveSettings({ apiKey })}
          />
          <TextInput
            type="password"
            label={t('settings.openaiKey')}
            description={t('settings.openaiKeyHint')}
            value={settings.openaiKey}
            placeholder="sk-…"
            onChange={(openaiKey) => saveSettings({ openaiKey })}
          />
          {openaiKey && (
            <div className="lang-apply">
              <Button label={t('settings.modelsRefresh')} size="sm" variant="secondary" isDisabled={openai.busy} onClick={openai.refresh} />
              <Text type="supporting" color="secondary" role="status">
                {openai.busy ? t('settings.modelsLoading') : openai.error ? t('settings.modelsFailed', { message: openai.error }) : t('settings.modelsCount', { n: openai.models.length })}
              </Text>
            </div>
          )}
          <Selector label={t('settings.model')} options={modelOptions} value={settings.model} onChange={(model) => model && saveSettings({ model })} />
          <SegmentedControl label={t('settings.format')} value={settings.format} onChange={(format) => saveSettings({ format })}>
            <SegmentedControlItem value="a2ui" label={t('settings.formatA2ui')} />
            <SegmentedControlItem value="html" label={t('settings.formatHtml')} />
          </SegmentedControl>
          <Selector
            label={t('settings.linkModel')}
            options={modelOptions}
            value={settings.linkModel}
            isDisabled={settings.format === 'html'}
            onChange={(linkModel) => linkModel && saveSettings({ linkModel })}
          />
          <SegmentedControl label={t('settings.depth')} value={settings.depth} onChange={(depth) => saveSettings({ depth })}>
            {Object.entries(DEPTHS).map(([id, d]) => (
              <SegmentedControlItem key={id} value={id} label={t('settings.depthWords', { name: t(`depth.${id}`), n: d.words.toLocaleString() })} />
            ))}
          </SegmentedControl>
          <SegmentedControl label={t('settings.text')} value={settings.text} onChange={(text) => saveSettings({ text })}>
            <SegmentedControlItem value="small" label={t('settings.small')} />
            <SegmentedControlItem value="medium" label={t('settings.medium')} />
            <SegmentedControlItem value="large" label={t('settings.large')} />
          </SegmentedControl>
          <SegmentedControl label={t('settings.theme')} value={settings.mode} onChange={(mode) => saveSettings({ mode })}>
            <SegmentedControlItem value="system" label={t('settings.system')} />
            <SegmentedControlItem value="light" label={t('nav.light')} />
            <SegmentedControlItem value="dark" label={t('nav.dark')} />
          </SegmentedControl>
          <Switch label={t('settings.a11y')} description={t('settings.a11yHint')} value={settings.a11y} onChange={(a11y) => saveSettings({ a11y })} />
          <Switch label={t('settings.prefetch')} description={t('settings.prefetchHint')} value={settings.prefetch} onChange={(prefetch) => saveSettings({ prefetch })} />
          <BudgetField value={settings.budget} t={t} />
          <Button label={t('settings.done')} variant="primary" onClick={onClose} />
        </VStack>
      </div>
    </Dialog>
  );
}
