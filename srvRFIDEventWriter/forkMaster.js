var cp = require('child_process');
var config = require('../common/config');

config.controllers.forEach(function(writerConfig){
	cp.fork('srvRFIDEventWriter.js',[writerConfig.port]);
});
