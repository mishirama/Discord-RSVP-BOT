require("dotenv").config();

const { log } = require("./config");
const { client } = require("./bot");
const createDashboard = require("./dashboard");

async function main() {
  const app = createDashboard(client);
  const port = process.env.SERVER_PORT || 8080;
  app.listen(port, () => log("WEB", `Dashboard server bound to port ${port}`));

  if (process.env.DISCORD_TOKEN) {
    await client.login(process.env.DISCORD_TOKEN);
  } else {
    log("WEB", "No token configured yet — waiting for dashboard setup at /");
  }
}

main();
