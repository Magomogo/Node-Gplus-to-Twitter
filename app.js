#!/usr/bin/env node

var repost = require('repost'),
    fs = require('fs'),
    _ = require('underscore'),
    config = {
        "latestDateFile": "./latestPostedDate.json",

        "googleUserId": undefined,
        "googleAPIKey": undefined,

        "twitterConsumerKey": undefined,
        "twitterConsumerSecret": undefined,
        "twitterAccessToken": undefined,
        "twitterAccessTokenSecret": undefined
    },
    latestPostedDate;

if (fs.existsSync('config.json')) {
    _.extend(config, JSON.parse(fs.readFileSync('config-dev.json')));
}

latestPostedDate = new Date(
    fs.existsSync(config.latestDateFile) ?
        require(config.latestDateFile) : '1970-01-01'
);

repost.src.googlePlus(config)
    .pipe(repost.filter.publishedAfter(latestPostedDate))
    .pipe(repost.dest.twitter(config))
    .pipe(repost.logger(process.stdout))
    .pipe(repost.dest.publishedDate(config.latestDateFile));
