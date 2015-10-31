'use strict'

const Promise = require('promise')
const http = require('http')
const qs = require('querystring')
const getFilesStream = require('./get-files-stream')

function request (config, path, args, opts, files, buffer) {
  return new Promise(function (resolve, reject) {
    if (Array.isArray(path)) path = path.join('/')

    opts = opts || {}

    if (args && !Array.isArray(args)) args = [args]
    if (args) opts.arg = args
    if (typeof buffer === 'undefined') {
      buffer = false
    }

    var query, stream, contentType
    contentType = 'application/json'

    if (files) {
      stream = getFilesStream(files, opts)
      if (!stream.boundary) {
        throw new Error('no boundary in multipart stream')
      }
      contentType = 'multipart/form-data; boundary=' + stream.boundary
    }

    // this option is only used internally, not passed to daemon
    delete opts.followSymlinks

    opts['stream-channels'] = true
    query = qs.stringify(opts)

    var reqo = {
      method: files ? 'POST' : 'GET',
      host: config.host,
      port: config.port,
      path: config['api-path'] + path + '?' + query,
      headers: {
        'User-Agent': config['user-agent'],
        'Content-Type': contentType
      },
      withCredentials: false
    }

    var req = http.request(reqo, function (res) {
      var data = ''
      var objects = []
      var stream = !!res.headers && !!res.headers['x-stream-output']
      var chunkedObjects = !!res.headers && !!res.headers['x-chunked-output']

      if (stream && !buffer) return resolve(res)
      if (chunkedObjects && buffer) return resolve(res)

      res.on('data', function (chunk) {
        if (!chunkedObjects) {
          data += chunk
          return data
        }

        try {
          var obj = JSON.parse(chunk.toString())
          objects.push(obj)
        } catch (e) {
          chunkedObjects = false
          data += chunk
        }
      })
      res.on('end', function () {
        var parsed

        if (!chunkedObjects) {
          try {
            parsed = JSON.parse(data)
            data = parsed
          } catch (e) {}
        } else {
          data = objects
        }

        if (res.statusCode >= 400 || !res.statusCode) {
          if (!data) data = new Error()
          return reject(data)
        }

        return resolve(data)
      })
      res.on('error', reject)
    })

    req.on('error', reject)

    if (stream) {
      stream.pipe(req)
    } else {
      req.end()
    }
  })
}

exports = module.exports = function getRequestAPI (config) {
  return request.bind(null, config)
}
