"use strict";

const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");

// Loads bot settings
var botSettings = JSON.parse(fs.readFileSync("bot-settings.json"));
const bot = new TelegramBot(botSettings.token, { polling: true });

bot.on("message", async (msg) => {
  let chatId = msg.chat.id;

  // Check if it is the correct group
  if (chatId != botSettings.groupid) {
    // if it isn't the correct group, the only message it will answer to is chat id
    if (msg.text && msg.text.match(/\/chatid($|@adfarenzaudiobot$)/))
      cmdChatId(msg);
    return;
  }

  // Check if the message is from an admin
  let status = (await bot.getChatMember(chatId, msg.from.id)).status;
  if (status == "creator" || status == "administrator" || msg.from.username == "GroupAnonymousBot") {
    console.log(`admin (${msg.from.username} - ${status})`);
    // check if the admin wrote a command
    if (msg.text) {
      let text = msg.text;
      if (text.match(/\/help($|@adfarenzaudiobot$)/)) {
        cmdHelp(msg);
      } else if (text.match(/\/chatid($|@adfarenzaudiobot$)/)) {
        cmdChatId(msg);
      } else if (text.match(/\/soloaudio($|@adfarenzaudiobot$)/)) {
        cmdSoloAudio(msg);
      } else if (text.match(/\/tuttimessaggi($|@adfarenzaudiobot$)/)) {
        cmdTuttiMessaggi(msg);
      } else if (text.match(/\/confermaeliminazione($|@adfarenzaudiobot$)/)) {
        cmdConfermaEliminazione(msg);
      } else if (text.match(/\/nascondieliminazione($|@adfarenzaudiobot$)/)) {
        cmdNascondiEliminazione(msg);
      }
    }
    return;
  }

  // if it isn't from an admin, check if some user tried to do some commands
  if (msg.text) {
    let text = msg.text;
    if (text.match(/\/(help|chatid|soloaudio|tuttimessaggi|confermaeliminazione|nascondieliminazione)($|@adfarenzaudiobot$)/)) {
      bot.deleteMessage(chatId, msg.message_id);
      if (botSettings.senddelmsg)
        bot.sendMessage(chatId, `Hey ${msg.from.first_name}, non puoi usare i comandi!`);
      return;
    }
  }

  // if every msgs are allowed, it doesn't do nothing
  if (botSettings.allowothermsgs) {
    return;
  }

  // if only audio msgs are allowed, check if it is an audio msg
  if (msg.voice) {
    // check if it is under the limit
    if (msg.voice.duration <= botSettings.maxaudiosecs)
      return;
  }

  // this will prevent msgs like "msg pinned", "new user" ecc. to be eliminated
  if (msg.voice || msg.text || msg.audio || msg.document || msg.photo || msg.sticker || msg.video || msg.video_note || msg.contact || msg.poll || msg.location) {
    bot.deleteMessage(chatId, msg.message_id);

    if (botSettings.senddelmsg)
      bot.sendMessage(chatId, `Hey ${msg.from.first_name}, invia solo audio inferiori a ${botSettings.maxaudiosecs} secondi!`);
  }
});

// /help
function cmdHelp(msg) {
  const helpText = `help - spiega i comandi disponibili
chatid - id della chat
soloaudio - accetta solo messaggi audio (meno di 15 secondi)
tuttimessaggi - accetta tutti i messaggi
confermaeliminazione - scrive in chat quando un messaggio è stato eliminato
nascondieliminazione - non scrive in chat quando un messaggio è stato eliminato`;
  bot.sendMessage(msg.chat.id, helpText);
}

// /chatid
function cmdChatId(msg) {
  console.log(`asked chatid in chat ${msg.chat.id}, from user ${msg.from.id} (${msg.from.username})`);
  bot.sendMessage(msg.chat.id, msg.chat.id);
}

// /soloaudio
function cmdSoloAudio(msg) {
  botSettings.allowothermsgs = false;
  const confirmText = "D'ora in poi accetterò solo i messaggi audio inferiori a " + botSettings.maxaudiosecs + " secondi";
  bot.sendMessage(msg.chat.id, confirmText);

  updateSettingsFile();
}

// /tuttimessaggi
function cmdTuttiMessaggi(msg) {
  botSettings.allowothermsgs = true;
  const confirmText = "D'ora in poi accetterò tutti i messaggi)";
  bot.sendMessage(msg.chat.id, confirmText);

  updateSettingsFile();
}

// /confermaeliminazione
function cmdConfermaEliminazione(msg) {
  botSettings.senddelmsg = true;
  const confirmText = "D'ora in poi scriverò ogni volta che eliminerò un messaggio";
  bot.sendMessage(msg.chat.id, confirmText);

  updateSettingsFile();
}

// /nascondieliminazione
function cmdNascondiEliminazione(msg) {
  botSettings.senddelmsg = false;
  const confirmText = "D'ora in poi starò zitto";
  bot.sendMessage(msg.chat.id, confirmText);

  updateSettingsFile();
}

function updateSettingsFile() {
  fs.writeFile("bot-settings.json", JSON.stringify(botSettings, null, 2), (err) => {
    if (err)
      console.log(err);
  });
}