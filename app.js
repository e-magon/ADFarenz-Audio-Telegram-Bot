"use strict";

const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");

// Loads bot settings
var botSettings = JSON.parse(fs.readFileSync("bot-settings.json"));
const bot = new TelegramBot(botSettings.token, { polling: true });

bot.onText(/\/chatid/, (msg, match) => {
  let chatId = msg.chat.id;
  console.log(`asked chatid in chat ${chatId}, from user ${msg.from.id} (${msg.from.username})`);
  bot.sendMessage(chatId, chatId);
});

bot.on("message", async (msg) => {
  let chatId = msg.chat.id;

  // Check if it is the correct group
  if (chatId != botSettings.groupid)
    return;

  // Check if the message is from an admin
  let status = (await bot.getChatMember(chatId, msg.from.id)).status;
  if (status == "creator" || status == "administrator" || msg.from.username == "GroupAnonymousBot")
    return;

  // check if it is an audio msg
  if (msg.voice) {
    // check if it is under the limit
    if (msg.voice.duration <= botSettings.maxaudiosecs)
      return;
  } else if (botSettings.allowothermsgs) {
    // if it isn't an audio message and other msgs are allowed:
    return;
  }

  // this will prevent msgs like "msg pinned", "new user" ecc. to be eliminated
  if (msg.voice || msg.text || msg.audio || msg.document || msg.photo || msg.sticker || msg.video || msg.video_note || msg.contact || msg.poll || msg.location) {
    bot.deleteMessage(chatId, msg.message_id);

    if (botSettings.senddelmsg)
      bot.sendMessage(chatId, `Hey ${msg.from.first_name}, invia solo audio inferiori a ${botSettings.maxaudiosecs} secondi!`);
  }
});

//console.log(botSettings);