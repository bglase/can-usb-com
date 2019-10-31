// Example script that opens the CAN connection and
// sends a message.  
// The example also sets up a filter to catch a response message
// (obviously you will not get a ) 


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

var transaction = {

  state: J1939TP_STATE_UNUSED,
  status: 0,
  pgn: 0,
  msgSize: 0,
  timer: 0,
  numPackets: 0,
  numCur: 0,
  ctsCnt: 0,
  ctsRcvd: 0,
  rsn: 0,
  dst: 0,
  src: 0,
  buf: null


};
const MY_ID = 0xFE;

function AbortReason( code ) {
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


function buildId( pgn, to, pri ) {
  
  pri = pri || 4;

  var pf = (pgn >> 8) & 0xFF;

  if( pf < 240 ) {
    return (pri << 26) + (pf << 16) + (to << 8) + MY_ID;
  }
  else {
    return (pri << 26 )+( pgn << 8) + MY_ID;
  }

}

function sendAbort( dst, rsn, pgn ) {

  var buf = Buffer.from( [
    J1939TP_CTRL_BYTE_ABORT,
    rsn,
    0xFF,
    0xFF,
    0xFF,
    transaction.pgn & 0xFF,
    (transaction.pgn >> 8 ) & 0xFF,
    (transaction.pgn >> 16) & 0xFF
  ]);

  board.sendExt( buildId( J1939_PGN_TP_CM, dst ), buf );
}



function sendBamOrRts( transaction, type ) {

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

  console.log( 'Sending RTS ', buildId( J1939_PGN_TP_CM, transaction.dst ).toString( 16 ), buf );
  board.sendExt( buildId( J1939_PGN_TP_CM, transaction.dst  ), buf );

}

function onTimeout( ) {

  console.log( 'TIMEOUT' );

  if( this.state !== J1939TP_STATE_SEND_RTS ) {
    this.rsn = J1939TP_RSN_TIMEOUT;
    this.state = J1939TP_STATE_SEND_ABORT;
    sendAbort( this );

  }

}

function sendPgn( pgn, to, pri, buf ) {

  if( buf.len <= 8 ) {
    board.sendExt(buildId( pgn, to, pri, buf ));
  }
  else {
    // use transport protocol


    transaction.dst = to;
    transaction.src = MY_ID;
    transaction.pgn = pgn;
    transaction.msgSize = buf.length;
    transaction.numPackets = Math.floor((buf.length+6)/7);
    transaction.numCur = 1;
    transaction.ctsCnt = 0;
    transaction.ctsRcvd = 0;
    //transaction.status = status;
    transaction.buf = buf;
        


    if( to === J1939_ADDR_GLOBAL ) {
      transaction.state = J1939TP_STATE_SEND_BAM;
      sendBamOrRts( transaction, J1939TP_CTRL_BYTE_BAM );
      transaction.timer = 0;
    }
    else {
      transaction.state = J1939TP_STATE_SEND_RTS;
      sendBamOrRts( transaction, J1939TP_CTRL_BYTE_RTS );
      transaction.state = J1939TP_STATE_WAIT_CTS;
      transaction.timer = setTimeout( onTimeout.bind( transaction ), J1939TP_TIMEOUT_T3);
    }   

  }

}


const Can = require('..');

let board = new Can({
  canRate: 500000,
  // filters: [{
  //   ext: true,
  //   id: '10EF0000 10FFFFFF',
  //  }

  // ]
});

//let board = new Can();

function SendNextDt( transaction ) {


  var buf = Buffer.from( [
    transaction.numCur,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
  ]);

  /* how many bytes have been sent and are remaining? */
  var b_snt = (transaction.numCur-1)*7;
  var b_rem = transaction.msgSize - b_snt;

  for( cnt = 0; cnt < 7; cnt++ ) {
    buf[1+cnt] = (b_rem>cnt) ? transaction.buf[ b_snt+cnt] : 255;
  }
  console.log( 'Sending DT: ', buildId( J1939_PGN_TP_DT, transaction.dst ).toString(16), buf );

  return board.sendExt( buildId( J1939_PGN_TP_DT, transaction.dst), buf );
}

function ProcessCm( msg ) {


  /* all cm messages have the pgn in the same location */
  var pgn = msg.buf[5] | msg.buf[6]<<8 | msg.buf[7]<<16;

  /* msg_size is in RTS, ACK, and BAM so make sure it's only used there */
  var msgSize = msg.buf[1] | msg.buf[2] << 8;

  switch( msg.buf[0] ) {



    case J1939TP_CTRL_BYTE_CTS: {

      //var trans = transaction;

      //cnt = j1939tp_txbuf_find(msg->dst, msg->src, pgn);

      //if( cnt < J1939CFG_TP_TX_BUF_NUM ) {

        /* if we never get a CTS, then an abort shouldn't be sent.  if we did
           get a CTS, then an abort needs to be sent if a timeout happens */
        transaction.ctsRcvd = 1;

        /* spec says only 1 CTS can be received at a time */
        if( transaction.ctsCnt ) {

          transaction.rsn = J1939TP_RSN_ERROR;
          transaction.state = J1939TP_STATE_SEND_ABORT;
          transaction.timer = J1939TP_TIMEOUT_TR;

        } else if( (transaction.state === J1939TP_STATE_WAIT_CTS) || (transaction.state === J1939TP_STATE_WAIT_ACK) ) {
  
            if( transaction.timer ) {
              clearTimeout( transaction.timer );
            }

            transaction.state = J1939TP_STATE_SEND_DATA;
            transaction.ctsCnt = msg.buf[1];
            transaction.numCur = msg.buf[2];

            console.log ('CTS cstCnt: ' + transaction.ctsCnt + ' numCur: ', transaction.numCur );
            for( var i = 0; i < transaction.numPackets; i++ ) {
              SendNextDt( transaction );
              transaction.numCur++;
              
              //transaction.timer = J1939TP_TIMEOUT_T3;
            }
            transaction.state = J1939TP_STATE_WAIT_ACK;

              // if( transaction.numCur++ >= transaction.numPackets ) {
              //   transaction.timer = J1939TP_TIMEOUT_T3;
              //   transaction.state = J1939TP_STATE_WAIT_ACK;
              // } else if( --transaction.ctsCnt === 0 ) {
              //   transaction.timer = J1939TP_TIMEOUT_TR;
              //   transaction.state = J1939TP_STATE_WAIT_CTS;
              // }
            //}
            // if( transaction.ctsCnt ) {
            //   transaction.timer = J1939TP_TIMEOUT_TR;
            // }
            // else {
            //   transaction.timer = J1939TP_TIMEOUT_T4;
            // }
        }
      }
      break;
    

    case J1939TP_CTRL_BYTE_ACK: {

      //cnt = j1939tp_txbuf_find(msg->dst, msg->src, pgn);
      //if( cnt < J1939CFG_TP_TX_BUF_NUM ) {
        console.log( 'ACK: ', transaction );

        if( transaction.state === J1939TP_STATE_WAIT_ACK ) {

          transaction.state = J1939TP_STATE_UNUSED;
          if( transaction.msgSize === msgSize ) {

            /* we passed */
            console.log( "success!");
            process.exit( 0 );
          } else {
            console.log( "FAILED!");
            //j1939tp_rtscts_failed( cnt );
          }
        }
      //}

      break;
    }

    case J1939TP_CTRL_BYTE_ABORT: {

      console.log( 'FAILED due to ABORT: ', AbortReason( msg.buf[1] ));

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


function ProcessPgn( msg ) {

  console.log( 'Process ', msg.pgn.toString(16));

  switch( msg.pgn ) {
    case J1939_PGN_TP_CM:
      ProcessCm( msg );
      break;

    default:
      break;

  }

}


// Look for compatible CAN adapters
board.list()
.then( function( ports ) {

  // got a list of the ports, try to open the last one which is likely
  // the USB cable
  ports = ports.slice(-1);

  // Event handler for each incoming message
  board.on('rx', function( msg ){

    if( msg.id !== 0x10FF1081 ) {
      console.log( 'Msg: ', msg, msg.id.toString(16), msg.data );

      if( msg.ext ) {

        var dst, pgn;

        var pf = (msg.id >> 16) & 0xff;
        if( pf < 240 ) {
          dst = (msg.id >> 8) & 0xff;
          pgn = (msg.id >> 8 ) & 0x1ff00;
        }
        else {
          dst = J1939_ADDR_GLOBAL;
          pgn = (msg.id >> 8 ) & 0x1ffff;

        }

        ProcessPgn( {
          pri: ( msg.id >> 26) & 0x07,
          src: msg.id & 0xFF,
          dst: dst,
          pgn: pgn,
          buf: msg.data,
        });

      }

      //board.sendExt( 0x10EFC901, [0x48, 0xA0, 0x19, 0, 0, 0, 0, 0]);
    }

  });

  // Open the COM port and initialize the USBCAN device...
  return board.open( ports[0].comName );
  
})
.then( function() {

  // set joystick options
 // board.sendExt( 0x10EF8201, [0x49, 0x2B, 0x09, 0x00, 0x0B, 0]);
  
  // read joystick options
 // board.sendExt( 0x10EF8201, [0x49, 0x43, 0x09, 0x00, 0, 0]);
   // board.sendExt( 0x10FF39EA, [0x49, 0x2B, 0x06, 0x00, 0x02]);

  //  board.sendExt( 0x10EF8201, [0x49, 0x2B, 0x09, 0x00, 0x0B]);

  //for( let i = 0; i<5; i++) {

    //let ledState = [0x01, 0x01, 0x01, 0x01, 0x01, 0x01 ];
    let ledState = [0x05, 0x1F, 0x00, 0x00, 0x00, 0x1F, 0x01 ];

    setInterval( function() {

      // ledState.forEach( function( value, index ) {
      //   let newValue =  value << 1;
      //   ledState[ index ] = (newValue > 16)? 1: newValue;
      // });
      
      //console.log( ledState );
 //     board.sendExt( 0x10FF2080, ledState );

    }, 50);

    setInterval( function() {

      // ledState.forEach( function( value, index ) {
      //   let newValue =  value << 1;
      //   ledState[ index ] = (newValue > 16)? 1: newValue;
      // });
      
      //console.log( ledState );

      // board.sendExt( 0x10EC8180, [
      //   J1939TP_CTRL_BYTE_RTS,
      //   16, //msg size lsb
      //   0, // msg size msb
      //   3,  // total packets
      //   0xFF, // no limit in response to cts
      //   0x10, //
      //   0x81, // ps of PGN
      //   0xEA, // pf
      //   ] );


      // sendPgn( 0xEF00, 0x81, null, Buffer.from( [ 0x47, 2, 3, 4, 5, 6, 7, 8, 9, 10 ] ));

      //board.sendExt( 0x10EF8280, [0,1,2] );

    }, 5000);

      let buf = Buffer.alloc( 1785 );
      buf.fill( 0xAA );
      sendPgn( 0xEF00, 0x80, null, buf );
//      sendPgn( 0xEF00, 0x80, null, Buffer.from( [ 0x47, 2, 3, 4, 5, 6, 7, 8, 9, 10 ] ));


//    board.sendExt( 0x10EF8001, [0x49, 0x2B, 0x06, 0x00, 0x02]);
//    board.sendExt( 0x10EF8001, [0x49, 0x2B, 0x05, 0x00, 0x85, 0x85]);


})
.catch( function( err ) {
  // Something went wrong... 
  console.error( err );
  board.close();
  process.exit(-1);
});

