
var owfs = require('owfs'),
	mqtt = require('mqttjs'),
  os = require('os'),
  Log = require('./lib/log');

var config = require('./config.json'),
    log = new Log(),
    deviceinfo={};
    
log.level=config.loglevel || 3;

var owclient = new owfs.Client(config.owfs.host, config.owfs.port);
var valid_keys=['/temperature', '/PIO'];

function readDevices(mqclient){
  try{
    log.info('reading devices');
    owclient.dirall("/", function(nodes){
      //console.log(nodes);
      nodes.forEach(function(nod){
        readDevice(nod, mqclient);
      });	
    });
  }
  catch (e) {
    log.error(e); 
  }
}


function readDevice(nod, mqclient){
	//console.log("processing", nod);
  try{
    owclient.dir(nod, function(values){
      values.forEach(function(value){
        value = value.replace(nod, '');
        //console.log(value);
        if(valid_keys.indexOf(value)>=0){
          readValue(nod, value, mqclient);
        }
      });
    });
  }
  catch (e) {
    log.error(e);
  }
		
}

function readValue(nod, value, mqclient) {
	var vp = nod + value;
	var topic = 'owfs' + vp;
  if(deviceinfo.hasOwnProperty(nod)){
    if(deviceinfo[nod].hasOwnProperty('alias')){
      topic = deviceinfo[nod].alias + value;
    }
  }
  else{
    deviceinfo[nod]={alias: config.topic.prefix + nod};
    mqclient.publish({topic:"/config/owfs/deviceinfo" + nod + "/alias", retain:true, payload:config.topic.prefix + nod});
  }
  if(! deviceinfo[nod].hasOwnProperty(value.substring(1))){
    mqclient.publish({topic:"/config/owfs/deviceinfo" + nod + value, retain:true, payload:"ro"});
  }
    
  topic='/raw/' + topic;
	//console.log("reading", vp);
	owclient.read(vp, function(result){
		log.debug(topic, result);
		mqclient.publish({topic:topic, payload:result, retain:true});
	});
}

function hartbeat(mqclient){
  mqclient.publish({topic:'/config/owfs/nodes/' + os.hostname() +  "/hartbeat", payload:(new Date).toJSON(), retain:true});  
}

console.log(config);

mqtt.createClient(config.mqtt.port, config.mqtt.host, function(err, client){
	if(err){
		log.error(err);
		process.exit(1);
	}
  log.info('knott-driver-owfs starting');
	client.connect({keepalive:30000});
	client.on('connack', function(packet){
		log.info("Connected to mqtt");
    client.subscribe({topic:'/config/owfs/deviceinfo/#'});
		//readDevices(client);
		setInterval(readDevices, config.refresh, client );
    hartbeat(client);
    setInterval(hartbeat, 30000, client);
	});

	client.on('close', function() {
		log.info("mqtt connection closed");
	});
	client.on('error', function(e) {
		log.error("mqtt error", e);
	});	
 
  client.on('suback', function(packet) {
    log.debug("suback", packet);
  });

  //listen for the subscribed topics so that 
  //we can get a proper alias for the device.
  client.on('publish', function(packet){
    log.debug(packet.topic, packet.payload);
    var topic = packet.topic.split('/');
    var device = '/' + topic[4];
    var key = topic[5];
    var value = packet.payload;
    if(typeof(deviceinfo[device]) === 'undefined'){
      deviceinfo[device]={};
    }
    deviceinfo[device][key] = value;
    log.info(device, key, 'set to', value );
  });
});

