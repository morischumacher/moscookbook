import type { ReactNode } from 'react';
import Logo from '@/components/brand/Logo';

export interface PrintInfo {
    /** Categories and cuisines, as the page's eyebrow says them. */
    eyebrow: string;
    description: string | null;
    /** Times, as label and value. The servings come from the page, as scaled. */
    facts: { label: string; value: string }[];
    url: string;
}

/**
 * The recipe on paper: one A4 page for an ordinary recipe.
 *
 * The screen layout printed badly — a narrow column with a third of the
 * sheet empty, rows spaced for a thumb, tinted panels, four pages for a
 * curry, and no logo. The screen parts are hidden in print and this is shown
 * instead: masthead, title, the facts on one line (the servings the amounts
 * are for — the ones chosen on the page), then ingredients and method side by
 * side, small and dense like a cookbook page.
 *
 * Its width is set in millimetres rather than taken from the page: an iPhone
 * prints the layout at the phone's width and shrinks it onto the sheet, which
 * is where the narrow column came from. A fixed paper width comes out the
 * same from every browser.
 */
export default function PrintSheet({
    title,
    info,
    servingsLabel,
    servings,
    ingredients,
    ingredientsHeading,
    steps,
    stepsHeading,
    scaledNote,
}: {
    title: string;
    info: PrintInfo;
    servingsLabel: string;
    servings: number | null;
    ingredients: { amount: string; item: string; section: string | null }[];
    ingredientsHeading: string;
    steps: ReactNode[];
    stepsHeading: string;
    scaledNote: string | null;
}) {
    const facts = [...(servings ? [{ label: servingsLabel, value: String(servings) }] : []), ...info.facts];

    return (
        <div className="print-sheet hidden print:block">
            <header className="print-masthead">
                {/* Loaded eagerly: hidden on screen, a lazy picture is never
                    fetched, and the printed page came out without the logo. */}
                <Logo height={40} priority />
                <span className="print-url">{info.url.replace(/^https?:\/\//, '')}</span>
            </header>

            {info.eyebrow && <p className="print-eyebrow">{info.eyebrow}</p>}
            <h1 className="print-title">{title}</h1>
            {info.description && <p className="print-description">{info.description}</p>}

            {facts.length > 0 && (
                <dl className="print-facts">
                    {facts.map((fact) => (
                        <div key={fact.label}>
                            <dt>{fact.label}</dt>
                            <dd>{fact.value}</dd>
                        </div>
                    ))}
                </dl>
            )}

            <div className="print-columns">
                <section className="print-ingredients">
                    <h2>{ingredientsHeading}</h2>
                    <table>
                        <tbody>
                            {ingredients.flatMap((row, index) => {
                                // A section's name above its first row.
                                const heading = row.section && row.section !== ingredients[index - 1]?.section ? row.section : null;
                                return [
                                    heading ? (
                                        <tr key={`h${index}`} className="print-section">
                                            <td colSpan={2}>{heading}</td>
                                        </tr>
                                    ) : null,
                                    <tr key={index}>
                                        <td className="print-amount">{row.amount}</td>
                                        <td>{row.item}</td>
                                    </tr>,
                                ];
                            })}
                        </tbody>
                    </table>
                    {scaledNote && <p className="print-note">{scaledNote}</p>}
                </section>

                <section className="print-method">
                    <h2>{stepsHeading}</h2>
                    <ol>
                        {steps.map((step, index) => (
                            <li key={index}>
                                <span className="print-step-number">{index + 1}</span>
                                <div>{step}</div>
                            </li>
                        ))}
                    </ol>
                </section>
            </div>
        </div>
    );
}
