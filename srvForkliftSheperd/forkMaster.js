var cp = require('child_process');
var config = require('../common/config');

config.controllers.forEach(function(writerConfig){
	cp.fork('srvForkliftSheperd.js',[writerConfig.id, writerConfig.ip]);
});
