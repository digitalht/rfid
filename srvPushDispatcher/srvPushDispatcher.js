/*eslint no-console: 0, no-unused-vars: 0*/
"use strict";

var hdb = require('hdb');
var log = require('../common/log');
var rfid = require('../common/rfid_manager');
var RFIDEvent = require('../common/rfid_manager').RFIDEvent;
var config = require('../common/config');
var request = require('request');

var MODULE = 'PushDispatcher';
var HDB_RECONNECTION_WAIT = 5;      // waiting time in seconds before hdb reconnection attempt
var POLLING_TICK = 1;               // analysis tick interval in seconds

var VALIDITY_INTERVAL = 5;          // timeframe of analysis in seconds
var MAX_INTERVAL_TAG_EVENTS = 11;   // maximum possible tag events in VALIDITY_INTERVAL from rfid controller
var MIN_VALIDITY = 60;              // minimum percentage of physical events present in VALIDITY_INTERVAL to be considered a valid read

var MAIN_ANTENNA_NO = config.antenna.main;            // antenna number for main detection (pallet / positions)
var GATE_ANTENNA_NO = config.antenna.lateral;            // antenna number for gate tags detection

global.hdbClient = hdb.createClient({
  host           : config.hdb.ip,                   // system database host
  instanceNumber : config.hdb.instance,             // instance number of the HANA system
  databaseName   : config.hdb.dbname,               // name of a particular tenant database
  user           : config.hdb.user,                 // user for the tenant database
  password       : config.hdb.pw,                   // password for the user specified
  port			 : config.hdb.port 
});

function handleHDBConnection (err) {

    if (err) {
        log.write(log.LEVEL_ERROR,MODULE,'hdbClient.connect' + err);
        hdbReconnect();
    }
    
    log.write(log.LEVEL_INFO,MODULE,'hdbClient.connect','HDB Connected - ' + global.hdbClient.readyState);

    global.hdbClient.prepare('CALL "RFID.analytics::rfid_event_retriever" (?)', function(err, statement) {
        if (err) {
            log.write(log.LEVEL_ERROR,MODULE,'hdbClient.prepare','HDB Prepare statement error: ' + err);
            return console.error('HDB Prepare statement error: ', err);
        }

    

        setInterval(function() {
            statement.exec({}, handleRetrieverResponse);

        },POLLING_TICK * 1000);

    });

    global.hdbClient.prepare('CALL "RFID.analytics::distance_analytics_retriever" (?)', function(err, statement) {
        if (err) {
            log.write(log.LEVEL_ERROR,MODULE,'hdbClient.prepare','HDB Prepare statement error: ' + err);
            return console.error('HDB Prepare statement error: ', err);
        }

        setInterval(function() {
            statement.exec({}, handleDistanceResponse);

        },POLLING_TICK * 1000);

    });

    global.hdbClient.prepare('CALL "RFID.analytics::network_analytics_retriever" (?)', function(err, statement) {
        if (err) {
            log.write(log.LEVEL_ERROR,MODULE,'hdbClient.prepare','HDB Prepare statement error: ' + err);
            return console.error('HDB Prepare statement error: ', err);
        }

        setInterval(function() {
            statement.exec({}, handleNetworkResponse);

        },POLLING_TICK * 1000);

    });

}
    
global.hdbClient.connect(handleHDBConnection);

global.hdbClient.on('error', function (err) {
    log.write(log.LEVEL_ERROR,MODULE,'hdbClient.onError','Network connection error' + err);
    hdbReconnect();
});

function hdbReconnect() {
    log.write(log.LEVEL_INFO,MODULE,'hdbReconnect','Reconnection attempt within ' + HDB_RECONNECTION_WAIT + ' seconds...');
    setTimeout(function() {
        global.hdbClient.connect(handleHDBConnection);
    },HDB_RECONNECTION_WAIT * 1000);
}

function handleRetrieverResponse(err, parameter, output) {

    if (err) {
        log.write(log.LEVEL_ERROR,MODULE,'handleRetrieverResponse','HDB Error:' + err);
        return console.error('HDB Error:', err);
    }
    log.write(log.LEVEL_INFO,MODULE,'handleRetrieverResponse','HDB Select Ok - rows fetched: ' + output.length);

    //console.log(rows[0].INTERNAL_TIMESTAMP);
    //pushNotifications(output);
    if(output.length > 0){
        badgeNumber('EVENT',output);
    }
}

function handleDistanceResponse(err, parameter, output) {

    if (err) {
        log.write(log.LEVEL_ERROR,MODULE,'handleDistanceResponse','HDB Error:' + err);
        return console.error('HDB Error:', err);
    }
    log.write(log.LEVEL_INFO,MODULE,'handleDistanceResponse','HDB Select Ok - rows fetched: ' + output.length);

    //console.log(rows[0].INTERNAL_TIMESTAMP);
    //pushNotificationsDistance(output);
    if(output.length > 0){
        badgeNumber('MAINT',output);
    }
}

function handleNetworkResponse(err, parameter, output) {

    if (err) {
        log.write(log.LEVEL_ERROR,MODULE,'handleNetworkResponse','HDB Error:' + err);
        return console.error('HDB Error:', err);
    }
    log.write(log.LEVEL_INFO,MODULE,'handleNetworkResponse','HDB Select Ok - rows fetched: ' + output.length);

    //console.log(rows[0].INTERNAL_TIMESTAMP);
    //pushNotificationsNetwork(output);
    if(output.length > 0){
        badgeNumber('NETWO',output);
    }
}

function badgeNumber(notifType, output) {

    global.hdbClient.prepare('CALL "XSA_DEV"."RFID.analytics::badge_counter"(?)', function(err,statement){

        if (err) {
            log.write(log.LEVEL_ERROR,MODULE,'hdbClient.prepare','HDB Prepare statement error: ' + err);
            return console.error('HDB Prepare statement error: ', err);
        }
            statement.exec({}, handleBadgeResponse);
    });

    
    function handleBadgeResponse(err, parameters){
        var badgeNum = parameters.BADGENUM;
        if (err) {
            log.write(log.LEVEL_ERROR,MODULE,'handleBadgeResponse','HDB Error:' + err);
            return console.error('HDB Error:', err);
        }
        log.write(log.LEVEL_INFO,MODULE,'handleBadgeResponse','HDB Select Ok - rows fetched: ' + badgeNum);

        var pushToQueue;
        switch(notifType) {
            case 'EVENT':
                pushToQueue = pushNotifications(output, badgeNum);
                queuePush(pushToQueue);
                break;
            case 'MAINT':
                pushToQueue = pushNotificationsDistance(output, badgeNum);
                queuePush(pushToQueue);
                break;
            case 'NETWO':
                pushToQueue = pushNotificationsNetwork(output, badgeNum);
                queuePush(pushToQueue);
                break;
            default:
                break;
        }
    }
}


// launch EVENT notification POST
function pushNotifications(nots, badgeNum) {

    var pushToQueue = [];

    var auth = "Basic dmFsZXJpby5hcnZpenppZ25vQGgtdC5pdDpTb2xmaXRpXzAz="; //credenziali SCP Valerio

    log.write(log.LEVEL_INFO,MODULE,'pushNotifications','Processing ' + nots.length + ' notifications...');

    nots.forEach(function each(notification) {

        var pushData = {
            "type": "EVENT",
            "forkliftId": notification.CONTROLLER_ID,
            "from":  notification.POSITION_FROM,
            "to":  notification.POSITION_TO,
            "tagId": notification.TAG_ID
        };
        
        var pushBody = {};
        switch(notification.EVENT) {
            case 'ON':
                pushBody = {
                    "badge": badgeNum + 1,
                    "sound": "default",
                    "alert": "RFID Event: " + notification.EVENT + "; Pallet: " + notification.TAG_DATA + "; Muletto: " + notification.CONTROLLER_ID,
                    "data": JSON.stringify(pushData)
                };
                break;
            case 'OFF':
                pushBody = {
                    "badge": badgeNum + 1,
                    "sound": "default",
                    "alert": "RFID Event: " + notification.EVENT + "; Pallet: " + notification.TAG_DATA +"; Ubicazione: " + notification.POSITION_TO + "; Muletto: " + notification.CONTROLLER_ID,
                    "data": JSON.stringify(pushData)
                };
                break;
            case 'MOVE':
                pushBody = {
                    "badge": badgeNum + 1,
                    "sound": "default",
                    "alert": "RFID Event: " + notification.EVENT + "; Pallet: " + notification.TAG_DATA + "; From: " + notification.POSITION_FROM +"; To: " + notification.POSITION_TO + "; Muletto: " + notification.CONTROLLER_ID,
                    "data": JSON.stringify(pushData)
                };
                break;
            default:
                break;
        }


        
        pushToQueue.push({type: 'EVENT', alert: pushBody.alert});

        log.write(log.LEVEL_INFO,MODULE,'pushNotifications','Launching notification post:  ' + notification.EVENT);

        request({
            method: 'POST',
            headers: {'Content-Type': 'application/json', 'Authorization': auth},
            url: 'https://mobile-a9d976a16.hana.ondemand.com/restnotification/application/it.ht.com.sap.tutorial.demoapp.Demo/',
            body: pushBody,
            json: true
        }, handlePushNotificationResponse);

    });

    return pushToQueue;
}

// launch EVENT notification POST
function pushNotificationsDistance(nots, badgeNum) {

    var pushToQueue = [];
    var auth = "Basic dmFsZXJpby5hcnZpenppZ25vQGgtdC5pdDpTb2xmaXRpXzAz="; //credenziali SCP Valerio

    log.write(log.LEVEL_INFO,MODULE,'pushNotificationsDistance','Processing ' + nots.length + ' notifications...');

    nots.forEach(function each(notification) {

        var pushData = {
            "type": "MAINT",
            "forkliftId": notification.CONTROLLER_ID,
            "timestamp":  notification.INTERNAL_TIMESTAMP,
            "KmGiornalieri":  notification.KM_GIORNALIERI,
            "KmCumulativi": notification.KM_CUMULATIVI
        };

        var pushBody = {
            "badge": badgeNum + 1,
            "sound": "default",
            "alert": "Manutenzione muletto necessaria il giorno: " + notification.INTERNAL_TIMESTAMP.substr(0,10) + " KM totali percorsi stimati:" + notification.KM_CUMULATIVI,
            "data": JSON.stringify(pushData)
        };
        
        pushToQueue.push({type: 'MAINT', alert: pushBody.alert});
        log.write(log.LEVEL_INFO,MODULE,'pushNotificationsDistance','Launching notification post: DISTANCE');

        request({
            method: 'POST',
            headers: {'Content-Type': 'application/json', 'Authorization': auth},
            url: 'https://mobile-a9d976a16.hana.ondemand.com/restnotification/application/it.ht.com.sap.tutorial.demoapp.Demo/',
            body: pushBody,
            json: true
        }, handlePushNotificationResponse);

    });

    return pushToQueue;
}

// launch EVENT notification POST
function pushNotificationsNetwork(nots, badgeNum) {

    var pushToQueue = [];
    var auth = "Basic dmFsZXJpby5hcnZpenppZ25vQGgtdC5pdDpTb2xmaXRpXzAz="; //credenziali SCP Valerio

    log.write(log.LEVEL_INFO,MODULE,'pushNotificationsNetwork','Processing ' + nots.length + ' notifications...');

    nots.forEach(function each(notification) {

        var pushData = {
            "type": "NETWO",
            "forkliftId": notification.CONTROLLER_ID,
            "timestamp":  notification.INTERNAL_TIMESTAMP,
            "connectivityPerc":  notification.CONNECTIVITY_PERC
        };

        var pushBody = {
            "badge": badgeNum + 1,
            "sound": "default",
            "alert": "! Possibile problema di rete il giorno: " + notification.INTERNAL_TIMESTAMP.substr(0,10) + "; " + "Connettività al: " + notification.CONNECTIVITY_PERC + "%;" + " Chiamata in corso al manutentore: Chiara",
            "data": JSON.stringify(pushData)
        };
        
        pushToQueue.push({type: 'NETWO', alert: pushBody.alert});

        log.write(log.LEVEL_INFO,MODULE,'pushNotificationsNetwork','Launching notification post: NETWORK');

        request({
            method: 'POST',
            headers: {'Content-Type': 'application/json', 'Authorization': auth},
            url: 'https://mobile-a9d976a16.hana.ondemand.com/restnotification/application/it.ht.com.sap.tutorial.demoapp.Demo/',
            body: pushBody,
            json: true
        }, handlePushNotificationResponse);

    });

    return pushToQueue;
}


function handlePushNotificationResponse(error,response,body) {
    log.write(log.LEVEL_INFO,MODULE,'pushNotifications','POST response: ' + response.statusCode);
}

function queuePush(pushToQueue){

    pushToQueue.forEach(function each(push) {
     global.hdbClient.exec('INSERT INTO \"XSA_DEV\".\"RFID.analytics.model::pushTables.PUSH_NOTIFICATION_QUEUE\" VALUES (\"XSA_DEV\".\"RFID.analytics::pushID\".NEXTVAL,\'' + push.type + '\',\'' + push.alert + '\',\'\')', handleQueueResponse);
    });
}

function handleQueueResponse(err, affectedRows){
    if (err) {
        log.write(log.LEVEL_ERROR,MODULE,'hdbClient.exec','HDB Exec Error: ' + err);
        return;
    }
    var insertNo = 1;
    if (affectedRows !== undefined) {
        if (affectedRows.length !== undefined) {
            insertNo = affectedRows.length;
        }
    }
    log.write(log.LEVEL_INFO,MODULE,'hdbClient.exec','Push Queue Insert OK - Number of Insert Done: ' + insertNo);
}
