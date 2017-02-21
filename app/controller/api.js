var request = require('request');
var rssReader = require("feed-read");

var config = require('../config/config');
var properties = require('../config/properties');

exports.tokenVerification = function (req, res) {
    if (req.query['hub.mode'] === 'subscribe' && req.query['hub.verify_token'] === config.VERIFY_TOKEN)
    {
        console.log("Validating webhook");
        res.status(200).send(req.query['hub.challenge']);
    }
    else
    {
        console.error("Failed validation. Make sure the validation tokens match.");
        res.sendStatus(403);
    }
}

exports.messageHandler = function(req, res) {
    var data = req.body;

    // Make sure this is a page subscription
    if (data.object === 'page') {

        // Iterate over each entry - there may be multiple if batched
        data.entry.forEach(function(entry) {
            var pageID = entry.id;
            var timeOfEvent = entry.time;

            // Iterate over each messaging event
            entry.messaging.forEach(function(event) {
                if (event.message) {
                    receivedMessage(event);
                } else {
                    console.log("Webhook received unknown event: ", event);
                }
            });
        });

        // Assume all went well.
        //
        // You must send back a 200, within 20 seconds, to let us know
        // you've successfully received the callback. Otherwise, the request
        // will time out and we will keep trying to resend.
        res.sendStatus(200);
    }
}

function receivedMessage(event) {
    var senderID = event.sender.id,
        recipientID = event.recipient.id,
        timeOfMessage = event.timestamp,
        message = event.message;

    // info in the message object
    console.log(JSON.stringify(message));
    var messageID = message.mid,
        messageText = message.text,
        messageAttachments = message.attachments;
    if(messageText) {
        // If we receive a text message, check to see if it matches a keyword
        // and send back the example. Otherwise, just echo the text we received.
        var normalizedText = messageText.toLowerCase().trim();
        getArticle(function(err, articles) {
            if(err) {
                console.log(err);
            }
            else{
                switch(normalizedText) {
                    case 'showmore' :
                        var maxArticles = Math.min(articles.length, 5);
                        for(var i = 0; i < maxArticles; i++) {
                            sendTextMessage(senderID, articles[i]);
                        }
                        break;
                    default:
                        sendTextMessage(senderID, articles[0]);
                        break;
                }
            }
        });
    }
    else if(messageAttachments) {
        sendTextMessage(senderID, "Attachments here");
    }
}

function sendGenericMessage(recipientId, messageText) {
    // To be expanded in later sections
}

function sendTextMessage(recipientId, message) {
    var messageData = {
        recipient: {
            id: recipientId
        },
        message: {
            attachment: {
                type : "template",
                payload : {
                    template_type : "generic",
                    elements : [{
                        title : message.title,
                        subtitle : message.published.toString(),
                        item_url : message.link
                    }]
                }
            }
        }
    };

    callSendAPI(messageData);
}

function callSendAPI(messageData) {
    request(
        {
            uri: 'https://graph.facebook.com/v2.6/me/messages',
            qs: { access_token: config.PAGE_ACCESS_TOKEN },
            method: 'POST',
            json: messageData
        },
        function (error, response, body) {
            if (!error && response.statusCode == 200) {
                var recipientId = body.recipient_id;
                var messageId = body.message_id;

                console.log("Successfully sent generic message with id %s to recipient %s",
                    messageId, recipientId);
            } else {
                console.error("Unable to send message.");
                console.error(response);
                console.error(error);
            }
        });
}

function getArticle(callback) {
    rssReader(properties.GOOGLE_NEWS_ENDPOINT, function(err, articles) {
        if(err) {
            callback(err);
        }
        else {
            if(articles.length > 0) {
                callback(null, articles);
            }
            else {
                callback('no articles');
            }
        }
    });
}