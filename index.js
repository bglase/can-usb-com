// Defines a NodeJS module to interface via serialport to the Grid Connect CANUSB Com 
// module
// reference https://gridconnect.box.com/shared/static/bt1lpbzdhx2fws11z1tvsoi2xnhbvgv3.pdf

const EventEmitter = require('events').EventEmitter;

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

  filters: [
  ]
};


module.exports = class CanUsbCom extends EventEmitter {
  
  constructor( options ) {

    super();

    this.requestQueue = [];

    this.setOptions( options );

    this.port = null;

    this.isReady = false;
  }

  // sets (or re-sets) the configuration options.
  setOptions( options ) {

   // save for later use
    this.options = Object.assign( DEFAULT_OPTIONS, options );

  }

  // Returns a promise that resolves to a list of available serial ports
  list() {

    return new Promise( function( resolve, reject ){
      SerialPort.list( function( err, ports ) {
        if( err ) {
          reject( err );
        }
        else {
          resolve( ports.filter( function(port) {
            // the CAN-USB-COM returns a particular device ID
            return port.vendorId === '0403' && port.productId === '6001';
          }));
        }
      });
    });
  }


  // Open the specified serial port and configure as directed
  // Returns a promise that resolves when the operation is complete 
  open( port ) {

    var me = this;

    return new Promise( function( resolve, reject ){
      
      let serialOptions = {
        baudRate: me.options.baudRate
      };

      // Do this last, since the caller will have their callback called
      // when the port is opened
      me.port = new SerialPort( port, serialOptions, function( err ) {

        if( err ) {
          me.emit( 'error', err );
          reject( err );
        }
        else {
          
          me.emit( 'open' );

          me.configure()
          
          .then( function() {
            // success!
            me.isReady = true;
            resolve();
          })
          .catch( function(err) {
            // configure failed
            reject( err );
          });
        }

      });

      // Call event handler on serial port error
      me.port.on( 'error', me.onSerialError.bind(me));

      // call the onData function when data is received
      me.port.on('data', me.onData.bind(me));

      // event when the port is closed or disconnected
      me.port.on('close', function( err ) {
        me.flushRequestQueue();

        // pass up to our listeners.  If port was disconnected
        // (eg remove usb cable), err is an Error object with
        // err.disconnected = true.  We also get here if our 
        // owner calls 'close'
        me.emit( 'close', err );

        me.isReady = false;
        me.port = null;
      });

    });

  }


  // Sets up a to-do list to send configuration commands to the board
  configure() {

    let me = this;

    // Enter configuration mode
    return me._sendAndWait( ':CONFIG;' + CR, '#0#' )
    .then( function() {

      // Set up CAN baud rate and sample point
      return me._sendAndWait( 
        'set can port ' + 
        me.options.canRate + 
        ' ' + me.options.samplePoint + CR, 
        '<A:(.*?)>' );
    })

    // Set up input and output format
    .then( function() {
      return me._sendAndWait( 
        'DEL CAN FILTER ALL' + CR, 
        '<A:All filters deleted>' );
    })

    // Set up input and output format
    .then( function() {
      
      if( me.options.filters.length > 0 ) {
        let filterList  = '';

        me.options.filters.forEach( function( filter ) {

          let type = filter.ext? ' ext':' std';
          
          filterList = filterList + type + ' ' + filter.id; 
          // filterList.push( me._sendAndWait( 
          //   'SET CAN FILTER ' + type + ' ' + filter.id + ' ' + filter.mask  + CR, 
          //   '<A:EOL=(.*?)>' ));
        });
        //console.log('filters: ', filterList );

        return me._sendAndWait( 
            'SET CAN FILTER' + filterList + CR, 
            '<A:(.*?)>' );
      }

    })

    // Set up input and output format
    .then( function() {
      let filter = (me.options.filters.length > 0)? 'ON' : 'OFF';

      return me._sendAndWait( 
        'SET CAN CM FILTER=' + filter + ' EOL=NONE IFMT=ASCII OFMT=ASCII MODE=NORMAL' + CR, 
        '<A:EOL=(.*?)>' );
    })

    // Go to command mode (operational mode)
    .then( function() {
      return me._sendAndWait( 
        'EXIT' + CR, 
        '<A>' );
    });

  }


  // Close the serial port and clean up
  close() {
    this.flushRequestQueue();
    if( this.port ) {
      if( this.port.isReady ) {
        this.port.close();
      }
      this.port = null;
      this.isReady = false;
    }
  }

  isOpen() {
    return this.port && this.port.isOpen && this.isReady;
  }


  // Error out any requests we are waiting for
  flushRequestQueue() {
    let me = this;

    me.requestQueue.forEach( function( request ) {
      me.resolveRequest( request.regex, new Error('Port Closed'));
    });
  }

  // finds the first matching request in the queue and closes it out
  // by calling the callback, removing the timer if any, and 
  // removing it from the queue
  resolveRequest( regex, err ) {

    let index = this.requestQueue.findIndex( function(item) {
      return  item.regex === regex;
    });

    if( index > -1 ){
      if( this.requestQueue[index].timer ) {
        clearTimeout( this.requestQueue[index].timer );
      }

      this.requestQueue[index].cb( err );
      this.requestQueue.splice( index, 1);
    }
  }

  // Event handler for error reported by serial port
  onSerialError(err) {
    // not really sure how to handle this in a more elegant way

    this.emit( 'error', err );
  }


  _sendAndWait( data, waitfor, timeout ) {
  
    //console.log( 'TX: ', data );

    this.port.write( data );

    return this._waitFor( waitfor, timeout );

  }


  // send a message with 29-bit extended id
  sendExt( id, data ) {

    let me = this;

    //console.log( 'SEND: :X' + id.toString(16) + 'N' + Buffer.from( data ).toString('hex'));
    me.port.write( ':X' + id.toString(16) + 'N' + Buffer.from( data ).toString('hex') + ';');

  }

  // Send a message with 11-bit ID
  send( id, data ) {

    let me = this;

    //console.log( 'SEND: :X' + id.toString(16) + 'N' + Buffer.from( data ).toString('hex'));
    me.port.write( ':S' + id.toString(16) + 'N' + Buffer.from( data ).toString('hex') + ';');

  }


  // wait for a message to be received, or a time interval to expire
  _waitFor( msg, timeout ) {

    let me = this;

    return new Promise( function( resolve, reject ){

      let timer = setTimeout( function() {
        me.resolveRequest( msg, new Error('No Response to ' + msg ));
      }, timeout || DEFAULT_TIMEOUT );

      let cb = function(err, result) {
        if( err ) {
          reject(err);
        }
        else {
          resolve( result );
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
  onData( data ) {
    
    let me = this;

    me._rxData = me._rxData + data.toString();

    if( this.requestQueue.length > 0 ) {

      let cmd = me.requestQueue[0];

      if( me._rxData.search( cmd.regex ) > -1) {
        // found what we are looking for

        // Cancel the no-response timeout because we have a response
        if( cmd.timer !== null ) {
          clearTimeout(cmd.timer);
          cmd.timer = null;
        }

        // Signal the caller with the response data
        if( cmd.cb ) {
          cmd.cb( null, me._rxData );
        }
        
        // Remove the request from the queue
        me.requestQueue.shift();

        // discard all data (this only works because we only send one
        // command at a time...)
        me.rxData = '';
      }
    }
    else if( me.isReady ) {
 
      let packets = me._rxData.split( ';');

      if( packets.length > 0 ) {

        me._rxData = packets.pop();

        packets.forEach( function( packet ){

          let fields = packet.match(/:([SX])([0-9A-F]{1,8})N([0-9A-F]{2,16})/);

          if( fields ){

            // let id = parseInt(fields[2], 16);
            // let pgn = (id >> 8) & 0xFF00;
            // let priority = (id >> 26) & 0x07;

            

            // me.emit(pgn, {
            //   priority: priority,
            //   id: id,
            //   ext: (fields[1] === 'X'),
            //   data: Buffer.from( fields[3], 'hex')
            // });

            me.emit('rx', {
              id: parseInt(fields[2], 16),
              ext: (fields[1] === 'X'),
              data: Buffer.from( fields[3], 'hex')
            });


          }
        });
      }
    }
  }

};

