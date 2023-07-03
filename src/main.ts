import {
  CommentSubmit,
  Metadata,
} from '@devvit/protos';

import {
  Devvit,
  getSetting,
  getFromMetadata,
  Header,
  KeyValueStorage,
  RedditAPIClient,
} from '@devvit/public-api';

Devvit.use(Devvit.Types.HTTP);

const kv = new KeyValueStorage();
const reddit = new RedditAPIClient();
const scheduler = Devvit.use(Devvit.Types.Scheduler);
const PRUNE_KVSTORAGE = "prune_kvstorage";

Devvit.addSettings([
  {
    type: 'string',
    name: 'courier_channel_webhook',
    label: 'Courier Channel Webhook:'
  }
]
)

// Register a handler for the OnCommentSubmit event
Devvit.addTrigger({
  event: Devvit.Trigger.CommentSubmit,
  async handler(request: CommentSubmit, metadata?: Metadata) {
    if (request.author?.name === getFromMetadata(Header.AppUser, metadata)) {
      console.log('hey! my app created this comment; not going to respond');
      return;
    }

    const commentBody = request.comment!.body!.toLowerCase();
    // Comment body does not start with !courier or courier!
    if (!(commentBody.startsWith("!courier") || commentBody.startsWith("courier!"))) {
      return;
    }

    const submission_flair_text = request.post!.linkFlair?.text.toLowerCase();
    if (!submission_flair_text) {
      // If no flair seleted
      return;
    }

    const valid_prefixes: string[] = ["xbox", "playstation", "pc", "price"];
    if (submission_flair_text && !valid_prefixes.some(prefix => submission_flair_text.startsWith(prefix))) {
      // If submission flair is not correct
      return;
    }

    let comment = await reddit.getCommentById(request.comment!.id, metadata);
    let last_request_time: number | undefined = await kv.get(request.post!.id);
    if (last_request_time) {
      let unix_time = Math.floor(Date.now() / 1000);
      if (last_request_time - unix_time < 1800) {
        const comment_body = `Hi u/${comment.authorName}! The couriers have already been notified. ` +
          `If you don't receive a response within 30 minutes, feel free to submit another request.`;
        await comment.reply({ text: comment_body });
        return;
      }
    }

    let console_type: string;
    if (submission_flair_text.includes("xbox")) {
      console_type = "<@&794246049278591007>";
    } else if (submission_flair_text.includes("playstation") || submission_flair_text.includes("ps")) {
      console_type = "<@&794245851743518730>";
    } else if (submission_flair_text.includes("pc")) {
      console_type = "<@&794246168288034856>";
    } else {
      console_type = "@Mod";
    }

    const message = `${console_type} [u/${request.author?.name}](https://www.reddit.com${request.post?.url}) ` +
      `is requesting courier service. Please react to the message accordingly. ` +
      `<:request_completed:803477382156648448> (request completed), ` +
      `<:request_inprocess:804224025688801290> (request in process), ` +
      `<:request_expired:803477444581523466> (request expired), and ` +
      `<:request_rejected:803477462360784927> (request rejected). `;


    const webhook = await getSetting('courier_channel_webhook', metadata) as string;
    const response = await fetch(webhook, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ "content": message }),
    });

    if (!response.ok) {
      throw new Error('Error sending data to webhook');
    }

    const comment_body = `Hi u/${comment.authorName}! The bot has successfully sent your courier request. ` +
      `A courier will reach out to you in 30 minutes. If you don't get a response even after 30 minutes, you may submit another request.`;
    await comment.reply({ text: comment_body });

    let unix_time = Math.floor(Date.now() / 1000);
    await kv.put(request.post!.id, unix_time)
  },
});

Devvit.addTrigger({
  event: Devvit.Trigger.AppUpgrade,
  handler: async (_, metadata?: Metadata) => {
    try {
      await scheduler.Schedule(
        { cron: "*/15 * * * *", action: { type: PRUNE_KVSTORAGE } },
        metadata
      );
    } catch (e) {
      console.log("error was not able to schedule:", e);
      throw e;
    }
  },
});

Devvit.addSchedulerHandler({
  type: PRUNE_KVSTORAGE,
  async handler(_, metadata) {
    let kv_list = await kv.list(metadata);
    for (const item of kv_list) {
      let last_request_time: number | undefined = await kv.get(item);
      if (!last_request_time) {
        continue;
      }

      let unix_time = Math.floor(Date.now() / 1000);
      if (last_request_time - unix_time >= 1800) {
        continue;
      }

      // Perform actions if last_request_time is older than the threshold (1800 seconds)
      await kv.delete(item);
    }
  },
});

export default Devvit;
