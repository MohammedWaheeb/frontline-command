// Frontline Command menu kit (menu-shell lane). API: work/beta-2026-10-31/contracts/menu-kit.md.
// Pure presentation. Styles: src/styles/menu.css (imported once by ui/App.tsx after game.css).
export {Button,type ButtonProps,type ButtonVariant,type ButtonSize} from './Button';
export {KitIcon} from './icon';
export {Panel,SectionHeader,EmptyState,StatusChip,type PanelProps,type SectionHeaderProps,type EmptyStateProps,type StatusChipProps,type StatusTone} from './Panel';
export {Field,Select,Switch,type FieldProps,type FieldControlProps,type SelectProps,type SelectOption,type SwitchProps} from './Field';
export {Segmented,Tabs,TabPanel,type SegmentedProps,type SegmentedOption,type TabsProps,type TabItem,type TabPanelProps} from './Segmented';
export {FooterActionBar,Columns,MenuScreenContext,useMenuScreen,useScreenFill,type FooterActionBarProps,type FooterAction,type ColumnsProps,type MenuScreenContextValue} from './screen';
export {ConfirmModal,type ConfirmModalProps} from './ConfirmModal';
export {FileButton,type FileButtonProps} from './FileButton';
export {InviteCode,InfoTip,type InviteCodeProps,type InfoTipProps} from './InviteCode';
export {ColorSwatchPicker,teamColorCss,teamColorName,TEAM_COLOR_SLOTS,type ColorSwatchPickerProps} from './ColorSwatchPicker';
export {SlotTable,SlotRow,SlotCell,SlotNumber,type SlotTableProps,type SlotColumn,type SlotRowProps,type SlotCellProps} from './SlotTable';
export {MapPanel,MapMarker,MapThumbStrip,MapThumb,type MapPanelProps,type MapMarkerProps,type MapThumbStripProps,type MapThumbProps} from './MapPanel';
