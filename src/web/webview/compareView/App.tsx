/**
 * Schema Compare — single-page React application.
 *
 * Layout:
 *   ┌─ header ────────────────────────────────────────────────────────────────┐
 *   │ Schema Compare  Source [dropdown] ⇄ Target [dropdown]                  │
 *   │ [▶ Compare] ☐ Ignore case  ···  [📜 Migration Script] [↻ Refresh]      │
 *   ├─ body ──────────────────────────────────────────────────────────────────┤
 *   │ results tree (260px) │ side-by-side diff                                │
 *   └─────────────────────┴──────────────────────────────────────────────────┘
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
	FluentProvider,
	webLightTheme,
	webDarkTheme,
	Button,
	Checkbox,
	makeStyles,
	tokens,
	Spinner,
	Text,
	Tooltip,
	Badge,
} from '@fluentui/react-components';
import {
	ArrowSyncRegular,
	ScriptRegular,
	ArrowSwapRegular,
	ArrowCounterclockwiseRegular,
} from '@fluentui/react-icons';
import { FileDropdown } from './FileDropdown';
import { ResultsTree } from './ResultsTree';
import { DiffView } from './DiffView';
import type { ExtensionMessage, WebviewMessage, CompareResult } from './types';

// ---------------------------------------------------------------------------
// VS Code API bridge
// ---------------------------------------------------------------------------

declare const acquireVsCodeApi: () => {
	postMessage(message: WebviewMessage): void;
	getState(): unknown;
	setState(state: unknown): void;
};

const vscode = acquireVsCodeApi();

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const useStyles = makeStyles({
	root: {
		width: '100vw',
		height: '100vh',
		display: 'flex',
		flexDirection: 'column',
		overflow: 'hidden',
		backgroundColor: tokens.colorNeutralBackground1,
	},

	// ── Header ──────────────────────────────────────────────────────────────
	header: {
		display: 'flex',
		flexDirection: 'column',
		flexShrink: 0,
		borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
		backgroundColor: tokens.colorNeutralBackground2,
	},
	headerRow1: {
		display: 'flex',
		alignItems: 'center',
		gap: tokens.spacingHorizontalS,
		padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
		flexWrap: 'wrap',
	},
	title: {
		fontWeight: tokens.fontWeightSemibold,
		fontSize: tokens.fontSizeBase300,
		color: tokens.colorNeutralForeground1,
		whiteSpace: 'nowrap',
		marginRight: tokens.spacingHorizontalS,
	},
	spacer: {
		flex: 1,
		minWidth: tokens.spacingHorizontalS,
	},
	headerRow2: {
		display: 'flex',
		alignItems: 'center',
		gap: tokens.spacingHorizontalS,
		padding: `0 ${tokens.spacingHorizontalM} ${tokens.spacingVerticalS}`,
		flexWrap: 'wrap',
	},
	errorBanner: {
		padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
		backgroundColor: tokens.colorStatusDangerBackground1,
		color: tokens.colorStatusDangerForeground1,
		fontSize: tokens.fontSizeBase200,
		borderTop: `1px solid ${tokens.colorStatusDangerBorder1}`,
	},

	// ── Body ────────────────────────────────────────────────────────────────
	body: {
		flex: 1,
		display: 'grid',
		gridTemplateColumns: '260px 1fr',
		overflow: 'hidden',
		minHeight: 0,
	},
	treePanel: {
		borderRight: `1px solid ${tokens.colorNeutralStroke1}`,
		overflow: 'hidden',
		display: 'flex',
		flexDirection: 'column',
		backgroundColor: tokens.colorNeutralBackground1,
	},
	diffPanel: {
		overflow: 'hidden',
		display: 'flex',
		flexDirection: 'column',
	},
	diffPanelHeader: {
		display: 'flex',
		alignItems: 'center',
		gap: tokens.spacingHorizontalXS,
		padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
		borderBottom: `1px solid ${tokens.colorNeutralStroke1}`,
		fontSize: tokens.fontSizeBase200,
		color: tokens.colorNeutralForeground2,
		backgroundColor: tokens.colorNeutralBackground2,
		flexShrink: 0,
	},
	diffContent: {
		flex: 1,
		overflow: 'hidden',
	},

	// ── Empty / loading states ────────────────────────────────────────────────
	placeholder: {
		flex: 1,
		display: 'flex',
		flexDirection: 'column',
		alignItems: 'center',
		justifyContent: 'center',
		gap: tokens.spacingVerticalM,
		color: tokens.colorNeutralForeground3,
		padding: tokens.spacingHorizontalXL,
		textAlign: 'center',
	},
	loadingOverlay: {
		flex: 1,
		display: 'flex',
		alignItems: 'center',
		justifyContent: 'center',
	},
});

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DiffPair {
	sourceSql: string;
	targetSql: string;
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export function App() {
	const styles = useStyles();

	// Theme detection
	const [isDark, setIsDark] = useState(
		document.body.classList.contains('vscode-dark') ||
		document.body.classList.contains('vscode-high-contrast'),
	);

	useEffect(() => {
		const observer = new MutationObserver(() => {
			setIsDark(
				document.body.classList.contains('vscode-dark') ||
				document.body.classList.contains('vscode-high-contrast'),
			);
		});
		observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
		return () => observer.disconnect();
	}, []);

	// State
	const [files,        setFiles]        = useState<string[]>([]);
	const [sourceFile,   setSourceFile]   = useState<string | null>(null);
	const [targetFile,   setTargetFile]   = useState<string | null>(null);
	const [result,       setResult]       = useState<CompareResult | null>(null);
	const [isComparing,  setIsComparing]  = useState(false);
	const [selectedKey,  setSelectedKey]  = useState<string | null>(null);
	const [diffMap,      setDiffMap]      = useState<Record<string, DiffPair>>({});
	const [ignoreCase,   setIgnoreCase]   = useState(false);
	const [error,        setError]        = useState<string | null>(null);
	const [genMigration, setGenMigration] = useState(false);

	// Message handler
	const handleMessage = useCallback((event: MessageEvent) => {
		const msg = event.data as ExtensionMessage;
		switch (msg.command) {
			case 'filesListed':
				setFiles(msg.files);
				break;
			case 'compareResult':
				setResult(msg.result);
				setIsComparing(false);
				setSelectedKey(null);
				setDiffMap({});
				break;
			case 'diffContent':
				setDiffMap(prev => ({
					...prev,
					[msg.key]: { sourceSql: msg.sourceSql, targetSql: msg.targetSql },
				}));
				break;
			case 'migrationReady':
				setGenMigration(false);
				break;
			case 'error':
				setError(msg.message);
				setIsComparing(false);
				break;
		}
	}, []);

	useEffect(() => {
		window.addEventListener('message', handleMessage);
		vscode.postMessage({ command: 'ready' });
		return () => window.removeEventListener('message', handleMessage);
	}, [handleMessage]);

	// ── Actions ─────────────────────────────────────────────────────────────

	const runComparison = (src = sourceFile, tgt = targetFile) => {
		if (!src || !tgt) { return; }
		setError(null);
		setIsComparing(true);
		setResult(null);
		vscode.postMessage({
			command: 'compare',
			sourceFiles: [src],
			targetFiles: [tgt],
			options: { ignoreCase },
		});
	};

	const swapAndRecompare = () => {
		const newSrc = targetFile;
		const newTgt = sourceFile;
		setSourceFile(newSrc);
		setTargetFile(newTgt);
		if (newSrc && newTgt) {
			runComparison(newSrc, newTgt);
		}
	};

	const handleSelectObject = (key: string) => {
		setSelectedKey(key);
		if (!diffMap[key]) {
			vscode.postMessage({ command: 'requestDiff', key });
		}
	};

	const canCompare = !!sourceFile && !!targetFile && !isComparing;
	const currentDiff = selectedKey ? diffMap[selectedKey] : null;
	const selectedObj = result?.objects.find(o => o.key === selectedKey);

	// ── Render ───────────────────────────────────────────────────────────────

	return (
		<FluentProvider theme={isDark ? webDarkTheme : webLightTheme} style={{ height: '100%' }}>
			<div className={styles.root}>

				{/* ── Header ── */}
				<div className={styles.header}>

					{/* Row 1: title + file pickers + swap */}
					<div className={styles.headerRow1}>
						<Text className={styles.title}>Schema Compare</Text>

						<FileDropdown
							id="source-file"
							label="Source"
							accentColor="#2563eb"
							files={files}
							value={sourceFile}
							onChange={setSourceFile}
						/>

						<Tooltip content="Swap source and target" relationship="label">
							<Button
								appearance="subtle"
								size="small"
								icon={<ArrowSwapRegular />}
								onClick={swapAndRecompare}
								disabled={!sourceFile && !targetFile}
							/>
						</Tooltip>

						<FileDropdown
							id="target-file"
							label="Target"
							accentColor="#16a34a"
							files={files}
							value={targetFile}
							onChange={setTargetFile}
						/>
					</div>

					{/* Row 2: actions */}
					<div className={styles.headerRow2}>
						<Button
							appearance="primary"
							size="small"
							icon={isComparing ? <Spinner size="tiny" /> : <ArrowSyncRegular />}
							onClick={() => runComparison()}
							disabled={!canCompare}
						>
							{isComparing ? 'Comparing…' : 'Compare'}
						</Button>

						<Checkbox
							label="Ignore case"
							size="medium"
							checked={ignoreCase}
							onChange={(_, d) => setIgnoreCase(!!d.checked)}
						/>

						<div className={styles.spacer} />

						{result && (
							<Tooltip content="Generate migration SQL and open in editor" relationship="label">
								<Button
									appearance="subtle"
									size="small"
									icon={<ScriptRegular />}
									onClick={() => {
										setGenMigration(true);
										vscode.postMessage({ command: 'generateMigration' });
									}}
									disabled={genMigration}
								>
									{genMigration ? 'Generating…' : 'Migration Script'}
								</Button>
							</Tooltip>
						)}

						<Tooltip content="Refresh file list from workspace" relationship="label">
							<Button
								appearance="subtle"
								size="small"
								icon={<ArrowCounterclockwiseRegular />}
								onClick={() => vscode.postMessage({ command: 'listFiles' })}
							/>
						</Tooltip>
					</div>

					{error && (
						<div className={styles.errorBanner}>{error}</div>
					)}
				</div>

				{/* ── Body ── */}
				<div className={styles.body}>

					{/* Left: results tree */}
					<div className={styles.treePanel}>
						{isComparing ? (
							<div className={styles.loadingOverlay}>
								<Spinner size="medium" label="Comparing…" />
							</div>
						) : result ? (
							<ResultsTree
								result={result}
								selectedKey={selectedKey}
								onSelect={handleSelectObject}
							/>
						) : (
							<div className={styles.placeholder}>
								<ArrowSyncRegular fontSize={32} />
								<Text size={200}>
									Select source and target files above, then click Compare.
								</Text>
							</div>
						)}
					</div>

					{/* Right: diff view */}
					<div className={styles.diffPanel}>
						{selectedObj && (
							<div className={styles.diffPanelHeader}>
								<strong>
									{selectedObj.schemaName !== 'dbo'
										? `${selectedObj.schemaName}.${selectedObj.name}`
										: selectedObj.name}
								</strong>
								{' — '}
								{selectedObj.change === 'added'     && <Badge color="success">Added</Badge>}
								{selectedObj.change === 'removed'   && <Badge color="danger">Removed</Badge>}
								{selectedObj.change === 'modified'  && <Badge color="warning">Modified</Badge>}
								{selectedObj.change === 'unchanged' && <Badge color="informative">Unchanged</Badge>}
								{currentDiff == null && selectedObj.change !== 'unchanged' && (
									<Spinner size="tiny" style={{ marginLeft: 8 }} />
								)}
							</div>
						)}

						<div className={styles.diffContent}>
							<DiffView
								sourceSql={currentDiff?.sourceSql ?? ''}
								targetSql={currentDiff?.targetSql ?? ''}
								sourceLabel={result?.sourceLabel ?? 'Source'}
								targetLabel={result?.targetLabel ?? 'Target'}
							/>
						</div>
					</div>

				</div>
			</div>
		</FluentProvider>
	);
}
