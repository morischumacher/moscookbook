/**
 * Writes the iOS Shortcut "Save To Moscookbook" as a file to import.
 *
 *   node scripts/build-shortcut.mjs [--url https://www.moscookbook.com] [--out file.shortcut]
 *
 * What it does on the phone: from the share sheet it sends the shared link
 * and the three latest screenshots — each with the time it was taken, so the
 * server can drop the ones that are not about this share (see `imagesFrom`
 * in src/lib/captureInput.ts). The capture key is asked for once, on import,
 * and never written into this file.
 *
 * The file is unsigned. iOS only imports signed shortcuts, so on a Mac:
 *
 *   shortcuts sign -m anyone -i Save-To-Moscookbook.shortcut -o Save-To-Moscookbook-signed.shortcut
 *
 * and AirDrop the signed one to the phone.
 */
import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const args = process.argv.slice(2);
const option = (name, fallback) => {
    const index = args.indexOf(name);
    return index === -1 ? fallback : args[index + 1];
};
const site = option('--url', 'https://www.moscookbook.com').replace(/\/+$/, '');
const out = option('--out', 'docs/shortcuts/Save-To-Moscookbook.shortcut');

/* ------------------------------------------------------------ plist writer */

const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function plist(value, indent = '') {
    const inner = `${indent}\t`;
    if (value === true) return `${indent}<true/>`;
    if (value === false) return `${indent}<false/>`;
    if (typeof value === 'number') {
        return Number.isInteger(value) ? `${indent}<integer>${value}</integer>` : `${indent}<real>${value}</real>`;
    }
    if (typeof value === 'string') return `${indent}<string>${escape(value)}</string>`;
    if (Array.isArray(value)) {
        return value.length === 0 ? `${indent}<array/>` : `${indent}<array>\n${value.map((item) => plist(item, inner)).join('\n')}\n${indent}</array>`;
    }
    const entries = Object.entries(value);
    if (entries.length === 0) return `${indent}<dict/>`;
    return `${indent}<dict>\n${entries
        .map(([key, item]) => `${inner}<key>${escape(key)}</key>\n${plist(item, inner)}`)
        .join('\n')}\n${indent}</dict>`;
}

/* --------------------------------------------------------- shortcut pieces */

const OBJECT = '￼';

/** An action's result, as a whole-field variable. */
const output = (uuid, name) => ({
    Value: { Type: 'ActionOutput', OutputUUID: uuid, OutputName: name },
    WFSerializationType: 'WFTextTokenAttachment',
});

const repeatItem = {
    Value: { Type: 'Variable', VariableName: 'Repeat Item' },
    WFSerializationType: 'WFTextTokenAttachment',
};

/** Text with variables in it: parts are strings or { uuid, name } / { input: true }. */
function text(...parts) {
    let string = '';
    const attachmentsByRange = {};
    for (const part of parts) {
        if (typeof part === 'string') {
            string += part;
            continue;
        }
        attachmentsByRange[`{${string.length}, 1}`] = part.input
            ? { Type: 'ExtensionInput' }
            : { Type: 'ActionOutput', OutputUUID: part.uuid, OutputName: part.name };
        string += OBJECT;
    }
    return { Value: { string, attachmentsByRange }, WFSerializationType: 'WFTextTokenString' };
}

function dictionary(fields) {
    return {
        Value: {
            WFDictionaryFieldValueItems: fields.map(([key, value]) => ({
                WFItemType: 0,
                WFKey: text(key),
                WFValue: value,
            })),
        },
        WFSerializationType: 'WFDictionaryFieldValue',
    };
}

const action = (identifier, parameters) => ({ WFWorkflowActionIdentifier: identifier, WFWorkflowActionParameters: parameters });

/* ------------------------------------------------------------- the actions */

const id = {
    key: randomUUID().toUpperCase(),
    shots: randomUUID().toUpperCase(),
    taken: randomUUID().toUpperCase(),
    iso: randomUUID().toUpperCase(),
    resized: randomUUID().toUpperCase(),
    jpeg: randomUUID().toUpperCase(),
    base64: randomUUID().toUpperCase(),
    entry: randomUUID().toUpperCase(),
    repeatEnd: randomUUID().toUpperCase(),
    joined: randomUUID().toUpperCase(),
    header: randomUUID().toUpperCase(),
    sent: randomUUID().toUpperCase(),
};
const loop = randomUUID().toUpperCase();

const actions = [
    // 0 — the key, asked for on import (see WFWorkflowImportQuestions).
    action('is.workflow.actions.gettext', { UUID: id.key, WFTextActionText: '' }),

    // 1 — the three latest screenshots; the server keeps only recent ones.
    action('is.workflow.actions.getlatestscreenshots', { UUID: id.shots, WFGetLatestPhotoCount: 3 }),

    // 2 — each of them …
    action('is.workflow.actions.repeat.each', {
        GroupingIdentifier: loop,
        WFControlFlowMode: 0,
        WFInput: output(id.shots, 'Latest Screenshots'),
    }),
    // … when it was taken, as ISO 8601 …
    action('is.workflow.actions.properties.images', {
        UUID: id.taken,
        WFInput: repeatItem,
        WFContentItemPropertyName: 'Date Taken',
    }),
    action('is.workflow.actions.format.date', {
        UUID: id.iso,
        WFDate: text({ uuid: id.taken, name: 'Date Taken' }),
        WFDateFormatStyle: 'ISO 8601',
        WFISO8601IncludeTime: true,
    }),
    // … made small enough that three fit in one request …
    action('is.workflow.actions.image.resize', {
        UUID: id.resized,
        WFImage: repeatItem,
        WFImageResizeWidth: '1200',
    }),
    action('is.workflow.actions.image.convert', {
        UUID: id.jpeg,
        WFInput: output(id.resized, 'Resized Image'),
        WFImageFormat: 'JPEG',
        WFImageCompressionQuality: 0.7,
        WFImagePreserveMetadata: false,
    }),
    action('is.workflow.actions.base64encode', {
        UUID: id.base64,
        WFInput: output(id.jpeg, 'Converted Image'),
        WFEncodeMode: 'Encode',
        WFBase64LineBreakMode: 'None',
    }),
    // … as "time|picture".
    action('is.workflow.actions.gettext', {
        UUID: id.entry,
        WFTextActionText: text({ uuid: id.iso, name: 'Formatted Date' }, '|', { uuid: id.base64, name: 'Base64 Encoded' }),
    }),
    action('is.workflow.actions.repeat.each', {
        GroupingIdentifier: loop,
        WFControlFlowMode: 2,
        UUID: id.repeatEnd,
    }),

    // 10 — all of them in one text, separated by commas.
    action('is.workflow.actions.text.combine', {
        UUID: id.joined,
        text: output(id.repeatEnd, 'Repeat Results'),
        WFTextSeparator: 'Custom',
        WFTextCustomSeparator: ',',
    }),

    // 11 — "Bearer <key>".
    action('is.workflow.actions.gettext', {
        UUID: id.header,
        WFTextActionText: text('Bearer ', { uuid: id.key, name: 'Text' }),
    }),

    // 12 — sent: the shared link, and the pictures.
    action('is.workflow.actions.downloadurl', {
        UUID: id.sent,
        WFURL: `${site}/api/capture`,
        WFHTTPMethod: 'POST',
        ShowHeaders: true,
        WFHTTPHeaders: dictionary([['Authorization', text({ uuid: id.header, name: 'Text' })]]),
        WFHTTPBodyType: 'JSON',
        WFJSONValues: dictionary([
            ['url', text({ input: true })],
            ['images', text({ uuid: id.joined, name: 'Combined Text' })],
        ]),
    }),

    // 13 — said so.
    action('is.workflow.actions.notification', {
        WFNotificationActionTitle: 'Moscookbook',
        WFNotificationActionBody: 'Im Eingang – wird gerade gelesen.',
        WFNotificationActionSound: false,
    }),
];

const shortcut = {
    WFWorkflowClientVersion: '2607.0.2',
    WFWorkflowMinimumClientVersion: 900,
    WFWorkflowMinimumClientVersionString: '900',
    WFWorkflowIcon: { WFWorkflowIconStartColor: 4282601983, WFWorkflowIconGlyphNumber: 59446 },
    WFWorkflowTypes: ['ActionExtension'],
    WFWorkflowHasShortcutInputVariables: true,
    WFWorkflowInputContentItemClasses: [
        'WFURLContentItem',
        'WFSafariWebPageContentItem',
        'WFStringContentItem',
        'WFRichTextContentItem',
        'WFArticleContentItem',
    ],
    WFWorkflowOutputContentItemClasses: [],
    WFWorkflowHasOutputFallback: false,
    WFQuickActionSurfaces: [],
    WFWorkflowImportQuestions: [
        {
            ActionIndex: 0,
            Category: 'Parameter',
            DefaultValue: '',
            ParameterKey: 'WFTextActionText',
            Text: 'Dein Kochbuch-Schlüssel (Verwaltung → Geräte → Neuer Schlüssel)',
        },
    ],
    WFWorkflowActions: actions,
};

const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
    `<plist version="1.0">\n${plist(shortcut)}\n</plist>\n`;

writeFileSync(out, xml);
console.log(`Wrote ${out} (unsigned) for ${site}/api/capture.`);
