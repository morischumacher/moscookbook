/**
 * What goes into the system share sheet.
 *
 * A function of its own, for one field that must not come back. The Web Share
 * API accepts `title`, `text` and `url`, but what a receiving app does with
 * them is up to that app, and nothing in the specification says a target has to
 * keep all three. Telegram takes `text` and drops `url`: a recipe shared with
 * its description arrived as a paragraph of prose with no link anywhere in it.
 *
 * So only the title and the link travel. The description is not lost — it
 * arrives in the link preview, which is built from the page's OpenGraph tags,
 * and a preview is where a description belongs anyway.
 */
export interface SharePayload {
    title: string;
    url: string;
}

export function sharePayload(title: string, url: string): SharePayload {
    return { title, url };
}
