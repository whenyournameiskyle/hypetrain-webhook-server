const fiveMinutesInMilliseconds = 300000
const fortyMinutesInMilliseconds = fiveMinutesInMilliseconds * 8
const oneDayInSeconds = 86400 // in seconds not ms
const hypetrainCallbackUrl = 'https://fathomless-meadow-21718.herokuapp.com/hypetrain'
const twitchWebhookAPIBaseUrl = 'https://api.twitch.tv/helix'

const ignoredUsers = {
  ananonymouscheerer: true,
  ananonymousgifter: true,
  moobot: true,
  nightbot: true,
  streamelements: true,
}

module.exports = {
  fiveMinutesInMilliseconds,
  fortyMinutesInMilliseconds,
  hypetrainCallbackUrl,
  ignoredUsers,
  oneDayInSeconds,
  twitchWebhookAPIBaseUrl,
}
