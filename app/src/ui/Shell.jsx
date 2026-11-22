import { Button } from '@astryxdesign/core/Button';
import { Icon } from '@astryxdesign/core/Icon';
import { IconButton } from '@astryxdesign/core/IconButton';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Selector } from '@astryxdesign/core/Selector';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TopNav } from '@astryxdesign/core/TopNav';
import { HomeIcon, MoonIcon, SunIcon, TrailIcon } from './icons.jsx';
import { useT } from '../i18n/index.js';
import { CUSTOM, LANGUAGES } from '../i18n/languages.js';
import { money } from '../state/spend.js';

const OTHER = '__other';

/** The frame: where you are in history, the search, the language, and the running cost of curiosity. */
export function Shell({
  query, onQuery, onSearch, onHome, onBack, onForward, canGoBack, canGoForward,
  spend, unusedPrefetch, isDark, onToggleDark, trailOpen, onToggleTrail, onSettings, format, onFormat,
  language, customLanguage, onLanguage, onOtherLanguage,
}) {
  const t = useT();
  const meter = unusedPrefetch > 0
    ? t('nav.spentUnused', { amount: money(spend), unused: money(unusedPrefetch) })
    : money(spend);

  // The five quick choices, the custom language if one is set, then a way in to set another.
  const options = [
    ...LANGUAGES.map((l) => ({ value: l.id, label: l.native })),
    ...(customLanguage ? [{ value: CUSTOM, label: customLanguage.native }] : []),
    { type: 'divider' },
    { value: OTHER, label: t('nav.otherLanguage') },
  ];

  return (
    <TopNav
      label="LatentSpace"
      heading={<Button label="LatentSpace" variant="ghost" onClick={onHome} />}
      startContent={
        <>
          <IconButton label={t('nav.back')} tooltip={t('nav.back')} variant="ghost" icon={<Icon icon="chevronLeft" />} isDisabled={!canGoBack} onClick={onBack} />
          <IconButton label={t('nav.forward')} tooltip={t('nav.forward')} variant="ghost" icon={<Icon icon="chevronRight" />} isDisabled={!canGoForward} onClick={onForward} />
          <IconButton label={t('nav.home')} tooltip={t('nav.home')} variant="ghost" icon={<Icon icon={HomeIcon} />} onClick={onHome} />
        </>
      }
      centerContent={
        <div className="search">
          <TextInput
            type="search"
            label={t('nav.search')}
            isLabelHidden
            placeholder={t('nav.search')}
            value={query}
            onChange={onQuery}
            onEnter={() => onSearch(query)}
          />
        </div>
      }
      endContent={
        <>
          <div className="lang-pick">
            <Selector
              label={t('nav.language')}
              isLabelHidden
              size="sm"
              variant="ghost"
              options={options}
              value={language}
              onChange={(value) => (value === OTHER ? onOtherLanguage() : value && onLanguage(value))}
            />
          </div>
          {/* The two ways a page is made. Pages already written keep the way they were written. */}
          <SegmentedControl label={t('nav.format')} size="sm" value={format} onChange={onFormat}>
            <SegmentedControlItem value="a2ui" label="A2UI" />
            <SegmentedControlItem value="html" label="HTML" />
          </SegmentedControl>
          {/* keyed by the amount, so each change plays a small tick */}
          <span key={money(spend)} className="tick" title={t('nav.spent', { amount: meter })}>
            <Text type="supporting" hasTabularNumbers>
              {money(spend)}
            </Text>
          </span>
          <IconButton label={trailOpen ? t('nav.trailHide') : t('nav.trailShow')} tooltip={t('nav.trail')} variant="ghost" icon={<Icon icon={TrailIcon} />} onClick={onToggleTrail} />
          <IconButton
            label={isDark ? t('nav.toLight') : t('nav.toDark')}
            tooltip={isDark ? t('nav.light') : t('nav.dark')}
            variant="ghost"
            icon={<Icon icon={isDark ? SunIcon : MoonIcon} />}
            onClick={onToggleDark}
          />
          <IconButton label={t('nav.settings')} tooltip={t('nav.settings')} variant="ghost" icon={<Icon icon="wrench" />} onClick={onSettings} />
        </>
      }
    />
  );
}
