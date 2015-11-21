'use strict'

const multiaddr = require('multiaddr')
const Wreck = require('wreck')
const ndjson = require('ndjson')

const getConfig = require('./config')
const getRequestAPI = require('./request-api')

class IpfsAPI {
  constructor (host_or_multiaddr, port) {
    this._config = getConfig()

    try {
      const maddr = multiaddr(host_or_multiaddr).nodeAddress()
      this._config.host = maddr.address
      this._config.port = maddr.port
    } catch (e) {
      this._config.host = host_or_multiaddr
      this._config.port = port || this._config.port
    }

    // autoconfigure in browser
    if (!this._config.host &&
        typeof window !== 'undefined') {
      const split = window.location.host.split(':')
      this._config.host = split[0]
      this._config.port = split[1]
    }

    this.send = getRequestAPI(this._config)
    this.Buffer = Buffer
  }

  // -- Internal
  _command (name) {
    return (opts, cb) => {
      if (typeof (opts) === 'function') {
        cb = opts
        opts = {}
      }
      return this.send(name, null, opts, null, cb)
    }
  }

  _argCommand (name) {
    return (arg, opts, cb) => {
      if (typeof (opts) === 'function') {
        cb = opts
        opts = {}
      }
      return this.send(name, arg, opts, null, cb)
    }
  }

  // -- Interface

  add (files, opts, cb) {
    if (typeof (opts) === 'function' && cb === undefined) {
      cb = opts
      opts = {}
    }

    if (typeof files === 'string' && files.startsWith('http')) {
      Wreck.request('GET', files, null, (err, res) => {
        if (err) return cb(err)

        this.send('add', null, opts, res, cb)
      })

      return
    }

    this.send('add', null, opts, files, cb)
  }

  get cat () {
    return this._argCommand('cat')
  }

  get ls () {
    return this._argCommand('ls')
  }

  get config () {
    return {
      get: this._argCommand('config'),
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
      apply: this._command('update'),
      check: this._command('update/check'),
      log: this._command('update/log')
    }
  }

  get version () {
    return this._command('version')
  }

  get commands () {
    return this._command('commands')
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

  get diag () {
    return {
      net: this._command('diag/net'),
      sys: this._command('diag/sys')
    }
  }

  get block () {
    return {
      get: this._argCommand('block/get'),
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
      get: this._argCommand('object/get'),
      put: (file, encoding, cb) => {
        if (typeof encoding === 'function') {
          return cb(null, new Error("Must specify an object encoding ('json' or 'protobuf')"))
        }
        return this.send('object/put', encoding, null, file, cb)
      },
      data: this._argCommand('object/data'),
      stat: this._argCommand('object/stat'),
      links: this._argCommand('object/links'),
      patch: (file, opts, cb) => {
        return this.send('object/patch', [file].concat(opts), null, null, cb)
      }
    }
  }

  get swarm () {
    return {
      peers: this._command('swarm/peers'),
      connect: this._argCommand('swarm/connect')
    }
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
      tail: cb => {
        this.send('log/tail', null, {}, null, false, (err, res) => {
          if (err) return cb(err)
          cb(null, res.pipe(ndjson.parse()))
        })
      }
    }
  }

  get name () {
    return {
      publish: this._argCommand('name/publish'),
      resolve: this._argCommand('name/resolve')
    }
  }

  get refs () {
    const refs = this._argCommand('refs')
    // TODO: Deprecate this and find a better solution
    refs.local = this._command('refs/local')

    return refs
  }

  get dht () {
    return {
      findprovs: this._argCommand('dht/findprovs'),

      get: (key, opts, cb) => {
        if (typeof (opts) === 'function' && !cb) {
          cb = opts
          opts = null
        }

        return this.send('dht/get', key, opts, null, (err, res) => {
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

exports = module.exports = IpfsAPI
