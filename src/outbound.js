const line = require('./services/line');
const twilio = require('twilio');
const twilioClient = require('./services/twilio');
const querystring = require('querystring');

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
        const eventBody = querystring.parse(event.body)
        const validSignature = validateTwlilioSignature(
            eventBody,
            event.headers['X-Twilio-Signature'],
            `https://${event.requestContext.domainName}/${event.requestContext.stage}/outbound`
        )
        if (validSignature && eventBody.Source === 'SDK') {
            statusCode = 200;
            const channelId = eventBody.ChannelSid;
            const msg = eventBody.Body;
            const lineUserId = await getLineUserIdFromChannel(channelId);
            await sendLineMessage(lineUserId, msg);
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

const validateTwlilioSignature = (body, signature, url) => {
    const requestIsValid = twilio.validateRequest(
        process.env.TWILIO_AUTH_TOKEN,
        signature,
        url,
        body
    );
    return requestIsValid;
};

const getLineUserIdFromChannel = async (channelId) => {
    const client = twilioClient.getTwilioClient();
    const chat = await client.chat
        .services(process.env.TWILIO_FLEX_CHAT_SERVICE_SID)
        .channels(channelId)
        .fetch();
    return JSON.parse(chat.attributes).from;
};

const sendLineMessage = async (lineUserId, msg) => {
    const lineClient = line.getLineClient();
    const message = {
        type: 'text',
        text: msg
    };
    const sentMessage = await lineClient.pushMessage(lineUserId, message);
    console.log('Responded with Line Request ID: ', sentMessage['x-line-request-id']);
};