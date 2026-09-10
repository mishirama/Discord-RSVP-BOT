const fs = require("fs");
const moment = require("moment-timezone");
const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require("discord.js");
const { CONFIG, DATA_FILE, log } = require("./config");
const { ROLE_EMOJIS, DAY_KEYS, ROLE_BUTTONS } = require("./constants");

class RSVPSession {
  constructor(client, limits, targetDate, options = {}) {
    this.client = client;
    this.limits = limits;
    this.targetDate = targetDate;
    this.dataFile = options.dataFile || DATA_FILE;
    this.title = options.title || "Node War RSVP";
    this.sessionType = options.sessionType || "node";
    this.messagePrefix = options.messagePrefix || "";
    this.roleButtons = options.roleButtons || ROLE_BUTTONS;
    this.data = {};
    this.waitlist = {};
    this.memberData = {};
    this.memberWaitlist = {};
    for (const role of Object.keys(limits)) {
      this.data[role] = [];
      this.waitlist[role] = [];
      this.memberData[role] = [];
      this.memberWaitlist[role] = [];
    }
    this.isClosed = false;
    this._updateRunning = false;
  }

  messageKey(name) {
    return this.messagePrefix ? `${this.messagePrefix}${name[0].toUpperCase()}${name.slice(1)}` : name;
  }

  saveState() {
    fs.writeFileSync(
      this.dataFile,
      JSON.stringify(
        {
          target_date: moment(this.targetDate).format("YYYY-MM-DD"),
          is_closed: this.isClosed,
          data: this.data,
          waitlist: this.waitlist,
          member_data: this.memberData,
          member_waitlist: this.memberWaitlist,
          session_type: this.sessionType,
          main_msg_id: this.client[this.messageKey("mainMsgId")] || null,
          waitlist_msg_id: this.client[this.messageKey("waitlistMsgId")] || null,
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
      .setTitle(`${this.title}${this.sessionType === "node" ? ` - ${tier}` : ""} (${totalSlots} Slot)`)
      .setDescription(
        `**Event Date:** ${moment(this.targetDate).format("dddd, DD-MM-YYYY")}\n` +
          (this.isClosed ? "❌ CLOSED" : "Click buttons to join!")
      )
      .setColor(color);

    for (const [role, users] of Object.entries(this.data)) {
      mainEmb.addFields({
        name: `${ROLE_EMOJIS[role] || "👤"} ${role} (${users.length}/${this.limits[role]})`,
        value: users.length ? users.map((u) => `• ${u}`).join("\n") : "-",
        inline: true,
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
          name: `${ROLE_EMOJIS[role] || "👤"} ${role} Backups`,
          value: users.map((u) => `• ${u}`).join("\n"),
          inline: true,
        });
      }
    }
    return { mainEmb, waitEmb };
  }

  buildComponents() {
    const buttons = this.roleButtons.map((b) =>
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
      const channelId = String(this.sessionType === "siege" ? CONFIG.SIEGE_CHANNEL_ID || "0" : CONFIG.CHANNEL_ID || "0");

      if (channelId !== "0") {
        const ch = await this.client.channels.fetch(channelId).catch(() => null);
        if (ch) {
          if (!this.client[this.messageKey("mainMsg")] && this.client[this.messageKey("mainMsgId")]) {
            this.client[this.messageKey("mainMsg")] = await ch.messages
              .fetch(this.client[this.messageKey("mainMsgId")])
              .catch((e) => {
                log("ERROR", `Failed to fetch main message: ${e}`);
                return null;
              });
          }
          if (!this.client[this.messageKey("waitlistMsg")] && this.client[this.messageKey("waitlistMsgId")]) {
            this.client[this.messageKey("waitlistMsg")] = await ch.messages
              .fetch(this.client[this.messageKey("waitlistMsgId")])
              .catch((e) => {
                log("ERROR", `Failed to fetch waitlist message: ${e}`);
                return null;
              });
          }
        }
      }

      if (this.client[this.messageKey("mainMsg")])
        await this.client[this.messageKey("mainMsg")].edit({ embeds: [mainEmb], components: this.buildComponents() });
      if (this.client[this.messageKey("waitlistMsg")]) await this.client[this.messageKey("waitlistMsg")].edit({ embeds: [waitEmb] });
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
    const member = { id: interaction.user.id, name: user };

    for (const r of Object.keys(this.limits)) {
      const idx = this.data[r].findIndex((savedName, index) => this.memberData[r][index]?.id === member.id || savedName === user);
      if (idx !== -1) {
        this.data[r].splice(idx, 1);
        this.memberData[r].splice(idx, 1);
        if (this.waitlist[r].length) {
          this.data[r].push(this.waitlist[r].shift());
          this.memberData[r].push(this.memberWaitlist[r].shift());
        }
      }
      const wIdx = this.waitlist[r].findIndex((savedName, index) => this.memberWaitlist[r][index]?.id === member.id || savedName === user);
      if (wIdx !== -1) this.waitlist[r].splice(wIdx, 1);
      if (wIdx !== -1) this.memberWaitlist[r].splice(wIdx, 1);
    }

    if (role !== "Cancel") {
      if (this.data[role].length < this.limits[role]) {
        this.data[role].push(user);
        this.memberData[role].push(member);
      } else {
        this.waitlist[role].push(user);
        this.memberWaitlist[role].push(member);
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

module.exports = RSVPSession;
