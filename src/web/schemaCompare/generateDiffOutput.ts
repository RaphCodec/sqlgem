/**
 * Diff output generators.
 *
 * generateDiffText()  — plain-text human-readable diff (Git-style symbols).
 * generateDiffHTML()  — self-contained VS Code–themed HTML page for a webview.
 */

import type { SchemaComparison, ModifiedTableDiff, ColumnChange } from './SchemaCompareModel';

// ---------------------------------------------------------------------------
// Plain-text output
// ---------------------------------------------------------------------------

export function generateDiffText(comparison: SchemaComparison): string {
	const lines: string[] = [];

	lines.push(`Schema Comparison`);
	lines.push(`Source : ${comparison.sourceLabel}`);
	lines.push(`Target : ${comparison.targetLabel}`);
	lines.push('='.repeat(60));
	lines.push('');

	const hasChanges =
		comparison.addedSchemas.length
		+ comparison.removedSchemas.length
		+ comparison.addedTables.length
		+ comparison.removedTables.length
		+ comparison.modifiedTables.length > 0;

	if (!hasChanges) {
		lines.push('No differences found. The schemas are identical.');
		return lines.join('\n');
	}

	if (comparison.addedSchemas.length > 0) {
		lines.push('Schemas Added:');
		comparison.addedSchemas.forEach(s => lines.push(`  + Schema [${s}]`));
		lines.push('');
	}
	if (comparison.removedSchemas.length > 0) {
		lines.push('Schemas Removed:');
		comparison.removedSchemas.forEach(s => lines.push(`  - Schema [${s}]`));
		lines.push('');
	}
	if (comparison.addedTables.length > 0) {
		lines.push('Tables Added:');
		comparison.addedTables.forEach(t => lines.push(`  + Table \`${t.schemaName}.${t.tableName}\``));
		lines.push('');
	}
	if (comparison.removedTables.length > 0) {
		lines.push('Tables Removed:');
		comparison.removedTables.forEach(t => lines.push(`  - Table \`${t.schemaName}.${t.tableName}\``));
		lines.push('');
	}
	if (comparison.modifiedTables.length > 0) {
		lines.push('Tables Modified:');
		lines.push('');
		comparison.modifiedTables.forEach(t => appendTableDiff(t, lines));
	}

	return lines.join('\n');
}

function appendTableDiff(diff: ModifiedTableDiff, lines: string[]): void {
	lines.push(`~ Table \`${diff.schemaName}.${diff.tableName}\`:`);

	if (diff.pkChanged) {
		const oldPk = diff.oldPk?.join(', ') || '(none)';
		const newPk = diff.newPk?.join(', ') || '(none)';
		lines.push(`    ~ Primary Key changed: (${oldPk}) → (${newPk})`);
	}

	diff.addedColumns.forEach(c => lines.push(`    + Column \`${c.name}\` added`));
	diff.removedColumns.forEach(c => lines.push(`    - Column \`${c.name}\` removed`));
	diff.modifiedColumns.forEach(c => appendColumnChange(c, lines));

	diff.addedIndexes.forEach(idx => {
		const uq = idx.isUnique ? 'UNIQUE ' : '';
		const cl = idx.isClustered ? 'CLUSTERED' : 'NONCLUSTERED';
		lines.push(`    + Index \`${idx.name}\` added (${uq}${cl} on (${idx.columns.join(', ')}))`);
	});
	diff.removedIndexes.forEach(idx => lines.push(`    - Index \`${idx.name}\` removed`));

	diff.addedForeignKeys.forEach(fk =>
		lines.push(
			`    + Foreign Key \`${fk.constraintName}\` added` +
			` (\`${fk.column}\` → \`${fk.refSchema}.${fk.refTable}.${fk.refColumn}\`)`,
		),
	);
	diff.removedForeignKeys.forEach(fk =>
		lines.push(`    - Foreign Key \`${fk.constraintName}\` removed`),
	);

	diff.addedUniqueConstraints.forEach(uc =>
		lines.push(`    + Unique Constraint \`${uc.name}\` added on (${uc.columns.join(', ')})`),
	);
	diff.removedUniqueConstraints.forEach(uc =>
		lines.push(`    - Unique Constraint \`${uc.name}\` removed`),
	);

	lines.push('');
}

function appendColumnChange(change: ColumnChange, lines: string[]): void {
	lines.push(`    ~ Column \`${change.name}\` modified:`);
	change.changes.forEach(d => {
		const oldVal = d.oldValue ?? '(none)';
		const newVal = d.newValue ?? '(none)';
		lines.push(`        ${d.field}: ${oldVal} → ${newVal}`);
	});
}

// ---------------------------------------------------------------------------
// HTML output (self-contained, VS Code–themed webview page)
// ---------------------------------------------------------------------------

export function generateDiffHTML(comparison: SchemaComparison): string {
	const sourceLabel = he(comparison.sourceLabel);
	const targetLabel = he(comparison.targetLabel);

	const hasChanges =
		comparison.addedSchemas.length
		+ comparison.removedSchemas.length
		+ comparison.addedTables.length
		+ comparison.removedTables.length
		+ comparison.modifiedTables.length > 0;

	const bodyParts: string[] = [];

	if (!hasChanges) {
		bodyParts.push('<p class="no-changes">No differences found. The schemas are identical.</p>');
	} else {
		if (comparison.addedSchemas.length > 0) {
			bodyParts.push(section('Schemas Added', comparison.addedSchemas.map(s => added(`Schema [${s}]`))));
		}
		if (comparison.removedSchemas.length > 0) {
			bodyParts.push(section('Schemas Removed', comparison.removedSchemas.map(s => removed(`Schema [${s}]`))));
		}
		if (comparison.addedTables.length > 0) {
			bodyParts.push(section(
				'Tables Added',
				comparison.addedTables.map(t => added(`Table <code>${he(t.schemaName)}.${he(t.tableName)}</code>`)),
			));
		}
		if (comparison.removedTables.length > 0) {
			bodyParts.push(section(
				'Tables Removed',
				comparison.removedTables.map(t => removed(`Table <code>${he(t.schemaName)}.${he(t.tableName)}</code>`)),
			));
		}
		if (comparison.modifiedTables.length > 0) {
			bodyParts.push(
				'<h2>Tables Modified</h2>',
				...comparison.modifiedTables.map(t => renderTableDiff(t)),
			);
		}
	}

	return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
  <title>Schema Comparison</title>
  <style>
    :root {
      --added:    #4ec994;
      --removed:  #f14c4c;
      --modified: #e2c08d;
      --muted:    #888888;
      --border:   #444444;
      --bg:       #1e1e1e;
      --fg:       #cccccc;
      --code-bg:  #2d2d2d;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px;
      background: var(--vscode-editor-background, var(--bg));
      color: var(--vscode-editor-foreground, var(--fg));
      margin: 0;
      padding: 20px 28px 40px;
      line-height: 1.6;
    }
    h1 { font-size: 1.25em; margin: 0 0 2px; }
    h2 { font-size: 1em; margin: 24px 0 8px; color: var(--vscode-descriptionForeground, var(--muted)); text-transform: uppercase; letter-spacing: .05em; }
    .subtitle { font-size: 0.85em; color: var(--vscode-descriptionForeground, var(--muted)); margin-bottom: 20px; }
    .no-changes { color: var(--vscode-descriptionForeground, var(--muted)); font-style: italic; }
    ul { margin: 0 0 12px; padding-left: 0; list-style: none; }
    li { padding: 2px 0 2px 18px; position: relative; }
    li::before { position: absolute; left: 0; font-weight: bold; }
    li.added   { color: var(--vscode-gitDecoration-addedResourceForeground,    var(--added));    }
    li.removed { color: var(--vscode-gitDecoration-deletedResourceForeground,  var(--removed));  }
    li.modified{ color: var(--vscode-gitDecoration-modifiedResourceForeground, var(--modified)); }
    li.added::before   { content: '+'; color: var(--added);    }
    li.removed::before { content: '−'; color: var(--removed);  }
    li.modified::before{ content: '~'; color: var(--modified); }
    .table-block { border: 1px solid var(--vscode-panel-border, var(--border)); border-radius: 4px; padding: 12px 16px; margin-bottom: 12px; }
    .table-title { font-weight: 600; margin-bottom: 8px; }
    .table-title code { background: var(--vscode-textCodeBlock-background, var(--code-bg)); padding: 1px 5px; border-radius: 3px; font-size: 0.95em; }
    .change-detail { font-size: 0.85em; color: var(--vscode-descriptionForeground, var(--muted)); padding-left: 24px; }
    code { font-family: var(--vscode-editor-font-family, 'Cascadia Code', monospace); }
    hr { border: none; border-top: 1px solid var(--vscode-panel-border, var(--border)); margin: 20px 0; }
  </style>
</head>
<body>
  <h1>Schema Comparison</h1>
  <div class="subtitle">${sourceLabel} &rarr; ${targetLabel}</div>
  <hr>
  ${bodyParts.join('\n  ')}
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// HTML helpers
// ---------------------------------------------------------------------------

function he(s: string): string {
	return s
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;');
}

function section(title: string, items: string[]): string {
	return `<h2>${he(title)}</h2>\n<ul>${items.map(i => `<li>${i}</li>`).join('\n')}</ul>`;
}

function added(html: string): string {
	return `<span class="added">+ ${html}</span>`;
}

function removed(html: string): string {
	return `<span class="removed">− ${html}</span>`;
}

function renderTableDiff(diff: ModifiedTableDiff): string {
	const items: string[] = [];

	if (diff.pkChanged) {
		const oldPk = diff.oldPk?.join(', ') || '(none)';
		const newPk = diff.newPk?.join(', ') || '(none)';
		items.push(`<li class="modified">Primary Key changed: <code>(${he(oldPk)})</code> &rarr; <code>(${he(newPk)})</code></li>`);
	}

	diff.addedColumns.forEach(c =>
		items.push(`<li class="added">Column <code>${he(c.name)}</code> added</li>`),
	);
	diff.removedColumns.forEach(c =>
		items.push(`<li class="removed">Column <code>${he(c.name)}</code> removed</li>`),
	);
	diff.modifiedColumns.forEach(c => {
		items.push(`<li class="modified">Column <code>${he(c.name)}</code> modified`);
		c.changes.forEach(d => {
			const oldVal = d.oldValue ? `<code>${he(d.oldValue)}</code>` : '<em>(none)</em>';
			const newVal = d.newValue ? `<code>${he(d.newValue)}</code>` : '<em>(none)</em>';
			items.push(`  <div class="change-detail">${he(d.field)}: ${oldVal} &rarr; ${newVal}</div>`);
		});
		items.push('</li>');
	});

	diff.addedIndexes.forEach(idx => {
		const uq = idx.isUnique ? 'UNIQUE ' : '';
		const cl = idx.isClustered ? 'CLUSTERED' : 'NONCLUSTERED';
		items.push(`<li class="added">Index <code>${he(idx.name)}</code> added (${he(uq + cl)} on (${he(idx.columns.join(', '))}))</li>`);
	});
	diff.removedIndexes.forEach(idx =>
		items.push(`<li class="removed">Index <code>${he(idx.name)}</code> removed</li>`),
	);

	diff.addedForeignKeys.forEach(fk =>
		items.push(
			`<li class="added">Foreign Key <code>${he(fk.constraintName)}</code> added` +
			` (<code>${he(fk.column)}</code> &rarr; <code>${he(fk.refSchema)}.${he(fk.refTable)}.${he(fk.refColumn)}</code>)</li>`,
		),
	);
	diff.removedForeignKeys.forEach(fk =>
		items.push(`<li class="removed">Foreign Key <code>${he(fk.constraintName)}</code> removed</li>`),
	);

	diff.addedUniqueConstraints.forEach(uc =>
		items.push(`<li class="added">Unique Constraint <code>${he(uc.name)}</code> added on (<code>${he(uc.columns.join(', '))}</code>)</li>`),
	);
	diff.removedUniqueConstraints.forEach(uc =>
		items.push(`<li class="removed">Unique Constraint <code>${he(uc.name)}</code> removed</li>`),
	);

	return `<div class="table-block">
  <div class="table-title">~ Table <code>${he(diff.schemaName)}.${he(diff.tableName)}</code></div>
  <ul>${items.join('\n  ')}</ul>
</div>`;
}
