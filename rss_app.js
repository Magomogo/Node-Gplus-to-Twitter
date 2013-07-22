var request = require('request'),
    htmlparser = require('htmlparser'),
    fs = require('fs'),
    Twitter = require('node-twitter'),
    _ = require('underscore'),
    ent = require('ent');

var config = {
    "latestDateFile": "lastestPostedDate.txt",

    "rssUrl": 'http://feeds.bbci.co.uk/news/rss.xml',
    "intervalLength": 10000,
    "characters_reserved_per_media": 23,
    "short_url_length": 22,

    "twitterConsumerKey": undefined,
    "twitterConsumerSecret": undefined,
    "twitterAccessToken": undefined,
    "twitterAccessTokenSecret": undefined
};

if (fs.existsSync('config.json')) {
    _.extend(config, JSON.parse(fs.readFileSync('config.json')));
}

var twitterRestClient = new Twitter.RestClient(
    config.twitterConsumerKey,
    config.twitterConsumerSecret,
    config.twitterAccessToken,
    config.twitterAccessTokenSecret
);

// Get date of latest posted article
var lastestPostedItemDate = getLatestPostedItemDate();

// Needed for RSS parsing
var handler = new htmlparser.RssHandler();
var parser = new htmlparser.Parser(handler);

// function to sort of dates
function compareDates(a, b) {
    var aDate = new Date(a.pubDate);
    var bDate = new Date(b.pubDate);

    if (aDate < bDate)
        return -1;
    if (aDate > bDate)
        return 1;
    return 0;
}

// get the date (uses flat file to be replaced with MongoDB)
function getLatestPostedItemDate() {
    return new Date(
        fs.existsSync(config.latestDateFile) ? fs.readFileSync(config.latestDateFile).toString() : '1970-01-01'
    );
}

// set the date (uses flat file to be replaced with MongoDB)
function setLatestPostedItemDate(date) {
    lastestPostedItemDate = date;
    // write to file
    fs.writeFile(config.latestDateFile, lastestPostedItemDate);
    return true;
}

function contents(html, link) {
    var handler = new htmlparser.DefaultHandler(),
        parser = new htmlparser.Parser(handler),
        textPart,
        firstImage;

    parser.parseComplete(html);

    function extractText(siblings) {
        var i, element, text = '', isBlockElement = false;
        for (i = 0; i < siblings.length; i++) {
            element = siblings[i];

            if (element.type === 'text') {
                text = text + element.data;
            }

            if (!firstImage && (element.type === 'tag') && (element.name === 'img') &&
                element.attribs.src.match(/\.(jpg|jpeg)$/)) {
                firstImage = element.attribs.src;
            }

            if (element.children) {
                isBlockElement = (element.type === 'tag') && (['div'].indexOf(element.name) !== -1);

                text = text +
                    (isBlockElement ? ' ' : '') +
                    extractText(element.children) +
                    (isBlockElement ? ' ' : '');
            }
        }
        return text.replace(/^\s+|\s+$/gm, '').replace(/ +/gm, ' ');
    }
    textPart = extractText(handler.dom);

    var allowedTextLength = 140 - (firstImage ? config.characters_reserved_per_media + 1 : 0) - 1;

    if (textPart.length > allowedTextLength) {
        allowedTextLength = allowedTextLength - config.short_url_length - 1;
        textPart = textPart.substr(0, allowedTextLength) + ' ' + link;
    }

    return {
        "text": textPart,
        "image": firstImage
    };
}

// post item to twitter
function publishToTwitter(item) {
    var contentsToTweet = contents(ent.decode(item.description), item.link);

    function reporter(error, result) {
        if (error) {
            console.log('Error: ' + (error.code ? error.code + ' ' + error.message : error.message));
        }
        if (result) {
            console.log('sent: ' + result.text + '\n');
        }
    }

    if (contentsToTweet.image) {

        twitterRestClient.statusesUpdateWithMedia(
            {status: contentsToTweet.text, "mediaExt[]": contentsToTweet.image},
            reporter
        );

    } else {
        twitterRestClient.statusesUpdate(
            {status: contentsToTweet.text},
            reporter
        );
    }

}
function pingRss() {
    request({uri: config.rssUrl}, function (err, response, body) {

        // Basic error check
        if (!response || (err && response.statusCode !== 200)) {
            console.log('Request error.');
        }

        parser.parseComplete(body);
        var items = handler.dom.items;
        var itemsToPublish = []; // Array

        for (key in items) {
            var itemDate = new Date(items[key].pubDate);
            if (itemDate > lastestPostedItemDate) {
                // add to a publish array here
                itemsToPublish.push(items[key]);
            }
        }
        // sort items to publish on pubDate
        itemsToPublish.sort(compareDates);

        for (var i in itemsToPublish) {
            publishToTwitter(itemsToPublish[i]);
            setLatestPostedItemDate(itemsToPublish[i].pubDate);
        }
    });
//    console.log('.');
}

pingRss();
setInterval(pingRss, config.intervalLength);
