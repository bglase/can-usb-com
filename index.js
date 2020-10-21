/**
 *  Defines a class to interface via serialport to the Grid Connect CANUSB Com
 *
 * The class extends the nodeJS Duplex stream which makes it easy to connect
 * other message processor modules
 *
 * Copyright (c) 2020 Control Solutions LLC.  All Rights Reserved.
 *
 */


const { Duplex } = require('stream');

const SerialPort = require('serialport');

// Carriage return
const CR = '\r';

// default timeout for commands sent to the CAN-USB device
const DEFAULT_TIMEOUT = 2000;

// Default configuration used unless overridden by caller
const DEFAULT_OPTIONS = {

  // Serial port baud rate
  baudRate: 115200,

  canRate: 250000,

  samplePoint: 75,

  filters: [],

  loopback: false,
};



/**
 * Class definition we are exporting
 */
module.exports = class CanUsbCom extends Duplex {

  constructor(options) {

    super({ objectMode: true });

    this.setOptions(options);

    this.requestQueue = [];

    this.port = null;

    this.isReady = false;

    this._rxData = '';
  }

  // sets (or re-sets) the configuration options.
  setOptions(options) {

    // save for later use
    this.options = Object.assign(DEFAULT_OPTIONS, options);

  }

  // Returns a promise that resolves to a list of available serial ports
  list() {

    return SerialPort.list()
      .then(function(ports) {

        return (ports.filter(function(port) {
          // the CAN-USB-COM returns a particular device ID
          // so we filter for that before supplying the list to the
          // caller
          return port.vendorId === '0403' && port.productId === '6001';
        }));

      });
  }


  // Open the specified serial port and configure as directed
  // Returns a promise that resolves when the operation is complete
  open(port) {

    var me = this;

    return new Promise(function(resolve, reject) {

      let serialOptions = {
        baudRate: me.options.baudRate
      };

      // Do this last, since the caller will have their callback called
      // when the port is opened
      me.port = new SerialPort(port, serialOptions, function(err) {

        if (err) {
          reject(err);
        } else {

          me._configure()
            .then(function() {
              // success!
              me.isReady = true;
              me.emit('open');

              resolve();
            })
            .catch(function(err) {
              // configure failed
              reject(err);
            });
        }

      });

      // Call event handler on serial port error
      me.port.on('error', me._onSerialError.bind(me));

      // call the onData function when data is received
      me.port.on('data', me._onData.bind(me));

      // event when the port is closed or disconnected
      me.port.on('close', function(err) {

        me._flushRequestQueue();

        // pass up to our listeners.  If port was disconnected
        // (eg remove usb cable), err is an Error object with
        // err.disconnected = true.  We also get here if our
        // owner calls 'close'
        me.emit('close', err);

        me.isReady = false;
        me.port = null;
        this.push(null);
      });

    });

  }

  // Close the serial port and clean up
  close() {
    this._flushRequestQueue();
    if (this.isOpen()) {

      this.port.close();
    }
    this.port = null;
    this.isReady = false;

  }

  // Required function for cs-modbus GenericConnection
  isOpen() {
    return this.port && this.port.isOpen && this.isReady;
  }

  // Required function for cs-modbus GenericConnection
  isConnected() {
    return this.isOpen();
  }

  /**
   * Send a CAN packet
   *
   * @param {Object} msg   message to be sent
   * @param {number} msg.id   message ID to be sent
   * @param {Array|Buffer} msg.buf the data bytes for the message
   */
  write(msg) {

    let me = this;

    let buf = (Array.isArray(msg.buf)) ? Buffer.from(msg.buf) : msg.buf;

    if (buf.length <= 8) {

      let prefix = (me.options.loopback) ? '|' : ':';
      prefix += (msg.ext === true) ? 'X' : 'S';

      try {

        me.port.write(prefix + msg.id.toString(16) + 'N' + buf.toString('hex') + ';\r');

      } catch (err) {
        //console.log('CanUsbCom write error: ',msg, err );
        //
        // what to do here...
        // throw err;

      }

      me.emit('write', msg);

    } else {
      throw new Error('Tried to send invalid CAN data');
    }


  }

  // required functions for a readable stream, we don't need to do anything
  _read() {}

  // required functions for a writable stream, we don't need to do anything
  _write() {}

  // Sets up a to-do list to send configuration commands to the board
  _configure() {

    let me = this;

    // Enter configuration mode
    return me._sendAndWait(':CONFIG;' + CR, '#0#')
      .then(function() {

        // Set up CAN baud rate and sample point
        return me._sendAndWait(
          'set can port ' +
          me.options.canRate +
          ' ' + me.options.samplePoint + CR,
          '<A:(.*?)>');
      })

      // Set up input and output format
      .then(function() {
        return me._sendAndWait(
          'DEL CAN FILTER ALL' + CR,
          '<A:All filters deleted>');
      })

      // Set up input and output format
      .then(function() {

        if (me.options.filters.length > 0) {
          let filterList = '';

          me.options.filters.forEach(function(filter) {

            let type = filter.ext ? ' ext' : ' std';

            filterList = filterList + type + ' ' + filter.id;
            // filterList.push( me._sendAndWait(
            //   'SET CAN FILTER ' + type + ' ' + filter.id + ' ' + filter.mask  + CR,
            //   '<A:EOL=(.*?)>' ));
          });

          return me._sendAndWait(
            'SET CAN FILTER' + filterList + CR,
            '<A:(.*?)>');
        }

      })

      // Set up input and output format
      .then(function() {
        let filter = (me.options.filters.length > 0) ? 'ON' : 'OFF';

        return me._sendAndWait(
          'SET CAN CM FILTER=' + filter + ' EOL=NONE IFMT=ASCII OFMT=ASCII MODE=NORMAL' + CR,
          '<A:EOL=(.*?)>');
      })

      // Go to command mode (operational mode)
      .then(function() {
        return me._sendAndWait(
          'EXIT' + CR,
          '<A>');
      });

  }



  // Error out any requests we are waiting for
  _flushRequestQueue() {
    let me = this;

    me.requestQueue.forEach(function(request) {
      me.resolveRequest(request.regex, new Error('Port Closed'));
    });
  }

  // finds the first matching request in the queue and closes it out
  // by calling the callback, removing the timer if any, and
  // removing it from the queue
  _resolveRequest(regex, err) {

    let index = this.requestQueue.findIndex(function(item) {
      return item.regex === regex;
    });

    if (index > -1) {
      if (this.requestQueue[index].timer) {
        clearTimeout(this.requestQueue[index].timer);
      }

      this.requestQueue[index].cb(err);
      this.requestQueue.splice(index, 1);
    }
  }

  // Event handler for error reported by serial port
  _onSerialError(err) {
    // not really sure how to handle this in a more elegant way

    this.emit('error', err);
  }


  // Send to serial port and wait for response
  _sendAndWait(data, waitfor, timeout) {

    this.port.write(data);

    return this._waitFor(waitfor, timeout);

  }




  // wait for a message to be received, or a time interval to expire
  _waitFor(msg, timeout) {

    let me = this;

    return new Promise(function(resolve, reject) {

      let timer = setTimeout(function() {
        me.resolveRequest(msg, new Error('No Response to ' + msg));
      }, timeout || DEFAULT_TIMEOUT);

      let cb = function(err, result) {
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      };

      // put it on the list of things we are waiting for
      me.requestQueue.push({
        regex: msg,
        timer: timer,
        cb: cb
      });
    });
  }



  // Event handler that is triggered when a valid message arrives on the serial port
  _onData(data) {

    let me = this;

    me._rxData = me._rxData + data.toString();

    // If we are waiting for a response from the device, see if this is it
    if (this.requestQueue.length > 0) {

      let cmd = me.requestQueue[0];

      if (me._rxData.search(cmd.regex) > -1) {
        // found what we are looking for


        // Cancel the no-response timeout because we have a response
        if (cmd.timer !== null) {
          clearTimeout(cmd.timer);
          cmd.timer = null;
        }

        // Signal the caller with the response data
        if (cmd.cb) {
          cmd.cb(null, me._rxData);
        }

        // Remove the request from the queue
        me.requestQueue.shift();

        // discard all data (this only works because we only send one
        // command at a time...)
        me._rxData = '';
      }
    } else if (me.isReady) {

      let packets = me._rxData.split(';');

      if (packets.length > 0) {


        // save any extra data that's not a full packet for next time
        me._rxData = packets.pop();

        packets.forEach(function(packet) {

          let fields = packet.match(/:([SX])([0-9A-F]{1,8})N([0-9A-F]{0,16})/);

          if (fields) {

            let id = 0;
            let ext = false,
              data;

            try {

              data = Buffer.from(fields[3], 'hex');
              id = parseInt(fields[2], 16);

              if (fields[1] === 'X') {
                ext = true;
              }

            } catch (err) {
              // we sometimes get malformed packets (like an odd number of hex digits for the data)
              // I dunno why that is, so ignore them
              // console.log('onData error: ', fields, err);
            }

            if (id > 0) {
              // emit a standard (non-J1939) message
              me.push({
                id: id,
                ext: ext,
                buf: data
              });

            }

          }
        });
      }
    }
  }
};