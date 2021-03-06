// Module Dependencies
var fs = require('fs');
var express = require('express'), format = require('util').format;
var date = new Date();
var path = require('path')
var app = module.exports = express();

//Database Dependencies
var redis = require("redis"), client = redis.createClient();

//Metrics Dependencies
var stats = require('measured').createCollection();

// Cluster Dependencies
var cluster = require('cluster');
var numCPUs = require('os').cpus().length;

//Configuration variables
var uploadDirectory = './uploads/';
var idLength = 10;

// Functions
function makeid()	{
    var id = "";
    var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    for( var i=0; i < idLength; i++ )	{
        id += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return id;
}

// Cluster generation
if (cluster.isMaster) {
  // Fork workers.
  for (var i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
  cluster.on('exit', function(worker, code, signal) {
  cluster.fork();
  console.log('worker ' + worker.process.pid + ' restarted after crash');
  });
} else {
	
	//BodyParser
	app.use(express.bodyParser({keepExtensions: true, uploadDir:uploadDirectory}))
	
	//Form (debug)
	app.get('/', function(req, res)	{
	  res.send('<form method="post" action="/upload" enctype="multipart/form-data">'
	    + '<p>Image: <input type="file" name="image" /></p>'
	    + '<p>Title: <input type="text" name="title" /></p>'
	     + '<input type="hidden" name="owner" value="CaptainMack" />'
	    + '<p><input type="submit" value="Upload" /></p>'
	    + '</form>');
	});
	
	/* View service
	* Used for serving images eg. ip/view?uid=image.jpg
	* will send image.jpg in the response
	*/
	app.get('/view', function(req, res)	{
		var uid = req.query.uid;
		client.hget(uid, "file", function (err, reply) {
	    	res.sendfile(uploadDirectory + reply.toString());
	    	client.hincrby(uid, "views", 1);
	    	stats.meter('viewsPerSecond').mark();
	    });		
	});
	
	/* Comment services
	* Used for viewing/saving comments
	*/
	/* User service
	* Used for creating/modifying/deleting users
	*/
	/*app.post('/user', function(req, res)	{
		var userName = req.body.userName.toString()
		
		stats.meter('usersCreatedPerSecond').mark();
	});*/
	
	/* Download service
	* Used for download images eg. ip/download?uid=image.jpg
	* will prompt the user to download the image
	*/
	app.get('/download', function(req, res)	{
		var uid = req.query.uid;
		client.hget(uid, "file", function (err, reply) {
			res.download(uploadDirectory + reply.toString());
			client.hincrby(uid, "downloads", 1);
			stats.meter('downloadsPerSecond').mark();
		});	
	});
	
	/* Statistics service
	* Used for showing statistics
	*/
	app.get('/statistics', function(req, res)	{
		var uid = req.query.uid;
		var returnJSON = { };
			client.hget(uid, "views", function (err, reply) {
				returnJSON.views = reply.toString();
				client.hget(uid, "downloads", function (err, reply) {
					returnJSON.downloads = reply.toString();
					client.hget(uid, "size", function (err, reply) {
						returnJSON.size = reply.toString();
						client.hget(uid, "date", function (err, reply) {
							returnJSON.date = reply.toString();
								res.json(200, returnJSON);
						});	
					});	
				});	
			});
	});
	
	/* Upload service
	* Files is sent through a POST, service will generate
	* random ID and rename file accordingly.
	*/
	app.post('/upload', function(req, res, next)	{
		var newID = makeid();
		client.hexists(newID, "file", function (err, reply) {
			if (reply.toString()==0) {
				var newFileName = newID + path.extname(req.files.image.name)
			  	fs.renameSync(req.files.image.path, uploadDirectory + newFileName);
			  	client.hset(newID, "file", newFileName);
			  	client.hset(newID, "views", 0);
			  	client.hset(newID, "downloads", 0);
			  	client.hset(newID, "score", 0);
			  	client.hset(newID, "title", req.body.title.toString());
			  	client.hset(newID, "owner", req.body.owner.toString());
			  	client.hset(newID, "size", req.files.image.size);
			  	client.hset(newID, "date", (new Date).getTime());
			  	res.set('Access-Control-Allow-Origin', '*');
			  	res.json(200, {imageID: newFileName});
			  	res.setHeader
			  	stats.meter('uploadsPerSecond').mark();
			  	console.log('Node ' + cluster.worker.id + ' processed ' + newFileName);
		  	}
		  });
	});
	
	/* Monitoring Service
	* Used for getting load-metrics from node clusters
	* WORK IN PROGRESS
	*/
	app.get('/metric', function(req, res)	{
		res.json(200, stats.toJSON());	
	});
	
	if (!module.parent)	{
	  	app.listen(80);
	  	console.log('Node ' + cluster.worker.id + ' started on ' + date.getHours() + ":" + date.getMinutes() + ":" + date.getSeconds() + ":" + date.getMilliseconds() +  " - " + date.getDate() + "/" + (date.getMonth()+1) + "/" + date.getFullYear());
	}

}


