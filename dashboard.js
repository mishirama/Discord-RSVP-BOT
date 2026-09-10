const express = require("express");
const fs = require("fs");
const { ChannelType } = require("discord.js");
const { CONFIG, CONFIG_FILE } = require("./config");
const { getCapacityWarnings } = require("./utils");
const HTML_TEMPLATE = require("./template");

function renderTemplate(vars) {
  return HTML_TEMPLATE.replace(/\{(\w+)\}/g, (match, key) =>
    vars[key] !== undefined ? vars[key] : match
  );
}

// Takes the Discord client so the dashboard can read live guild/channel/role data
function createDashboard(client) {
  const app = express();
  app.use(express.urlencoded({ extended: true }));

  app.get("/", (req, res) => {
    const tierPage = req.query.tier === "2" ? "2" : "1";
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

    const limitFields = {
      LIMIT_BUILDER: CONFIG.LIMIT_BUILDER || "1",
      LIMIT_ELEPHANT: CONFIG.LIMIT_ELEPHANT || "1",
      LIMIT_FLAG: CONFIG.LIMIT_FLAG || "1",
      LIMIT_FT: CONFIG.LIMIT_FT || "2",
      LIMIT_HWACHA: CONFIG.LIMIT_HWACHA || "1",
      LIMIT_SHAI: CONFIG.LIMIT_SHAI || "3",
      LIMIT_SHOTCALLER: CONFIG.LIMIT_SHOTCALLER || "1",
      MAINBALL_SUN_T1: CONFIG.MAINBALL_SUN_T1 || "20",
      MAINBALL_SUN_T2: CONFIG.MAINBALL_SUN_T2 || "35",
      MAINBALL_MON_T1: CONFIG.MAINBALL_MON_T1 || "15",
      MAINBALL_MON_T2: CONFIG.MAINBALL_MON_T2 || "25",
      MAINBALL_TUE_T1: CONFIG.MAINBALL_TUE_T1 || "20",
      MAINBALL_TUE_T2: CONFIG.MAINBALL_TUE_T2 || "25",
      MAINBALL_WED_T1: CONFIG.MAINBALL_WED_T1 || "15",
      MAINBALL_WED_T2: CONFIG.MAINBALL_WED_T2 || "25",
      MAINBALL_THU_T1: CONFIG.MAINBALL_THU_T1 || "20",
      MAINBALL_THU_T2: CONFIG.MAINBALL_THU_T2 || "25",
      MAINBALL_FRI_T1: CONFIG.MAINBALL_FRI_T1 || "15",
      MAINBALL_FRI_T2: CONFIG.MAINBALL_FRI_T2 || "35",
    };

    const dayLabels = {
      SUN: "Sunday",
      MON: "Monday",
      TUE: "Tuesday",
      WED: "Wednesday",
      THU: "Thursday",
      FRI: "Friday",
    };
    const mainball_settings = Object.entries(dayLabels)
      .map(([day, label]) => {
        const key = `MAINBALL_${day}_T${tierPage}`;
        return `<div class='mainball-box'><label>${label}</label><input type='number' name='${key}' min='1' value='${limitFields[key]}'></div>`;
      })
      .join("");
    const capacityWarnings = getCapacityWarnings();
    const capacity_alert = capacityWarnings.length
      ? `<div class='capacity-warning'><strong>⚠️ Pax total needs attention</strong>${capacityWarnings
          .map((warning) => {
            return `<div>${dayLabels[warning.day]} (${warning.tier}): official max <b>${warning.expected}</b>, your total <b>${warning.actual}</b> — over by <b>${warning.difference}</b>.</div>`;
          })
          .join("")}</div>`
      : "<div class='capacity-ok'>✅ All active daily pax totals match the official limits.</div>";

    const html = renderTemplate({
      status_message: statusDiv,
      capacity_alert,
      tier_page: tierPage,
      tier1_active: tierPage === "1" ? "active" : "",
      tier2_active: tierPage === "2" ? "active" : "",
      mainball_settings,
      ...selectors,
      ...limitFields,
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

  app.get("/siege", (req, res) => {
    const guildReady = client.isReady() && client.guilds.cache.size > 0;
    const guild = client.guilds.cache.get(String(CONFIG.SERVER_ID)) || (guildReady ? client.guilds.cache.first() : null);
    const channels = guild ? [...guild.channels.cache.filter((channel) => channel.type === ChannelType.GuildText).values()] : [];
    const options = channels.map((channel) => `<option value='${channel.id}' ${String(channel.id) === String(CONFIG.SIEGE_CHANNEL_ID) ? "selected" : ""}># ${channel.name}</option>`).join("");
    const siegeRoles = [
      ["Builder", "SIEGE_LIMIT_BUILDER"], ["Elephant", "SIEGE_LIMIT_ELEPHANT"], ["Flag", "SIEGE_LIMIT_FLAG"], ["Flame Tower", "SIEGE_LIMIT_FT"],
      ["Hwacha", "SIEGE_LIMIT_HWACHA"], ["Shai", "SIEGE_LIMIT_SHAI"], ["Shotcaller", "SIEGE_LIMIT_SHOTCALLER"], ["Witch/Wizard", "SIEGE_LIMIT_WITCH_WIZARD"],
    ];
    const roleFields = siegeRoles.map(([label, key]) => `<div><label>${label}</label><input type="number" min="0" max="100" name="${key}" value="${CONFIG[key] ?? 0}"></div>`).join("");
    res.type("html").send(`<!doctype html><html><head><meta charset="utf-8"><title>Siege War Settings</title><style>body{margin:0;min-height:100vh;background:#17191d;color:#f2f3f5;font:16px system-ui;display:grid;place-items:center;padding:24px;box-sizing:border-box}.card{width:min(760px,100%);background:#202329;border:1px solid #343943;border-radius:16px;padding:26px;box-shadow:0 18px 50px #0008}h1{margin:12px 0 8px}p{color:#aeb5c3;line-height:1.5}.field{background:#2a2e36;border-left:4px solid #6d75ff;padding:16px;border-radius:10px;margin:18px 0}.role-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.role-grid>div{background:#1b1e23;padding:10px;border-radius:7px}label{font-size:13px;font-weight:700;color:#aeb5c3;display:block;margin-bottom:7px}input,select{box-sizing:border-box;width:100%;padding:11px;border:0;border-radius:7px;background:#1b1e23;color:white;font:inherit}.role-grid input{background:#30343c}button{width:100%;padding:14px;border:0;border-radius:8px;background:#626cf3;color:white;font-weight:700;font-size:15px;cursor:pointer}a{color:#aeb5c3;text-decoration:none;font-size:14px}@media(max-width:520px){.role-grid{grid-template-columns:1fr}}</style></head><body><main class="card"><a href="/">← Node War settings</a><h1>🏰 Siege War</h1><p>Configure a separate manual RSVP in its own channel. Main Ball automatically receives the remaining spaces, and the full roster cannot exceed 100 pax.</p><form method="post" action="/save-siege"><div class="field"><label>Siege RSVP Channel</label>${guild ? `<select name="SIEGE_CHANNEL_ID">${options}</select>` : "<input disabled value='Bot offline'>"}</div><div class="field"><label>Total Siege Pax (maximum 100)</label><input type="number" min="1" max="100" name="SIEGE_TOTAL_PAX" value="${CONFIG.SIEGE_TOTAL_PAX || 100}"></div><div class="field"><label>Special Role Limits</label><div class="role-grid">${roleFields}</div></div><button>💾 Save Siege Settings</button></form><p>After saving, use <b>!opensiege</b> in Discord with an authorized role to post the Siege RSVP.</p></main></body></html>`);
  });

  app.post("/save-siege", (req, res) => {
    const total = Math.min(Math.max(parseInt(req.body.SIEGE_TOTAL_PAX, 10) || 100, 1), 100);
    CONFIG.SIEGE_TOTAL_PAX = String(total);
    if (Object.hasOwn(req.body, "SIEGE_CHANNEL_ID")) CONFIG.SIEGE_CHANNEL_ID = String(req.body.SIEGE_CHANNEL_ID).trim();
    for (const key of ["SIEGE_LIMIT_BUILDER", "SIEGE_LIMIT_ELEPHANT", "SIEGE_LIMIT_FLAG", "SIEGE_LIMIT_FT", "SIEGE_LIMIT_HWACHA", "SIEGE_LIMIT_SHAI", "SIEGE_LIMIT_SHOTCALLER", "SIEGE_LIMIT_WITCH_WIZARD"]) {
      const value = Math.min(Math.max(parseInt(req.body[key], 10) || 0, 0), 100);
      CONFIG[key] = String(value);
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(CONFIG, null, 4));
    res.redirect("/siege");
  });

  app.post("/save", async (req, res) => {
    const keys = [
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
      "SUN_VOTE_TARGET",
      "MON_VOTE_TARGET",
      "TUE_VOTE_TARGET",
      "WED_VOTE_TARGET",
      "THU_VOTE_TARGET",
      "FRI_VOTE_TARGET",
      "LIMIT_BUILDER",
      "LIMIT_ELEPHANT",
      "LIMIT_FLAG",
      "LIMIT_FT",
      "LIMIT_HWACHA",
      "LIMIT_SHAI",
      "LIMIT_SHOTCALLER",
      "MAINBALL_SUN_T1",
      "MAINBALL_SUN_T2",
      "MAINBALL_MON_T1",
      "MAINBALL_MON_T2",
      "MAINBALL_TUE_T1",
      "MAINBALL_TUE_T2",
      "MAINBALL_WED_T1",
      "MAINBALL_WED_T2",
      "MAINBALL_THU_T1",
      "MAINBALL_THU_T2",
      "MAINBALL_FRI_T1",
      "MAINBALL_FRI_T2",
    ];
    // Tier pages submit only their own Main Ball fields. Preserve settings
    // that are not shown on the current page.
    for (const k of keys) {
      if (Object.hasOwn(req.body, k)) CONFIG[k] = String(req.body[k]).trim();
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(CONFIG, null, 4));
    const capacityWarnings = getCapacityWarnings();

    if (capacityWarnings.length && String(CONFIG.LOG_CHANNEL_ID || "0") !== "0") {
      const dayNames = { SUN: "Sunday", MON: "Monday", TUE: "Tuesday", WED: "Wednesday", THU: "Thursday", FRI: "Friday" };
      const lines = capacityWarnings.map((warning) => {
        return `• ${dayNames[warning.day]} (${warning.tier}): official ${warning.expected}, configured ${warning.actual} — over by ${warning.difference} pax`;
      });
      const logChannel = await client.channels.fetch(String(CONFIG.LOG_CHANNEL_ID)).catch(() => null);
      if (logChannel?.isTextBased()) {
        await logChannel.send(`⚠️ **Node War pax configuration warning**\n${lines.join("\n")}`).catch(() => null);
      }
    }
    // Configuration is shared in memory, so there is no need to disconnect
    // the bot or restart the dashboard after saving.
    res.redirect(req.query.tier === "2" ? "/?tier=2#mainball-settings" : "/?tier=1#mainball-settings");
  });

  return app;
}

module.exports = createDashboard;
