var util = require('util')
	, EventEmitter = require('events').EventEmitter
	, spawn = require('child_process').spawn
	, path = require('path')
	, cmdDir = process.env.ES_BIN || path.resolve(__dirname, 'EventStore')
	, cmd = path.resolve(cmdDir, 'EventStore.ClusterNode.exe')
	, opts = {
			cwd: cmdDir
		}
	, currentPort = 5001

module.exports = MemoryStore


function LogDebug(msg) {
	//console.log(msg)
}


function MemoryStore(done) {
	if(!(this instanceof MemoryStore)) {
    return new MemoryStore(done)
	}
	EventEmitter.call(this)

	var me = this
	initializeGesProcess()

	function initializeGesProcess() {
		var settings = getSettings()
			, es = spawn(cmd, getArgsArray(settings), opts)
			, isIntialized = false

		me._es = es

		es.stdout.on('data', function(data) {
			LogDebug('[LOG] : ' + data.toString())
			var logLine = data.toString()
			if(logLine.indexOf("'admin' user added to $users") !== -1) {
				isIntialized = true
				done(null, {
					host: settings.ip
				, port: settings.tcpPort
				})
			} else if(logLine.indexOf('Exit reason: Address already in use') !== -1) {
				me._removeHandlers()
				initializeGesProcess()
			}
		})

		es.stderr.on('data', function(data) {
			LogDebug('[ERR] : ' + data.toString())
			var err = data.toString()
			cb(data.toString())
			if(isIntialized) {
				me.emit('error', err)
				me._close()
			} else {
				done(err)
			}
		})

		es.on('close', function(signal) {
			LogDebug('passive close', arguments)
			me._removeHandlers()
		})

		es.on('exit', function(signal) {
			LogDebug('passive exit', arguments)
			me._removeHandlers()
		})

		es.on('error', function(err) {
			if(isIntialized) {
				me.emit('error', err)
				me._close()
			} else {
				done(err)
			}
		})
	}
}
util.inherits(MemoryStore, EventEmitter)

MemoryStore.prototype._close = function() {
	this._es.kill('SIGINT')
}

MemoryStore.prototype._removeHandlers = function() {
	this._es.removeAllListeners()
	this._es.stdin.removeAllListeners()
	this._es.stdout.removeAllListeners()
}

MemoryStore.prototype.addConnection = function(con) {
	this._con = con
}

MemoryStore.prototype.cleanup = function(cb) {
	var me = this
		, isClosed = false
	this._es.removeAllListeners('close')
	this._es.removeAllListeners('error')

	function completeClose(msg) {
		me._removeHandlers()
		if(!isClosed) {
			if(msg) {
				LogDebug('COMPLETE CLOSE ERROR: ' + msg)
			}
			isClosed = true
			cb()
		}
	}

	this._es.stdout.on('data', function(data) {
		LogDebug(data.toString())
	})

	this._es.on('close', function(signal) {
		LogDebug('in close handler',arguments)
		completeClose()
	}).on('exit', function(signal) {
		LogDebug('in exit handler',arguments)
		completeClose()
	}).on('error', function(err) {
		completeClose('Had error closing')
	})

	setTimeout(function() {
		completeClose('Close timeout')
	}, 5000)

	function closeGes() {
		me._close()
		if(this._con) {
			this._con.removeAllListeners()
		}
	}

	if(this._con) {
		LogDebug('closing connection')
		this._con.on('close', closeGes)
		this._con.close()
	} else {
		closeGes()
	}
}

function getSettings() {
	//currentPort += 1
	return {
		ip: '127.0.0.1'
	, tcpPort: currentPort
	}
}

function getArgsArray(args) {
	var allArgs = ['--mem-db']
	if(args.ip) allArgs.push('--ext-ip=' + args.ip) 
	if(args.tcpPort) {
		allArgs.push('--ext-tcp-port=' + args.tcpPort) 
		allArgs.push('--ext-http-port=' + (args.tcpPort + 1000))
	}
	return allArgs
}
