/*eslint no-console: 0, no-unused-vars: 0*/
"use strict";

var hdb = require('hdb');
var log = require('../common/log');
var ws = require('ws');
var rfid = require('../common/rfid_manager');
var RFIDEvent = require('../common/rfid_manager').RFIDEvent;
var config = require('../common/config');

var SUPERVISOR = '0'; //Supervisor user start with 0 (range 001-099)
var MODULE = 'EventAnalyzer';
var HDB_RECONNECTION_WAIT = 5;      // waiting time in seconds before hdb reconnection attempt
var POLLING_TICK = 1;               // analysis tick interval in seconds

var VALIDITY_INTERVAL = 5;          // timeframe of analysis in seconds
var MAX_INTERVAL_TAG_EVENTS = 11;   // maximum possible tag events in VALIDITY_INTERVAL from rfid controller
var MIN_VALIDITY = 60;              // minimum percentage of physical events present in VALIDITY_INTERVAL to be considered a valid read

var MAIN_ANTENNA_NO = config.antenna.main;            // antenna number for main detection (pallet / positions)
var GATE_ANTENNA_NO = config.antenna.lateral;            // antenna number for gate tags detection

var WSSERVER_PORT = config.ws.port;

global.hdbClient = hdb.createClient({
  host           : config.hdb.ip,  // system database host
  instanceNumber : config.hdb.instance,            // instance number of the HANA system
  databaseName   : config.hdb.dbname,      // name of a particular tenant database
  user           : config.hdb.user,       // user for the tenant database
  password       : config.hdb.pw,    // password for the user specified
  port			 : config.hdb.port 
});

global.wsServer = new ws.Server({ port: WSSERVER_PORT });   // start web socket server

function handleHDBConnection (err) {

    if (err) {
        log.write(log.LEVEL_ERROR,MODULE,'hdbClient.connect' + err);
        hdbReconnect();
    }
    
    log.write(log.LEVEL_INFO,MODULE,'hdbClient.connect','HDB Connected - ' + global.hdbClient.readyState);

    global.hdbClient.prepare('CALL "RFID.engine::analyzer" (?, ?, ?, ?, ?, ?)', function(err, statement) {
        if (err) {
            log.write(log.LEVEL_ERROR,MODULE,'hdbClient.prepare','HDB Prepare statement error: ' + err);
            return console.error('HDB Prepare statement error: ', err);
        }

        setInterval(function() {
            statement.exec({
                MAX_INTERVAL_TAG_EVENTS: MAX_INTERVAL_TAG_EVENTS,
                VALIDITY_INTERVAL: VALIDITY_INTERVAL,
                MIN_VALIDITY: MIN_VALIDITY,
                GATE_ANTENNA_NO: GATE_ANTENNA_NO,
                MAIN_ANTENNA_NO: MAIN_ANTENNA_NO
            }, handleAnalyzerResponse);
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

function handleAnalyzerResponse(err, parameters, events) {

    if (err) {
        log.write(log.LEVEL_ERROR,MODULE,'handleAnalyzerResponse','HDB Error:' + err);
        return console.error('HDB Error:', err);
    }
    log.write(log.LEVEL_DEBUG,MODULE,'handleAnalyzerResponse','HDB Select Ok - rows fetched: ' + events.length);

    // event manager
    events.forEach(function each(event) {
        global.wsServer.clients.forEach(function each(client) {
            if (client.controllerID == event.CONTROLLER_ID || client.controllerID.charAt(0) == SUPERVISOR) {
                var rfidEvent = new RFIDEvent(event, client);
                log.write(log.LEVEL_DEBUG,MODULE,'handleAnalyzerResponse','trowing event: ' + rfidEvent.getType() + ', from controller ' + rfidEvent.getControllerID() + ' - tag data: ' + rfidEvent.getTagData());
                rfidEvent.launch();
            }
        });
    });
}

global.mockEventGenerator = function (type,status) {
    var now = new Date();

    var event = {};

    event.CONTROLLER_ID = 111;
    event.INTERNAL_TIMESTAMP = now.toISOString();
    event.VALID = "Y";
    event.TAG_DATA = "A000000009";
    event.TAG_ID = "341223";
    
   
    event.customData = {};
    event.customData.status = status;
    event.customData.qty = "666";
    event.customData.um = "KG";
    event.customData.material = "Antimateria";

    event.EVENT = type;

    switch (type) {
        case "ON" :
           
            break;

        case "OFF":
            event.POSITION_TO = "A1O";
            break;

        case "MOVE":
            event.TAG_DATA = "";
            event.TAG_ID = "";
            event.POSITION_FROM = "A1I";
            event.POSITION_TO = "A1O";
            event.customData = {};
            break;
    }

    var mockEvents = [];
    mockEvents.push(event);

    mockEvents.forEach(function each(event) {
        global.wsServer.clients.forEach(function each(client) {
            if (client.controllerID == event.CONTROLLER_ID) {
                var rfidEvent = new RFIDEvent(event, client);
                log.write(log.LEVEL_DEBUG,MODULE,'handleAnalyzerResponse','trowing event: ' + rfidEvent.getType() + ', from controller ' + rfidEvent.getControllerID());
                rfidEvent.launch();
            }
        });
    });
};

// WebSocket message server init
global.wsServer.on('connection', function (ws,req) {
    
    // incoming message handler (registration message from client - forklift)
    ws.on('message', function (message) {
        var controllerID = JSON.parse(message)['controllerID'];
        if (controllerID != undefined) {

            // check for double connection
            global.wsServer.clients.forEach( function each(client) {
                if (client.controllerID == controllerID) {
                    // terminate old connection if present
                    client.terminate();
                }
            });

            this.controllerID = controllerID;
            log.write(log.LEVEL_INFO,MODULE,'onWsServerConnection','forklift ' + controllerID +  ' registered');
        }
        
    });

/*    ws.send(JSON.stringify({
        user: 'NODEJS',
        text: 'Hallo from server'
    }));*/
    /*
    setTimeout(function() {
        mockEventGenerator("ON","L");
    },5000);
    setTimeout(function() {
        mockEventGenerator("MOVE","L");
    },10000);
    setTimeout(function() {
        mockEventGenerator("OFF","L");
    },15000);
    */
});