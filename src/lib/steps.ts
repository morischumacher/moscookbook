/**
 * Splits the markdown instructions into steps: numbered list items when the
 * author used them, otherwise paragraphs. Each step gets its own checkbox so a
 * cook can keep their place.
 */
export function splitSteps(instructions: string): string[] {
    const text = instructions.replace(/\r\n?/g, '\n').trim();
    if (!text) return [];

    const numbered = text.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);

    if (numbered.length > 1) {
        return numbered.map((block) => block.replace(/^\s*\d+[.)]\s*/, ''));
    }

    // A single block: split on numbered or bulleted lines within it.
    const lines = text.split('\n');
    const looksLikeList = lines.filter((line) => /^\s*(?:\d+[.)]|[-–—*•])\s+/.test(line)).length > 1;

    if (looksLikeList) {
        const steps: string[] = [];
        let current = '';
        for (const line of lines) {
            if (/^\s*(?:\d+[.)]|[-–—*•])\s+/.test(line)) {
                if (current.trim()) steps.push(current.trim());
                current = line.replace(/^\s*(?:\d+[.)]|[-–—*•])\s+/, '');
            } else {
                current += (current ? ' ' : '') + line.trim();
            }
        }
        if (current.trim()) steps.push(current.trim());
        return steps;
    }

    return [text];
}

