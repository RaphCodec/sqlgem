/**
 * SqlBuilder.ts
 *
 * Accumulates idempotent SQL statements and renders them as a script.
 *
 * Design goals:
 *  - Engine-agnostic API – identifier quoting and batch separators are
 *    provided by a SqlDialect so that future dialects (PostgreSQL, MySQL …)
 *    only need to supply a new dialect object.
 *  - Statements are grouped into batches.  Calling newBatch() inserts the
 *    dialect's batch separator (e.g. "GO") between groups.
 *  - The builder never executes SQL – it only constructs strings.
 */

// ---------------------------------------------------------------------------
// Dialect
// ---------------------------------------------------------------------------

export interface SqlDialect {
    /**
     * Wrap an identifier in the dialect's quoting characters.
     * e.g. MSSQL: [Users],  PostgreSQL: "Users"
     */
    quoteIdentifier(name: string): string;

    /**
     * Batch separator (e.g. "GO" for MSSQL).
     * Use an empty string for dialects that do not need one.
     */
    readonly batchSeparator: string;
}

/** Default dialect – Microsoft SQL Server. */
export const MssqlDialect: SqlDialect = {
    quoteIdentifier(name: string): string {
        // Escape any ] characters inside the name to avoid injection.
        return `[${name.replace(/]/g, ']]')}]`;
    },
    batchSeparator: 'GO',
};

// ---------------------------------------------------------------------------
// Builder
// ---------------------------------------------------------------------------

export class SqlBuilder {
    readonly dialect: SqlDialect;

    private readonly _batches: string[][] = [[]];

    constructor(dialect: SqlDialect = MssqlDialect) {
        this.dialect = dialect;
    }

    // -----------------------------------------------------------------------
    // Statement accumulation
    // -----------------------------------------------------------------------

    /** Append a raw SQL statement to the current batch. */
    append(sql: string): this {
        this._currentBatch.push(sql);
        return this;
    }

    /**
     * Close the current batch and start a new one.
     * Calling this when the current batch is empty is a no-op.
     */
    newBatch(): this {
        if (this._currentBatch.length > 0) {
            this._batches.push([]);
        }
        return this;
    }

    // -----------------------------------------------------------------------
    // Identifier & name helpers
    // -----------------------------------------------------------------------

    /** Return a quoted identifier, e.g. [Users] or "Users". */
    q(name: string): string {
        return this.dialect.quoteIdentifier(name);
    }

    /**
     * Build a schema-qualified table reference.
     * e.g. qualifiedTable('dbo', 'Users')  →  [dbo].[Users]
     */
    qualifiedTable(schema: string, table: string): string {
        return `${this.q(schema)}.${this.q(table)}`;
    }

    // -----------------------------------------------------------------------
    // Output
    // -----------------------------------------------------------------------

    /** Render the complete SQL script as a single string. */
    build(): string {
        const sep = this.dialect.batchSeparator;
        const batchJoiner = sep ? `\n${sep}\n\n` : '\n\n';

        return this._batches
            .filter(batch => batch.length > 0)
            .map(batch => batch.join('\n'))
            .join(batchJoiner);
    }

    // -----------------------------------------------------------------------
    // Private
    // -----------------------------------------------------------------------

    private get _currentBatch(): string[] {
        return this._batches[this._batches.length - 1];
    }
}
