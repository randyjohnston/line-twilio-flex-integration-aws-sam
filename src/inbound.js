const crypto = require('crypto');
const line = require('@line/bot-sdk');
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
        console.log(JSON.stringify(event));
        const validSignature = validateLineSignature(
            event.body, 
            event.headers['x-line-signature'],
            process.env.LINE_CHANNEL_SECRET
        );
        if (validSignature) {
            statusCode = 200;
            await sendAckReply(
                process.env.LINE_CHANNEL_ACCESS_TOKEN,
                JSON.parse(event.body).events[0].replyToken, 
                process.env.ACK_RESPONSE_TEXT
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

const validateLineSignature = (requestBody, lineSignature, lineChannelSecret) => {
    const signature = crypto
        .createHmac('SHA256', lineChannelSecret)
        .update(requestBody).digest('base64');
    console.log('Calculated signature: ', signature);
    return (signature === lineSignature);
};

const sendAckReply = async (channelAccessToken, replyToken, responseText) => {
    const client = new line.Client({
        channelAccessToken: channelAccessToken
    });
    const message = {
        type: 'text',
        text: responseText
    };
    await client.replyMessage(replyToken, message);
};
