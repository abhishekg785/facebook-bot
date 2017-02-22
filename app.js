var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var nodeSchedule = require('node-schedule');

var routes = require('./app/routes/index');
var webhook = require('./app/routes/webhook');
var mongoose = require('mongoose');
var UserModel = require('./app/models/User');
var apiController = require('./app/controller/api');

var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'app/views'));
app.engine('html',require('ejs').renderFile);
app.set('view engine', 'html');

// mongodb connect using mongoose
mongoose.connect('mongodb://localhost/aaron-bot', function(err) {
    if(!err) {
        console.log('connected to db');
    }
    else{
        console.log(err);
    }
});

// schedule the event for each morning using node scheduler
// 10 am every morning to send the update
var j = nodeSchedule.scheduleJob('11 * * * *', function() {
    UserModel.find({}, function(err, users) {
        if(users != null) {
            apiController.getArticle(function(err, articles) {
                users.forEach(function(user) {
                    apiController.sendArticleMessage(user.fb_id, articles[0]);
                });
            });
        }
    });
});

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'app/public')));

app.use('/', routes);
app.use('/webhook', webhook);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function(err, req, res, next) {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err
        });
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {}
    });
});


module.exports = app;
