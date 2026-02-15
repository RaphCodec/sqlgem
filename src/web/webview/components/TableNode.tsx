import React, { useState } from 'react';
import { Handle, Position } from '@xyflow/react';
import { 
	makeStyles, 
	tokens, 
	Button, 
	Menu, 
	MenuTrigger, 
	MenuPopover, 
	MenuList, 
	MenuItem,
	Dialog,
	DialogSurface,
	DialogTitle,
	DialogBody,
	DialogContent,
	DialogActions
} from '@fluentui/react-components';
import { KeyRegular, EditRegular, MoreVerticalRegular, DeleteRegular } from '@fluentui/react-icons';
import { Table } from '../types';

interface TableNodeProps {
	data: {
		schemaName: string;
		table: Table;
		onEdit?: (schemaName: string, table: Table) => void;
		onDelete?: (schemaName: string, tableName: string) => void;
	};
}

const useStyles = makeStyles({
	tableNode: {
		backgroundColor: tokens.colorNeutralBackground1,
		border: `2px solid ${tokens.colorBrandBackground}`,
		borderRadius: tokens.borderRadiusMedium,
		minWidth: '220px',
		boxShadow: tokens.shadow8,
	},
	header: {
		backgroundColor: tokens.colorBrandBackground,
		color: tokens.colorNeutralForegroundOnBrand,
		padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
		fontWeight: tokens.fontWeightSemibold,
		borderRadius: `${tokens.borderRadiusMedium} ${tokens.borderRadiusMedium} 0 0`,
		fontSize: tokens.fontSizeBase300,
		display: 'flex',
		justifyContent: 'space-between',
		alignItems: 'center',
	},
	headerTitle: {
		flex: 1,
		overflow: 'hidden',
		textOverflow: 'ellipsis',
		whiteSpace: 'nowrap',
	},
	headerActions: {
		display: 'flex',
		gap: tokens.spacingHorizontalXXS,
	},
	editButton: {
		minWidth: 'auto',
		padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalXXS}`,
	},
	columns: {
		padding: `${tokens.spacingVerticalS} 0`,
	},
	columnRow: {
		padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
		display: 'flex',
		justifyContent: 'space-between',
		fontSize: tokens.fontSizeBase200,
		color: tokens.colorNeutralForeground1,
		alignItems: 'center',
		position: 'relative',
	},
	columnName: {
		display: 'flex',
		alignItems: 'center',
		gap: tokens.spacingHorizontalXXS,
	},
	columnType: {
		color: tokens.colorNeutralForeground3,
		fontSize: tokens.fontSizeBase100,
		marginLeft: tokens.spacingHorizontalS,
	},
	keyIcon: {
		fontSize: tokens.fontSizeBase200,
		color: tokens.colorPaletteDarkOrangeForeground1,
	},
});

const TableNode: React.FC<TableNodeProps> = ({ data }) => {
	const styles = useStyles();
	const { schemaName, table, onEdit, onDelete } = data;
	const tableId = `${schemaName}.${table.name}`;
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

	const getFullType = (col: any): string => {
		const baseType = col.type;
		if (baseType === 'VARCHAR' || baseType === 'NVARCHAR') {
			return `${baseType}(${col.length || 255})`;
		} else if (baseType === 'DECIMAL') {
			return `DECIMAL(${col.precision || 18},${col.scale || 2})`;
		}
		return baseType;
	};

	return (
		<>
		<div className={styles.tableNode}>
			<div className={styles.header}>
				<div className={styles.headerTitle}>
					{schemaName}.{table.name}
				</div>
				<div className={styles.headerActions}>
					{onEdit && (
						<Button
							appearance="transparent"
							icon={<EditRegular />}
							onClick={(e) => {
								e.stopPropagation();
								onEdit(schemaName, table);
							}}
							className={styles.editButton}
							size="small"
						/>
					)}
					{(onEdit || onDelete) && (
						<Menu>
							<MenuTrigger disableButtonEnhancement>
								<Button
									appearance="transparent"
									icon={<MoreVerticalRegular />}
									onClick={(e) => e.stopPropagation()}
									className={styles.editButton}
									size="small"
								/>
							</MenuTrigger>
							<MenuPopover>
								<MenuList>
									{onEdit && (
										<MenuItem
											icon={<EditRegular />}
											onClick={(e) => {
												e.stopPropagation();
												onEdit(schemaName, table);
											}}
										>
											Edit Table
										</MenuItem>
									)}
									{onDelete && (
										<MenuItem
											icon={<DeleteRegular />}
											onClick={(e) => {
												e.stopPropagation();
									setDeleteDialogOpen(true);
											}}
										>
											Delete Table
										</MenuItem>
									)}
								</MenuList>
							</MenuPopover>
						</Menu>
					)}
				</div>
			</div>
			<div className={styles.columns}>
				{table.columns.map((col, index) => (
					<div key={index} className={styles.columnRow}>
						{/* Left handle - supports both source and target for bidirectional connections */}
						<Handle
							type="target"
							position={Position.Left}
							id={`${tableId}-${col.name}-target`}
							style={{ left: -8, top: '50%' }}
							isConnectable={true}
						/>
						<span className={styles.columnName}>
							{col.isPrimaryKey && <KeyRegular className={styles.keyIcon} />}
							{col.name}
						</span>
						<span className={styles.columnType}>
							{getFullType(col)}
							{!col.isNullable && ' NOT NULL'}
						</span>
						{/* Right handle - supports both source and target for bidirectional connections */}
						<Handle
							type="source"
							position={Position.Right}
							id={`${tableId}-${col.name}-source`}
							style={{ right: -8, top: '50%' }}
							isConnectable={true}
						/>
					</div>
				))}
			</div>
		</div>

			<Dialog open={deleteDialogOpen} onOpenChange={(_, data) => setDeleteDialogOpen(data.open)}>
				<DialogSurface>
					<DialogBody>
						<DialogTitle>Delete Table</DialogTitle>
						<DialogContent>
							Are you sure you want to delete table {table.name}?
						</DialogContent>
						<DialogActions>
							<Button appearance="secondary" onClick={() => setDeleteDialogOpen(false)}>
								Cancel
							</Button>
							<Button
								appearance="primary"
								onClick={() => {
									if (onDelete) {
										onDelete(schemaName, table.name);
									}
									setDeleteDialogOpen(false);
								}}
							>
								Delete
							</Button>
						</DialogActions>
					</DialogBody>
				</DialogSurface>
			</Dialog>
		</>
	);
};

// Memoize component to prevent unnecessary re-renders
export default React.memo(TableNode, (prevProps, nextProps) => {
	// Only re-render if table data or schema name changes
	return (
		prevProps.data.schemaName === nextProps.data.schemaName &&
		prevProps.data.table.name === nextProps.data.table.name &&
		prevProps.data.table.columns.length === nextProps.data.table.columns.length &&
		prevProps.data.onEdit === nextProps.data.onEdit &&
		prevProps.data.onDelete === nextProps.data.onDelete
	);
});
