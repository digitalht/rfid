/**
 * Scan2Action Library - node module version
 * Logging class
 *
 * @version 2.1.1
 * @author Fedex Terraneo
 *
 * @class
 */
var Log = function() {

    this.LEVEL_ERROR =                  0;
    this.LEVEL_WARNING =                1;
    this.LEVEL_INFO =                   2;
    this.LEVEL_DEBUG =                  3;
    this.LEVEL_KEYSTROKES =             9;

    // actual logging level
    this.LEVEL =                        this.LEVEL_DEBUG;

    this.redirectingErrors =            false;

};

/**
 * writes a log line to the console according to actual log level
 *
 * @param level
 * @param application
 * @param caller
 * @param logString
 */
Log.prototype.write = function(level, application, caller, logString) {
    if(level > this.LEVEL) return;

    this.onLogWrite(level, application, caller, logString);

    var logOutput;

    if (logString === null) {
        logOutput = Date.now() + ' - ' + process.pid + ' - [' + application + '] - ' + caller + '()';
    }
    else {
        logOutput = Date.now() + ' - ' + process.pid + ' - [' + application + '] - ' + caller + '(): ' + logString;
    }

    if (typeof(console) !== 'undefined') {
        switch(level) {

            case this.LEVEL_ERROR:
                console.error(logOutput);
                break;
            
            case this.LEVEL_WARNING:
                console.warn(logOutput);
                break;

            default:
                console.log(logOutput);
        }
    }

};

/**
 * Event called when a log is being written.
 * Can use in your application to do further things (ex. write to a database)
 * @param level
 * @param application
 * @param caller
 * @param logString
 */
Log.prototype.onLogWrite = function(level, application, caller, logString) {

};

/**
 * If activated, redirects the javascript error output to alerts
 * @param redirect
 */
Log.prototype.redirectErrors = function(redirect) {
    this.redirectingErrors = redirect;
    if (this.redirectingErrors) {
        window.onerror = function(msg, url, line) {
            alert(msg + '\n' + url + ' - on line ' + line);
            return false;
        };
    }
    else {
        window.onerror = function(msg, url, line) {
            return false;
        };
    }
};


module.exports = new Log();