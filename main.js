'use strict';

/*
 * Created with @iobroker/create-adapter v2.0.1
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');
const net = require("net");
const Json2iob = require("./lib/json2iob");

class PilightAPI extends utils.Adapter {

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
        // this.on('objectChange', this.onObjectChange.bind(this));
        // this.on('message', this.onMessage.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    /**
     * Is called when databases are connected and adapter received configuration.
     */
    async onReady() {
        // Initialize your adapter here
        this.conneted = this.connectTopi();

this.log.info('conneted: ' + this.conneted);

        await this.connectToWS();
        this.json2iob = new Json2iob(this);

        this.subscribeStates('*');

    }

    async connectTopi() {
            this.check = net.createConnection({ host: this.config.pilightip, port: this.config.pilightdaemonport }, () => {
            this.check.write('{"action": "identify"}\n');
        });
        await this.checkip = false;
        this.check.on('data', (data) => {
            try {
	         if (typeof data === "object") {
this.log.info("Object OK");
                    const jsondata = JSON.parse(data.toString("utf-8"));
	             if (typeof jsondata.status !== "undefined") {
this.log.info("Type OK");
	                 if (jsondata.status === "success") {
this.log.info("True OK");
	                     await this.checkip = true;
this.log.info("True OK: " + this.checkip);
                        }
	             }
	         }
            } catch (err) {
                this.log.error(err);
            }

            this.check.end();
        });

        this.check.on('end', () => {
            this.log.info('disconnected from server');
        });

        this.check.on('error', (err) => {
            throw err;
        });
this.log.info("True NOK: " + this.checkip);
        return await this.checkip;
    }

    async connectToWS() {
        this.client = net.createConnection({ host: this.config.pilightip, port: this.config.pilightdaemonport }, () => {
            this.client.write('{"action": "identify","options":{"core": 1,"receiver": 1,"config": 1,"forward": 1},"uuid": "0000-d0-63-00-000000","media": "all"}\n');
            this.client.write('{"action": "request config"}\n');
        });

        this.client.on('data', (data) => {
            try {
	         if (typeof data === "object") {
	             if (data.toString().includes('success', 'failure')) {

//this.log.info("Testen1: " + data.toString("utf-8"));

	                 const jsonMessage = data.toString("utf-8").replace(/\[/g, '').replace(/\]/g, '').replace(/\n/g, '');
	                 const loginval = JSON.parse(jsonMessage.split("}{")[0] + "}");
	                 const configval = JSON.parse("{" + jsonMessage.split("}{")[1]);
                        if(loginval.status === "success") {
                            this.log.info("Server connected!");


//this.log.info("Testen2: " + JSON.stringify(configval["config"]["devices"]));
//this.log.info("Testen3: " + JSON.stringify(configval["config"]["gui"]));


//const ha1 = {"Lamp1":{"protocol":"elro_800_switch","id":{"systemcode":14,"unitcode":1},"state":"on"}};
//const ha2 = {"Lamp1":{"name":"Stehlampe","group":"Steckdosen","media":"all"}};
//                    this.setObjectNotExistsAsync('devices', {
//                        type: "channel",
//                        common: {
//                            name: "devices",
//                        },
//                        native: {},
//                    });
//this.json2iob.parse('devices', ha1);


                            //const items = ['devices', 'rules', 'gui', 'settings', 'hardware', 'registry'];
                            const items = ['devices'];
                            for (let i=0; i<items.length; i++) {
                                if (Object.keys( configval["config"][items[i]] ).length > 0) {
                                    this.log.info("Create data point " + items[i] + ": " + Object.keys( configval["config"][items[i]] ).length);

                    //this.setObjectNotExistsAsync(items[i], {
                    //    type: "channel",
                    //    common: {
                    //        name: items[i],
                    //    },
                    //    native: {},
                    //});

                    //this.json2iob.parse(items[i], configval["config"][items[i]]);
                    //this.json2iob.parseduo(items[i], configval["config"][items[i]], configval["config"]["gui"]);


                                }
                            }
                        } else {
                            this.log.info("Server not connected!");
                            this.client.end();
                        }
	             } else {
	                 this.log.info("Connect failed!");
	                 this.client.end();
	             }
	         } else {
	             this.log.info("Can not data found!");
	             this.client.end();
	         }
            } catch (err) {
                this.log.error(err);
            }





	     //let jsonMessage = data.toString().replace(/\[/g, '').replace(/\]/g, '').replace(/\n/g, '');
	     //jsonMessage = jsonMessage.replace(/]/g,"");
            //this.log.info("Data1: " + jsonMessage);
            //this.log.info("Data2: " + data.toString());
            //this.log.info("Data3: " + data.toString());


	     //const loginval = JSON.parse(jsonMessage.split("}{")[0] + "}");
	     //const configval = JSON.parse("{" + jsonMessage.split("}{")[1]);
	     //const configval = "{" + jsonMessage.split("}{")[1];
	     //this.log.info("Data1: " + loginval.status);
	     //this.log.info("Data2: " + JSON.stringify(configval["config"]["gui"]));



            //const jsonMessage = data.toString();
            //jsonMessage = JSON.parse(jsonMessage);
            //this.log.info("status: " + jsonMessage.status);

            //this.json2iob.parse("Test", jsonMessage["status"]);
            //this.json2iob.parse("message", jsonMessage["message"]);



            
        });
        this.client.on('end', () => {
            this.log.info('disconnected from server');
        });

        this.client.on('error', (err) => {
            throw err;
        });
    }

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
        if (state) {
            // The state was changed
            this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
        } else {
            // The state was deleted
            this.log.info(`state ${id} deleted`);
        }
    }
}

if (require.main !== module) {
    // Export the constructor in compact mode
    /**
     * @param {Partial<utils.AdapterOptions>} [options={}]
     */
    module.exports = (options) => new PilightAPI(options);
} else {
    // otherwise start the instance directly
    new PilightAPI();
}