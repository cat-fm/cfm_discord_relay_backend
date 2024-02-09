import { GatewayIntents, createBot, logger } from "@discordeno/bot"

const ws = Bun.serve({
  port: 1337,

  fetch(request, server) {
    if (request.headers.get("Authorization") != Bun.env.SOCK_PASSWORD) {
      return
    }

    if (server.upgrade(request)) {
      return undefined
    }
  },
  websocket: {
    perMessageDeflate: true,

    async message(socket, message) {
      const data = JSON.parse(message.toString())

      bot.rest.executeWebhook(Bun.env.DISCORD_WEBHOOK_ID!, Bun.env.DISCORD_WEBHOOK_TOKEN!, {
        avatarUrl: data.avatar,
        username: data.username,
        content: data.message
      })
    },
    async open(socket) {
      logger.info(socket.remoteAddress + " connected to websocket server")
      socket.subscribe("gmod")
    },
    async close(socket, code, reason) {
      logger.warn(socket.remoteAddress + " closed connection with server, providing next data: (" + code + ", " + reason + ")")
      socket.unsubscribe("gmod")
    }
  }
})

const bot = createBot({
  token: Bun.env.DISCORD_TOKEN!,
  intents: GatewayIntents.Guilds | GatewayIntents.GuildMessages | GatewayIntents.MessageContent,
  events: {
    messageCreate: async (message) => {
      if (message.author.bot || message.webhookId != undefined) {
        return
      }

      if (message.channelId != BigInt(Bun.env.DISCORD_RELAY_CHANNEL_ID!)) {
        return
      }

      ws.publish("gmod", JSON.stringify({
        username: message.author.username,
        message: message.content, // todo: clean content before sending it
      }))

      logger.info("sent " + message.content.length + " bytes to " + ws.pendingRequests + " clients.")
    },
    ready: async (self) => {
      logger.info("ready! logged in as " + self.user.username + " with shard id: " + self.shardId)
    }
  }
})

// https://github.com/discordeno/discordeno/issues/3103#issuecomment-1691135121
bot.transformers.desiredProperties.user.username = true
bot.transformers.desiredProperties.message.author = true
bot.transformers.desiredProperties.message.content = true
bot.transformers.desiredProperties.message.channelId = true
bot.transformers.desiredProperties.message.webhookId = true

logger.info("started websocket server (" + ws.hostname + ":" + ws.port + ")")

await bot.start()