/*eslint no-console: 0, no-unused-vars: 0*/
"use strict";

var MODULE = 'EventWriter';

var net = require('net');
var hdb = require('hdb');

var log = require('../common/log');
var rfid = require('../common/rfid_manager');
var config = require('../common/config');

//var TCP_INBOUND_PORT = 9000;
var HDB_RECONNECTION_WAIT = 5;
var HDB_STACK_INSERT_BUFFER = 10;

// check args
if(process.argv[2] === undefined) {
	log.write(log.LEVEL_ERROR,MODULE,'main','No port specified');
	return;
}

// --------> HDB Stuff <-------------

global.hdbClient = hdb.createClient({
  host           : config.hdb.ip,       // system database host
  instanceNumber : config.hdb.instance, // instance number of the HANA system
  databaseName   : config.hdb.dbname,          // name of a particular tenant database
  user           : config.hdb.user,           // user for the tenant database
  password       : config.hdb.pw,       // password for the user specified
  port			 : config.hdb.port
});

global.hdbClient.setAutoCommit(true);

global.insertStackBuffer = 0;
global.valuesRows = [];

function handleHDBConnection (err) {

    if (err) {
        log.write(log.LEVEL_ERROR,MODULE,'hdbClient.connect' + err);
        hdbReconnect();
        //return console.error('HDB Error:', err);
    }
    
    log.write(log.LEVEL_INFO,MODULE,'hdbClient.connect','HDB Connected - ' + global.hdbClient.readyState);
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

// --------> TCP Inbound Socket Stuff <-------------

var tcpServer = net.createServer();
tcpServer.on('connection', handleTCPConnection);

tcpServer.listen(process.argv[2], function() {
    log.write(log.LEVEL_INFO,MODULE,'tcpServer.listen','TCP server listening to ' + tcpServer.address() + ':' + process.argv[2]);
});

function handleTCPConnection(conn) {
    //conn.setEncoding('utf8');

    var remoteAddress = conn.remoteAddress + ':' + conn.remotePort;
    log.write(log.LEVEL_INFO,MODULE,'handleTCPConnection','new client connection from ' + remoteAddress );

    conn.once('close', onConnClose);
    conn.on('error', onConnError);

    function onConnData(d) {

        this.tcpData = d;

        log.write(log.LEVEL_DEBUG,MODULE,'onConnData','Incoming packet');

        var reads = rfid.parse(d);

        var today = new Date();
        var dd = "00" + today.getDate();
        var mm = "00" + (today.getMonth()+1);
        var yyyy = today.getFullYear();

        var sql;
        
        if(global.insertStackBuffer > HDB_STACK_INSERT_BUFFER) {
            log.write(log.LEVEL_DEBUG,MODULE,'onConnData',"Insert Stack Buffer overflow, skipping request");
            return;
        }
        
        global.insertStackBuffer++;
        global.valuesRows = [];

        for (var i=0;i<reads.length;i++) {

            //sql = "insert into \"XSA_DEV\".\"RFID_PHYSICAL_EVENTS\" values(timestamp'" + yyyy + "-" + mm.substr(mm.length-2) + "-" + dd.substr(dd.length-2) + " " + reads[i].timestamp + "', " + reads[i].controllerID + ", '" + reads[i].tagID + "', '" + reads[i].tagData + "',now())";
            log.write(log.LEVEL_DEBUG,MODULE,'onConnData',"Pushing tagData: '" + reads[i].tagData + "'");
            log.write(log.LEVEL_DEBUG,MODULE,'onConnData',"Pushing ts: '" + "timestamp'" + yyyy + "-" + mm.substr(mm.length-2) + "-" + dd.substr(dd.length-2) + " " + reads[i].timestamp + "'");
            global.valuesRows.push(new Array(
                                        "timestamp'" + yyyy + "-" + mm.substr(mm.length-2) + "-" + dd.substr(dd.length-2) + " " + reads[i].timestamp + "'"
                                        , reads[i].controllerID
                                        , reads[i].tagID
                                        , reads[i].tagData
                                        //, 'now()'
                                        , reads[i].antennaNo

            ));
            /*
            global.hdbClient.exec(sql, function(err, rows) {
                if (err) {
                    log.write(log.LEVEL_ERROR,MODULE,'onConnData','HDB Insert Error:' + err);
                    log.write(log.LEVEL_DEBUG,MODULE,'onConnData','sql string: ' + sql);
                    return console.error('HDB Insert Error:', err);
                }
                log.write(log.LEVEL_INFO,MODULE,'onConnData','Physical Event Insert OK - TagData: ' + reads[i].tagData);
            });
            */
        }

        global.hdbClient.prepare('insert into \"XSA_DEV\".\"RFID.engine.model::rfid_tables.RFID_PHYSICAL_EVENTS\" (TIMERSTAMP,CONTROLLER_ID,TAG_ID,TAG_DATA,ANTENNA_NO) values(?,?,?,?,?)', function(err, statement) {
            if (err) {
                log.write(log.LEVEL_ERROR,MODULE,'hdbClient.prepare','HDB Prepare Error: ' + err);
            }
            statement.exec(global.valuesRows, function(err, affectedRows) {
                if (err) {
                    log.write(log.LEVEL_ERROR,MODULE,'hdbClient.exec','HDB Exec Error: ' + err);
                }
                var insertNo = 1;
                if (affectedRows !== undefined) {
                	if (affectedRows.length !== undefined) {
                		insertNo = affectedRows.length;
                	}
                }
                log.write(log.LEVEL_INFO,MODULE,'hdbClient.exec','Physical Event Insert OK - Number of Insert Done: ' + insertNo);
                global.insertStackBuffer--;
                // security ;)
                if (global.insertStackBuffer < 0) global.insertStackBuffer = 0;
            });
        });

        /*
        for (var i=0;i<reads.length;i++) {
            sql = "insert into \"XSA_DEV\".\"RFID_PHYSICAL_EVENTS\" values(timestamp'" + yyyy + "-" + mm.substr(mm.length-2) + "-" + dd.substr(dd.length-2) + " " + reads[i].timestamp + "', " + reads[i].controllerID + ", '" + reads[i].tagID + "', '" + reads[i].tagData + "',now())";
            global.hdbClient.exec(sql, function(err, rows) {
                if (err) {
                    log.write(log.LEVEL_ERROR,MODULE,'onConnData','HDB Insert Error:' + err);
                    log.write(log.LEVEL_ERROR,MODULE,'onConnData','sql string: ' + sql);
                    return console.error('HDB Insert Error:', err);
                }
                log.write(log.LEVEL_INFO,MODULE,'onConnData','Physical Event Insert OK - TagData: ' + reads[i].tagData);
            });
        }
        */

        /*
        global.hdbClient.commit(function(commitError) {
            log.write(log.LEVEL_INFO,MODULE,'onConnData','HDB Commit Done. Response: ' + commitError);
            global.insertStackBuffer--;
            // security ;)
            if (global.insertStackBuffer < 0) global.insertStackBuffer = 0;
        });
        */
        
    }

    var onConnDataBind = onConnData.bind(this);
    conn.on('data', onConnDataBind);

    function onConnClose() {
        log.write(log.LEVEL_INFO,MODULE,'onConnClose','TCP connection from ' + remoteAddress + ' closed');
    }

    function onConnError(err) {
        log.write(log.LEVEL_ERROR,MODULE,'onConnError','TCP Connection ' + remoteAddress + ' error: ' + err.message);
        console.log('TCP Connection %s error: %s', remoteAddress, err.message);
    }
}
