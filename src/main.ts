import { Devvit } from "@devvit/public-api";

Devvit.configure({
  redditAPI: true,
  http: true,
  redis: true,
});

Devvit.addSettings([
  {
    type: "string",
    name: "courier_channel_webhook",
    label: "Courier Channel Webhook:",
  },
]);

// Register a handler for the OnCommentSubmit event
Devvit.addTrigger({
  event: "CommentSubmit",
  onEvent: async (event, context) => {
    if (event.author?.id === context.appAccountId) {
      return;
    }

    const commentBody = event.comment!.body!.toLowerCase();
    // Comment body does not start with !courier or courier!
    if (
      !(
        commentBody.startsWith("!courier") || commentBody.startsWith("courier!")
      )
    ) {
      return;
    }

    const submission_flair_text = event.post!.linkFlair?.text.toLowerCase();
    if (!submission_flair_text) {
      // If no flair seleted
      return;
    }

    const valid_prefixes: string[] = ["xbox", "playstation", "pc", "price"];
    if (
      submission_flair_text &&
      !valid_prefixes.some((prefix) => submission_flair_text.startsWith(prefix))
    ) {
      // If submission flair is not correct
      return;
    }

    let comment = await context.reddit.getCommentById(event.comment!.id);
    let last_request_time: string | undefined = await context.redis.get(
      event.post!.id
    );
    if (last_request_time) {
      let unix_time = Math.floor(Date.now() / 1000);
      if (Number(last_request_time) - unix_time < 1800) {
        const comment_body =
          `Hi u/${comment.authorName}! The couriers have already been notified. ` +
          `If you don't receive a response within 30 minutes, feel free to submit another request.`;
        await comment.reply({ text: comment_body });
        return;
      }
    }

    let console_type: string;
    if (submission_flair_text.includes("xbox")) {
      console_type = "<@&794246049278591007>";
    } else if (
      submission_flair_text.includes("playstation") ||
      submission_flair_text.includes("ps")
    ) {
      console_type = "<@&794245851743518730>";
    } else if (submission_flair_text.includes("pc")) {
      console_type = "<@&794246168288034856>";
    } else {
      console_type = "@Mod";
    }

    let post = await context.reddit.getPostById(event.post!.id);
    const message =
      `${console_type} [u/${event.author?.name}](https://www.reddit.com${post.permalink}) ` +
      `is requesting courier service. Please react to the message accordingly. ` +
      `<:request_completed:803477382156648448> (request completed), ` +
      `<:request_inprocess:804224025688801290> (request in process), ` +
      `<:request_expired:803477444581523466> (request expired), and ` +
      `<:request_rejected:803477462360784927> (request rejected). `;

    const webhook = (await context.settings.get(
      "courier_channel_webhook"
    )) as string;
    const response = await fetch(webhook, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ content: message }),
    });

    if (!response.ok) {
      throw new Error("Error sending data to webhook");
    }

    const comment_body =
      `Hi u/${comment.authorName}! The bot has successfully sent your courier request. ` +
      `A courier will reach out to you in 30 minutes. If you don't get a response even after 30 minutes, you may submit another request.`;
    await comment.reply({ text: comment_body });

    let currentUnixTimeSeconds = Math.floor(Date.now() / 1000);
    let futureUnixTimeMillis = (currentUnixTimeSeconds + 30 * 60 * 1000) * 1000;
    let futureDate = new Date(futureUnixTimeMillis);

    await context.redis.set(event.post!.id, currentUnixTimeSeconds.toString(), {
      expiration: futureDate,
    });
  },
});

export default Devvit;
