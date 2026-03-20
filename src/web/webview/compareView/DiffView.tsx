/**
 * Side-by-side SQL diff component.
 *
 * Receives two SQL strings and renders them line-by-line with additions,
 * removals, and modifications highlighted.
 */

import React, { useMemo } from 'react';
import { makeStyles, tokens } from '@fluentui/react-components';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type LineKind = 'same' | 'added' | 'removed';

interface DiffLine {
	kind: LineKind;
	text: string;
}

interface SideBySideRow {
	left:  { kind: LineKind; text: string } | null;
	right: { kind: LineKind; text: string } | null;
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const useStyles = makeStyles({
	container: {
		display: 'flex',
		flexDirection: 'column',
		height: '100%',
		overflow: 'hidden',
	},
	header: {
		display: 'grid',
		gridTemplateColumns: '1fr 1fr',
		gap: '1px',
		backgroundColor: tokens.colorNeutralStroke1,
		borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
		flexShrink: 0,
	},
	headerCell: {
		padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
		backgroundColor: tokens.colorNeutralBackground2,
		fontWeight: tokens.fontWeightSemibold,
		fontSize: tokens.fontSizeBase200,
		color: tokens.colorNeutralForeground2,
	},
	scrollArea: {
		flex: 1,
		overflowY: 'auto',
		overflowX: 'auto',
	},
	table: {
		width: '100%',
		borderCollapse: 'collapse',
		fontFamily: 'var(--vscode-editor-font-family, "Cascadia Code", "Consolas", monospace)',
		fontSize: tokens.fontSizeBase200,
	},
	row: {
		display: 'contents',
	},
	cell: {
		padding: '1px 12px',
		whiteSpace: 'pre',
		verticalAlign: 'top',
		borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
		minWidth: '40%',
		boxSizing: 'border-box',
	},
	lineNum: {
		padding: '1px 8px',
		color: tokens.colorNeutralForeground4,
		textAlign: 'right',
		userSelect: 'none',
		borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
		minWidth: '3ch',
	},
	cellSame: {
		backgroundColor: tokens.colorNeutralBackground1,
		color: tokens.colorNeutralForeground1,
	},
	cellAdded: {
		backgroundColor: 'rgba(0, 170, 60, 0.15)',
		color: tokens.colorNeutralForeground1,
	},
	cellRemoved: {
		backgroundColor: 'rgba(204, 40, 40, 0.15)',
		color: tokens.colorNeutralForeground1,
	},
	cellEmpty: {
		backgroundColor: tokens.colorNeutralBackground3,
	},
	placeholder: {
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
		height: '100%',
		color: tokens.colorNeutralForeground3,
		fontSize: tokens.fontSizeBase300,
	},
});

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DiffViewProps {
	sourceSql: string;
	targetSql: string;
	sourceLabel: string;
	targetLabel: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DiffView({ sourceSql, targetSql, sourceLabel, targetLabel }: DiffViewProps) {
	const styles = useStyles();

	const rows = useMemo<SideBySideRow[]>(() => {
		if (!sourceSql && !targetSql) { return []; }
		const diff = computeLineDiff(sourceSql, targetSql);
		return buildSideBySide(diff);
	}, [sourceSql, targetSql]);

	if (!sourceSql && !targetSql) {
		return (
			<div className={styles.placeholder}>
				Select an item in the results list to see the diff.
			</div>
		);
	}

	let leftLineNum  = 0;
	let rightLineNum = 0;

	return (
		<div className={styles.container}>
			<div className={styles.header}>
				<div className={styles.headerCell}>{sourceLabel || 'Source'}</div>
				<div className={styles.headerCell}>{targetLabel || 'Target'}</div>
			</div>

			<div className={styles.scrollArea}>
				<table className={styles.table}>
					<tbody>
						{rows.map((row, i) => {
							const lKind = row.left?.kind  ?? 'same';
							const rKind = row.right?.kind ?? 'same';

							if (row.left)  { leftLineNum++;  }
							if (row.right) { rightLineNum++; }

							const ln = row.left  ? leftLineNum  : '';
							const rn = row.right ? rightLineNum : '';

							return (
								<tr key={i}>
									<td className={styles.lineNum}>{ln}</td>
									<td className={`${styles.cell} ${cellStyle(styles, lKind, !row.left)}`}>
										{row.left ? row.left.text : ''}
									</td>
									<td className={styles.lineNum}>{rn}</td>
									<td className={`${styles.cell} ${cellStyle(styles, rKind, !row.right)}`}>
										{row.right ? row.right.text : ''}
									</td>
								</tr>
							);
						})}
					</tbody>
				</table>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function cellStyle(
	styles: ReturnType<typeof useStyles>,
	kind: LineKind,
	isEmpty: boolean,
): string {
	if (isEmpty)            { return styles.cellEmpty; }
	if (kind === 'added')   { return styles.cellAdded; }
	if (kind === 'removed') { return styles.cellRemoved; }
	return styles.cellSame;
}

/** LCS-based line diff producing a flat sequence of DiffLine. */
function computeLineDiff(a: string, b: string): DiffLine[] {
	const aLines = a.split('\n');
	const bLines = b.split('\n');
	const m = aLines.length;
	const n = bLines.length;

	// Build LCS table
	const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
	for (let i = 1; i <= m; i++) {
		for (let j = 1; j <= n; j++) {
			dp[i][j] = aLines[i - 1] === bLines[j - 1]
				? dp[i - 1][j - 1] + 1
				: Math.max(dp[i - 1][j], dp[i][j - 1]);
		}
	}

	// Backtrack to produce diff
	const result: DiffLine[] = [];
	let i = m, j = n;
	while (i > 0 || j > 0) {
		if (i > 0 && j > 0 && aLines[i - 1] === bLines[j - 1]) {
			result.unshift({ kind: 'same',    text: aLines[i - 1] });
			i--; j--;
		} else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
			result.unshift({ kind: 'added',   text: bLines[j - 1] });
			j--;
		} else {
			result.unshift({ kind: 'removed', text: aLines[i - 1] });
			i--;
		}
	}

	return result;
}

/** Pair adjacent removed/added lines into side-by-side rows. */
function buildSideBySide(diff: DiffLine[]): SideBySideRow[] {
	const rows: SideBySideRow[] = [];
	let i = 0;

	while (i < diff.length) {
		const curr = diff[i];

		if (curr.kind === 'same') {
			rows.push({ left: curr, right: curr });
			i++;
		} else if (curr.kind === 'removed') {
			const next = diff[i + 1];
			if (next?.kind === 'added') {
				rows.push({ left: curr, right: next });
				i += 2;
			} else {
				rows.push({ left: curr, right: null });
				i++;
			}
		} else {
			// 'added' with no preceding 'removed'
			rows.push({ left: null, right: curr });
			i++;
		}
	}

	return rows;
}
