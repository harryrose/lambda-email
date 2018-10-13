const AWS = require('aws-sdk'),
    qs = require('qs'),
    siteName = process.env.SITE_NAME,
    toAddress = process.env.EMAIL_TO,
    fromAdddress = process.env.EMAIL_FROM,
    recapAction = process.env.RECAPTCHA_ACTION,
    reCaptchaSecret = process.env.RECAPTCHA_SECRET,
    cors_allow_origin = process.env.CORS_ALLOW_ORIGIN,
    cors_allow_methods= process.env.CORS_ALLOW_METHODS,
    recaptcha = require('./recaptcha'),
    recap = new recaptcha.Validator(reCaptchaSecret);


const buildMessage = function(ip, name, email, body) {
    return {
        subject: "Contact form on "+siteName,
        body: "Somebody has used the contact form on "+siteName+" in order to send the following message\n" +
              "\nIP: " + ip +
              "\nName: " + name +
              "\nEmail: "+ email +
              "\nBody: " + body
    };
};

const sendEmail = function(to, from, replyTo, subject, message) {
    replyTo = replyTo ? [ replyTo ] : replyTo;

    const params = {
        Destination: {
            ToAddresses: [ to ]
        },
        Source: from,
        ReplyToAddresses: replyTo,
        Message: {
            Body: {
                Text: {
                    Charset: "UTF-8",
                    Data: message
                }
            },
            Subject: {
                Charset: "UTF-8",
                Data: subject
            }
        }
    };

    return new AWS.SES({apiVersion: '2010-12-01'}).sendEmail(params).promise();
};

const response = function(status, body) {
    return {
        statusCode: status,
        body: JSON.stringify(body),
        headers: {
            "Access-Control-Allow-Origin": cors_allow_origin,
        }
    };
};

const errorResponse = function(status, message){
    return response(status, {
        error: message
    });
};

const okResponse = function(status, data) {
    if(data === undefined) {
        data = [];
    }
    return response(status, {
        "data": data
    });
};

const handlePOST = function(event, callback) {
    const fromIP = event.requestContext.identity.sourceIp;
    const body = qs.parse(event.body);

    console.log("IP: ", fromIP, "Name: ", body.name, "Email: ", body.email, "Body: ", body.body, "EncodedBody: ", JSON.stringify(body));


    if(!toAddress || !fromAdddress) {
        console.error("unable to continue as either the to or from address is not configured");
        callback(null, errorResponse(500, "configuration error"));
        return
    }

    if(!body.name) {
        callback(null, errorResponse(400, "name field not populated"));
        return
    }

    if(!body.email) {
        callback(null, errorResponse(400, "email field not populated"));
        return
    }

    if(!body.body) {
        callback(null, errorResponse(400, "body field not populated"));
        return
    }

    const msg = buildMessage(fromIP, body.name, body.email, body.body);


    recap.validate(recapAction, fromIP, recaptcha.getResponseFromObject(body))
        .then( () => {
            sendEmail(toAddress, fromAdddress, body.email, msg.subject, msg.body)
                .then(function(){
                    callback(null, okResponse());
                })
        })
        .catch(function(err){
            console.error("failed to send message: ", err);
            if(err instanceof recaptcha.ConfigurationError) {
                callback(null, errorResponse(500, "recaptcha failed due to configuration error"));
            }
            else if (err instanceof recaptcha.InvalidAction) {
                callback(null, errorResponse(400, "recaptcha failed due to invalid action"));
            }
            else if(err instanceof recaptcha.ValidationError){
                callback(null, errorResponse(400), "recaptcha failed");
            }
            else {
                callback(null, errorResponse(500, "error sending email"));
            }
        });
};

const handleOPTIONS = function(event, callback){
    const response = {
        statusCode: 200,
        headers: {
            Allow: cors_allow_methods,
            "Access-Control-Allow-Methods": cors_allow_methods,
            "Access-Control-Allow-Origin": cors_allow_origin,
        },
        multiValueHeaders: {
            "Access-Control-Allow-Headers": ["Content-Type"]
        }
    }

    callback(null, response);
};

exports.handler = function(event, context, callback) {
    switch(event.httpMethod) {
        case "POST":
            handlePOST(event, callback);
            return;

        case "OPTIONS":
            handleOPTIONS(event, callback);
            return;

        default:
            callback(null, errorResponse(405, "method not allowed"));
    }
};