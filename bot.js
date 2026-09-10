const {
  Client,
  GatewayIntentBits,
  Events,
  AttachmentBuilder,
  REST,
  Routes,
  SlashCommandBuilder,
  MessageFlags,
} = require("discord.js");
const moment = require("moment-timezone");
const fs = require("fs");
const { CONFIG, DATA_FILE, SIEGE_DATA_FILE, HISTORY_FILE, JAKARTA_TZ, log } = require("./config");
const { CUSTOM_ID_TO_ROLE, SIEGE_ROLE_BUTTONS } = require("./constants");
const { getLimits, getSiegeLimits, isAuthorized } = require("./utils");
const RSVPSession = require("./rsvpSession");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});
client.mainMsg = null;
client.waitlistMsg = null;
client.mainMsgId = null;
client.waitlistMsgId = null;
client.currentSession = null;
client.siegeSession = null;

let lastPostDate = null;
const voteReminderSent = new Set();

function messageKey(prefix, name) {
  return prefix ? `${prefix}${name[0].toUpperCase()}${name.slice(1)}` : name;
}

const SLASH_COMMANDS = [
  new SlashCommandBuilder().setName("open-node-war").setDescription("Open a Node War RSVP now"),
  new SlashCommandBuilder().setName("close-rsvp").setDescription("Close the current Node War RSVP"),
  new SlashCommandBuilder().setName("open-siege").setDescription("Open a Siege War RSVP in the configured channel"),
].map((command) => command.toJSON());

async function registerSlashCommands() {
  if (!process.env.DISCORD_TOKEN || !CONFIG.SERVER_ID) return;
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(Routes.applicationGuildCommands(client.user.id, String(CONFIG.SERVER_ID)), { body: SLASH_COMMANDS });
  log("INFO", "Slash commands registered for this server.");
}

function restoreState(dataFile = DATA_FILE, sessionKey = "currentSession", messagePrefix = "") {
  if (!fs.existsSync(dataFile)) return;
  try {
    const state = JSON.parse(fs.readFileSync(dataFile, "utf8"));
    const targetDate = moment.tz(state.target_date, JAKARTA_TZ).toDate();
    const session = new RSVPSession(client, state.session_type === "siege" ? getSiegeLimits() : getLimits(targetDate), targetDate, {
      dataFile,
      title: state.session_type === "siege" ? "Siege War RSVP" : "Node War RSVP",
      sessionType: state.session_type || "node",
      messagePrefix,
      roleButtons: state.session_type === "siege" ? SIEGE_ROLE_BUTTONS : undefined,
    });

    for (const role of Object.keys(session.limits)) {
      if (state.data && state.data[role]) session.data[role] = state.data[role];
      if (state.waitlist && state.waitlist[role]) session.waitlist[role] = state.waitlist[role];
      if (state.member_data && state.member_data[role]) session.memberData[role] = state.member_data[role];
      if (state.member_waitlist && state.member_waitlist[role]) session.memberWaitlist[role] = state.member_waitlist[role];
    }
    session.isClosed = state.is_closed || false;
    client[messageKey(messagePrefix, "mainMsgId")] = state.main_msg_id || null;
    client[messageKey(messagePrefix, "waitlistMsgId")] = state.waitlist_msg_id || null;
    client[sessionKey] = session;
    log("INFO", `Saved ${session.sessionType} state restored for ${state.target_date}`);
  } catch (e) {
    log("ERROR", `Error restoring state: ${e}`);
  }
}

function getBenchHistory() {
  if (!fs.existsSync(HISTORY_FILE)) return [];
  try { return JSON.parse(fs.readFileSync(HISTORY_FILE, "utf8")); } catch { return []; }
}

function recordBenchHistory(session) {
  const history = getBenchHistory();
  if (history.some((entry) => entry.date === moment(session.targetDate).format("YYYY-MM-DD"))) return;
  const users = Object.values(session.memberWaitlist).flat().filter((member) => member?.id);
  history.push({ date: moment(session.targetDate).format("YYYY-MM-DD"), users });
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history.slice(-10), null, 2));
}

function getPriorityBenchUsers() {
  const recent = getBenchHistory().slice(-3);
  if (recent.length < 3) return [];
  const everyDay = recent.reduce((ids, entry) => {
    const today = new Map(entry.users.map((member) => [member.id, member]));
    return ids.filter((member) => today.has(member.id)).map((member) => today.get(member.id));
  }, recent[0].users || []);
  return [...new Map(everyDay.map((member) => [member.id, member])).values()].slice(0, 5);
}

async function postRSVP() {
  const now = moment().tz(JAKARTA_TZ);
  const targetDate = (now.hour() >= 21 ? now.clone().add(1, "day") : now.clone()).toDate();
  const ch = await client.channels.fetch(String(CONFIG.CHANNEL_ID || "0")).catch(() => null);
  if (!ch?.isTextBased()) return false;

  const session = new RSVPSession(client, getLimits(targetDate), targetDate);
  const priorityUsers = getPriorityBenchUsers();
  for (const member of priorityUsers) {
    if (session.data["Main Ball"].length >= session.limits["Main Ball"]) break;
    session.data["Main Ball"].push(member.name);
    session.memberData["Main Ball"].push(member);
  }
  client.currentSession = session;
  const { mainEmb, waitEmb } = session.buildEmbeds();

  const mainMsg = await ch.send({
    content: `@everyone Node War Open!${priorityUsers.length ? `\n⭐ Priority Main Ball: ${priorityUsers.map((member) => `<@${member.id}>`).join(", ")}` : ""}`,
    allowedMentions: { parse: ["everyone", "users"] },
    embeds: [mainEmb],
    components: session.buildComponents(),
  });
  const waitlistMsg = await ch.send({ embeds: [waitEmb] });

  client.mainMsg = mainMsg;
  client.waitlistMsg = waitlistMsg;
  client.mainMsgId = mainMsg.id;
  client.waitlistMsgId = waitlistMsg.id;
  session.saveState();
  return true;
}

async function postSiege() {
  const channel = await client.channels.fetch(String(CONFIG.SIEGE_CHANNEL_ID || "0")).catch(() => null);
  if (!channel?.isTextBased()) return false;
  const targetDate = moment().tz(JAKARTA_TZ).toDate();
  const session = new RSVPSession(client, getSiegeLimits(), targetDate, { dataFile: SIEGE_DATA_FILE, title: "Siege War RSVP", sessionType: "siege", messagePrefix: "siege", roleButtons: SIEGE_ROLE_BUTTONS });
  client.siegeSession = session;
  const { mainEmb, waitEmb } = session.buildEmbeds();
  const mainMsg = await channel.send({ content: "@everyone Siege War Open!", allowedMentions: { parse: ["everyone"] }, embeds: [mainEmb], components: session.buildComponents() });
  const waitlistMsg = await channel.send({ embeds: [waitEmb] });
  client.siegeMainMsg = mainMsg;
  client.siegeWaitlistMsg = waitlistMsg;
  client.siegeMainMsgId = mainMsg.id;
  client.siegeWaitlistMsgId = waitlistMsg.id;
  session.saveState();
  return true;
}

async function closeRSVP(logChannelOverride = null) {
  const session = client.currentSession;
  if (!session) return;
    session.isClosed = true;
    recordBenchHistory(session);
  try {
    if (!client.mainMsg && client.mainMsgId) {
      const ch = await client.channels.fetch(String(CONFIG.CHANNEL_ID || "0")).catch(() => null);
      if (ch) client.mainMsg = await ch.messages.fetch(client.mainMsgId).catch(() => null);
    }
    const { mainEmb } = session.buildEmbeds();
    if (client.mainMsg) {
      await client.mainMsg.edit({
        content: "🔒 CLOSED",
        embeds: [mainEmb],
        components: session.buildComponents(),
      });
    }
    session.saveState();

    const logCh =
      logChannelOverride ||
      (await client.channels.fetch(String(CONFIG.LOG_CHANNEL_ID || "0")).catch(() => null));
    if (logCh) {
      const fn = `node${moment(session.targetDate).format("YYMMDD")}.json`;
      await logCh.send({
        content: `💾 Backup: \`${fn}\``,
        files: [new AttachmentBuilder(DATA_FILE, { name: fn })],
      });
    }
  } catch (e) {
    log("ERROR", `Close RSVP failed: ${e}`);
  }
  client.currentSession = null;
}

async function tagRSVPParticipants(session, channelId, reminderText) {
  if (!session || session.isClosed) return;
  const channel = await client.channels.fetch(String(channelId || "0")).catch(() => null);
  if (!channel?.isTextBased()) return;
  await channel.send({ content: `🔔 @everyone\n${reminderText}`, allowedMentions: { parse: ["everyone"] } });
}

async function sendVoteReminder() {
  const session = client.currentSession;
  if (session && !session.isClosed) {
  const day = { 0: "SUN", 1: "MON", 2: "TUE", 3: "WED", 4: "THU", 5: "FRI" }[session.targetDate.getDay()];
    if (day) {
      const tier = CONFIG[`${day}_TIER`] === "Tier 2" ? "Tier 2" : "Tier 1";
      const targets = tier === "Tier 2" ? "Calpheon or Ulukita" : "Balenos or Serendia";
      await tagRSVPParticipants(session, CONFIG.CHANNEL_ID, `Please **YES UP** on **${targets}** for **${tier}**.`);
    }
  }

  await tagRSVPParticipants(client.siegeSession, CONFIG.SIEGE_CHANNEL_ID, "Please **YES UP** for the **Siege War** vote.");
}

function startScheduler() {
  setInterval(async () => {
    const now = moment().tz(JAKARTA_TZ);
    const today = now.format("YYYY-MM-DD");
    const isOpeningTime = now.hour() * 60 + now.minute() >= 21 * 60 + 30;
    if (isOpeningTime && lastPostDate !== today) {
      lastPostDate = now.format("YYYY-MM-DD");

      if (now.day() === 5) {
        // Friday -> no node war the following day (Saturday)
        const ch = await client.channels
          .fetch(String(CONFIG.CHANNEL_ID || "0"))
          .catch(() => null);
        if (ch) {
          await ch.send(
            `No Node War bot reservation today, stand by for free medals at siege time <@&${CONFIG.ALLIANCE_ROLE_ID || "0"}>`
          );
        }
      } else if (!client.currentSession || client.currentSession.isClosed) {
        await postRSVP();
      }
    } else if (now.hour() === 20 && now.minute() === 0) {
      await closeRSVP();
    }
    if ((now.hour() === 17 || now.hour() === 19) && now.minute() === 0) {
      const reminderKey = `${now.format("YYYY-MM-DD")}-${now.hour()}`;
      if (!voteReminderSent.has(reminderKey)) {
        voteReminderSent.add(reminderKey);
        await sendVoteReminder();
      }
    }
  }, 60 * 1000);
}

client.once(Events.ClientReady, () => {
  log("INFO", `Logged in as ${client.user.tag}`);
  registerSlashCommands().catch((error) => log("ERROR", `Could not register slash commands: ${error}`));
  restoreState();
  restoreState(SIEGE_DATA_FILE, "siegeSession", "siege");
  startScheduler();
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (!isAuthorized(interaction.member)) {
        await interaction.reply({ content: "🚫 Unauthorized.", flags: MessageFlags.Ephemeral });
        return;
      }
      // Discord requires an initial acknowledgement within three seconds.
      // Opening/editing RSVP messages can take longer than that.
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      if (interaction.commandName === "open-node-war") {
        const opened = await postRSVP();
        await interaction.editReply(opened ? "✅ Node War RSVP opened." : "⚠️ Set an RSVP channel in the dashboard first.");
      } else if (interaction.commandName === "close-rsvp") {
        await closeRSVP();
        await interaction.editReply("✅ Node War RSVP closed.");
      } else if (interaction.commandName === "open-siege") {
        const opened = await postSiege();
        await interaction.editReply(opened ? "✅ Siege War RSVP opened." : "⚠️ Set a Siege RSVP channel in the dashboard first.");
      }
      return;
    }
    if (!interaction.isButton()) return;
    const role = CUSTOM_ID_TO_ROLE[interaction.customId];
    if (!role) return;
    const session = interaction.message.id === client.mainMsgId ? client.currentSession : interaction.message.id === client.siegeMainMsgId ? client.siegeSession : null;
    if (!session) return;
    await session.processRoleSelection(interaction, role);
  } catch (error) {
    log("ERROR", `Interaction failed: ${error}`);
    if (interaction.isChatInputCommand() && (interaction.deferred || interaction.replied)) {
      await interaction.editReply("⚠️ The command could not be completed. Please try again.").catch(() => {});
    }
  }
});


module.exports = { client, postRSVP, closeRSVP, postSiege };
