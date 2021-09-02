const axios = require('axios');
const base64 = require('base-64');
const crypto = require('crypto');
const line = require('./services/line');
const twilio = require('./services/twilio');
let response;
let statusCode = 401;

/**
 *
 * Event doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html#api-gateway-simple-proxy-for-lambda-input-format
 * @param {Object} event - API Gateway Lambda Proxy Input Format
 *
 * Context doc: https://docs.aws.amazon.com/lambda/latest/dg/nodejs-prog-model-context.html 
 * @param {Object} context
 *
 * Return doc: https://docs.aws.amazon.com/apigateway/latest/developerguide/set-up-lambda-proxy-integrations.html
 * @returns {Object} object - API Gateway Lambda Proxy Output Format
 * 
 */
exports.lambdaHandler = async (event, context) => {
    try {
        const validSignature = validateLineSignature(
            event.body,
            event.headers['x-line-signature'],
            process.env.LINE_CHANNEL_SECRET
        );
        const body = JSON.parse(event.body);
        const lineEvent = body.events[0];
        if (validSignature) {
            statusCode = 200;
            const lineDisplayName = await getLineUserDisplayName(
                lineEvent.source.userId
            );
            await sendMessageToFlex(
                lineEvent.source.userId,
                lineDisplayName,
                lineEvent.message.text,
                event.requestContext,
                lineEvent.replyToken
            );
        }
        response = {
            'statusCode': statusCode,
        }
        console.log('Responded with', statusCode);
    } catch (err) {
        console.log(err);
        return err;
    }

    return response
};

const validateLineSignature = (
    requestBody,
    lineSignature,
    lineChannelSecret
) => {
    const signature = crypto
        .createHmac('SHA256', lineChannelSecret)
        .update(requestBody).digest('base64');
    console.log('Calculated signature: ', signature);
    return (signature === lineSignature);
};

const sendMessageToFlex = async (
    userId,
    lineDisplayName,
    text,
    requestContext,
    replyToken
) => {
    const flexChannel = await getFlexChannel(
        process.env.TWILIO_FLEX_FLOW_SID,
        process.env.TWILIO_FLEX_CHAT_SERVICE_SID,
        userId,
        lineDisplayName,
        requestContext,
        replyToken
    );
    await sendFlexChatMessage(
        process.env.TWILIO_FLEX_CHAT_SERVICE_SID,
        flexChannel.sid,
        userId,
        text
    );
};

const getFlexChannel = async (
    flexFlowSid,
    flexChatServiceSid,
    lineUserId,
    lineDisplayName,
    requestContext,
    replyToken
) => {
    let flexChannel;
    twilioClient = twilio.getTwilioClient();
    try {
        const channelExists = await hasOpenChannel(twilioClient, lineUserId);
        // Identity is unique per channel, if we create a new channel that already exists, there's no penalty to that
        // We need the channel SID anyway to send the message so we go ahead and do this every time
        flexChannel = await twilioClient.flexApi.channel.create({
            flexFlowSid: flexFlowSid,
            identity: lineUserId,
            chatUserFriendlyName: lineDisplayName,
            chatFriendlyName: `LINE with ${lineUserId}`,
            target: lineUserId,
        });
        console.log('Created or retrieved Flex chat channel SID: ', flexChannel.sid);
        // Duplicating webhooks results in duplicate flows between Twitter and Flex
        if (!channelExists) {
            const webhook = await twilioClient.chat
                .services(flexChatServiceSid)
                .channels(flexChannel.sid)
                .webhooks.create({
                    type: 'webhook',
                    configuration: {
                        method: 'POST',
                        url: `https://${requestContext.domainName}/${requestContext.stage}/outbound`,
                        filters: ['onMessageSent'],
                    },
                });
            console.log('Created webhook SID: ', webhook.sid);
            await sendAckReply(replyToken);
        }
    } catch (e) {
        console.error(e);
    }
    return flexChannel;
};

const hasOpenChannel = async (twilioClient, lineUserId) => {
    const channels = await twilioClient.chat
        .services(process.env.TWILIO_FLEX_CHAT_SERVICE_SID)
        .channels.list();
    const openChannelExists =
        channels.filter((c) => {
            const { from, status } = JSON.parse(c.attributes);
            // Channels are automatically set to INACTIVE when they are ended by a Flex Agent
            return from.includes(lineUserId) && status !== 'INACTIVE';
        }).length > 0;
    return openChannelExists;
};

const sendFlexChatMessage = async (
    flexChatServiceSid,
    flexChannelSid,
    userId,
    text
) => {
    const params = new URLSearchParams();
    params.append('Body', text);
    params.append('From', userId);
    const response = await axios.post(
        `https://chat.twilio.com/v2/Services/${flexChatServiceSid}/Channels/${flexChannelSid}/Messages`,
        params,
        {
            headers: {
                'X-Twilio-Webhook-Enabled': 'true',
                Authorization: `Basic ${base64.encode(
                    `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
                )}`
            },
        }
    );
    responseData = response.data;
    console.log('Created inbound chat message SID: ', responseData.sid);
};

const sendAckReply = async (replyToken) => {
    const lineClient = line.getLineClient();
    const message = {
        type: 'text',
        text: process.env.ACK_RESPONSE_TEXT
    };
    await lineClient.replyMessage(replyToken, message);
};

const getLineUserDisplayName = async (lineUserId) => {
    const lineClient = line.getLineClient();
    const profile = await lineClient.getProfile(lineUserId);
    return profile.displayName;
};