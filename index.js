hype'use strict'

const TwitchJs = require('twitch-js').default
const { Events } = TwitchJs.Chat
const bodyParser = require('body-parser')
const express = require('express')
const fetch = require('node-fetch')
const http = require('http')
const socketIo = require('socket.io')

const {
  fiveMinutesInMilliseconds,
  fortyMinutesInMilliseconds,
  hypetrainCallbackUrl,
  ignoredUsers,
  oneDayInSeconds,
  twitchWebhookAPIBaseUrl,
} = require('./constants.js')
const index = require('./routes/index.js')

// start initialize variables
let timeoutHolder
let isHypeTrainHappening = false
let hypeTrainData = {
  started: '',
  bitsCheered: {},
  cooldownEndTime: '',
  expiresAt: '',
  goal: 0,
  level: 0,
  newsubs: {},
  resubs: {},
  tier1: {},
  tier2: {},
  tier3: {},
  total: 0,
}
let previousHypeTrain = {}
let streamLeaders = {
  bits: {},
  giftedSubs: {}
}
// end initialize variables
// start initialize Twitch Clients
const baseChannel = { channelId: '', username: '' }
const { chat } = new TwitchJs({ log: { level: 'silent' } })
// end initialize Twitch Clients
const shittyDb = {}
const shittyDbManager = () => {
  const shittyDbKeys = Object.keys(shittyDb)
  let totalValue = 0
  if (shittyDbKeys.length) {
    shittyDbKeys.forEach((key, index) => {
      if (Date.now() >= parseInt(key) + fortyMinutesInMilliseconds) {
        delete shittyDb[key]
      } else {
        totalValue += shittyDb[key].value
      }
      if (index >= shittyDbKeys.length - 1) {
        shittyDbManagerTimeoutManager()
      }
    })
  } else {
    shittyDbManagerTimeoutManager()
  }
}
let shittyDbManagerTimeout
const shittyDbManagerTimeoutManager = () => {
  if (shittyDbManagerTimeout) clearTimeout(shittyDbManagerTimeout)
  return shittyDbManagerTimeout = setTimeout(() => shittyDbManager(), 60000)
}
shittyDbManagerTimeoutManager()
const tierEditor = (tierArray, multiplier, tierNumber) => [tierArray[0], tierArray[1], tierArray[1] * multiplier, tierNumber]

// start initialize express
let interval
const port = process.env.PORT || 4001
const app = express()
app.use(index)
app.use(bodyParser.json())
const server = http.createServer(app)

// start initialize sockets
const io = socketIo(server)
io.on('connection', (socket) => {
  console.info('New client connected')
  if (interval) {
    clearInterval(interval)
  }
  interval = setInterval(() => { ping() }, 60000 * 5)
  socket.on('fromClient', (data) => {
    console.info('fromClient', data)
  })
  socket.on('disconnect', () => {
    console.info('Client disconnected')
    clearInterval(interval)
  })
})

// start ping
const ping = () => {
  console.info('emitting ping')
  io.emit('fromAPI', 'ping')
}

// start create endpoints
app.get('/hypetrain', (req, res) => {
  console.info('/hypetrain GET', req.query['hub.challenge'], res.send)
  try {
    res.send(req.query['hub.challenge'])
    console.info('sent webhook sub challenge')
  } catch (error) {
    console.error('hype subscribe', error)
  }
})
app.post('/hypetrain', (req, res) => {
  const data = req?.body?.data
  if (data && data[0] && data[0].event_data) {
    if (!isHypeTrainHappening) {
      isHypeTrainHappening = true
      console.info('********************HYPETRAIN HAS STARTED********************')
      hypeTrainData = { ...hypeTrainData, started: Date.now() }
      setTimeout(() => { return hypeTrainPole() }, 1000)
      parsePreHypeTrainData()
    }
    const {
      cooldown_end_time: cooldownEndTime,
      expires_at: expiresAt,
      level,
      goal,
      total
    } = data[0].event_data
    const percentComplete = goal ? Math.round(total / goal * 100) : 0

    hypeTrainData = { ...hypeTrainData, cooldownEndTime: new Date(cooldownEndTime).valueOf(), expiresAt: new Date(expiresAt), goal, level, percentComplete, total }
  }
  res.status(200).end()
})

app.get('/stream-leaders', (req, res) => {
  console.info('/stream-leaders GET', {isHypeTrainHappening})
  try {
    const { bits, giftedSubs } = streamLeaders
    let sortedBits = Object.entries(bits)
    let sortedGiftedSubs = Object.entries(giftedSubs)
    sortedBits = sortedBits.length ? sortedBits.sort((item1, item2) => item2[1] - item1[1]) : []
    sortedGiftedSubs = sortedGiftedSubs.length ? sortedGiftedSubs.sort((item1, item2) => item2[1] - item1[1]) : []
    res.send({ bits, giftedSubs, sortedBits, sortedGiftedSubs })
  } catch (error) {
    console.error(`/stream-leaders GET error: ${error}`)
  }
})

// start hype train helpers
const subscribeToHypeTrainData = async () => {
  console.info('Subscribing!')
  const channelId = baseChannel.channelId
  const headers = {
    'Client-ID': '',
    'Content-Type': 'application/json',
    Authorization: 'Bearer '
  }
  const topic = encodeURIComponent(`${twitchWebhookAPIBaseUrl}/hypetrain/events?broadcaster_id=${channelId}&first=1`)
  const url = `${twitchWebhookAPIBaseUrl}/webhooks/hub?hub.callback=${hypetrainCallbackUrl}&hub.mode=subscribe&hub.topic=${topic}&hub.lease_seconds=${oneDayInSeconds}&hub.secret=*************`
  const response = await fetch(url, {
    method: 'POST',
    headers
  })
  return response
}

const resetHypeTrain = () => {
  console.info('********************RESETTING HYPETRAIN********************')
  isHypeTrainHappening = false
  hypeTrainData = {
    started: '',
    bitsCheered: {},
    cooldownEndTime: '',
    expiresAt: '',
    goal: 0,
    level: 0,
    newsubs: {},
    resubs: {},
    tier1: {},
    tier2: {},
    tier3: {},
    total: 0,
  }
}

const parsePreHypeTrainData = () => {
  const shittyDbKeys = Object.keys(shittyDb)
  if (shittyDbKeys.length) {
    let preHypeTrainData = []
    shittyDbKeys.forEach((key) => {
      if (parseInt(key) <= hypeTrainData.started - fiveMinutesInMilliseconds) {
        preHypeTrainData.push(shittyDb[key])
      }
    })
    hypeTrainData['preHypeTrainData'] = preHypeTrainData
  }
}

const hypeTrainPole = () => {
  const rightMeow = new Date().valueOf()
  if (hypeTrainData.expiresAt && rightMeow >= hypeTrainData.expiresAt.valueOf()) {
    isHypeTrainHappening = false
    previousHypeTrain = hypeTrainData
    console.info('********************HYPETRAIN EXPIRED********************')
    setTimeout(() => {
      return resetHypeTrain()
    }, hypeTrainData.cooldownEndTime - rightMeow - 900000)
    return parseAndSendHypeTrainData()
  }
  return setTimeout(() => { return hypeTrainPole() }, 1000)
}

const parseAndSendHypeTrainData = () => {
  if (timeoutHolder) clearTimeout(timeoutHolder)
  timeoutHolder = setTimeout(() => {
    const { bitsCheered, tier1, tier2, tier3 } = hypeTrainData
    const sortedBitsCheered = Object.entries(bitsCheered).sort((item1, item2) => item2[1] - item1[1])
    const tiersCombined = Object.entries(tier1).map((tier) => tierEditor(tier, 4.99, 1))
      .concat(Object.entries(tier2).map((tier) => tierEditor(tier, 9.99, 2)))
      .concat(Object.entries(tier3).map((tier) => tierEditor(tier, 24.99, 3)))
    const sortedCombined = tiersCombined.sort((item1, item2) => item2[2] - item1[2])

    hypeTrainData = { ...hypeTrainData, sortedBitsCheered, sortedCombined }
    io.emit('hype', hypeTrainData)
  }, 500)
}

// start twitch chat event handlers
chat.connect().then(() => {
  chat.removeAllListeners()
  chat.on(Events.PARSE_ERROR_ENCOUNTERED, () => {})
  chat.on(Events.CHEER, ({ tags: { bits, displayName } }) => {
    if (displayName.toLowerCase() === 'aneternalenigma') return
    const bitsInt = parseInt(bits)

    // start hype train handling
    if (isHypeTrainHappening) {
      if (!hypeTrainData.bitsCheered[displayName]) {
        hypeTrainData.bitsCheered[displayName] = bitsInt
      } else {
        hypeTrainData.bitsCheered[displayName] += bitsInt
      }
      parseAndSendHypeTrainData()
    }

    const timestamp = Date.now()
    shittyDb[timestamp] = { value: bitsInt, displayName, type: 'bits' }

    // start leaderboard handling
    streamLeaders.bits[displayName] = !!streamLeaders.bits[displayName] ? streamLeaders.bits[displayName] + bitsInt : bitsInt
  })

  chat.on(Events.SUBSCRIPTION, ({ parameters: { subPlan }, tags: { displayName } }) => {
    const tier = parseInt(subPlan) / 1000 || subPlan

    // start hype train handling
    if (isHypeTrainHappening) {
      hypeTrainData.newsubs[displayName] = { tier }
      parseAndSendHypeTrainData()
    }

    const timestamp = Date.now()
    shittyDb[timestamp] = { value: 500, displayName, type: 'newsub', tier }
  })

  chat.on(Events.SUBSCRIPTION_GIFT, ({ parameters: { giftMonths, subPlan }, tags: { displayName } }) => {
    if (displayName.toLowerCase() === 'aneternalenigma') return
    const tierNumber = parseInt(subPlan) / 1000 || subPlan
    const tierKey = `tier${tierNumber}`

    // start hype train handling
    if (isHypeTrainHappening && displayName) {
      if (hypeTrainData[tierKey][displayName]) {
        hypeTrainData[tierKey][displayName] += 1
      } else {
        hypeTrainData[tierKey][displayName] = 1
      }
      parseAndSendHypeTrainData()
    }

    const timestamp = Date.now()
    shittyDb[timestamp] = { value: 500, displayName, type: 'gift', tierKey }

    // start leaderboard handling
    streamLeaders.giftedSubs[displayName] = !!streamLeaders.giftedSubs[displayName] ? streamLeaders.giftedSubs[displayName] + (1 * giftMonths) : 1 * giftMonths
  })

  chat.on(Events.RESUBSCRIPTION, ({ parameters: { cumulativeMonths, subPlan }, tags: { displayName } }) => {
    const tier = parseInt(subPlan) / 1000 || subPlan

    // start hype train handling
    if (isHypeTrainHappening) {
      hypeTrainData.resubs[displayName] = { cumulativeMonths, tier }
      parseAndSendHypeTrainData()
    }

    const timestamp = Date.now()
    shittyDb[timestamp] = { value: 500, displayName, type: 'resub', tier }
  })
  chat.join(baseChannel.username)
})

server.listen(port, () => console.info(`🚀 Server running on port ${port}`))
subscribeToHypeTrainData(true)
