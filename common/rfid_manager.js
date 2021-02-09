/**
 * RFID Manager module
 * @author FX
 * @version 0.2.2
 * 
 * @requires log.js
 * @requires odata
 * @requires request
 */
var log = require('./log');
var request = require('request');
var config  = require('../common/config');
//var odata = require('odata');
//var ws = require('ws');

var MODULE = 'rfid_manager.js';

var ENDPOINT_BASE_URL = config.gateway.url;
var ENDPOINT_USER = config.gateway.user;
var ENDPOINT_PW = config.gateway.pw;
var UNIT = config.gateway.unit;

/**
 * @class RFIDEvent
 * RFID Functional Event Manager
 * 
 * @constructor
 * @param eventData
 */
var RFIDEvent = function(eventData, wsocket) {
    this.rawData = eventData;
    this.wsocket = wsocket;

    // parsing event json data
    this.type = eventData.EVENT;
    this.controllerID = eventData.CONTROLLER_ID;
    this.tagData = eventData.TAG_DATA;
    //this.ts = eventData.INTERNAL_TIMESTAMP;
    this.ts = new Date(Date.parse(eventData.INTERNAL_TIMESTAMP));
    this.tagId = eventData.TAG_ID;
    if (eventData.valid === "X") this.isValid = true; else this.isValid = false;
    this.gateId = eventData.GATE_ID;
    this.positionFrom = eventData.POSITION_FROM;
    this.positionTo = eventData.POSITION_TO;

    // adding to packed data   
    this.data = {}; 
    this.data.type = eventData.EVENT;
    this.data.controllerID = eventData.CONTROLLER_ID;
    this.data.tagData = eventData.TAG_DATA;
    //this.data.ts = eventData.INTERNAL_TIMESTAMP;
    this.data.ts = new Date(Date.parse(eventData.INTERNAL_TIMESTAMP));
    this.data.tagId = eventData.TAG_ID;
    this.data.isValid = this.isValid;
    this.data.gateId = eventData.GATE_ID;
    this.data.positionFrom = eventData.POSITION_FROM;
    this.data.positionTo = eventData.POSITION_TO;
};

/**
 * gets the event type
 * @returns {string}
 */
RFIDEvent.prototype.getType = function() {
    return this.type;
};

/**
 * gets the event generator id
 * @returns {number}
 */
RFIDEvent.prototype.getControllerID = function() {
    return this.controllerID;
};

/**
 * gets the event generator tag data
 * @returns {string}
 */
RFIDEvent.prototype.getTagData = function() {
    return this.data.tagData;
};

// merdata on

//get pallet info call config
var headersGetPalletStatus = {
    "Authorization": "Basic " + new Buffer( ENDPOINT_USER + ":" + ENDPOINT_PW).toString("base64"),
    "Content-Type": "application/json",
    "Accept": "application/json"
};

var baseOptsGetPalletStatus = {
    url: ENDPOINT_BASE_URL + "GET_PALLET_STATUS?UNIT='" + UNIT + "'&PALLET_ID='",
    headers: headersGetPalletStatus,
    json: true
};

//goods movement call config
var headersSetGoodsMovement = {
    "Authorization": "Basic " + new Buffer(ENDPOINT_USER + ":" +  ENDPOINT_PW).toString("base64"),
    "Content-Type": "application/json",
    "Accept": "application/json"
};

var baseOptsSetGoodsMovement = {
    url: ENDPOINT_BASE_URL + "UPD_SET_ODAINV_QTY_RFID?PALLET_ID='",
    headers: headersSetGoodsMovement,
    json: true
};

//goods movement call config
var headersSetProdMovement = {
    "Authorization": "Basic " + new Buffer(ENDPOINT_USER + ":" + ENDPOINT_PW).toString("base64"),
    "Content-Type": "application/json",
    "Accept": "application/json"
};

var baseOptsSetProdMovement = {
    url: ENDPOINT_BASE_URL + "UPD_TRASF_TAG_PROD?UNIT='" + UNIT + "'&TAG_ID='",
    headers: headersSetProdMovement,
    json: true
};


// merdata off

/**
 * launch the functional event.
 * contains logic operations required by event types
 */
RFIDEvent.prototype.launch = function() {
	var opts;
    var requestCallback;
    
    switch(this.type) {
        case 'ON':

            opts = JSON.parse(JSON.stringify(baseOptsGetPalletStatus));
            opts.url = baseOptsGetPalletStatus.url + this.tagData + "'";
            requestCallback = (function (error, response, body) {

                if (!error && response.statusCode === 200) {
					
					log.write(log.LEVEL_INFO,MODULE,'request','GET_PALLET_STATUS OK ');
					
                    this.data.customData = {};
                    this.data.customData.status = body.d.GET_PALLET_STATUS.STATUS;
                    this.data.customData.qty = body.d.GET_PALLET_STATUS.QTY;
                    this.data.customData.um = body.d.GET_PALLET_STATUS.UM;
                    this.data.customData.material = body.d.GET_PALLET_STATUS.PART_NUMBER;
                    this.data.customData.descr = body.d.GET_PALLET_STATUS.PART_DESCR;

                    this.wsocket.send(JSON.stringify(this.data));
                } else {
                    log.write(log.LEVEL_ERROR,MODULE,'request','GET_PALLET_STATUS ERROR: ' + error + ' statuscode = ' + response.statusCode);
                }
            }).bind(this);
            log.write(log.LEVEL_INFO,MODULE,'request','GET_PALLET_STATUS launching: ' + opts.url);
            
            request(opts, requestCallback);


            break;

        case 'OFF':
            
            if(this.positionTo === config.tag.prod) {

                opts = JSON.parse(JSON.stringify(baseOptsSetProdMovement));
                opts.url = baseOptsSetProdMovement.url + this.tagData + "'" + "&LOCATION='" + this.positionTo + "'" + "&USER_ID='" + this.controllerID + "'";
                requestCallback = (function (error, response, body) {

                    if (!error && response.statusCode === 200) {
                        log.write(log.LEVEL_INFO,MODULE,'request','Production movement request to NWGateway: ' + body.d.UPD_TRASF_TAG_PROD.RETURN_CODE);
                    } else {
                        log.write(log.LEVEL_ERROR,MODULE,'request','Error in goods movement request: ' + error);
                    }
        
                });
                request(opts, requestCallback);
            }
            else if(this.positionFrom !== this.positionTo && this.positionTo !== "") {    

                opts = JSON.parse(JSON.stringify(baseOptsSetGoodsMovement));
                opts.url = baseOptsSetGoodsMovement.url + this.tagData + "'" + "&LOCATION='" + this.positionTo + "'";
                requestCallback = (function (error, response, body) {

                    if (!error && response.statusCode === 200) {
                        log.write(log.LEVEL_INFO,MODULE,'request','Goods movement request to NWGateway: ' + body.d.UPD_SET_ODAINV_QTY_RFID.RETURN_CODE);
                    } else {
                        log.write(log.LEVEL_ERROR,MODULE,'request','Error in goods movement request: ' + error);
                    }
        
                });
                request(opts, requestCallback);
            }
            
            this.wsocket.send(JSON.stringify(this.data));
            break;

        case 'MOVE':
            
            this.wsocket.send(JSON.stringify(this.data));
            break;

        case 'CELL':
        
            this.wsocket.send(JSON.stringify(this.data));
            break;

        default:
    }

    
};

/**
 * @class RFIDRead
 * RFID read entry
 * 
 * @constructor
 * @param {string} timestamp 
 * @param {number} controllerID 
 * @param {string} tagID 
 * @param {string} tagData 
 * @param {string} antennaNo 
 */
var RFIDRead = function (timestamp, controllerID, tagID, tagData, antennaNo) {
    this.timestamp = timestamp;
    this.controllerID = controllerID;
    this.tagID = tagID;
    this.tagData = tagData;
    this.antennaNo = antennaNo;
};

/**
 * gets the timestamp
 * @returns {string}
 */
RFIDRead.prototype.getTimestamp = function () {
    return this.timestamp;
};

/**
 * gets the read source controller id number
 * @returns {number}
 */
RFIDRead.prototype.getControllerID = function () {
    return this.controllerID;
};

/**
 * gets the tag id
 * @returns {string}
 */
RFIDRead.prototype.getTagID = function () {
    return this.tagID;
};

/**
 * gets the tag data
 * @returns {string}
 */
RFIDRead.prototype.getTagData = function () {
    return this.tagData;
};

/**
 * gets the antenna number
 * @returns {string}
 */
RFIDRead.prototype.getAntennaNo = function () {
    return this.antennaNo;
};

/**
 * @class RFIDManager
 * RFID Event Manager Class
 */
var RFIDManager = function () {

    // header positions
    this.POS_CONTROLLER_ID = 3;
    this.POS_DATASETS_COUNT = 9;             // todo: now considering only one byte (instead of 2) for number of datasets!
    this.LEN_DATASETS_COUNT = 1;
    this.POS_DATASETS_START = 10;

    // relative dataset positions (datasets can be repeated)
    this.POS_DATASET_LENGTH = 1;
    this.POS_TAG_ID = 7;
    this.LEN_TAG_ID = 12;
    this.POS_TAG_DATA = 22; 
    //this.LEN_TAG_DATA = 10;                 // considering FIXED tag data length!
    this.POS_TAG_DATA_LEN = 20;             // position of data length in blocks (considering only one byte instead of 2)
    this.POS_TAG_DATA_BLOCK_LEN = 21;       // position of dimension of data block
    this.POS_TIMESTAMP = 22;
	this.POS_ANTENNA_NO = 27;
	
};

/**
 * parses the binary array from controller to human readable objects
 * @param {binary} array binary array from controller
 * @returns {objects} array of RFIDRead
 */
RFIDManager.prototype.parse = function (array) {
    var datasetsCount =  parseInt(array[this.POS_DATASETS_COUNT]);
    var readSet = [];
    var previousDatasetLength = 0;
    var datasetOffset = this.POS_DATASETS_START;
    var controllerID = parseInt(array[this.POS_CONTROLLER_ID]);
    
    var datasetLength, datablockLength;
    var tagId = '', tagData = '', timestampString = '', antennaNo = '';
    var seconds;
    var h,m,s,ms;

    log.write(log.LEVEL_INFO,'RFIDManager','parse','parsing stream - datasets count: ' + datasetsCount);

    for (var i=0;i<datasetsCount;i++) {
    	
    	//try{

        datasetOffset += previousDatasetLength;

        datasetLength = parseInt(array[datasetOffset + this.POS_DATASET_LENGTH]);

        datablockLength = parseInt(array[datasetOffset + this.POS_TAG_DATA_LEN]) * parseInt(array[datasetOffset + this.POS_TAG_DATA_BLOCK_LEN]);

        // parsing timestamp
        h = "00" + parseInt(array[datasetOffset + datablockLength + this.POS_TIMESTAMP]);
        m = "00" + parseInt(array[datasetOffset + datablockLength + this.POS_TIMESTAMP + 1]);
        seconds = array.readUInt16BE(datasetOffset + datablockLength + this.POS_TIMESTAMP + 2) / 1000;
        s = "00" + Math.floor(seconds);
        ms = "000" + ("" + seconds).split(".")[1];
        timestampString = h.substr(h.length-2) + ':' + m.substr(m.length-2) + ':' + s.substr(s.length-2) + '.' + ms.substr(ms.length-3);

        // parsing tagId
        tagId = '';
        for (var j=0;j<this.LEN_TAG_ID;j++) {
            //tagId = '' + tagId + String.fromCharCode(parseInt(array[datasetOffset + this.POS_TAG_ID + j]));
            tagId = '' + tagId + parseInt(array[datasetOffset + this.POS_TAG_ID + j]);
        }

        // parsing tagData - TODO: now considering only ONE datablock!
        tagData = '';
        for (var k=0;k<datablockLength;k++) {
            if(parseInt(array[datasetOffset + this.POS_TAG_DATA + k]) !== 0)
                tagData = '' + tagData + String.fromCharCode(parseInt(array[datasetOffset + this.POS_TAG_DATA + k]));
        }
        
        // parsing Antenna no.
        antennaNo = parseInt(array[datasetOffset + datablockLength + this.POS_ANTENNA_NO]);

        readSet.push(new RFIDRead(
            timestampString,
            controllerID,
            tagId,
            tagData,
            antennaNo
        ));

        previousDatasetLength = datasetLength;
    	//}
    	//catch (err){
    		//log.write(log.LEVEL_ERROR, MODULE,'parse','parsing error ' + error);
    	//}
    }

    return readSet;

};

module.exports.RFIDRead = RFIDRead;
module.exports = new RFIDManager();
module.exports.RFIDEvent = RFIDEvent;