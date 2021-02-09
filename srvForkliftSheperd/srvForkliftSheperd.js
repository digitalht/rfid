/*eslint no-console: 0, no-unused-vars: 0*/
"use strict";

var hdb = require('hdb');
var log = require('../common/log');
var ping = require('ping');
var config = require('../common/config');

var MODULE = 'ForkliftSheperd';
var HDB_RECONNECTION_WAIT = 5;      // waiting time in seconds before hdb reconnection attempt
var POLLING_TICK = 500;             // analysis tick interval in milliseconds

var forkliftSheperd = null;
var forkliftSheperdWriter = null;

/*
var sheeps = [
        {
            "controllerID" : 111,
            "host" : "10.20.30.20"
        }
    ];
*/

var sheeps = [];

// check args
if(process.argv[2] === undefined) {
	log.write(log.LEVEL_ERROR,MODULE,'main','No params specified');
	return;
}

sheeps.push({
	"controllerID" : process.argv[2],
    "host" : process.argv[3]
});

global.hdbClient = hdb.createClient({
  host           : config.hdb.ip ,  // system database host
  instanceNumber : config.hdb.instance ,            // instance number of the HANA system
  databaseName   : config.hdb.dbname,      // name of a particular tenant database
  user           : config.hdb.user,       // user for the tenant database
  password       : config.hdb.pw,    // password for the user specified
  port			 : config.hdb.port
});

function handleHDBConnection (err) {

    if (err) {
        log.write(log.LEVEL_ERROR,MODULE,'hdbClient.connect' + err);
        hdbReconnect();
    }
    
    log.write(log.LEVEL_INFO,MODULE,'hdbClient.connect','HDB Connected - ' + global.hdbClient.readyState);

    global.hdbClient.prepare('CALL "RFID.engine::forklift_sheperd" (?,?)', function(err, statement) {
        if (err) {
            log.write(log.LEVEL_ERROR,MODULE,'hdbClient.prepare','HDB Prepare statement error: ' + err);
            return console.error('HDB Prepare statement error: ', err);
        }
        
        var isAliveStr;

        forkliftSheperd = setInterval(function() {
            sheeps.forEach(function(sheep) {
                ping.sys.probe(sheep.host, function(isAlive) {
                    var msg = isAlive ? 'host ' + sheep.controllerID + ' is alive' : 'host ' + sheep.host + ' is dead';
                    log.write(log.LEVEL_INFO,MODULE,'ping.sys.probe',msg);

                    if (isAlive) isAliveStr = 'Y'; else isAliveStr = 'N';
                    statement.exec({
                        CONTROLLER_ID: sheep.controllerID,
                        VALID:  isAliveStr
                    }, handleAnalyzerResponse);

                });
            });
        },POLLING_TICK);

    });

}
    
global.hdbClient.connect(handleHDBConnection);

global.hdbClient.on('error', function (err) {
    log.write(log.LEVEL_ERROR,MODULE,'hdbClient.onError','Network connection error' + err);
    clearInterval(forkliftSheperd);
    hdbReconnect();
});

function hdbReconnect() {
    log.write(log.LEVEL_INFO,MODULE,'hdbReconnect','Reconnection attempt within ' + HDB_RECONNECTION_WAIT + ' seconds...');
    setTimeout(function() {
        global.hdbClient.connect(handleHDBConnection);
    },HDB_RECONNECTION_WAIT * 1000);
}

function handleAnalyzerResponse(err, parameters) {

    if (err) {
        log.write(log.LEVEL_ERROR,MODULE,'handleAnalyzerQueryResponse','HDB Select Error:' + err);
        return console.error('HDB Select Error:', err);
    }
    log.write(log.LEVEL_DEBUG,MODULE,'handleAnalyzerQueryResponse','HDB Ok');
}




