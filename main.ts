import "jsr:@std/dotenv/load";
import { EmbedBuilder, WebhookClient } from "npm:discord.js";
import { Client } from "npm:discord.js-selfbot-v13";

const webhook = new WebhookClient({
  url: Deno.env.get("WEBHOOK_URL") as string,
});

const fedId = Deno.env.get("CHANNEL_ID_TO_FED");
const forwardId = Deno.env.get("CHANNEL_ID_TO_FORWARD");
if (!fedId || !forwardId) {
  throw new Error(
    "CHANNEL_ID_TO_FED or CHANNEL_ID_TO_FORWARD is not defined, please define them in a .env file",
  );
}

const bot = new Client();

bot.on("ready", () => {
  console.log("Botme ready");
});

bot.on("messageCreate", async (data) => {
  if (data.author.id === Deno.env.get("DISCORD_ID")) return;
  // do not respond to webhooks to avoid the incident of 10/15/2024
  if (data.webhookId) return;

  if (data.type === "CHANNEL_ICON_CHANGE") {
    webhook.send({
      username: data.author.username,
      avatarURL: data.author.displayAvatarURL(),
      content: "GC Icon changed to whatever this is",
    });
  }

  if (data.channelId === fedId) {
    const embeds: EmbedBuilder[] = [];
    const videos: string[] = [];
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
      data.attachments.forEach((attachment) => {
        if (!attachment || !attachment.contentType) return;
        if (attachment.contentType.includes("video")) {
          videos.push(attachment.url);
        } else {
          embeds.push(
            new EmbedBuilder()
              .setTitle("Attachment")
              .setImage(attachment.url)
              .setColor(0x00ff00)
              .setFooter({
                text: data.author.username,
                iconURL: data.author.displayAvatarURL(),
              }),
          );
        }
      });
    }

    let cleaned = cleanMessage(data.content);
    if (videos.length !== 0) {
      for (let i = 0; i < videos.length; i++) {
        cleaned += ` [video ${i + 1}](${videos[i]}) `;
      }
    }

    webhook.send({
      username: data.author.username,
      avatarURL: data.author.displayAvatarURL(),
      content: cleaned.length > 2000 ? cleaned.slice(0, 2000) : cleaned ||
        "SHaboom booom (this is from the bot when no message content not anyone in the gc)",
      embeds: embeds,
      allowedMentions: {
        roles: [],
        users: [],
      },
    });
  } else if (data.channelId === forwardId) {
    if (data.content.startsWith("!send")) {
      bot.channels.cache
        .get(fedId)
        //@ts-ignore colon :3
        ?.send(
          `<@${data.author.id}> » ${data.content.split("!send")[1].trim()}`,
        );
      data.attachments.forEach((attachment) => {
        bot.channels.cache
          .get(fedId)
          //@ts-ignore colon :3
          ?.send(`<@${data.author.id}> » ${attachment.url}`);
      });
      data.react("✅");
    } else if (
      data.content.startsWith("!anon") &&
      Deno.env.get("ANON_ENABLED") === "true"
    ) {
      bot.channels.cache
        .get(fedId)
        //@ts-ignore colon :3
        ?.send(`🕵️ » ${data.content.split("!anon")[1].trim()}`);
      data.attachments.forEach((attachment) => {
        //@ts-ignore colon :3
        bot.channels.cache.get(fedId)?.send(`${attachment.url}`);
      });
      data.react("✅");
    }
  }
});

bot.login(Deno.env.get("DISCORD_TOKEN") as string);

function cleanMessage(message: string): string {
  return message
    .replaceAll("@everyone", "@\u200Beveryone")
    .replaceAll("@here", "@\u200Bhere");
}
