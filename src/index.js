'use strict'

const multiaddr = require('multiaddr')
const getConfig = require('./config')
const getRequestAPI = require('./request-api')

const isNode = !global.window

// -- Internal

function command (send, name) {
  return (opts, cb) => {
    if (typeof (opts) === 'function') {
      cb = opts
      opts = {}
    }
    return send(name, null, opts, null, cb)
  }
}

function argCommand (send, name) {
  return (arg, opts, cb) => {
    if (typeof (opts) === 'function') {
      cb = opts
      opts = {}
    }
    return send(name, arg, opts, null, cb)
  }
}

class API {
  constructor (host_or_multiaddr, port) {
    const config = getConfig()

    try {
      const maddr = multiaddr(host_or_multiaddr).nodeAddress()
      config.host = maddr.address
      config.port = maddr.port
    } catch (e) {
      config.host = host_or_multiaddr
      config.port = port || config.port
    }

    // autoconfigure in browser
    if (!config.host && !isNode) {
      const split = window.location.host.split(':')
      config.host = split[0]
      config.port = split[1]
    }

    this.send = getRequestAPI(config)
    this.Buffer = Buffer
  }

  // -- Interface

  add (files, opts, cb) {
    if (typeof (opts) === 'function' && cb === undefined) {
      cb = opts
      opts = {}
    }

    return this.send('add', null, opts, files, cb)
  }

  mount (ipfs, ipns, cb) {
    if (typeof ipfs === 'function') {
      cb = ipfs
      ipfs = null
    } else if (typeof ipns === 'function') {
      cb = ipns
      ipns = null
    }
    const opts = {}
    if (ipfs) opts.f = ipfs
    if (ipns) opts.n = ipns
    return this.send('mount', null, opts, null, cb)
  }

  ping (id, cb) {
    return this.send('ping', id, { n: 1 }, null, function (err, res) {
      if (err) return cb(err, null)
      cb(null, res[1])
    })
  }

  id (id, cb) {
    if (typeof id === 'function') {
      cb = id
      id = null
    }
    return this.send('id', id, null, null, cb)
  }

  get cat () {
    return argCommand(this.send, 'cat')
  }

  get ls () {
    return argCommand(this.send, 'ls')
  }

  get version () {
    return command(this.send, 'version')
  }

  get commands () {
    return command(this.send, 'commands')
  }

  get config () {
    return {
      get: argCommand(this.send, 'config'),
      set: (key, value, opts, cb) => {
        if (typeof (opts) === 'function') {
          cb = opts
          opts = {}
        }
        return this.send('config', [key, value], opts, null, cb)
      },
      show: cb => {
        return this.send('config/show', null, null, null, true, cb)
      },
      replace: (file, cb) => {
        return this.send('config/replace', null, null, file, cb)
      }
    }
  }

  get update () {
    return {
      apply: command(this.send, 'update'),
      check: command(this.send, 'update/check'),
      log: command(this.send, 'update/log')
    }
  }

  get diag () {
    return {
      net: command(this.send, 'diag/net')
    }
  }

  get block () {
    return {
      get: argCommand(this.send, 'block/get'),
      put: (file, cb) => {
        if (Array.isArray(file)) {
          return cb(null, new Error('block.put() only accepts 1 file'))
        }
        return this.send('block/put', null, null, file, cb)
      }
    }
  }

  get object () {
    return {
      get: argCommand(this.send, 'object/get'),
      put: (file, encoding, cb) => {
        if (typeof encoding === 'function') {
          return cb(null, new Error("Must specify an object encoding ('json' or 'protobuf')"))
        }
        return this.send('object/put', encoding, null, file, cb)
      },
      data: argCommand(this.send, 'object/data'),
      stat: argCommand(this.send, 'object/stat'),
      links: argCommand(this.send, 'object/links')
    }
  }

  get swarm () {
    return {
      peers: command(this.send, 'swarm/peers'),
      connect: argCommand(this.send, 'swarm/connect')
    }
  }

  get pin () {
    return {
      add: (hash, opts, cb) => {
        if (typeof opts === 'function') {
          cb = opts
          opts = null
        }

        this.send('pin/add', hash, opts, null, cb)
      },
      remove: (hash, opts, cb) => {
        if (typeof opts === 'function') {
          cb = opts
          opts = null
        }

        this.send('pin/rm', hash, opts, null, cb)
      },
      list: (type, cb) => {
        if (typeof type === 'function') {
          cb = type
          type = null
        }
        let opts = null
        if (type) opts = { type: type }
        return this.send('pin/ls', null, opts, null, cb)
      }
    }
  }

  get log () {
    return {
      tail: cb => this.send('log/tail', null, {enc: 'text'}, null, true, cb)
    }
  }

  get name () {
    return {
      publish: argCommand(this.send, 'name/publish'),
      resolve: argCommand(this.send, 'name/resolve')
    }
  }

  get refs () {
    const cmd = argCommand(this.send, 'refs')
    cmd.local = command(this.send, 'refs/local')

    return cmd
  }

  get dht () {
    return {
      findprovs: argCommand(this.send, 'dht/findprovs'),
      get: (key, opts, cb) => {
        if (typeof (opts) === 'function' && !cb) {
          cb = opts
          opts = null
        }

        return this.send('dht/get', key, opts, null, function (err, res) {
          if (err) return cb(err)
          if (!res) return cb(new Error('empty response'))
          if (res.length === 0) return cb(new Error('no value returned for key'))

          // Inconsistent return values in the browser vs node
          if (Array.isArray(res)) {
            res = res[0]
          }

          if (res.Type === 5) {
            cb(null, res.Extra)
          } else {
            cb(res)
          }
        })
      },
      put: (key, value, opts, cb) => {
        if (typeof (opts) === 'function' && !cb) {
          cb = opts
          opts = null
        }

        return this.send('dht/put', [key, value], opts, null, cb)
      }
    }
  }
}

exports = module.exports = API
