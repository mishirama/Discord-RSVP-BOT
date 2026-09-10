const HTML_TEMPLATE = `
<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Dashboard</title>
<style>
:root { --primary: #6d75ff; --bg: #17191d; --card: #202329; --panel: #2a2e36; --field: #1b1e23; --text: #f2f3f5; --muted: #aeb5c3; }
body { font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: radial-gradient(circle at top right, #30356a 0, var(--bg) 38%); color: var(--text); display: flex; justify-content: center; padding: 28px; }
.card { background: var(--card); padding: 26px; border: 1px solid #343943; border-radius: 16px; width: 100%; max-width: 1180px; box-shadow: 0 18px 50px rgba(0,0,0,0.35); }
.dashboard-header { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 20px; }
.dashboard-header h2 { margin: 0; font-size: 24px; letter-spacing: -0.4px; }
.siege-link { display: inline-block; margin: -4px 0 16px; color: #c9cdff; font-size: 14px; font-weight: 700; text-decoration: none; }
.siege-link:hover { color: white; }
.dashboard-form { display: grid; grid-template-columns: repeat(2, minmax(320px, 1fr)); gap: 16px; align-items: start; }
.dashboard-column { display: grid; gap: 16px; align-content: start; }
.section { background: var(--panel); padding: 16px; border: 1px solid #383e49; border-left: 4px solid var(--primary); border-radius: 10px; margin: 0; }
.server-section { grid-column: 1 / -1; }
.day-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 5px; }
.day-box { background: var(--field); padding: 9px; border-radius: 6px; }
.limit-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 5px; }
.limit-box { background: var(--field); padding: 9px; border-radius: 6px; }
.limit-box input { margin-bottom: 0; background: #30343c; }
.mainball-box { background: var(--field); padding: 9px; border-radius: 6px; }
.mainball-pair { display: flex; gap: 6px; }
.mainball-pair input { margin-bottom: 0; background: #2b2d31; width: 50%; }
.tier-nav { display: flex; gap: 8px; margin: 10px 0 14px; }
.tier-tab { flex: 1; padding: 10px; text-align: center; border-radius: 6px; color: var(--muted); background: var(--field); text-decoration: none; font-weight: bold; }
.tier-tab.active { background: var(--primary); color: white; }
.capacity-warning, .capacity-ok { position: fixed; top: 24px; right: 24px; z-index: 10; width: min(360px, calc(100vw - 48px)); max-height: calc(100vh - 48px); overflow-y: auto; box-sizing: border-box; padding: 12px; border-radius: 6px; margin: 0; font-size: 13px; line-height: 1.6; box-shadow: 0 10px 30px rgba(0,0,0,0.35); transition: opacity 300ms ease, transform 300ms ease; }
.capacity-warning { background: #4a2529; border-left: 4px solid #ed4245; color: #ffb5b5; }
.capacity-ok { background: #193b2a; border-left: 4px solid #57f287; color: #9cf5ba; }
label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 6px; font-weight: 700; }
input, select { width: 100%; padding: 10px; margin-bottom: 10px; border-radius: 6px; border: 1px solid transparent; background: var(--field); color: white; box-sizing: border-box; }
input:focus, select:focus { outline: none; border-color: #8790ff; box-shadow: 0 0 0 3px rgba(109,117,255,0.18); }
.day-box select { margin-bottom: 0; background: #30343c; }
button { background: linear-gradient(135deg, #727bff, #5961e7); color: white; border: none; padding: 15px; border-radius: 8px; width: 100%; font-weight: 700; cursor: pointer; }
button:hover { filter: brightness(1.08); }
.dashboard-form > button { grid-column: 1 / -1; }
.status { padding: 10px 14px; border-radius: 7px; text-align: center; margin: 0; font-weight: 700; }
@media (max-width: 760px) { body { padding: 12px; } .card { padding: 16px; } .dashboard-header { align-items: flex-start; flex-direction: column; } .dashboard-form { grid-template-columns: 1fr; } }
</style></head><body><div class="card"><div class="dashboard-header"><h2>⚔️ Node War Settings</h2>{status_message}</div><a class="siege-link" href="/siege">🏰 Open Siege War Settings →</a>{capacity_alert}
<form class="dashboard-form" method="POST" action="/save?tier={tier_page}">
<div class="section server-section"><label>Discord Server</label>{server_input}</div>

<div class="dashboard-column">
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

<div class="section" id="mainball-settings">
    <label style="color: #faa61a; font-size: 13px; margin-bottom: 10px;">⚔️ Main Ball Slots</label>
    <div class="tier-nav"><a class="tier-tab {tier1_active}" href="/?tier=1#mainball-settings">1 · Tier 1</a><a class="tier-tab {tier2_active}" href="/?tier=2#mainball-settings">2 · Tier 2</a></div>
    <div class="day-grid">
        {mainball_settings}
    </div>
    <p style="font-size:11px;color:#949ba4;margin:8px 0 0;">You are editing Tier {tier_page}. Use the tabs above to switch tiers. The daily tier dropdown chooses which pax limit applies.</p>
</div>
</div>

<div class="dashboard-column">
<div class="section">
    <label style="color: #faa61a; font-size: 13px; margin-bottom: 10px;">🎯 Other Role Slot Limits</label>
    <div class="limit-grid">
        <div class="limit-box"><label>🔨 Builder</label><input type="number" name="LIMIT_BUILDER" min="0" value="{LIMIT_BUILDER}"></div>
        <div class="limit-box"><label>🐘 Elephant</label><input type="number" name="LIMIT_ELEPHANT" min="0" value="{LIMIT_ELEPHANT}"></div>
        <div class="limit-box"><label>🚩 Flag</label><input type="number" name="LIMIT_FLAG" min="0" value="{LIMIT_FLAG}"></div>
        <div class="limit-box"><label>🔥 FT</label><input type="number" name="LIMIT_FT" min="0" value="{LIMIT_FT}"></div>
        <div class="limit-box"><label>🏹 Hwacha</label><input type="number" name="LIMIT_HWACHA" min="0" value="{LIMIT_HWACHA}"></div>
        <div class="limit-box"><label>🎵 Shai</label><input type="number" name="LIMIT_SHAI" min="0" value="{LIMIT_SHAI}"></div>
        <div class="limit-box"><label>📢 Shotcaller</label><input type="number" name="LIMIT_SHOTCALLER" min="0" value="{LIMIT_SHOTCALLER}"></div>
    </div>
</div>

<div class="section"><label>RSVP Target Channel</label>{channel_input}<label>Log/Backup Channel</label>{log_channel_input}<label>Admin Authorized Role</label>{auth_role_input}<label>Alliance Tag Role</label>{alliance_role_input}</div>
</div>
<button type="submit">💾 Save Settings</button></form></div><script>const paxToast=document.querySelector('.capacity-warning,.capacity-ok');if(paxToast){setTimeout(()=>{paxToast.style.opacity='0';paxToast.style.transform='translateX(24px)';setTimeout(()=>paxToast.remove(),300);},10000);}</script></body></html>
`;

module.exports = HTML_TEMPLATE;
