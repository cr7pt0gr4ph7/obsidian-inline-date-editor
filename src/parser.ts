export const DATE_REGEX = /\b(\d{4}-\d{2}-\d{2})\b/ug;

/** A parsed inline date. */
export interface InlineDate {
    /** The raw value of the date. */
    value: string;
    /** The start column of the date. */
    start: number;
    /** The end column of the date. */
    end: number;
}

/** Extracts inline date values of the form 'YYYY-MM-DD' from a line of text. */
export function extractInlineDates(line: string): InlineDate[] {
    let results: InlineDate[] = [];

        for (const match of line.matchAll(DATE_REGEX)) {
            results.push({
                value: match[1]!,
                start: match.index,
                end: match.index + match[0].length,
            });
    }

    return results;
}
