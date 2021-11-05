'use strict';

/*
 * Created with @iobroker/create-adapter v2.0.1
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');
const net = require("net");
const Json2iob = require("./lib/json2iob");

class Pilightapi extends utils.Adapter {

    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    constructor(options) {
        super({
            ...options,
            name: 'pilightapi',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        // Initialize your adapter here
        this.setState("info.connection", false, true);
        this.config = {
            pilightip: this.config.pilightip || 'localhost',
            pilightdaemonport: this.config.pilightdaemonport || 5000
        };
        this.jsonString = "";
        this.countS = 0;
        this.json2iob = new Json2iob(this);
        this.subscribeStates('*');
        await this.connectToNet();
    }

    async connectToNet() {
        if (this.client) {
            this.client.end();
        }
        this.countS = 0
        this.client = net.createConnection({ host: this.config.pilightip, port: this.config.pilightdaemonport }, () => {
            this.client.write('{"action": "identify","options":{"core": 1,"receiver": 1,"config": 1,"forward": 1},"uuid": "0000-d0-63-00-000000","media": "all"}\n');
        });

        this.client.on('data', async (data) => {
            if (this.wsHeartbeatTimeout) {
                clearTimeout(this.wsHeartbeatTimeout);
            }
            this.wsHeartbeatTimeout = setTimeout(() => {
                this.log.info("Lost Socket connection. Reconnect Socket");
                this.client.end();
                setTimeout(() => {
                    this.connectToNet();
                }, 2000);
            }, 60 * 1000);
            try {
                const result = data.toString("utf-8").split('\n\n');
                if (result.length === 1) {
                    this.jsonString += data;
                    this.log.debug("Datafirst: " + this.jsonString.toString("utf-8"));
                } else {
                    this.jsonString += data;
                    this.jsonString.split('\n').forEach( async (v) => {
                        if (v) {
                            this.log.debug("Data: " + v.trim());
                            await this.jsonEvaluate(v.trim())
                        }
                    });
                    this.jsonString = "";
                }

                if (this.heartbeatInterval) {
                    clearInterval(this.heartbeatInterval);
                }
                this.heartbeatInterval = setInterval(() => {
                    this.log.debug("Send heartbeat!");
                    this.client.write('HEART\n');
                }, 10 * 1000);
            } catch (err) {
                this.log.error(err);
            }
        });

        this.client.on('end', () => {
            this.log.info('disconnected from server');
        });

        this.client.on('error', (err) => {
            this.log.error('Error: ' + err);
        });
    }

    /**
     * json string evaluate!
     * @param JSON -> Callback
     */
    async jsonEvaluate(JsonStr) {
        if(JsonStr === "BEAT") {
            this.log.debug("Heartbeat OK!");
            return true;
        }

        try {
             let jsonMessage = JSON.parse(JsonStr.replace(/\]/g, '').replace(/\[/g, '').replace(/\"on\"/g, '"true"').replace(/\"off\"/g, '"false"'));
             this.log.debug("Jsonparse: " + JSON.stringify(jsonMessage));

             if(jsonMessage.status === "success" && this.countS === 0) {
                  this.log.info("Server connected!");
                  this.client.write('{"action": "request config"}\n');
                  this.log.info("Send request for the config!");
                  this.setState("info.connection", true, true);
                  return true;
             }

             if(jsonMessage.status === "failure" && this.countS === 0) {
                  this.log.info("Server not connected!");
                  this.setState("info.connection", false, true);
                  return false;
             }

             if(jsonMessage.status === "success" && this.countS === 1) {
                  this.log.debug("Command was sent!");
                  return true;
             }

             if(jsonMessage.status === "failure" && this.countS === 1) {
                  this.log.debug("Command was not sent!");
                  return false;
             }

             if(jsonMessage.message === "config") {
                  //const items = ['devices', 'rules', 'gui', 'settings', 'hardware', 'registry'];
                  const items = ['devices'];
                  for (let i=0; i<items.length; i++) {
                       if (Object.keys( jsonMessage["config"][items[i]] ).length > 0) {
                            this.log.info("Create data point " + items[i] + ": " + Object.keys( jsonMessage["config"][items[i]] ).length);
                            this.setObjectNotExistsAsync(items[i], {
                                type: "channel",
                                common: {
                                    name: items[i],
                                },
                                native: {},
                            });
                            if (items[i] === 'devices') {
                                this.json2iob.parse(jsonMessage["config"]["gui"], items[i], jsonMessage["config"][items[i]]);
                            } else {
                                this.json2iob.parse("", items[i], jsonMessage["config"][items[i]]);
                            }
                       }
                  }
                  return true;
             }

             if(jsonMessage.action === "send") {
                  this.countS = 1;
                  this.log.debug("Send request for the config!");
                  return true;
             }

             if(jsonMessage.origin === "update") {
                  this.log.debug("Receive input!");
                  Object.keys(jsonMessage).forEach((n) => {
                  if(n === "values") {
                       Object.keys(jsonMessage[n]).forEach((v) => {
                           this.log.debug(this.namespace + ".devices." + jsonMessage["devices"] + "." + v);
                           this.getForeignObject(this.namespace + ".devices." + jsonMessage["devices"] + "." + v, async (err, obj) => {
                               if (!obj || !obj.common) {
                                   this.setObjectNotExists(this.namespace + ".devices." + jsonMessage["devices"] + "." + v, {
                                       type: 'state',
                                       common: {
                                           name: v,
                                           type: 'number',
                                           read: true,
                                           write: false,
                                           role: 'level',
                                           def: 0,
                                           desc: 'Create Timestamp'
                                       },
                                       native: {}
                                   });
                                   await this.sleep(2000);
                                   this.setState(this.namespace + ".devices." + jsonMessage["devices"] + "." + v, jsonMessage[n][v], true);
                               } else {
                                   this.setState(this.namespace + ".devices." + jsonMessage["devices"] + "." + v, jsonMessage[n][v], true);
                               }
                           });
                       });
                   }
               });
               return true;
             }

        } catch (err) {
            this.log.error(err);
            return false;
        }
    }

    /**
     * Sleep!
     * 
     */
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    /**
     * Is called when adapter shuts down - callback has to be called under any circumstances!
     * @param {() => void} callback
     */
    onUnload(callback) {
        try {
            this.setState("info.connection", false, true);
            clearInterval(this.heartbeatInterval);
            clearInterval(this.wsHeartbeatTimeout);
            callback();
        } catch (e) {
            callback();
        }
    }

    /**
     * Is called if a subscribed state changes
     * @param {string} id
     * @param {ioBroker.State | null | undefined} state
     */
    onStateChange(id, state) {
        if (state && !state.ack) {
            this.log.debug('Send id: ' + id);
            this.log.debug('Send state: ' + state.val);
            let states = null;
            const lastsplit = id.split('.')[id.split('.').length-1];
            const name = id.split('.')[id.split('.').length-2];
            this.log.debug('Send last: ' + lastsplit);
            if(lastsplit === "state") {
                states = (state.val) ? "on" : "off";
                this.client.write(JSON.stringify({
                    "action": "control",
                    "code": {
                        "device": name,
                        "state": states
                    }
                }));
            } else if(lastsplit === "dimlevel") {
                states = (state.val === 0) ? "off" : "on";
                this.client.write(JSON.stringify({
                    "action": "control",
                    "code": {
                        "device": name,
                        "state": states,
                        "values": {
                            "dimlevel": state.val
                        }
                    }
                }));
            } else {
                this.log.info("Command " + lastsplit + " not implemented");
                this.log.info("Path: " + lastsplit);
                this.log.info("Value: " + lastsplit);
            }
        }
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    module.exports = (options) => new Pilightapi(options);
} else {
    // otherwise start the instance directly
    new Pilightapi();
}