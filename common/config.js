var config = {};

config.controller = {};
config.antenna    = {};
config.gateway    = {};
config.hdb        = {};
config.ws         = {};
config.tag        = {};

//-----------------------------------HT ON-PREMISE-----------------------------------------//
// HT controller data
config.controller.ports = [9000];
config.controller.id    = [111];
config.controller.ip    = ['10.20.30.20'];

config.controllers = [
    {
        id: 111,
        port: 9000,
        ip: '10.20.30.20'
    }
];

//HT Antennas
config.antenna.main     = 1;
config.antenna.lateral  = 1;

//HT Gateway
//config.gateway.url      = 'http://vhsapht01.domht.local:8020/sap/opu/odata/sap/zgw_jaims_gateway_srv/';
config.gateway.url      = 'http://10.104.60.3:8020/sap/opu/odata/sap/zgw_jaims_gateway_srv/';
config.gateway.user     = 'SVLADM';
config.gateway.pw       = 'Developer';
config.gateway.unit     = 'HT';

//HT Hana Express
config.hdb.ip           = '10.144.150.10';
config.hdb.instance      = '00';
config.hdb.dbname       = 'SYSTEMDB';
config.hdb.user         = 'XSA_DEV';
config.hdb.pw           = 'Progamer666';
config.hdb.port         = '30013';

//HT Node Web Socket
config.ws.port          = '9001';

config.tag.prod         = 'RFID-PROD2'

//-----------------------------------END HT ON-PREMISE-----------------------------------------//

//-----------------------------------CAT-----------------------------------------//

// CAT controllers data
/*
config.controller.ports = [9010,9011];
config.controller.id    = [200,201];
config.controller.ip    = ['172.28.84.181', '172.28.84.180'];
*/

/*
// CAT
config.controllers = [
    {
        id: 200,
        port: 9010,
        ip: '172.28.84.181'
    },
    {
        id: 201,
        port: 9011,
        ip: '172.28.84.180'
    }
];
*/

//-----------------------------------END CAT-----------------------------------------//

module.exports = config;