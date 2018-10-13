const rp = require('request-promise');

const responseKey = "g-recaptcha-response";
const recapURI = "https://www.google.com/recaptcha/api/siteverify";
const recapErrCodeKey = "error-codes";

class CaptchaError extends Error {
    constructor(message) {
        super(message);
    }
}

class ConfigurationError extends CaptchaError {
    constructor(errorCodes) {
        errorCodes = errorCodes  ? errorCodes :  [];
        super(JSON.stringify(errorCodes));
        this.errorCodes = errorCodes;
    }
}

class ValidationError extends CaptchaError {
    constructor(msg) {
        msg = msg ? (": "+msg) : "";
        super("validation failed"+msg);
    }
}

class InvalidAction extends ValidationError {
    constructor(expected, got) {
        super("invalid action")
        this.expected = expected;
        this.got = got;
    }
}

function getResponseFromObject(body) {
    return body[responseKey];
}

function handleResponse(expectedAction) {
    return parsedBody => new Promise( (resolve, reject) => {
        if (!parsedBody.success) {
            if (parsedBody[recapErrCodeKey]) {
                reject(new ConfigurationError(parsedBody[recapErrCodeKey]));
                return
            }

            reject(new ValidationError("captcha was invalid"));
            return
        }

        if (expectedAction && parsedBody.action !== expectedAction) {
            reject(new InvalidAction(expectedAction, parsedBody.action));
            return
        }

        resolve();
    });
}

class Validator {
    constructor(secret) {
        this.secret = secret;
    }

    validate(action, remoteIP, response) {
        const options = {
            method: "POST",
            uri: "https://www.google.com/recaptcha/api/siteverify",
            json:true,
            form: {
                secret: this.secret,
                response: response,
                remoCteip: remoteIP
            }
        };

        return rp(options)
            .then(handleResponse(action));
    }

    getResponseFromObject(body){
        return getResponseFromObject(body);
    }
}



module.exports.ConfigurationError = ConfigurationError;
module.exports.ValidationError = ValidationError;
module.exports.InvalidAction = InvalidAction;
module.exports.getResponseFromObject = getResponseFromObject;
module.exports.Validator = Validator;
