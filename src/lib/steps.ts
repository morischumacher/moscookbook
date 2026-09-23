const LIST_ITEM = /^\s*(?:\d+[.)]|[-–—*•])\s+/;
const HEADING = /^\s*#{1,6}\s+(.+?)\s*:?\s*$/;

/** One block's steps: its list items when it is a list, otherwise the block. */
function stepsOfBlock(block: string): string[] {
    const lines = block.split('\n');
    const looksLikeList = lines.filter((line) => LIST_ITEM.test(line)).length > 1;
    if (!looksLikeList) return [block.replace(/^\s*\d+[.)]\s*/, '')];

    const steps: string[] = [];
    let current = '';
    // A heading above a list ("## Für den Teig") goes in front of its first
    // step rather than becoming a step of its own.
    let heading = '';
    for (const line of lines) {
        const title = HEADING.exec(line);
        if (title) {
            if (current.trim()) steps.push(current.trim());
            current = '';
            heading = title[1];
            continue;
        }
        if (LIST_ITEM.test(line)) {
            if (current.trim()) steps.push(current.trim());
            current = (heading ? `${heading}: ` : '') + line.replace(LIST_ITEM, '');
            heading = '';
        } else {
            current += (current ? ' ' : '') + line.trim();
        }
    }
    if (current.trim()) steps.push(current.trim());
    return steps;
}

/**
 * Splits the markdown instructions into steps: numbered list items when the
 * author used them, otherwise paragraphs. Each step gets its own checkbox so a
 * cook can keep their place.
 *
 * Block by block, and each block's list split into its items: a method that
 * starts with a paragraph ("Ofen vorheizen.") and then numbers its steps used
 * to come out as two steps, the second holding the whole list.
 */
export function splitSteps(instructions: string): string[] {
    const text = instructions.replace(/\r\n?/g, '\n').trim();
    if (!text) return [];

    return text
        .split(/\n\s*\n/)
        .map((block) => block.trim())
        .filter(Boolean)
        .flatMap(stepsOfBlock)
        .filter((step) => step.trim() !== '');
}
