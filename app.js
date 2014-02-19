#!/usr/bin/env node

var request = require('request'),
    fs = require('fs'),
    Twitter = require('node-twitter'),
    _ = require('underscore'),
    htmlToText = require('html-to-text');

var config = {
    "latestDateFile": "lastestPostedDate.txt",

    "pingIntervalLength": 10000,
    "characters_reserved_per_media": 23,
    "short_url_length": 22,

    "googleUserId": undefined,
    "googleAPIKey": undefined,

    "twitterConsumerKey": undefined,
    "twitterConsumerSecret": undefined,
    "twitterAccessToken": undefined,
    "twitterAccessTokenSecret": undefined
};

if (fs.existsSync('config.json')) {
    _.extend(config, JSON.parse(fs.readFileSync('config.json')));
}

var googleActivitiesUrl = "https://www.googleapis.com/plus/v1/people/" +
    config.googleUserId + "/activities/public?maxResults=10&key=" + config.googleAPIKey;

var twitterRestClient = new Twitter.RestClient(
    config.twitterConsumerKey,
    config.twitterConsumerSecret,
    config.twitterAccessToken,
    config.twitterAccessTokenSecret
);

// Get date of latest posted article
var lastestPostedItemDate = getLatestPostedItemDate(), itemsToPublish = [];

if (lastestPostedItemDate == 'Invalid Date') {
    throw 'Latest posted date is invalid';
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
    fs.writeFile(config.latestDateFile, lastestPostedItemDate.toJSON());
    return true;
}

// post item to twitter
function publishToTwitter(item, done) {

    function reporter(error, result) {
        if (error) {
            console.log(new Date() + '. Twitter error: ' + (error.code ? error.code + ' ' + error.message : error.message));
        }
        if (result) {
            console.log('sent: ' + result.text + '\n');
        }
        setLatestPostedItemDate(item.published);
        done();
    }

    if (item.image) {

        twitterRestClient.statusesUpdateWithMedia(
            {status: item.text, "mediaExt[]": item.image},
            reporter
        );

    } else {
        twitterRestClient.statusesUpdate(
            {status: item.text},
            reporter
        );
    }

}

function tweetLimit(embedVideo, embedImage, linkGplus) {
    return 140 - (embedVideo ? config.short_url_length + 1 : 0) -
        (embedImage ? config.characters_reserved_per_media + 1 : 0) -
        (linkGplus ? config.short_url_length + 2 : 0); // http[s] takes one letter more
}

function convertGoogleItem(item) {
    var embedVideo = item.object.attachments && item.object.attachments[0]['objectType'] === 'video' ?
            item.object.attachments[0]['url'] : undefined,

        embedImage = item.object.attachments && item.object.attachments[0].fullImage ?
            item.object.attachments[0].fullImage.url : undefined,

        link = item.object.attachments &&
            (['video', 'photo'].indexOf(item.object.attachments[0]['objectType']) < 0),

        text = htmlToText.fromString(item.object.content.replace(/<[^>]*>?/g, ''), {wordwrap: 140}),

        linkUrl = item.object.attachments && item.object.attachments[0]['objectType'] === 'article' ?
            item.object.attachments[0]['url'] : item.url;

    if (!text.length) {
        // nothing to say
        return undefined;
    }

    if (text.length > tweetLimit(embedVideo, embedImage, link)) {
        link = true;
        linkUrl = item.url;
    }

    var tweet = text.substr(0, tweetLimit(embedVideo, embedImage, link)) +
        (embedVideo ? ' ' + embedVideo : '') + (link ? ' ' + linkUrl : '');

    return {
        text: tweet,
        image: embedImage,
        published: new Date(item.published)
    }
}

function tweetNextItem () {
    if (itemsToPublish.length) {
        var item = itemsToPublish.pop();
        publishToTwitter(item, tweetNextItem);
    }
}

function ping() {

    if (!itemsToPublish.length) {

        request({uri: googleActivitiesUrl, json: true}, function (err, response, json) {

            // Basic error check
            if (!response || (err && response.statusCode !== 200)) {
                console.log(new Date() + '. Request error.');
                console.log(err);
            } else {
                var items = json.items || [], i;

                for (i = 0; i < items.length; i++) {
                    var itemDate = new Date(items[i].published), converted;

                    if (itemDate > lastestPostedItemDate) {
                        converted = convertGoogleItem(items[i]);

                        if (converted) {
                            itemsToPublish.push(converted);
                        }
                    }
                }

                tweetNextItem();
            }
        });

    }
}

ping();
setInterval(ping, config.pingIntervalLength);
