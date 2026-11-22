import { useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { Dialog, DialogHeader } from '@astryxdesign/core/Dialog';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Selector } from '@astryxdesign/core/Selector';
import { Switch } from '@astryxdesign/core/Switch';
import { TextInput } from '@astryxdesign/core/TextInput';
import { VStack } from '@astryxdesign/core/VStack';
import { DEPTHS, MODELS } from '../engine/models.js';
import { saveSettings, useSettings } from '../state/settings.js';

const modelOptions = MODELS.map((m) => ({ value: m.id, label: m.label, description: m.hint }));

// A text box for a dollar amount keeps what is typed ("0.") until it means a number.
function BudgetField({ value }) {
  const [text, setText] = useState(value ? String(value) : '');
  return (
    <TextInput
      label="Spending limit for this session, in dollars"
      description="Pages stop being written once the session has spent this much. Leave empty for no limit."
      value={text}
      placeholder="No limit"
      onChange={(v) => {
        setText(v);
        const n = Number.parseFloat(v);
        saveSettings({ budget: Number.isFinite(n) && n > 0 ? n : 0 });
      }}
    />
  );
}

export function SettingsDialog({ onClose }) {
  const settings = useSettings();
  return (
    <Dialog isOpen onOpenChange={(open) => !open && onClose()} width={520} purpose="form">
      <DialogHeader title="Settings" onOpenChange={(open) => !open && onClose()} />
      <div className="settings">
        <VStack gap={4}>
          <TextInput
            type="password"
            label="Cerebras API key"
            description="Stored in this browser and sent only to Cerebras."
            value={settings.apiKey}
            placeholder="csk-…"
            onChange={(apiKey) => saveSettings({ apiKey })}
          />
          <Selector label="Model that writes pages" options={modelOptions} value={settings.model} onChange={(model) => model && saveSettings({ model })} />
          <SegmentedControl label="How pages are written and drawn" value={settings.format} onChange={(format) => saveSettings({ format })}>
            <SegmentedControlItem value="a2ui" label="A2UI: prose, then links" />
            <SegmentedControlItem value="html" label="HTML: one pass" />
          </SegmentedControl>
          <Selector
            label="Model that chooses links (A2UI only)"
            options={modelOptions}
            value={settings.linkModel}
            isDisabled={settings.format === 'html'}
            onChange={(linkModel) => linkModel && saveSettings({ linkModel })}
          />
          <SegmentedControl label="Page depth" value={settings.depth} onChange={(depth) => saveSettings({ depth })}>
            {Object.entries(DEPTHS).map(([id, d]) => (
              <SegmentedControlItem key={id} value={id} label={`${d.label} · about ${d.words.toLocaleString()} words`} />
            ))}
          </SegmentedControl>
          <SegmentedControl label="Text size" value={settings.text} onChange={(text) => saveSettings({ text })}>
            <SegmentedControlItem value="small" label="Small" />
            <SegmentedControlItem value="medium" label="Medium" />
            <SegmentedControlItem value="large" label="Large" />
          </SegmentedControl>
          <SegmentedControl label="Theme" value={settings.mode} onChange={(mode) => saveSettings({ mode })}>
            <SegmentedControlItem value="system" label="System" />
            <SegmentedControlItem value="light" label="Light" />
            <SegmentedControlItem value="dark" label="Dark" />
          </SegmentedControl>
          <Switch
            label="Write pages ahead of your click"
            description="Hover a link and its page starts writing, so the click lands on a finished page. Pages you never open still cost money, and the meter says how much."
            value={settings.prefetch}
            onChange={(prefetch) => saveSettings({ prefetch })}
          />
          <BudgetField value={settings.budget} />
          <Button label="Done" variant="primary" onClick={onClose} />
        </VStack>
      </div>
    </Dialog>
  );
}
