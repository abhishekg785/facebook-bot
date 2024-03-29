var request = require('request');
var rssReader = require("feed-read");

var config = require('../config/config');
var properties = require('../config/properties');

var UserModel = require('../models/User');

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
    console.log('in the post route');
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
    console.log('in the received message function');
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
                // console.log(articles);
                switch(normalizedText) {
                    // case 'showmore' :
                    //     var maxArticles = Math.min(articles.length, 5);
                    //     for(var i = 0; i < maxArticles; i++) {
                    //         sendArticleMessage(senderID, articles[i]);
                    //     }
                    //     break;
                    case '/subscribe' :
                        subscribeUser(senderID);
                        break;
                    case '/unsubscribe' :
                        unSubscibeUser(senderID);
                        break;
                    default:
                        // sendArticleMessage(senderID, articles[0]);
                        callWitAI(normalizedText, function(err, intent) {
                            handleIntent(intent, senderID);
                        });
                        break;
                }
            }
        });
    }
    else if(messageAttachments) {
        sendArticleMessage(senderID, "Attachments here");
    }
}

function sendTextMessage(recipientId, messageText) {
    var messageText = {
        recipient : {
            id: recipientId
        },
        message : {
            text : messageText
        }
    }

    callSendAPI(messageText);
}

function sendArticleMessage(recipientId, message) {
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

function subscribeUser(id) {
    var newUser = new UserModel({
        fb_id : id,
    });
    UserModel.findOneAndUpdate({fb_id : id}, {fb_id : id}, {upsert : true}, function(err, user) {
        if(err) {
            sendTextMessage(newUser.fb_id, 'There was an error for subscribing you for daily notifications !');
        }
        else {
            sendTextMessage(newUser.fb_id, 'You have been subscribed!');
        }
    });
}

function unSubscibeUser(id) {
    UserModel.findOneAndRemove({ fb_id : id}, function(err, user) {
        if(err) {
            sendTextMessage(id, 'There was an error for unsubscribing you for daily notifications !');
        }
        else {
            sendTextMessage(id, 'You have been unsubscribed!');
        }
    });
}

function callWitAI(query, callback) {
    query = encodeURIComponent(query);
    request({
        uri : properties.WIT_API_ENDPOINT + query,
        qs : {
            access_token : config.WIT_AI_ACCESS_TOKEN
        },
        method : 'GET'
    }, function(err, response, body) {
        if(!err && response.statusCode == 200) {
            console.log('successfully got %s', response.body);
            try {
                body = JSON.parse(response.body);
                intent = body['entities']['intent'][0]['value']
                callback(null, intent)
            }
            catch(e){
                callback(e);
            }
        }
        else {
            console.log(response.statusCode);
            console.error('Unable to send message %s' + err);
            callback(err);
        }
    });
}

function handleIntent(intent, sender) {
    console.log(intent);
    switch(intent) {
        case "jokes" :
            sendTextMessage(sender, "When I see lovers' names carved in a tree, I don't think it's sweet. I just think it's surprising how many people bring a knife on a date.");
            break;
        case "status":
            sendTextMessage(sender, 'I am great as always :) ');
            break;
        case "greeting":
            sendTextMessage(sender, "Yo!");
            break;
        case "identification":
            sendTextMessage(sender, "I am Gosu! A smart Bot :) ");
            break;
        case "more news":
            getArticle(function(err, articles) {
                if(err) {
                    console.log(err);
                }
                else {
                    sendTextMessage(sender, "How about these ");
                    maxArticles = Math.min(articles.length, 5);
                    for(var i = 0 ; i < maxArticles; i++) {
                        sendArticleMessage(sender, articles[i]);
                    }
                }
            });
            break;
        case "general news" :
            getArticle(function(err, articles) {
                if(err) {
                    console.log(err);
                }
                else {
                    sendTextMessage(sender, 'Here is what i have found :)');
                    sendArticleMessage(sender, articles[0]);
                }
            });
            break;
        case "local news":
            getArticle(function(err, articles) {
                if(err) {
                    console.log(err);
                }
                else {
                    sendTextMessage(sender, "Here is something i have found!");
                    sendArticleMessage(sender, articles[0]);
                }
            });
            break;
        default:
            sendTextMessage(sender, "Sorry i did not understand this one :P");
            break;
    }
}

exports.sendArticleMessage = sendArticleMessage;
exports.getArticle = getArticle;