/**
 * Results tree component.
 *
 * Shows Added / Removed / Modified / Unchanged tables from a CompareResult,
 * with expandable modified tables that show column-level changes.
 */

import React, { useState } from 'react';
import {
	makeStyles,
	tokens,
	Badge,
	Text,
	Tooltip,
} from '@fluentui/react-components';
import {
	AddCircleRegular,
	DismissCircleRegular,
	EditRegular,
	CheckmarkCircleRegular,
	ChevronDownRegular,
	ChevronRightRegular,
	TableRegular,
} from '@fluentui/react-icons';
import type { CompareResult, ObjectDiff, ColumnChange } from './types';

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const useStyles = makeStyles({
	root: {
		display: 'flex',
		flexDirection: 'column',
		height: '100%',
		overflow: 'hidden',
	},
	summary: {
		display: 'flex',
		gap: tokens.spacingHorizontalS,
		padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
		borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
		flexWrap: 'wrap',
		flexShrink: 0,
		backgroundColor: tokens.colorNeutralBackground2,
	},
	treeScroll: {
		flex: 1,
		overflowY: 'auto',
		padding: `${tokens.spacingVerticalXS} 0`,
	},
	section: {
		marginBottom: tokens.spacingVerticalXS,
	},
	sectionHeader: {
		display: 'flex',
		alignItems: 'center',
		gap: tokens.spacingHorizontalXS,
		padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
		cursor: 'pointer',
		userSelect: 'none',
		':hover': {
			backgroundColor: tokens.colorNeutralBackground2,
		},
	},
	sectionLabel: {
		flex: 1,
		fontWeight: tokens.fontWeightSemibold,
		fontSize: tokens.fontSizeBase200,
	},
	objectRow: {
		display: 'flex',
		alignItems: 'center',
		gap: tokens.spacingHorizontalXS,
		padding: `2px ${tokens.spacingHorizontalM} 2px 28px`,
		cursor: 'pointer',
		fontSize: tokens.fontSizeBase200,
		':hover': {
			backgroundColor: tokens.colorNeutralBackground3,
		},
	},
	objectRowSelected: {
		backgroundColor: tokens.colorBrandBackground2,
		':hover': {
			backgroundColor: tokens.colorBrandBackground2Hover,
		},
	},
	objectLabel: {
		flex: 1,
		overflow: 'hidden',
		textOverflow: 'ellipsis',
		whiteSpace: 'nowrap',
	},
	expandBtn: {
		flexShrink: 0,
		display: 'flex',
		alignItems: 'center',
	},
	columnRow: {
		display: 'flex',
		alignItems: 'center',
		gap: tokens.spacingHorizontalXS,
		padding: `1px ${tokens.spacingHorizontalM} 1px 52px`,
		fontSize: tokens.fontSizeBase100,
		color: tokens.colorNeutralForeground2,
	},
	colName: {
		minWidth: '120px',
		overflow: 'hidden',
		textOverflow: 'ellipsis',
		whiteSpace: 'nowrap',
	},
	colChange: {
		fontSize: tokens.fontSizeBase100,
		color: tokens.colorNeutralForeground3,
		fontStyle: 'italic',
	},
	empty: {
		padding: `${tokens.spacingVerticalL} ${tokens.spacingHorizontalM}`,
		color: tokens.colorNeutralForeground3,
		textAlign: 'center',
	},
});

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ResultsTreeProps {
	result: CompareResult;
	selectedKey: string | null;
	onSelect: (key: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ResultsTree({ result, selectedKey, onSelect }: ResultsTreeProps) {
	const styles = useStyles();

	const [expanded, setExpanded] = useState<Record<string, boolean>>({
		added: true, removed: true, modified: true, unchanged: false,
	});
	const [expandedObjects, setExpandedObjects] = useState<Set<string>>(new Set());

	const toggle = (section: string) =>
		setExpanded(prev => ({ ...prev, [section]: !prev[section] }));

	const toggleObj = (key: string) =>
		setExpandedObjects(prev => {
			const next = new Set(prev);
			if (next.has(key)) { next.delete(key); } else { next.add(key); }
			return next;
		});

	const added     = result.objects.filter(o => o.change === 'added');
	const removed   = result.objects.filter(o => o.change === 'removed');
	const modified  = result.objects.filter(o => o.change === 'modified');
	const unchanged = result.objects.filter(o => o.change === 'unchanged');

	const { stats } = result;

	const noChanges = stats.added + stats.removed + stats.modified === 0;

	return (
		<div className={styles.root}>
			{/* Stats summary */}
			<div className={styles.summary}>
				<Tooltip content="Added" relationship="label">
					<Badge appearance="filled" color="success" size="medium">
						+{stats.added}
					</Badge>
				</Tooltip>
				<Tooltip content="Removed" relationship="label">
					<Badge appearance="filled" color="danger" size="medium">
						−{stats.removed}
					</Badge>
				</Tooltip>
				<Tooltip content="Modified" relationship="label">
					<Badge appearance="filled" color="warning" size="medium">
						~{stats.modified}
					</Badge>
				</Tooltip>
				<Tooltip content="Unchanged" relationship="label">
					<Badge appearance="ghost" color="informative" size="medium">
						={stats.unchanged}
					</Badge>
				</Tooltip>
			</div>

			<div className={styles.treeScroll}>
				{noChanges && (
					<div className={styles.empty}>
						<CheckmarkCircleRegular fontSize={24} />
						<br />
						Schemas are identical — no differences found.
					</div>
				)}

				{/* Added */}
				{added.length > 0 && (
					<Section
						styles={styles}
						label="Added"
						count={added.length}
						icon={<AddCircleRegular style={{ color: '#22a060' }} />}
						expanded={expanded['added']}
						onToggle={() => toggle('added')}
					>
						{added.map(obj => (
							<ObjectRow
								key={obj.key}
								styles={styles}
								obj={obj}
								selected={selectedKey === obj.key}
								isExpanded={expandedObjects.has(obj.key)}
								onSelect={() => onSelect(obj.key)}
								onToggleExpand={() => toggleObj(obj.key)}
							/>
						))}
					</Section>
				)}

				{/* Removed */}
				{removed.length > 0 && (
					<Section
						styles={styles}
						label="Removed"
						count={removed.length}
						icon={<DismissCircleRegular style={{ color: '#cc2828' }} />}
						expanded={expanded['removed']}
						onToggle={() => toggle('removed')}
					>
						{removed.map(obj => (
							<ObjectRow
								key={obj.key}
								styles={styles}
								obj={obj}
								selected={selectedKey === obj.key}
								isExpanded={expandedObjects.has(obj.key)}
								onSelect={() => onSelect(obj.key)}
								onToggleExpand={() => toggleObj(obj.key)}
							/>
						))}
					</Section>
				)}

				{/* Modified */}
				{modified.length > 0 && (
					<Section
						styles={styles}
						label="Modified"
						count={modified.length}
						icon={<EditRegular style={{ color: '#c87020' }} />}
						expanded={expanded['modified']}
						onToggle={() => toggle('modified')}
					>
						{modified.map(obj => (
							<ObjectRow
								key={obj.key}
								styles={styles}
								obj={obj}
								selected={selectedKey === obj.key}
								isExpanded={expandedObjects.has(obj.key)}
								onSelect={() => onSelect(obj.key)}
								onToggleExpand={() => toggleObj(obj.key)}
							/>
						))}
					</Section>
				)}

				{/* Unchanged */}
				{unchanged.length > 0 && (
					<Section
						styles={styles}
						label="Unchanged"
						count={unchanged.length}
						icon={<CheckmarkCircleRegular style={{ color: tokens.colorNeutralForeground3 }} />}
						expanded={expanded['unchanged']}
						onToggle={() => toggle('unchanged')}
					>
						{unchanged.map(obj => (
							<ObjectRow
								key={obj.key}
								styles={styles}
								obj={obj}
								selected={selectedKey === obj.key}
								isExpanded={false}
								onSelect={() => onSelect(obj.key)}
								onToggleExpand={() => { }}
							/>
						))}
					</Section>
				)}
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface SectionProps {
	styles: ReturnType<typeof useStyles>;
	label: string;
	count: number;
	icon: React.ReactNode;
	expanded: boolean;
	onToggle: () => void;
	children: React.ReactNode;
}

function Section({ styles, label, count, icon, expanded, onToggle, children }: SectionProps) {
	return (
		<div className={styles.section}>
			<div className={styles.sectionHeader} onClick={onToggle}>
				{expanded
					? <ChevronDownRegular fontSize={12} />
					: <ChevronRightRegular fontSize={12} />
				}
				{icon}
				<Text className={styles.sectionLabel}>{label}</Text>
				<Badge appearance="tint" size="small">{count}</Badge>
			</div>
			{expanded && children}
		</div>
	);
}

interface ObjectRowProps {
	styles: ReturnType<typeof useStyles>;
	obj: ObjectDiff;
	selected: boolean;
	isExpanded: boolean;
	onSelect: () => void;
	onToggleExpand: () => void;
}

function ObjectRow({ styles, obj, selected, isExpanded, onSelect, onToggleExpand }: ObjectRowProps) {
	const hasDetail =
		obj.change === 'modified' &&
		(obj.columnChanges.some(c => c.change !== 'unchanged') ||
		 obj.pkChanged ||
		 obj.indexChanges.length > 0 ||
		 obj.fkChanges.length > 0);

	const changedColumns = obj.columnChanges.filter(c => c.change !== 'unchanged');

	return (
		<>
			<div
				className={`${styles.objectRow} ${selected ? styles.objectRowSelected : ''}`}
				onClick={onSelect}
			>
				{hasDetail ? (
					<span
						className={styles.expandBtn}
						onClick={e => { e.stopPropagation(); onToggleExpand(); }}
					>
						{isExpanded
							? <ChevronDownRegular fontSize={10} />
							: <ChevronRightRegular fontSize={10} />
						}
					</span>
				) : (
					<span style={{ width: '14px', flexShrink: 0 }} />
				)}
				<TableRegular fontSize={14} />
				<span className={styles.objectLabel} title={`${obj.schemaName}.${obj.name}`}>
					{obj.schemaName !== 'dbo' ? `${obj.schemaName}.` : ''}{obj.name}
				</span>
			</div>

			{isExpanded && hasDetail && (
				<>
					{changedColumns.map(cc => (
						<ColumnRow key={cc.name} styles={styles} cc={cc} />
					))}
					{obj.pkChanged && (
						<div className={styles.columnRow}>
							<EditRegular fontSize={10} />
							<span className={styles.colName}>Primary Key</span>
							<span className={styles.colChange}>changed</span>
						</div>
					)}
					{obj.indexChanges.map(ic => (
						<div key={ic.name} className={styles.columnRow}>
							{ic.change === 'added'
								? <AddCircleRegular fontSize={10} style={{ color: '#22a060' }} />
								: <DismissCircleRegular fontSize={10} style={{ color: '#cc2828' }} />
							}
							<span className={styles.colName} title={ic.name}>{ic.name}</span>
							<span className={styles.colChange}>index {ic.change}</span>
						</div>
					))}
					{obj.fkChanges.map(fc => (
						<div key={fc.name} className={styles.columnRow}>
							{fc.change === 'added'
								? <AddCircleRegular fontSize={10} style={{ color: '#22a060' }} />
								: <DismissCircleRegular fontSize={10} style={{ color: '#cc2828' }} />
							}
							<span className={styles.colName} title={fc.name}>{fc.name}</span>
							<span className={styles.colChange}>FK {fc.change}</span>
						</div>
					))}
				</>
			)}
		</>
	);
}

interface ColumnRowProps {
	styles: ReturnType<typeof useStyles>;
	cc: ColumnChange;
}

function ColumnRow({ styles, cc }: ColumnRowProps) {
	const icon = cc.change === 'added'
		? <AddCircleRegular fontSize={10} style={{ color: '#22a060' }} />
		: cc.change === 'removed'
		? <DismissCircleRegular fontSize={10} style={{ color: '#cc2828' }} />
		: <EditRegular fontSize={10} style={{ color: '#c87020' }} />;

	const detail = cc.change === 'modified' && cc.fieldChanges.length > 0
		? cc.fieldChanges.map(f => `${f.field}: ${f.from} → ${f.to}`).join(', ')
		: cc.change;

	return (
		<div className={styles.columnRow}>
			{icon}
			<span className={styles.colName} title={cc.name}>{cc.name}</span>
			<span className={styles.colChange}>{detail}</span>
		</div>
	);
}
