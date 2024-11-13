import "jsr:@std/dotenv/load";
import { EmbedBuilder, WebhookClient } from "npm:discord.js";
import { Client, Message } from "npm:discord.js-selfbot-v13";
import { APIMessage } from "npm:discord-api-types/v10";
import { cleanMessage, DatabaseWrapper } from "./utils.ts";
import { PartialMessage } from "discord.js";

const fedId = Deno.env.get("CHANNEL_ID_TO_FED");
const forwardId = Deno.env.get("CHANNEL_ID_TO_FORWARD");
if (!fedId || !forwardId) {
  throw new Error(
    "CHANNEL_ID_TO_FED or CHANNEL_ID_TO_FORWARD is not defined, please define them in a .env file",
  );
}

const webhook = new WebhookClient({
  url: Deno.env.get("WEBHOOK_URL") as string,
});
const bot = new Client();
const db = new DatabaseWrapper();

bot.on("ready", () => {
  console.log("autofedder ready");
});

bot.on("messageUpdate", async (oldData, newData) => {
  if (newData?.channelId !== fedId) return;
  if (newData.author?.id === Deno.env.get("DISCORD_ID")) return;
  if (newData?.webhookId) return;
  const id = db.get(oldData.id);
  if (id) {
    const webhook = await handleMessageFedding(newData, id);
    db.save(oldData.id, webhook?.id);
    return;
  }
});

bot.on("messageDelete", (data) => {
  if (data?.channelId !== fedId) return;
  if (data.author?.id === Deno.env.get("DISCORD_ID")) return;
  if (data?.webhookId) return;
  const id = db.get(data.id);
  if (id) {
    webhook.deleteMessage(id);
    db.delete(data.id);
    return;
  }
});

bot.on("messageCreate", async (data) => {
  if (data.author.id === Deno.env.get("DISCORD_ID")) return;
  // do not respond to webhooks to avoid the incident of 10/15/2024
  if (data.webhookId) return;
  if (data.channelId === fedId) {
    const webhook = await handleMessageFedding(data);
    db.save(data.id, webhook?.id);
    return;
  }

  if (data.channelId === forwardId && Deno.env.get("MESSAGES_ENABLED")) {
    if (data.content.startsWith("!send ")) {
      handleMessages(data, "!send ", `<@${data.author.id}>`);
    }
    if (
      data.content.startsWith("!anon ") &&
      Deno.env.get("ANON_ENABLED") === "true"
    ) handleMessages(data, "!anon ", "🕵️");
  }
});

bot.login(Deno.env.get("DISCORD_TOKEN") as string);

async function handleMessages(
  data: Message<boolean>,
  slice: string,
  decorator: string,
) {
  try {
    let repliedMessage;
    if (data.type === "REPLY" && data.reference?.messageId) {
      const id = db.getHookId(data.reference?.messageId);
      if (id) {
        repliedMessage = await bot.channels.cache.get(fedId).messages.fetch(
          id,
        );
      }
    }
    if (data.content) {
      const message = `${decorator} » ${data.content.slice(slice.length)}`;
      repliedMessage
        ? repliedMessage.reply(
          message,
        )
        : bot.channels.cache.get(fedId).send(
          message,
        );
    }
    if (data.attachments) {
      data.attachments.forEach((attachment: { url: any }) => {
        const message = `${decorator} » ${attachment.url}`;
        bot.channels.cache.get(fedId)?.send(
          message,
        );
      });
    }
  } catch (e: unknown) {
    data.react("❌");
    data.reply(`An error occured and your message was not sent. (${e})`);
    return;
  }
  data.react("✅");
}

async function handleMessageFedding(
  data: Message<boolean> | PartialMessage,
  edit?: string,
): Promise<APIMessage> {
  const embeds: EmbedBuilder[] = [];
  const videos: string[] = [];

  if (data.type === "CHANNEL_ICON_CHANGE") {
    webhook.send({
      username: data.author.username,
      avatarURL: data.author.displayAvatarURL(),
      content: "GC Icon changed to whatever this is",
    });
  }
  
  if (data.type === "CHANNEL_NAME_CHANGE") {
    embeds.push(
      new EmbedBuilder()
        .setTitle("GC name changed")
        .setDescription(data.content)
        .setColor("Green")
        .setFooter({
          text: data.author.username,
          iconURL: data.author.displayAvatarURL(),
        }),
    );
  }
  if (data.type === "RECIPIENT_REMOVE") {
    const user = data.mentions.users.first();
    if (!user) return;
    embeds.push(
      new EmbedBuilder()
        .setTitle("Removed user")
        .setDescription(`${user.username} was removed from the GC`)
        .setColor("Red")
        .setFooter({
          text: data.author.username,
          iconURL: data.author.displayAvatarURL(),
        }),
    );
  }
  if (data.type === "RECIPIENT_ADD") {
    const user = data.mentions.users.first();
    if (!user) return;
    embeds.push(
      new EmbedBuilder()
        .setTitle("Added user")
        .setDescription(`${user.username} was Added to the GC`)
        .setColor("Green")
        .setFooter({
          text: data.author.username,
          iconURL: data.author.displayAvatarURL(),
        }),
    );
  }
  if (data.type === "REPLY" && data.reference?.messageId) {
    const repliedMessage = await data.channel.messages.fetch(
      data.reference?.messageId,
    );
    const replyEmbed = new EmbedBuilder()
      .setTitle("Replied message")
      .setDescription(repliedMessage.content)
      .setColor(0x00ff00)
      .setFooter({
        text: repliedMessage.author.username,
        iconURL: repliedMessage.author.displayAvatarURL(),
      });

    if (repliedMessage.attachments.size !== 0) {
      const attachment = repliedMessage.attachments.first();
      if (
        attachment &&
        attachment.contentType &&
        attachment.contentType.includes("video")
      ) {
        videos.push(attachment.url);
      } else {
        attachment && replyEmbed.setImage(attachment.url);
      }
    }

    embeds.push(replyEmbed);
  }
  if (data.attachments.size !== 0) {
    data.attachments.forEach(
      (attachment: { contentType: string | string[]; url: string | null }) => {
        if (!attachment || !attachment.contentType) return;
        if (attachment.contentType.includes("video")) {
          videos.push(attachment.url!);
        } else {
          embeds.push(
            new EmbedBuilder()
              .setTitle("Attachment")
              .setImage(attachment.url)
              .setColor(0x00ff00)
              .setFooter({
                text: data.author!.username,
                iconURL: data.author!.displayAvatarURL(),
              }),
          );
        }
      },
    );
  }

  let cleaned = cleanMessage(data.content);
  if (videos.length !== 0) {
    for (let i = 0; i < videos.length; i++) {
      cleaned += ` [video ${i + 1}](${videos[i]}) `;
    }
  }
  const message = cleaned.length > 2000 ? cleaned.slice(0, 2000) : cleaned;
  const noContentMessage = embeds.length
    ? ""
    : `SHaboom booom (this is from the bot, most likely an unhandled message event [${data.type}])`;
  const options = {
    username: data.author?.username,
    avatarURL: data.author?.displayAvatarURL(),
    content: message || noContentMessage,
    embeds: embeds,
    allowedMentions: {
      roles: [],
      users: [],
    },
  };
  if (edit) {
    return await webhook.editMessage(edit, options);
  }
  return await webhook.send(options);
}
