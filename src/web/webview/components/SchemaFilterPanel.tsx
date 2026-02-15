import React, { useState, useMemo } from 'react';
import {
	makeStyles,
	tokens,
	Button,
	Checkbox,
	SearchBox,
	Text,
	Divider,
} from '@fluentui/react-components';
import {
	ChevronLeftRegular,
	ChevronRightRegular,
	ArrowResetRegular,
	FilterRegular,
} from '@fluentui/react-icons';

interface SchemaFilterPanelProps {
	schemas: string[];
	visibleSchemas: Set<string>;
	defaultSchema: string;
	onVisibilityChange: (visibleSchemas: Set<string>) => void;
	onReset: () => void;
}

const useStyles = makeStyles({
	panel: {
		position: 'absolute',
		top: '56px',
		right: 0,
		width: '280px',
		height: 'calc(100% - 56px)',
		backgroundColor: tokens.colorNeutralBackground1,
		borderLeft: `1px solid ${tokens.colorNeutralStroke1}`,
		boxShadow: tokens.shadow8,
		display: 'flex',
		flexDirection: 'column',
		zIndex: 100,
		transition: 'transform 0.2s ease-in-out',
	},
	panelCollapsed: {
		transform: 'translateX(280px)',
	},
	toggleButton: {
		position: 'absolute',
		left: '-32px',
		top: '8px',
		width: '32px',
		height: '32px',
		minWidth: '32px',
		padding: 0,
		backgroundColor: tokens.colorNeutralBackground1,
		borderTopLeftRadius: tokens.borderRadiusMedium,
		borderBottomLeftRadius: tokens.borderRadiusMedium,
		borderRight: 'none',
		boxShadow: tokens.shadow4,
	},
	header: {
		padding: `${tokens.spacingVerticalM} ${tokens.spacingHorizontalM}`,
		borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'space-between',
	},
	headerTitle: {
		fontWeight: tokens.fontWeightSemibold,
		fontSize: tokens.fontSizeBase300,
		display: 'flex',
		alignItems: 'center',
		gap: tokens.spacingHorizontalS,
	},
	content: {
		flex: 1,
		padding: tokens.spacingHorizontalM,
		overflowY: 'auto',
		display: 'flex',
		flexDirection: 'column',
		gap: tokens.spacingVerticalS,
	},
	searchBox: {
		marginBottom: tokens.spacingVerticalS,
	},
	schemaItem: {
		display: 'flex',
		alignItems: 'center',
		padding: `${tokens.spacingVerticalXS} 0`,
	},
	schemaCount: {
		fontSize: tokens.fontSizeBase200,
		color: tokens.colorNeutralForeground3,
		marginTop: tokens.spacingVerticalXS,
	},
	footer: {
		padding: tokens.spacingHorizontalM,
		borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
	},
});

export const SchemaFilterPanel: React.FC<SchemaFilterPanelProps> = ({
	schemas,
	visibleSchemas,
	defaultSchema,
	onVisibilityChange,
	onReset,
}) => {
	const styles = useStyles();
	const [isCollapsed, setIsCollapsed] = useState(false);
	const [searchQuery, setSearchQuery] = useState('');

	const filteredSchemas = useMemo(() => {
		if (!searchQuery) return schemas;
		const query = searchQuery.toLowerCase();
		return schemas.filter(s => s.toLowerCase().includes(query));
	}, [schemas, searchQuery]);

	const handleSchemaToggle = (schemaName: string, checked: boolean) => {
		const newVisible = new Set(visibleSchemas);
		if (checked) {
			newVisible.add(schemaName);
		} else {
			newVisible.delete(schemaName);
		}
		onVisibilityChange(newVisible);
	};

	const handleSelectAll = () => {
		onVisibilityChange(new Set(schemas));
	};

	const handleDeselectAll = () => {
		onVisibilityChange(new Set([defaultSchema]));
	};

	return (
		<div className={`${styles.panel} ${isCollapsed ? styles.panelCollapsed : ''}`}>
			<Button
				className={styles.toggleButton}
				icon={isCollapsed ? <ChevronLeftRegular /> : <ChevronRightRegular />}
				appearance="subtle"
				onClick={() => setIsCollapsed(!isCollapsed)}
				title={isCollapsed ? 'Show Schema Filter' : 'Hide Schema Filter'}
			/>

			<div className={styles.header}>
				<div className={styles.headerTitle}>
					<FilterRegular />
					<Text>Schema Filter</Text>
				</div>
				<Button
					icon={<ArrowResetRegular />}
					appearance="subtle"
					size="small"
					onClick={onReset}
					title="Reset to default schema"
				/>
			</div>

			<div className={styles.content}>
				<SearchBox
					className={styles.searchBox}
					placeholder="Search schemas..."
					value={searchQuery}
					onChange={(_, data) => setSearchQuery(data?.value || '')}
					size="small"
				/>

				<div style={{ display: 'flex', gap: tokens.spacingHorizontalS, marginBottom: tokens.spacingVerticalS }}>
					<Button
						appearance="subtle"
						size="small"
						onClick={handleSelectAll}
						disabled={visibleSchemas.size === schemas.length}
					>
						Select All
					</Button>
					<Button
						appearance="subtle"
						size="small"
						onClick={handleDeselectAll}
						disabled={visibleSchemas.size === 1 && visibleSchemas.has(defaultSchema)}
					>
						Deselect All
					</Button>
				</div>

				<Divider />

				{filteredSchemas.length === 0 ? (
					<Text size={200} style={{ color: tokens.colorNeutralForeground3, textAlign: 'center', padding: tokens.spacingVerticalL }}>
						No schemas found
					</Text>
				) : (
					filteredSchemas.map(schema => (
						<div key={schema} className={styles.schemaItem}>
							<Checkbox
								checked={visibleSchemas.has(schema)}
								onChange={(_, data) => handleSchemaToggle(schema, data.checked === true)}
								label={schema}
							/>
							{schema === defaultSchema && (
								<Text size={100} style={{ marginLeft: 'auto', color: tokens.colorNeutralForeground3 }}>
									(default)
								</Text>
							)}
						</div>
					))
				)}

				<Divider style={{ marginTop: 'auto' }} />

				<div className={styles.schemaCount}>
					{visibleSchemas.size} of {schemas.length} schema{schemas.length !== 1 ? 's' : ''} visible
				</div>
			</div>
		</div>
	);
};
