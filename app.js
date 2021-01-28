"use strict";

const TelegramBot = require("node-telegram-bot-api");
const fs = require("fs");

// Loads bot settings
// botmode: 0 (allow everything)    1 (audio msgs only)     2 (text/images msgs only)
var botSettings = JSON.parse(fs.readFileSync("bot-settings.json"));
const bot = new TelegramBot(botSettings.token, { polling: true });
var botUsername;

// set up commands suggestions in Telegram when typing /
initialSetUp();

// array of messages that have the settings opened
let openSettingsMessages = [];

// Listen to messages and commands
bot.on("message", async (msg) => {
  // Check if it is the correct group
  if (msg.chat.id != botSettings.groupid) {
    // if it isn't the correct group, the only message it will answer to is chat id
    if (msg.text && msg.text.match(new RegExp(`^\/chatid($|@${botUsername}$)`)))
      cmdChatID(msg);
    return;
  }

  // Check if the message is from an admin
  let userStatus = (await bot.getChatMember(botSettings.groupid, msg.from.id)).status;
  if (userStatus == "creator" || userStatus == "administrator" || msg.from.username == "GroupAnonymousBot") {
    console.log(`msg from admin ${msg.from.username} (${userStatus})`);
    // check if the admin wrote a command
    if (msg.text) {
      let text = msg.text;
      if (text.match(new RegExp(`^\/help($|@${botUsername}$)`))) {
        
        cmdHelp(msg);
      } else if (text.match(new RegExp(`^\/chatid($|@${botUsername}$)`))) {
        cmdChatID(msg);
      } else if (text.match(new RegExp(`^\/impostazioni($|@${botUsername}$)`))) {
        cmdImpostazioni(msg);
      }
    }
    return;
  }

  // if it isn't from an admin, check if some user tried to do some commands
  if (msg.text) {
    let text = msg.text;
    if (isACommand(text)) {
      deleteMessage(msg.message_id, `Hey ${msg.from.first_name}, non puoi usare i comandi!`);
      return;
    }
  }

  // if every msgs are allowed, it doesn't do anything
  if (botSettings.botmode == 0)
    return;

  // if only audio msgs are allowed, check if it is a valid audio msg
  if (botSettings.botmode == 1 && msg.voice) {
    // check if it is under the limit
    if (msg.voice.duration <= botSettings.maxaudiosecs)
      return;
  }

  // if audio msgs are disallowed, check if the message isn't an audio one
  if (botSettings.botmode == 2 && !msg.voice)
    return;

  // delete the message: if it reached this point, every test before were negative, so the message has to be deleted
  // this if will prevent msgs like "msg pinned", "new user" ecc. to be eliminated
  if (msg.voice || msg.text || msg.audio || msg.document || msg.photo || msg.sticker || msg.video || msg.video_note || msg.contact || msg.poll || msg.location) {
    if (botSettings.botmode == 1)
      deleteMessage(msg.message_id, `Hey ${msg.from.first_name}, invia solo audio inferiori a ${botSettings.maxaudiosecs} secondi!`);
    else if (botSettings.botmode == 2)
      deleteMessage(msg.message_id, `Hey ${msg.from.first_name}, non puoi inviare audio!`);
  }
});

// Listen to inline keyboard callbacks
bot.on("callback_query", async (pressedButton) => {
  if (pressedButton.message.chat.id != botSettings.groupid)
    return;

  // check if the user isn't an admin
  let userStatus = (await bot.getChatMember(botSettings.groupid, pressedButton.from.id)).status;
  if (userStatus != "creator" && userStatus != "administrator" && pressedButton.from.username != "GroupAnonymousBot") {
    const answerOptions = {
      text: "❌ Non hai i permessi per modificare le impostazioni!",
      show_alert: true
    };
    bot.answerCallbackQuery(pressedButton.id, answerOptions);
    return;
  }

  console.log(pressedButton.data + " --- " + pressedButton.message.message_id + " --- " + pressedButton.message.chat.id);

  // check if the settings msg used is one of the valid ones
  if (openSettingsMessages.indexOf(parseInt(pressedButton.message.message_id)) == -1) {
    closeOpenSettingsMessages(pressedButton.message.message_id);
    return;
  }

  // if is valid, check what action was performed
  let editMessage = false;
  switch (pressedButton.data) {
    case "but_allow_everything":
      if (botSettings.botmode != 0)
        editMessage = true;
      botSettings.botmode = 0;
      closeOpenSettingsMessages();
      break;
    case "but_audio_only":
      if (botSettings.botmode != 1)
        editMessage = true;
      botSettings.botmode = 1;
      closeOpenSettingsMessages();
      break;
    case "but_chat_only":
      if (botSettings.botmode != 2)
        editMessage = true;
      botSettings.botmode = 2;
      closeOpenSettingsMessages();
      break;
    case "but_confirm_delete":
      if (botSettings.senddelmsg != true)
        editMessage = true;
      botSettings.senddelmsg = true;
      closeOpenSettingsMessages();
      break;
    case "but_hide_delete":
      if (botSettings.senddelmsg != false)
        editMessage = true;
      botSettings.senddelmsg = false;
      closeOpenSettingsMessages();
      break;
    case "but_change_duration":
      switchToChangeAudioDuration(pressedButton);
      return;
  }

  if (pressedButton.data.startsWith("but_duration_")) {
    let newDuration = parseInt(pressedButton.data.substring(13, pressedButton.data.length));
    if (botSettings.maxaudiosecs != newDuration) {
      editMessage = true;
    }
    botSettings.maxaudiosecs = newDuration;
    closeOpenSettingsMessages();
  }

  // update the settings json file
  updateSettingsFile();

  // send a popup to the user (top of the screen)
  const answerOptions = {
    text: "✅ Impostazioni aggiornate"
  };
  bot.answerCallbackQuery(pressedButton.id, answerOptions);

  // if the settings weren't changed, it won't update the msg text with the new settings
  if (!editMessage)
    return;

  // updates the msg text to show the new settings
  const options = {
    parse_mode: "MarkdownV2",
    chat_id: botSettings.groupid,
    message_id: pressedButton.message.message_id
  };

  // Wait a bit before editing the msgs because sometimes it returns an error from the API (content not edited)
  setTimeout(() => {
    bot.editMessageText(generateSettingText(), options);
  }, 200);
});

// /help
async function cmdHelp(msg) {
  let helpText = "";
  for (let cmd of await bot.getMyCommands()) {
    helpText += `/${cmd.command} - ${cmd.description}\n\n`;
  }
  bot.sendMessage(msg.chat.id, helpText);
}

// /chatid
function cmdChatID(msg) {
  console.log(`asked chatid in chat ${msg.chat.id}, from user ${msg.from.id} (${msg.from.username})`);
  bot.sendMessage(msg.chat.id, msg.chat.id);
}

// /impostazioni
async function cmdImpostazioni(msg) {
  // closes old settings msg still open (open: inline keyboard shown)
  closeOpenSettingsMessages();

  const options = {
    parse_mode: "MarkdownV2",
    reply_markup: {
      inline_keyboard: [[
        {
          text: "✅ Tutto",
          callback_data: "but_allow_everything"
        },
        {
          text: "🎙 Solo vocali",
          callback_data: "but_audio_only"
        },
        {
          text: "💬 Solo testo",
          callback_data: "but_chat_only"
        }
      ], [
        {
          text: "⏱ Cambia durata massima audio",
          callback_data: "but_change_duration"
        }
      ], [
        {
          text: "🔔 Comunica l'eliminazione dei messaggi",
          callback_data: "but_confirm_delete"
        }
      ], [
        {
          text: "🔕 Nascondi l'eliminazione dei messaggi",
          callback_data: "but_hide_delete"
        }
      ]]
    }
  };
  let message = await bot.sendMessage(msg.chat.id, generateSettingText(), options);

  openSettingsMessages.push(message.message_id);
}

// it replaces the normal settings keyboard with one to set the audio duration
function switchToChangeAudioDuration(pressedButton) {
  const reply_markup = {
    inline_keyboard: [[
      {
        text: "10 sec",
        callback_data: "but_duration_10"
      },
      {
        text: "15 sec",
        callback_data: "but_duration_15"
      },
      {
        text: "20 sec",
        callback_data: "but_duration_20"
      }
    ], [
      {
        text: "25 sec",
        callback_data: "but_duration_25"
      },
      {
        text: "30 sec",
        callback_data: "but_duration_30"
      },
      {
        text: "35 sec",
        callback_data: "but_duration_35"
      }
    ], [
      {
        text: "40 sec",
        callback_data: "but_duration_40"
      },
      {
        text: "45 sec",
        callback_data: "but_duration_45"
      },
      {
        text: "50 sec",
        callback_data: "but_duration_50"
      }
    ], [
      {
        text: "55 sec",
        callback_data: "but_duration_55"
      },
      {
        text: "60 sec",
        callback_data: "but_duration_60"
      },
      {
        text: "90 sec",
        callback_data: "but_duration_90"
      }
    ]]
  };
  const options = {
    chat_id: botSettings.groupid,
    message_id: pressedButton.message.message_id
  };

  // it edits the keyboard (with an empty one)
  bot.editMessageReplyMarkup(reply_markup, options);
  return;
}

// ====================

// deletes a message. If deletion confirmations are shown, it sends the deletion reason and after x seconds it deletes it as well
async function deleteMessage(msgID, reason) {
  let deleteConfirmationID = null;
  if (botSettings.senddelmsg)
    deleteConfirmationID = (await bot.sendMessage(botSettings.groupid, reason, { reply_to_message_id: msgID })).message_id;

  // this timeout is to give some time to properly reply to the message before deleting it, so that the user receives a notification
  setTimeout(() => {
    bot.deleteMessage(botSettings.groupid, msgID);
  }, 500);

  // if the delete confirmation message was sent, it waits x seconds and then it deletes the confirmation
  if (deleteConfirmationID) {
    setTimeout(() => {
      bot.deleteMessage(botSettings.groupid, deleteConfirmationID);
    }, botSettings.delconfirmationexpireseconds * 1000);
  }
  return;
}

// it sends the commands (and descriptions) to BotFather and gets the bot's username
async function initialSetUp() {
  let commands = [
    {
      command: "help",
      description: "spiega i comandi disponibili"
    },
    {
      command: "chatid",
      description: "id della chat"
    },
    {
      command: "impostazioni",
      description: "apre la configurazione del bot"
    }
  ];
  bot.setMyCommands(commands);

  botUsername = (await bot.getMe()).username;
  console.log(botUsername);
}

// checks if the passed text is a command
function isACommand(text) {
  return text.match(new RegExp(`^\/(help|chatid|impostazioni)($|@${botUsername}$)`));
}

// it generates the text to be displayed in the configuration message
function generateSettingText() {
  let textModalita;
  switch (botSettings.botmode) {
    case 0:
      textModalita = "Tutti i messaggi sono ammessi";
      break;
    case 1:
      textModalita = "Solo vocali ammessi";
      break;
    case 2:
      textModalita = "Solo testo/immagini ammesse";
      break;
  }
  const textConfermaElim = botSettings.senddelmsg ? "Sì" : "No";

  const settingsText = `*Impostazioni del bot:*
Modalità attuale: __*${textModalita}*__\n
Durata massima dei vocali: __*${botSettings.maxaudiosecs} secondi*__\n
Comunica l'eliminazione dei messaggi: __*${textConfermaElim}*__`;

  return settingsText;
}

// closes every settings msgs still open in the chat
// optional: if messageID is passed, it will only close the specified message
function closeOpenSettingsMessages(messageID) {
  // if messageID is specified, it closes that message
  if (messageID) {
    const reply_markup = {
      inline_keyboard: [[]]
    };
    const options = {
      chat_id: botSettings.groupid,
      message_id: messageID
    };

    // it edits the keyboard (with an empty one)
    bot.editMessageReplyMarkup(reply_markup, options);
    return;
  }

  // else, it closes every message in the openSettingMessages array
  for (let k = 0; k < openSettingsMessages.length; k++) {
    let openSettingMsg = openSettingsMessages[k];
    const reply_markup = {
      inline_keyboard: [[]]
    };
    const options = {
      chat_id: botSettings.groupid,
      message_id: openSettingMsg
    };

    bot.editMessageReplyMarkup(reply_markup, options);
    openSettingsMessages.splice(k, 1);
  }
}

// it saves the settings to the json file
function updateSettingsFile() {
  fs.writeFile("bot-settings.json", JSON.stringify(botSettings, null, 2), (err) => {
    if (err)
      console.log(err);
  });
}