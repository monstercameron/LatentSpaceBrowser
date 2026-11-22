import { Button } from '@astryxdesign/core/Button';
import { Icon } from '@astryxdesign/core/Icon';
import { IconButton } from '@astryxdesign/core/IconButton';
import { SegmentedControl, SegmentedControlItem } from '@astryxdesign/core/SegmentedControl';
import { Text } from '@astryxdesign/core/Text';
import { TextInput } from '@astryxdesign/core/TextInput';
import { TopNav } from '@astryxdesign/core/TopNav';
import { HomeIcon, MoonIcon, SunIcon, TrailIcon } from './icons.jsx';
import { money } from '../state/spend.js';

/** The frame: where you are in history, the search, and the running cost of curiosity. */
export function Shell({
  query, onQuery, onSearch, onHome, onBack, onForward, canGoBack, canGoForward,
  spend, unusedPrefetch, isDark, onToggleDark, trailOpen, onToggleTrail, onSettings, format, onFormat,
}) {
  const meter = unusedPrefetch > 0 ? `${money(spend)} (${money(unusedPrefetch)} on pages you did not open)` : money(spend);
  return (
    <TopNav
      label="LatentSpace"
      heading={<Button label="LatentSpace" variant="ghost" onClick={onHome} />}
      startContent={
        <>
          <IconButton label="Back" tooltip="Back" variant="ghost" icon={<Icon icon="chevronLeft" />} isDisabled={!canGoBack} onClick={onBack} />
          <IconButton label="Forward" tooltip="Forward" variant="ghost" icon={<Icon icon="chevronRight" />} isDisabled={!canGoForward} onClick={onForward} />
          <IconButton label="Home" tooltip="Home" variant="ghost" icon={<Icon icon={HomeIcon} />} onClick={onHome} />
        </>
      }
      centerContent={
        <div className="search">
          <TextInput
            type="search"
            label="Search any topic"
            isLabelHidden
            placeholder="Search any topic"
            value={query}
            onChange={onQuery}
            onEnter={() => onSearch(query)}
          />
        </div>
      }
      endContent={
        <>
          {/* The two ways a page is made. Pages already written keep the way they were written. */}
          <SegmentedControl label="How pages are written and drawn" size="sm" value={format} onChange={onFormat}>
            <SegmentedControlItem value="a2ui" label="A2UI" />
            <SegmentedControlItem value="html" label="HTML" />
          </SegmentedControl>
          {/* keyed by the amount, so each change plays a small tick */}
          <span key={money(spend)} className="tick" title={`Spent this session: ${meter}`}>
            <Text type="supporting" hasTabularNumbers>
              {money(spend)}
            </Text>
          </span>
          <IconButton label={trailOpen ? 'Hide trail' : 'Show trail'} tooltip="Trail" variant="ghost" icon={<Icon icon={TrailIcon} />} onClick={onToggleTrail} />
          <IconButton
            label={isDark ? 'Switch to light' : 'Switch to dark'}
            tooltip={isDark ? 'Light' : 'Dark'}
            variant="ghost"
            icon={<Icon icon={isDark ? SunIcon : MoonIcon} />}
            onClick={onToggleDark}
          />
          <IconButton label="Settings" tooltip="Settings" variant="ghost" icon={<Icon icon="wrench" />} onClick={onSettings} />
        </>
      }
    />
  );
}
