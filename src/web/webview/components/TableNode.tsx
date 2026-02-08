import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { makeStyles, tokens, Button } from '@fluentui/react-components';
import { KeyRegular, EditRegular } from '@fluentui/react-icons';
import { Table } from '../types';

interface TableNodeProps {
	data: {
		schemaName: string;
		table: Table;
		onEdit?: (schemaName: string, table: Table) => void;
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
	},
	editButton: {
		minWidth: 'auto',
		padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalXS}`,
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
	columnRowPK: {
		fontWeight: tokens.fontWeightSemibold,
		color: tokens.colorPaletteDarkOrangeForeground1,
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
	const { schemaName, table, onEdit } = data;
	const tableId = `${schemaName}.${table.name}`;

	return (
		<div className={styles.tableNode}>
			<div className={styles.header}>
				<div className={styles.headerTitle}>
					{schemaName}.{table.name}
				</div>
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
			</div>
			<div className={styles.columns}>
				{table.columns.map((col, index) => (
					<div
						key={index}
						className={`${styles.columnRow} ${col.isPrimaryKey ? styles.columnRowPK : ''}`}
					>
						{/* Target handle on the left for incoming FK connections */}
						<Handle
							type="target"
							position={Position.Left}
							id={`${tableId}-${col.name}-target`}
							style={{ left: -8, top: '50%' }}
						/>
						<span className={styles.columnName}>
							{col.isPrimaryKey && <KeyRegular className={styles.keyIcon} />}
							{col.name}
						</span>
						<span className={styles.columnType}>
							{col.type}
							{!col.isNullable && ' NOT NULL'}
						</span>
						{/* Source handle on the right for outgoing FK connections */}
						<Handle
							type="source"
							position={Position.Right}
							id={`${tableId}-${col.name}-source`}
							style={{ right: -8, top: '50%' }}
						/>
					</div>
				))}
			</div>
		</div>
	);
};

export default TableNode;
