/**
 * The mail bridge: Gmail → the cookbook's inbox.
 *
 * Gmail cannot call a webhook when mail arrives, and inbound-mail services want
 * a domain in the mail path. A Google Apps Script sidesteps both: it lives in
 * the same Google account as the mailbox, runs on a timer, and needs nothing
 * installed anywhere.
 *
 * Why bother when there is already a Shortcut? Because e-mail works from every
 * device and every app, including ones that have no share sheet and ones that
 * have not been invented yet — a friend can send a recipe straight into the
 * cookbook without being told to install anything.
 *
 * ── Setting it up ────────────────────────────────────────────────────────────
 *
 *  1. Sign in as the cookbook's mail account and open script.google.com.
 *  2. New project, paste this file in, and give it a name.
 *  3. Fill in ENDPOINT and TOKEN below. The token comes from /admin/devices —
 *     make a separate one labelled "E-Mail", so revoking the phone does not
 *     also stop the mailbox.
 *  4. Run `collectRecipes` once by hand. Google asks for permission to read
 *     Gmail; that is this script reading the label below, nothing else.
 *  5. Triggers (the clock icon) → add a trigger → `collectRecipes`, time-based,
 *     every 15 minutes.
 *
 * ── How it decides what to send ──────────────────────────────────────────────
 *
 * Only unread mail carrying the label in LABEL, and each message is marked read
 * as soon as it has been accepted, so nothing is sent twice. Set up a Gmail
 * filter that applies the label — to messages addressed to a plus-address like
 * moscookbook+rezept@gmail.com, say, or from the people you want to accept
 * recipes from. A script that swallowed the whole inbox would put every
 * newsletter into the cookbook.
 */

const ENDPOINT = 'https://www.moscookbook.com/api/capture';
const TOKEN = 'paste-the-key-from-admin-devices-here';
const LABEL = 'Kochbuch';

/** Never send more than this in one run, so a backlog cannot become a flood. */
const MAX_PER_RUN = 20;

function collectRecipes() {
  const label = GmailApp.getUserLabelByName(LABEL);

  if (!label) {
    throw new Error(
      'No Gmail label called "' + LABEL + '". Create it and add a filter that applies it.'
    );
  }

  const threads = label.getThreads(0, MAX_PER_RUN);
  let sent = 0;

  for (const thread of threads) {
    for (const message of thread.getMessages()) {
      if (!message.isUnread()) continue;

      // getPlainBody rather than getBody: the HTML version is a table layout
      // wrapped around the text, and the cookbook wants the text.
      const payload = {
        subject: message.getSubject(),
        text: message.getPlainBody(),
        via: 'email',
      };

      const response = UrlFetchApp.fetch(ENDPOINT, {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + TOKEN },
        payload: JSON.stringify(payload),
        muteHttpExceptions: true,
      });

      const code = response.getResponseCode();

      if (code === 201) {
        // Marked read only once the cookbook has it. A failed send stays
        // unread and is retried on the next run rather than being lost.
        message.markRead();
        sent += 1;
      } else if (code === 400) {
        // Nothing usable in it — a photo with no text, say. Marked read so the
        // same empty mail is not retried every quarter of an hour forever.
        message.markRead();
        Logger.log('Nothing usable in: ' + message.getSubject());
      } else {
        Logger.log('Kept for the next run (HTTP ' + code + '): ' + message.getSubject());
      }
    }
  }

  Logger.log('Sent ' + sent + ' message(s) to the cookbook.');
}
