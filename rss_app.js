var request = require('request'),
    url = require('url'),
    htmlparser = require('htmlparser'),
    fs = require('fs'),
    OAuth = require('oauth').OAuth
    _ = require('underscore');

var config = {
    "latestDateFile" : "lastestPostedDate.txt",

    "rssUrl": 'http://feeds.bbci.co.uk/news/rss.xml',
    "intervalLength": 2000,

    "twitterConsumerKey": undefined,
    "twitterConsumerSecret": undefined,
    "twitterAccessToken": undefined,
    "twitterAccessTokenSecret": undefined
};

if (fs.existsSync('config.json')) {
    _.extend(config, JSON.parse(fs.readFileSync('config.json')));
}

oAuth = new OAuth("http://twitter.com/oauth/request_token",
    "http://twitter.com/oauth/access_token", 
    config.twitterConsumerKey,
    config.twitterConsumerSecret,
    "1.0A",
    null,
    "HMAC-SHA1"
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
function setLatestPostedItemDate(date){
    lastestPostedItemDate = date;
    // write to file
    fs.writeFile(config.latestDateFile, lastestPostedItemDate);
    return true;
}

// post item to twitter
function publishToTwitter(item){
    var tweet = item.description.substr(0, 110) + ' ' + item.link;
    console.log('publishing to twitter');
    oAuth.post(
        'http://api.twitter.com/1.1/statuses/update.json',
        config.twitterAccessToken,
        config.twitterAccessTokenSecret,
        {'status': tweet},
        function(error, data) {
             if(error) console.log(require('util').inspect(error))
             //else console.log('succcess!' + data)
        }
    );
}

// looping on the server (every second)
setInterval(function(){
    request({uri: config.rssUrl}, function(err, response, body){

        // Basic error check
        if(err && response.statusCode !== 200){
            console.log('Request error.');
        }
        
        parser.parseComplete(body);
        var items = handler.dom.items;
        var itemsToPublish = []; // Array

        for(key in items){
            //console.log(prop + ': ' + items[prop].title + ' ' + items[prop].link + '\n');
            var itemDate = new Date(items[key].pubDate);
            if(itemDate > lastestPostedItemDate){
                // add to a publish array here
                itemsToPublish.push(items[key]);
            }
        }
        // sort items to publish on pubDate
        itemsToPublish.sort(compareDates);

        for(var i in itemsToPublish){
            console.log(itemsToPublish[i].pubDate + ' ' + itemsToPublish[i].title);
            publishToTwitter(itemsToPublish[i]);
            setLatestPostedItemDate(itemsToPublish[i].pubDate);
        }
    });
    console.log('\n');
}, config.intervalLength);
