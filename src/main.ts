
import {
  CommentSubmit,
  Metadata,
} from '@devvit/protos';

import {
  Devvit,
  getSetting,
  getFromMetadata,
  Header,
  RedditAPIClient,
} from '@devvit/public-api';

Devvit.use(Devvit.Types.HTTP);

//const kv = new KeyValueStorage();
const reddit = new RedditAPIClient();

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

    // let console_type: string;
    // if (submission_flair_text.includes("xbox")) {
    //   console_type = "<@&794246049278591007>";
    // } else if (submission_flair_text.includes("playstation") || submission_flair_text.includes("ps")) {
    //   console_type = "<@&794245851743518730>";
    // } else if (submission_flair_text.includes("pc")) {
    //   console_type = "<@&794246168288034856>";
    // } else {
    //   console_type = "@Mod";
    // }

    const message = `[u/${request.author?.name}](https://www.reddit.com${request.post?.url}) ` +
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
      body: JSON.stringify({ content: message }),
    });

    if (!response.ok) {
      throw new Error('Error sending data to webhook');
    }

    let comment = await reddit.getCommentById(request.comment!.id, metadata);
    const comment_body = `Hi u/${comment.authorName}! The bot has successfully sent your courier request. A courier will reach out to you in 30 minutes. If you don't get a response even after 30 minutes, you may submit another request.`;
    await comment.reply({ text: comment_body });
  },
});

export default Devvit;
