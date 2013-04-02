
var owfs = require('owfs'),
  driver = require('knott-driver'),
	Mq = driver.Mq,
  os = require('os'),
  log = driver.log,
  Pid = driver.Pid;

var config = require('./config.json'),
    pid = new Pid(config);
    deviceinfo={};

process.title = 'knott-owfs';
pid.downgrade();

log.level=config.loglevel || 3;

var owclient = new owfs.Client(config.owfs.host, config.owfs.port);
var valid_keys=['/temperature', '/PIO', '/power', '/temphigh', '/templow', '/type', '/sensed'];

function readDevices(){
  try{
    log.info('reading devices');
    owclient.dirall("/", function(nodes){
      //console.log(nodes);
      nodes.forEach(function(nod){
        readDevice(nod);
      });	
    });
  }
  catch (e) {
    log.error(e); 
  }
}


function readDevice(nod){
	//console.log("processing", nod);
  try{
    owclient.dir(nod, function(values){
      values.forEach(function(value){
        value = value.replace(nod, '');
        //console.log(value);
        if(valid_keys.indexOf(value)>=0){
          readValue(nod, value);
        }
      });
    });
  }
  catch (e) {
    log.error(e);
  }
		
}

function readValue(device, property) {
  var dpkey = device + property;
 // device = device.replace('/', '');
  //property = property.replace('/', '');
	var topic = config.topic.prefix + dpkey;
  //check for alias
  if(deviceinfo.hasOwnProperty(dpkey)){
    if(deviceinfo[dpkey].hasOwnProperty('alias')){
      topic = deviceinfo[dpkey].alias;
    }
  }
  else{
    deviceinfo[dpkey]={alias: config.topic.prefix + dpkey};
    mq.set(dpkey, 'alias', config.topic.prefix + dpkey);
  }
  //if access to default if missing
  if(! deviceinfo[dpkey].hasOwnProperty('access')){
    mq.set(dpkey,  'access', 'r'); //default to read-only
    deviceinfo[dpkey].access = 'r';
  }
    
  topic='/raw/' + topic;
	//console.log("reading", dpkey);
	owclient.read(dpkey, function(result){
		log.debug(topic, result);
		mq.publish(topic, result);
	});
}

function hartbeat(mqclient){
  mq.set('heartbeat', (new Date()).toJSON());
}

log.debug(config);
var mq = new Mq('owfs');
mq.on('ready', function () {
  log.info('mqtt connected');
  readDevices();
	setInterval(readDevices, config.refresh);
});

mq.on('config', function(device, property, value) {
  if(typeof(deviceinfo[device]) === 'undefined'){
    deviceinfo[device]={};
  }
  deviceinfo[device][property] = value;
  log.info(device, property, 'set to', value );
});

