const twilio = require('twilio');

let twilioClient = null;

exports.getTwilioClient = () => {
    if (twilioClient) return twilioClient;
    twilioClient = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN,
        {
            lazyLoading: true
        }
    );
    return twilioClient;
};