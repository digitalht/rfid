var request = require('./node_modules/request');
var hdb = require('./node_modules/hdb');


//HDB connection Config
var HDB_RECONNECTION_WAIT = 5;
var POLLING_TICK = 1; 

global.hdbClient = hdb.createClient({
  host           : '10.144.150.10',     // system database host
  instanceNumber : '00',                // instance number of the HANA system
  databaseName   : 'SYSTEMDB',          // name of a particular tenant database
  user           : 'XSA_DEV',           // user for the tenant database
  password       : 'Paperino666',       // password for the user specified
  port			 : '30013'
});

function handleHDBConnection (err) {

    if (err) {
        console.log('hdbClient.connect' + err);
        hdbReconnect();
    }
    
    console.log('HDB Connected - ' + global.hdbClient.readyState);

        setInterval(function() {
            global.hdbClient.exec('SELECT * from "XSA_DEV"."RFID_PAL_OUTPUT" WHERE KM_CUMULATIVI > 110160 ORDER BY INTERNAL_TIMESTAMP', handleResponse);
        },POLLING_TICK * 1000);
}

global.hdbClient.connect(handleHDBConnection);

global.hdbClient.on('error', function (err) {
    console.log('Network connection error' + err);
    hdbReconnect();
});

function hdbReconnect() {
    console.log('Reconnection attempt within ' + HDB_RECONNECTION_WAIT + ' seconds...');
    setTimeout(function() {
        global.hdbClient.connect(handleHDBConnection);
    },HDB_RECONNECTION_WAIT * 1000);
}

function handleResponse(err, rows) {

    if (err) {
        console.log('HDB Error:' + err);
        return console.error('HDB Error:', err);
    }
    console.log('HDB Select Ok - rows fetched: ' + rows.length);

    // event manager
    console.log(rows[0].INTERNAL_TIMESTAMP);
    doPost(rows[0]);
}

//HTTP call config
function doPost(row){
    var auth = "Basic YWx2aXNlLnp1bGlhbkBnbWFpbC5jb206MTIzaHQ0NTZodCE="
    var myJSONObject = {"alert": "Manutenzione necessaria il giorno: " + row.INTERNAL_TIMESTAMP.substr(0,10) + 
                        " KM totali percorsi stimati:" + row.KM_CUMULATIVI
                        };
    request({
        method: 'POST',
        headers: {'Content-Type': 'application/json', 'Authorization': auth},
        url: 'https://mobile-a9d976a16.hana.ondemand.com/restnotification/application/it.ht.com.sap.tutorial.demoapp.Demo/',
        body: myJSONObject,
        json: true
    }, function(error,response,body){
        console.log('POST response: ' + response.statusCode);
    })
}