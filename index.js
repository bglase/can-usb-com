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


/* SAE J1939 Source Addresses found in J1939 p. 45. 252 is
   for experimental use */
const J1939_ADDR_DIAG_TOOL1 =249;
const J1939_ADDR_EXPERIMENTAL_USE= 252;
const J1939_ADDR_NULL= 254;
const J1939_ADDR_GLOBAL =255;

/* SAE J1939 parameter group numbers */
const J1939_PGN_REQUEST =59904;
const J1939_PGN_ADDRESS_CLAIMED =60928;
const J1939_PGN_PROPRIETARY_A= 61184;
const J1939_PGN_TP_CM= 60416;
const J1939_PGN_TP_DT =60160;


/* different transport protocol states */
const J1939TP_STATE_UNUSED              =                   0;
const J1939TP_STATE_SEND_BAM            =                   1;
const J1939TP_STATE_SEND_RTS            =                   2;
const J1939TP_STATE_SEND_CTS             =                  3;
const J1939TP_STATE_SEND_DATA            =                  4;
const J1939TP_STATE_SEND_ACK             =                  5;
const J1939TP_STATE_SEND_ABORT           =                  6;
const J1939TP_STATE_WAIT_CTS             =                  7;
const J1939TP_STATE_WAIT_DATA            =                  8;
const J1939TP_STATE_WAIT_ACK             =                  9;


/* type of TP msg (see spec -21) */
const  J1939TP_CTRL_BYTE_RTS           =                    16;
const  J1939TP_CTRL_BYTE_CTS           =                    17;
const  J1939TP_CTRL_BYTE_ACK           =                    19;
const  J1939TP_CTRL_BYTE_BAM           =                    32;
const  J1939TP_CTRL_BYTE_ABORT          =                  255;

/* reasons to send an abort msg (see spec -21) */
const  J1939TP_RSN_BUSY                 =                    1;
const  J1939TP_RSN_RSRCS_FREED          =                    2;
const  J1939TP_RSN_TIMEOUT              =                    3;
const  J1939TP_RSN_ERROR                =                  254; 

// timeouts in ms (see spec -21) 
const J1939TP_TIMEOUT_BM      =    (50);
const J1939TP_TIMEOUT_TR      =   (200);
const J1939TP_TIMEOUT_TH      =   (500);
const J1939TP_TIMEOUT_T1      =   (750);
const J1939TP_TIMEOUT_T2      =  (1250);
const J1939TP_TIMEOUT_T3      =  (1250);
const J1939TP_TIMEOUT_T4      =  (1050);


/**
 * Convert an abort code to a string
 *
 * @param      {<type>}  code    The code
 * @return     {string}  Text description of abort code
 */
function abortReason( code ) {
  switch( code ) {

    case 1:
      return 'Busy';
    case 2: 
      return 'RSRCS Freed';

    case 3: 
      return 'Timeout';

    case 254: 
      return 'Error';

    default:
      return 'Unknown';
  }

}



/**
 * Class that holds j1939 transaction state and data
 *
 * @class      J1939Transaction (name)
 */
class J1939Transaction {
  constructor( msg, src ) {

      this.dst = msg.dst;
      this.src = src;
      this.pgn = msg.pgn;
      this.msgSize = msg.buf.length;
      this.numPackets = Math.floor((msg.buf.length+6)/7);
      this.numCur = 1;
      this.ctsCnt = 0;
      this.ctsRcvd = 0;
      this.buf = msg.buf;
      this.cb = msg.cb;
  }
}

/**
 * Class definition we are exporting
 */
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

    // the fact that this.address exists, tells us we are in J1930 mode
    if( options.j1939 ) {
      
      // address claim states
      this.CLAIM_NONE = 0;
      this.CLAIM_IN_PROGRESS = 1;
      this.CLAIM_SUCCESSFUL = 2;
      this.CLAIM_FAILED = 3;
      this.CLAIM_LISTEN_ONLY = 4;
  
      // one or the other of these needs to be defined
      this.preferredAddress = options.j1939.preferredAddress;
      this.addressRange = options.j1939.addressRange;
      this.address = 0; // until claim procedure is done

      this.name = options.j1939.name || [0,0,0,0,0,0,0,0];

      this.addressClaimStatus = this.CLAIM_NONE;
      this.attemptedSourceAddress = 0;

      // default interval to 50ms (J1939 standard)
      this.bamInterval = options.j1939.bamInterval || 50;

      // a list of the transport protocol transactions we have in process
      this.transactions = [];
    }
  }

  // Returns a promise that resolves to a list of available serial ports
  list() {

    return SerialPort.list()
    .then( function ( ports ) {
        
      return( ports.filter( function(port) {
        // the CAN-USB-COM returns a particular device ID
        return port.vendorId === '0403' && port.productId === '6001';
      }));
        
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
         
          me.configure()
          .then( function() {
            if( me.preferredAddress || me.addressRange ) {
              return me.setAddress();
            }
            // otherwise just continue
          })          
          .then( function() {
            // success!
            me.isReady = true;
            me.emit( 'open' );

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
    if( this.isOpen() ) {
     
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


  // Send to serial port and wait for response
  _sendAndWait( data, waitfor, timeout ) {
  
    this.port.write( data );

    return this._waitFor( waitfor, timeout );

  }

  reportAddressClaimStatus() {
    
    this.emit( 'address', this.addressClaimStatus, this.attemptedSourceAddress );
  
  }

  // returns a promise that resolves when the address claim process is complete
  // @todo use address range to implement a search if preferred address
  // is not available
  setAddress( name, preferredAddress, addressRange ) {

    let me = this;

    // unless specified, use stored values
    me.name = name || me.name;
    me.preferredAddress = preferredAddress || me.preferredAddress;
    me.addressRange = addressRange || me.addressRange;

    // for now we only support a single preferred address, no addressrange
    if( me.preferredAddress ) {

      return new Promise( function( resolve, reject ){

        me.attemptedSourceAddress = me.preferredAddress;
        me.addressClaimStatus = me.CLAIM_IN_PROGRESS;
        me.reportAddressClaimStatus();

        // send Request for Address Claimed
        me.sendExt( 0x10EA0000 + ( me.attemptedSourceAddress <<8 ) + 0xFE, me.name );

        let timer;

        let listener = function( msg ) {
          
          let pf = (msg.id >> 16) & 0xFF;   // protocol format field
          let ps = (msg.id >> 8 ) & 0xFF;   // protocol specific field
          let sa = (msg.id ) & 0xFF;        // source address

          if( pf === 0xEE && ps === 0xFF && sa === me.address ) {
            // someone else using our message - report error and kick out
            // @todo try one from the addressRange
            me.close();
            clearTimeout( timer );

            me.addressClaimStatus = me.CLAIM_FAILED;
            me.reportAddressClaimStatus( );

            reject(new Error( 'CAN Address already in use'));

          }
        };

        me.on('rx', listener );

        // wait at least 250ms, if no response then we can use address
        timer = setTimeout( function() {

          // we hit the timeout, address is ours!
          me.removeListener('rx', listener );

          me.address = me.preferredAddress;

          //console.log('can-usb-com:No CAN address conflict; claiming ' + me.preferredAddress );

          // send address claim to announce ourselves
          me.sendExt( 0x10EEFF00 + (me.preferredAddress), me.name );

          me.addressClaimStatus = me.CLAIM_SUCCESSFUL;
          me.reportAddressClaimStatus( );

          resolve();
        }, 500 );
      });
    }
    else {
      me.addressClaimStatus = me.CLAIM_FAILED;
      me.reportAddressClaimStatus( );
      return Promise.reject( new Error('Unable to claim address') );
    }

  }


  // Send a J1939 PGN.  If >8 bytes, it is sent using transport protocol
  /**
   * Send a J1939 PGN
   *
   * @param {Object} msg   contains the message to be sent
   * @param {number} msg.pgn the PGN of the message
   * @param {Buffer} msg.buf the data payload of the message
   * @param {number} msg.dst the address where the message should be sent
   * @param {number} msg.src the source address, optional (default to previously determined address)
   * @param {number} msg.priority 0-7, optional, 0 being highest priority
   * @param {function} msg.cb, optional function(err) to call on completion
   */
  write( msg ) {
    
    //console.log( 'can-usb-com::write', msg );
    
    let pri = msg.priority || 0x07;

    if( msg.buf.length <= 8 ) {
      return this.sendExt( this.buildId( msg.pgn, msg.dst, pri ), msg.buf );
    }
    else if( this.address ) {
      
      // use transport protocol if J1939 enabled
      let transaction = new J1939Transaction( msg, this.address );
  
      // add to our list of transactions
      this.transactions.push( transaction );
      
      if( msg.dst === J1939_ADDR_GLOBAL ) {
        transaction.state = J1939TP_STATE_SEND_BAM;
        this.sendBamOrRts( transaction, J1939TP_CTRL_BYTE_BAM );
        transaction.timer = setTimeout( this.updateTxBam.bind(this, transaction ), this.bamInterval );
      }
      else {
        transaction.state = J1939TP_STATE_SEND_RTS;
        this.sendBamOrRts( transaction, J1939TP_CTRL_BYTE_RTS );
        transaction.state = J1939TP_STATE_WAIT_CTS;
        transaction.timer = setTimeout( this.onTpTimeout.bind( this, transaction ), J1939TP_TIMEOUT_T3);
      }   

    }
    else {
      throw new Error( 'Invalid message data size');
    }
  }

  // send a message with 29-bit extended id
  sendExt( id, data ) {

    let me = this;

    try{
      me.port.write( ':X' + id.toString(16) + 'N' + Buffer.from( data ).toString('hex') + ';');
    }
    catch( err ) {
      //console.log('sendExt error: ',data.toString(), err );
      //
      // what to do here...
      throw err;
      
    }
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

  // handle an incoming 29-bit CAN message when in J1939 mode
  handleJ1939( id, data ) {

    let me = this;

    var dst, pgn;

    var pf = (id >> 16) & 0xff;
    if( pf < 240 ) {
      // destination-specific
      dst = (id >> 8) & 0xff;
      pgn = (id >> 8 ) & 0x1ff00;
    }
    else {
      // broadcast
      dst = J1939_ADDR_GLOBAL;
      pgn = (id >> 8 ) & 0x1ffff;

    }

    if( dst === me.address || dst === J1939_ADDR_GLOBAL ) {
      var src = id & 0xFF;

      let msg = {
        pri: ( id >> 26) & 0x07,
        src: src,
        dst: dst,
        pgn: pgn,
        buf: data,
      };

      switch( pgn ) {
        // case J1939_PGN_REQUEST:
        //   break;

        case J1939_PGN_TP_CM:
           me.processCm( msg );
           break;

        case J1939_PGN_TP_DT:
          break;

        case J1939_PGN_ADDRESS_CLAIMED:
        default:
          // let upper level application handle it
          me.emit( 'data', msg );
          break;
      }

    }
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

            let id = 0;
            let ext, data;

            try{
              //console.log('rx:', fields[3]); 

              ext = (fields[1] === 'X');
              data = Buffer.from( fields[3], 'hex');
              id = parseInt(fields[2], 16);

            }
            catch( err ) {
              // we sometimes get malformed packets (like an odd number of hex digits for the data)
              // I dunno why that is, so ignore them
              //console.log('onData error: ',fields, err );
            }

            if( id > 0 ) {

              if( me.address && ext ) {
                me.handleJ1939( id, data );
              }
              else {

                // emit a standard (non-J1939) message
                me.emit('rx', {
                  id: id,
                  ext: ext,
                  data: data
                });
              }


            }

          }
        });
      }
    }
  }


  /**
   * Handles an incoming J1939 CM message
   *
   * @param      The message
   */
  processCm( msg ) {
    // /* all cm messages have the pgn in the same location */
    var pgn = msg.buf[5] | msg.buf[6]<<8 | msg.buf[7]<<16;
    /* msg_size is in RTS, ACK, and BAM so make sure it's only used there */
    var msgSize = msg.buf[1] | msg.buf[2] << 8;

    switch( msg.buf[0] ) {

      case J1939TP_CTRL_BYTE_CTS: {
       
        // see if we know about the associated transaction
        let transaction = this.findTxTransaction( msg.src, msg.dst,  pgn, [J1939TP_STATE_WAIT_CTS, J1939TP_STATE_WAIT_ACK] );

  
        if( transaction ) {

          /* if we never get a CTS, then an abort shouldn't be sent.  if we did
             get a CTS, then an abort needs to be sent if a timeout happens */
          transaction.ctsRcvd = 1;

          /* spec says only 1 CTS can be received at a time */
          if( transaction.ctsCnt ) {

            transaction.rsn = J1939TP_RSN_ERROR;
            transaction.state = J1939TP_STATE_SEND_ABORT;
            transaction.timer = setTimeout( this.onTpTimeout.bind( this, transaction ), J1939TP_TIMEOUT_TR );

          } else if( (transaction.state === J1939TP_STATE_WAIT_CTS) || (transaction.state === J1939TP_STATE_WAIT_ACK) ) {
    
              if( transaction.timer ) {
                clearTimeout( transaction.timer );
              }

              transaction.state = J1939TP_STATE_SEND_DATA;
              transaction.ctsCnt = msg.buf[1];
              transaction.numCur = msg.buf[2];
             
              // send the next data block
              for( var i = 0; i < transaction.numPackets; i++ ) {
                this.sendDt( transaction );
                transaction.numCur++;
                
              }

              if( transaction.numCur++ >= transaction.numPackets ) {
                transaction.timer = setTimeout( this.onTpTimeout.bind( this, transaction ), J1939TP_TIMEOUT_T3 );
                transaction.state = J1939TP_STATE_WAIT_ACK;
              } else if( --transaction.ctsCnt === 0 ) {
                transaction.timer = setTimeout( this.onTpTimeout.bind( this, transaction ), J1939TP_TIMEOUT_TR );
                transaction.state = J1939TP_STATE_WAIT_CTS;
              }
            }
          }
        }
        break;

      case J1939TP_CTRL_BYTE_ACK: {

        // see if we know about the associated transaction
        let transaction = this.findTxTransaction( msg.src, msg.dst,  pgn, [J1939TP_STATE_WAIT_ACK] );

        if( transaction ) {

          if( transaction.cb ) {
            transaction.cb( (transaction.msgSize === msgSize)? null: new Error('Incomplete') );
          }

          this.completeTpTransaction( transaction );
        }

        break;
      }

      case J1939TP_CTRL_BYTE_ABORT: {

        // see if we know about the associated transaction
        let transaction = this.findTxTransaction( msg.src, msg.dst,  pgn, [J1939TP_STATE_WAIT_ACK, J1939TP_STATE_WAIT_CTS, J1939TP_STATE_WAIT_DATA] );

        if( transaction ) {

          this.completeTpTransaction();
        }

        // cnt = j1939tp_txbuf_find(msg->dst, msg->src, pgn);
        // if( cnt < J1939CFG_TP_TX_BUF_NUM )
        //   j1939tp_rtscts_failed(cnt);

        // cnt = j1939tp_rxbuf_find(msg->dst, msg->src, pgn);
        // if( cnt < J1939CFG_TP_RX_BUF_NUM )
        //   j1939tp_rxbuf[cnt].state = J1939TP_STATE_UNUSED;

        break;
      }
    }

    return;
  }

  /**
   * Updates the state of a TX BAM message and sends out the next packet
   *
   * @param      {Object}  transaction  The transaction
   */
  updateTxBam( transaction ) {
    
    // it would be better if we handled packet send failures, and
    // an overall timeout: if we have not sent any packets in 200ms, 
    // fail the whole message.    
    if( this.sendDt( transaction ) ) {

      if( transaction.numCur >= transaction.numPackets) {
        this.completeTpTransaction( transaction );
      }
      else {
        transaction.numCur++;

        transaction.timer = setTimeout( this.updateTxBam.bind( this, transaction ), this.bamInterval );
      }
    }

  }

  /**
   * Send a J1939 Connection management: abort message
   *
   * @param      transaction     The transaction to abort
   */
  sendAbort( transaction ) {

    var buf = Buffer.from( [
      J1939TP_CTRL_BYTE_ABORT,
      transaction.rsn,
      0xFF,
      0xFF,
      0xFF,
      transaction.pgn & 0xFF,
      (transaction.pgn >> 8 ) & 0xFF,
      (transaction.pgn >> 16) & 0xFF
    ]);

    this.sendExt( this.buildId( J1939_PGN_TP_CM, transaction.dst ), buf );
  }


  /**
   * Send J1939 Transport Protocol RTS or BAM
   * 
   * This kicks off a multi-packet transfer
   *
   * @param      {<type>}  transaction  The transaction
   * @param      {<type>}  type         The type (BAM or RTS)
   */
  sendBamOrRts( transaction, type ) {

    var buf = Buffer.from( [
      type,
      transaction.msgSize & 0xFF,
      (transaction.msgSize >> 8) & 0xFF,
      transaction.numPackets,
      0xFF,
      transaction.pgn & 0xFF,
      (transaction.pgn >> 8 ) & 0xFF,
      (transaction.pgn >> 16) & 0xFF

    ]);

    this.sendExt( this.buildId( J1939_PGN_TP_CM, transaction.dst  ), buf );

  }

  sendDt( transaction ) {

    let snt = (transaction.numCur-1)*7;
    let rem = transaction.msgSize - snt;
    var data = [ transaction.numCur ];

    // insert the data, or pad with 255
    for( let cnt = 0; cnt < 7; cnt++ ) {
      data.push( (rem > cnt) ? transaction.buf[ snt + cnt ] : 255 );
    }

    this.sendExt( this.buildId( J1939_PGN_TP_DT, transaction.dst  ), Buffer.from( data ) );

    // always indicate success cuz we don't know better
    return true;
  }

  /**
   * Looks up a transmit J1939 transaction
   *
   * @param      dst     The destination
   * @param      src     The source
   * @param      pgn     The pgn
   * @return     Object if found, null otherwise
   */
  findTxTransaction( dst, src, pgn, states ) {

    let index = this.transactions.findIndex( function( item ){
      return item.dst === dst && item.src === src && item.pgn === pgn && states.indexOf(item.state) > -1;
    });

    return( index > -1 ) ? this.transactions[ index ] : null;
  }


  /**
   * Find and remove the transaction from our queue
   * 
   *
   * @param      {Object}  transaction  The transaction
   */
  completeTpTransaction( transaction ) {

    let index = this.transactions.findIndex( function( item ){
      return item === transaction;
    });

    if( index > -1 ) {
      
      if( transaction.timer ) {
        clearTimeout( transaction.timer );

      }
      delete this.transactions.splice( index, 1 );

    }

  }


  /**
   * Handler for timeout waiting for J1939 Transport Protocol response
   */
  onTpTimeout( transaction ) {

    if( transaction.state !== J1939TP_STATE_SEND_RTS ) {
      transaction.rsn = J1939TP_RSN_TIMEOUT;
      transaction.state = J1939TP_STATE_SEND_ABORT;
      this.sendAbort( transaction );
    }

    if( transaction.cb ) {
      transaction.cb( new Error('Timeout') );
    }

    this.completeTpTransaction( transaction );

  }

  /**
  * Build a CAN 29-bit ID for J1939 PGN
  *
  * @param      {number}  pgn     The pgn
  * @param      {number}  to      destination
  * @param      {number}  pri     The priority
  * @return     {number}  The identifier.
  */
  buildId( pgn, to, pri ) {

    pri = pri || 4;

    var pf = (pgn >> 8) & 0xFF;

    if( pf < 240 ) {
      return (pri << 26) + (pf << 16) + (to << 8) + this.address;
    }
    else {
      return (pri << 26 )+( pgn << 8) + this.address;
    }

  }

};

