const line = require('@line/bot-sdk');

let lineClient = null;

exports.getLineClient = () => {
    if (lineClient) return lineClient;
    lineClient = new line.Client({
        channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    });
    return lineClient;
};