const {
  Client,
  GatewayIntentBits,
  Events,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ChannelType,
  PermissionsBitField,
  AttachmentBuilder,
} = require("discord.js");
const express = require("express");
const moment = require("moment-timezone");
const fs = require("fs");
const { spawn } = require("child_process");

// --- LOGGING & CONFIG ---
const JAKARTA_TZ = "Asia/Jakarta";
const CONFIG_FILE = "config.json";
const DATA_FILE = "rsvp_data.json";

function log(cat, msg) {
  const time = moment().tz(JAKARTA_TZ).format("HH:mm:ss");
  console.log(`[${time}] [${cat.padEnd(7)}] ${msg}`);
}

const DEFAULT_CONFIG = {
  TOKEN: "",
  SERVER_ID: "",
  CHANNEL_ID: "0",
  LOG_CHANNEL_ID: "0",
  AUTHORIZED_ROLE_ID: "0",
  ALLIANCE_ROLE_ID: "0",
  WEB_PASSWORD: "admin",
  SUN_TIER: "Tier 1",
  MON_TIER: "Tier 1",
  TUE_TIER: "Tier 1",
  WED_TIER: "Tier 1",
  THU_TIER: "Tier 1",
  FRI_TIER: "Tier 1",
};

function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 4));
    return { ...DEFAULT_CONFIG };
  }
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

let CONFIG = loadConfig();

const ROLE_EMOJIS = {
  "Main Ball": "⚔️",
  "Builder": "🔨",
  "Elephant": "🐘",
  "Flag": "🚩",
  "FT": "🔥",
  "Hwacha": "🏹",
  "Shai": "🎵",
  "Shotcaller": "📢",
};

// JS Date/moment .day(): 0=Sun,1=Mon,2=Tue,3=Wed,4=Thu,5=Fri,6=Sat
// Saturday (6) intentionally has no key, mirroring the original's default-to-MON behavior
const DAY_KEYS = { 0: "SUN", 1: "MON", 2: "TUE", 3: "WED", 4: "THU", 5: "FRI" };

const ROLE_BUTTONS = [
  { role: "Main Ball", customId: "rsvp_main", emoji: "⚔️" },
  { role: "Builder", customId: "rsvp_builder", emoji: "🔨" },
  { role: "Elephant", customId: "rsvp_elephant", emoji: "🐘" },
  { role: "Flag", customId: "rsvp_flag", emoji: "🚩" },
  { role: "FT", customId: "rsvp_ft", emoji: "🔥" },
  { role: "Hwacha", customId: "rsvp_hwacha", emoji: "🏹" },
  { role: "Shai", customId: "rsvp_shai", emoji: "🎵" },
  { role: "Shotcaller", customId: "rsvp_shotcaller", emoji: "📢" },
];
const CUSTOM_ID_TO_ROLE = Object.fromEntries(
  ROLE_BUTTONS.map((b) => [b.customId, b.role])
);
CUSTOM_ID_TO_ROLE["rsvp_cancel"] = "Cancel";

// --- LIMITS CALCULATOR ---
function getLimits(targetDate) {
  const weekday = targetDate.getDay();
  const dayPrefix = DAY_KEYS[weekday] || "MON";
  const tier = CONFIG[`${dayPrefix}_TIER`] || "Tier 1";

  const matrix = {
    SUN: { "Tier 1": 20, "Tier 2": 35 },
    MON: { "Tier 1": 15, "Tier 2": 25 },
    TUE: { "Tier 1": 20, "Tier 2": 25 },
    WED: { "Tier 1": 15, "Tier 2": 25 },
    THU: { "Tier 1": 20, "Tier 2": 25 },
    FRI: { "Tier 1": 15, "Tier 2": 35 },
  };

  const limits = {};
  for (const role of Object.keys(ROLE_EMOJIS)) limits[role] = 1;
  limits["Main Ball"] = matrix[dayPrefix][tier];
  limits["FT"] = 2;
  limits["Shai"] = 3;

  const total = Object.values(limits).reduce((a, b) => a + b, 0);
  log("RSVP", `Squad limits compiled for ${dayPrefix} (${tier}) -> Total: ${total} slots.`);
  return limits;
}

function isAuthorized(member) {
  const authId = String(CONFIG.AUTHORIZED_ROLE_ID || "0");
  if (authId !== "0" && member.roles.cache.has(authId)) return true;
  return member.permissions.has(PermissionsBitField.Flags.Administrator);
}

// --- RSVP SESSION (replaces the discord.py RSVPView) ---
class RSVPSession {
  constructor(client, limits, targetDate) {
    this.client = client;
    this.limits = limits;
    this.targetDate = targetDate;
    this.data = {};
    this.waitlist = {};
    for (const role of Object.keys(limits)) {
      this.data[role] = [];
      this.waitlist[role] = [];
    }
    this.isClosed = false;
    this._updateRunning = false;
  }

  saveState() {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(
        {
          target_date: moment(this.targetDate).format("YYYY-MM-DD"),
          is_closed: this.isClosed,
          data: this.data,
          waitlist: this.waitlist,
          main_msg_id: this.client.mainMsgId || null,
          waitlist_msg_id: this.client.waitlistMsgId || null,
        },
        null,
        4
      )
    );
  }

  buildEmbeds() {
    const color = this.isClosed ? 0xed4245 : 0x5865f2;
    const weekday = this.targetDate.getDay();
    const dayPrefix = DAY_KEYS[weekday] || "MON";
    const tier = CONFIG[`${dayPrefix}_TIER`] || "Tier 1";
    const totalSlots = Object.values(this.limits).reduce((a, b) => a + b, 0);

    const mainEmb = new EmbedBuilder()
      .setTitle(`Node War RSVP - ${tier} (${totalSlots} Slot)`)
      .setDescription(
        `**Event Date:** ${moment(this.targetDate).format("dddd, DD-MM-YYYY")}\n` +
          (this.isClosed ? "❌ CLOSED" : "Click buttons to join!")
      )
      .setColor(color);

    for (const [role, users] of Object.entries(this.data)) {
      mainEmb.addFields({
        name: `${ROLE_EMOJIS[role]} ${role} (${users.length}/${this.limits[role]})`,
        value: users.length ? users.map((u) => `• ${u}`).join("\n") : "-",
        inline: false,
      });
    }
    const totalReg = Object.values(this.data).reduce((a, arr) => a + arr.length, 0);
    mainEmb.addFields({
      name: "📊 Summary",
      value: `**Total Registered: ${totalReg}/${totalSlots}**`,
      inline: false,
    });

    const anyWaitlist = Object.values(this.waitlist).some((arr) => arr.length);
    const waitEmb = new EmbedBuilder()
      .setTitle("📋 Waitlist / Backups")
      .setColor(0xfaa61a)
      .setDescription(anyWaitlist ? "" : "No backups currently in queue.");
    for (const [role, users] of Object.entries(this.waitlist)) {
      if (users.length) {
        waitEmb.addFields({
          name: `${ROLE_EMOJIS[role]} ${role} Backups`,
          value: users.map((u) => `• ${u}`).join("\n"),
          inline: false,
        });
      }
    }
    return { mainEmb, waitEmb };
  }

  buildComponents() {
    const buttons = ROLE_BUTTONS.map((b) =>
      new ButtonBuilder()
        .setCustomId(b.customId)
        .setLabel(b.role)
        .setEmoji(b.emoji)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(this.isClosed)
    );
    buttons.push(
      new ButtonBuilder()
        .setCustomId("rsvp_cancel")
        .setLabel("Cancel")
        .setEmoji("❌")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(this.isClosed)
    );
    // Discord caps action rows at 5 components each
    const rows = [];
    for (let i = 0; i < buttons.length; i += 5) {
      rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
    }
    return rows;
  }

  async batchUpdateDiscord() {
    await new Promise((r) => setTimeout(r, 1500));
    try {
      const { mainEmb, waitEmb } = this.buildEmbeds();
      const channelId = String(CONFIG.CHANNEL_ID || "0");

      if (channelId !== "0") {
        const ch = await this.client.channels.fetch(channelId).catch(() => null);
        if (ch) {
          if (!this.client.mainMsg && this.client.mainMsgId) {
            this.client.mainMsg = await ch.messages
              .fetch(this.client.mainMsgId)
              .catch((e) => {
                log("ERROR", `Failed to fetch main message: ${e}`);
                return null;
              });
          }
          if (!this.client.waitlistMsg && this.client.waitlistMsgId) {
            this.client.waitlistMsg = await ch.messages
              .fetch(this.client.waitlistMsgId)
              .catch((e) => {
                log("ERROR", `Failed to fetch waitlist message: ${e}`);
                return null;
              });
          }
        }
      }

      if (this.client.mainMsg)
        await this.client.mainMsg.edit({ embeds: [mainEmb], components: this.buildComponents() });
      if (this.client.waitlistMsg) await this.client.waitlistMsg.edit({ embeds: [waitEmb] });
      this.saveState();
      log("SUCCESS", "RSVP Embeds updated on Discord.");
    } catch (e) {
      log("ERROR", `Batch update failed: ${e}`);
    } finally {
      this._updateRunning = false;
    }
  }

  async processRoleSelection(interaction, role) {
    if (this.isClosed) return;
    await interaction.deferUpdate();
    const user = interaction.member.displayName;

    for (const r of Object.keys(this.limits)) {
      const idx = this.data[r].indexOf(user);
      if (idx !== -1) {
        this.data[r].splice(idx, 1);
        if (this.waitlist[r].length) this.data[r].push(this.waitlist[r].shift());
      }
      const wIdx = this.waitlist[r].indexOf(user);
      if (wIdx !== -1) this.waitlist[r].splice(wIdx, 1);
    }

    if (role !== "Cancel") {
      if (this.data[role].length < this.limits[role]) {
        this.data[role].push(user);
      } else {
        this.waitlist[role].push(user);
        await interaction.followUp({
          content: `⚠️ ${role} full! Handled into Waitlist.`,
          ephemeral: true,
        });
      }
    }

    if (!this._updateRunning) {
      this._updateRunning = true;
      this.batchUpdateDiscord();
    }
  }
}

// --- MAIN BOT SYSTEM ---
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

let lastPostDate = null;

function restoreState() {
  if (!fs.existsSync(DATA_FILE)) return;
  try {
    const state = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    const targetDate = moment.tz(state.target_date, JAKARTA_TZ).toDate();
    const session = new RSVPSession(client, getLimits(targetDate), targetDate);

    for (const role of Object.keys(session.limits)) {
      if (state.data && state.data[role]) session.data[role] = state.data[role];
      if (state.waitlist && state.waitlist[role]) session.waitlist[role] = state.waitlist[role];
    }
    session.isClosed = state.is_closed || false;
    client.mainMsgId = state.main_msg_id || null;
    client.waitlistMsgId = state.waitlist_msg_id || null;
    client.currentSession = session;
    log("INFO", `Saved states resolved natively for event day ${state.target_date}`);
  } catch (e) {
    log("ERROR", `Error restoring state: ${e}`);
  }
}

async function postRSVP() {
  const now = moment().tz(JAKARTA_TZ);
  const targetDate = (now.hour() >= 21 ? now.clone().add(1, "day") : now.clone()).toDate();
  const ch = await client.channels.fetch(String(CONFIG.CHANNEL_ID || "0")).catch(() => null);
  if (!ch) return;

  const session = new RSVPSession(client, getLimits(targetDate), targetDate);
  client.currentSession = session;
  const { mainEmb, waitEmb } = session.buildEmbeds();

  const mainMsg = await ch.send({
    content: `<@&${CONFIG.ALLIANCE_ROLE_ID || "0"}> Node War Open!`,
    embeds: [mainEmb],
    components: session.buildComponents(),
  });
  const waitlistMsg = await ch.send({ embeds: [waitEmb] });

  client.mainMsg = mainMsg;
  client.waitlistMsg = waitlistMsg;
  client.mainMsgId = mainMsg.id;
  client.waitlistMsgId = waitlistMsg.id;
  session.saveState();
}

async function closeRSVP(logChannelOverride = null) {
  const session = client.currentSession;
  if (!session) return;
  session.isClosed = true;
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

function startScheduler() {
  setInterval(async () => {
    const now = moment().tz(JAKARTA_TZ);
    if (now.hour() === 21 && now.minute() === 30) {
      if (lastPostDate === now.format("YYYY-MM-DD")) return;
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
      } else {
        await postRSVP();
      }
    } else if (now.hour() === 20 && now.minute() === 0) {
      await closeRSVP();
    }
  }, 60 * 1000);
}

client.once(Events.ClientReady, () => {
  log("INFO", `Logged in as ${client.user.tag}`);
  restoreState();
  startScheduler();
});

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;
  const role = CUSTOM_ID_TO_ROLE[interaction.customId];
  if (!role) return;
  if (!client.currentSession) return;
  // Only respond to buttons on the currently active RSVP message
  if (interaction.message.id !== client.mainMsgId) return;
  await client.currentSession.processRoleSelection(interaction, role);
});

client.on(Events.MessageCreate, async (message) => {
  if (message.author.bot || !message.guild) return;
  if (!message.content.startsWith("!")) return;
  const cmd = message.content.slice(1).trim().split(/\s+/)[0];

  if (cmd === "testrsvp") {
    if (!isAuthorized(message.member)) {
      const warn = await message.channel.send("🚫 Unauthorized.");
      setTimeout(() => warn.delete().catch(() => {}), 5000);
      return;
    }
    await postRSVP();
  } else if (cmd === "closersvp") {
    if (!isAuthorized(message.member)) {
      const warn = await message.channel.send("🚫 Unauthorized.");
      setTimeout(() => warn.delete().catch(() => {}), 5000);
      return;
    }
    await closeRSVP(message.channel);
  }
});

// --- DASHBOARD SERVER ---
const app = express();
app.use(express.urlencoded({ extended: true }));

function renderTemplate(vars) {
  return HTML_TEMPLATE.replace(/\{(\w+)\}/g, (match, key) =>
    vars[key] !== undefined ? vars[key] : match
  );
}

app.get("/", (req, res) => {
  const guildReady = client.isReady() && client.guilds.cache.size > 0;
  const guild =
    client.guilds.cache.get(String(CONFIG.SERVER_ID)) ||
    (guildReady ? client.guilds.cache.first() : null);

  const opts = (items, curr, pref = "") =>
    items
      ? items
          .map(
            (i) =>
              `<option value='${i.id}' ${String(i.id) === String(curr) ? "selected" : ""}>${pref}${i.name}</option>`
          )
          .join("")
      : "";

  const statusDiv = guild
    ? `<div class='status' style='background:rgba(87,242,135,0.1);color:#57F287;'>✅ Connected to ${guild.name}</div>`
    : `<div class='status' style='background:rgba(237,66,69,0.1);color:#ed4245;'>⚠️ Bot Offline</div>`;

  const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI"];
  const selectors = {};
  for (const d of days) {
    const t1 = CONFIG[`${d}_TIER`] === "Tier 1" ? "selected" : "";
    const t2 = CONFIG[`${d}_TIER`] === "Tier 2" ? "selected" : "";
    selectors[`${d.toLowerCase()}_opts`] =
      `<option value="Tier 1" ${t1}>Tier 1</option><option value="Tier 2" ${t2}>Tier 2</option>`;
  }

  let textChannels = [];
  let roles = [];
  if (guild) {
    textChannels = [...guild.channels.cache.filter((c) => c.type === ChannelType.GuildText).values()];
    roles = [...guild.roles.cache.values()].reverse();
  }

  const html = renderTemplate({
    status_message: statusDiv,
    TOKEN: CONFIG.TOKEN || "",
    ...selectors,
    server_input: guildReady
      ? `<select name='SERVER_ID'>${opts([...client.guilds.cache.values()], guild.id)}</select>`
      : "<input type='text' disabled value='Offline'>",
    channel_input: guild
      ? `<select name='CHANNEL_ID'>${opts(textChannels, CONFIG.CHANNEL_ID, "# ")}</select>`
      : "<input type='text' disabled value='Offline'>",
    log_channel_input: guild
      ? `<select name='LOG_CHANNEL_ID'>${opts(textChannels, CONFIG.LOG_CHANNEL_ID, "# ")}</select>`
      : "<input type='text' disabled value='Offline'>",
    auth_role_input: guild
      ? `<select name='AUTHORIZED_ROLE_ID'>${opts(roles, CONFIG.AUTHORIZED_ROLE_ID, "@ ")}</select>`
      : "<input type='text' disabled value='Offline'>",
    alliance_role_input: guild
      ? `<select name='ALLIANCE_ROLE_ID'>${opts(roles, CONFIG.ALLIANCE_ROLE_ID, "@ ")}</select>`
      : "<input type='text' disabled value='Offline'>",
  });

  res.type("html").send(html);
});

app.post("/save", (req, res) => {
  if (req.body.WEB_PASSWORD !== CONFIG.WEB_PASSWORD) {
    return res.status(403).send("Wrong Password");
  }
  const keys = [
    "TOKEN",
    "SERVER_ID",
    "CHANNEL_ID",
    "LOG_CHANNEL_ID",
    "AUTHORIZED_ROLE_ID",
    "ALLIANCE_ROLE_ID",
    "SUN_TIER",
    "MON_TIER",
    "TUE_TIER",
    "WED_TIER",
    "THU_TIER",
    "FRI_TIER",
  ];
  for (const k of keys) CONFIG[k] = (req.body[k] || "").trim();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(CONFIG, null, 4));
  res.send("Saved! Restarting...");

  setTimeout(() => {
    // Spawn a fresh instance with the new config, then exit this one (mirrors os.execv)
    spawn(process.argv[0], process.argv.slice(1), {
      cwd: process.cwd(),
      detached: true,
      stdio: "inherit",
    }).unref();
    process.exit(0);
  }, 1000);
});

const HTML_TEMPLATE = `
<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Dashboard</title>
<style>
:root { --primary: #5865F2; --bg: #2c2f33; --card: #23272a; --text: #f2f3f5; }
body { font-family: sans-serif; background: var(--bg); color: var(--text); display: flex; justify-content: center; padding: 40px; }
.card { background: var(--card); padding: 30px; border-radius: 12px; width: 100%; max-width: 500px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); }
.section { background: #2f3136; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid var(--primary); }
.day-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 5px; }
.day-box { background: #1e1f22; padding: 8px; border-radius: 4px; }
label { display: block; font-size: 12px; color: #b5bac1; margin-bottom: 5px; font-weight: bold; }
input, select { width: 100%; padding: 10px; margin-bottom: 10px; border-radius: 4px; border: none; background: #1e1f22; color: white; box-sizing: border-box; }
.day-box select { margin-bottom: 0; background: #2b2d31; }
button { background: var(--primary); color: white; border: none; padding: 15px; border-radius: 4px; width: 100%; font-weight: bold; cursor: pointer; }
.status { padding: 10px; border-radius: 4px; text-align: center; margin-bottom: 20px; font-weight: bold; }
</style></head><body><div class="card"><h2>⚔️ Bot Configuration</h2>{status_message}
<form method="POST" action="/save">
<div class="section"><label>Bot Token</label><input type="password" name="TOKEN" value="{TOKEN}"><label>Discord Server</label>{server_input}</div>

<div class="section">
    <label style="color: #faa61a; font-size: 13px; margin-bottom: 10px;">📅 Daily Tier Strategy Configuration</label>
    <div class="day-grid">
        <div class="day-box"><label>Sunday</label><select name="SUN_TIER">{sun_opts}</select></div>
        <div class="day-box"><label>Monday</label><select name="MON_TIER">{mon_opts}</select></div>
        <div class="day-box"><label>Tuesday</label><select name="TUE_TIER">{tue_opts}</select></div>
        <div class="day-box"><label>Wednesday</label><select name="WED_TIER">{wed_opts}</select></div>
        <div class="day-box"><label>Thursday</label><select name="THU_TIER">{thu_opts}</select></div>
        <div class="day-box"><label>Friday</label><select name="FRI_TIER">{fri_opts}</select></div>
    </div>
</div>

<div class="section"><label>RSVP Target Channel</label>{channel_input}<label>Log/Backup Channel</label>{log_channel_input}<label>Admin Authorized Role</label>{auth_role_input}<label>Alliance Tag Role</label>{alliance_role_input}</div>
<label style="color: #ed4245;">🔐 Confirm Dashboard Password</label><input type="password" name="WEB_PASSWORD" required placeholder="Enter password to authorize save">
<button type="submit">💾 Save Settings & Restart</button></form></div></body></html>
`;

async function main() {
  const port = process.env.SERVER_PORT || 8080;
  app.listen(port, () => log("WEB", `Dashboard server bound to port ${port}`));

  if (CONFIG.TOKEN) {
    await client.login(CONFIG.TOKEN);
  } else {
    log("WEB", "No token configured yet — waiting for dashboard setup at /");
  }
}

main();