// Example script that opens the CAN connection and
// sends a message.  
// The example also sets up a filter to catch a response message
// (obviously you will not get a ) 

const MY_ID = 0xFE;


const Can = require('..');

let board = new Can({
  canRate: 500000,

  // Serial port baud rate
  baudRate: 480800,

  j1939: {
    address: 0xee,
  },

  // filters: [{
  //   ext: true,
  //   id: '10EF0000 10FFFFFF',
  //  }

  // ]
});


  let buf = [0x47, 0x01 , 0x00, 0xFF, 0xFF];
  

  let fill = new Array(200).fill( 0x55 );

  buf = buf.concat( fill );

  let index = 0;


  function complete( err ) {
    if( err ) {
      console.log( 'Err', err );
    }
    else {
      console.log('complete');
    }
  }

  function send( index ) {
    //buf[0] = index;
    board.write( {pgn: 0xEF00, dst: 0x81, buf: buf, cb: complete, priority: 4 } );
  }


// Look for compatible CAN adapters
board.list()
.then( function( ports ) {

  // got a list of the ports, try to open the last one which is likely
  // the USB cable
  ports = ports.slice(-1);

  // Event handler for each incoming message
  board.on('data', function( msg ){
    
    //console.log( msg );

    if( ( msg.pgn & 0xFF00 ) !== 0xFF00 ) {
      console.log( 'PGN: ', msg.buf.length, msg.pgn.toString(16), msg.buf );
    }

    index++;
//    send( index );
  });

  // Open the COM port and initialize the USBCAN device...
  return board.open( ports[0].path );
  
})
.then( function() {

 //  let buf = [0x47, 0xf0 , 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];

 //  let index = 0;

 //  function send( index ) {
 //    //buf[0] = index;
 //    board.write( {pgn: 0xEF00, dst: 0x80, buf: buf, cb: complete, priority: 4 } );
 //  }

 //  function complete( err ) {
 //    index = (index + 1) & 0xFF;

 //    if( err ) {
 //      console.log( err );
 //      process.exit(1);
 //    }
 //    else
 //    {
 //      console.log( 'Complete!');
 //      process.nextTick( send.bind(index) );
 // //process.exit(0);
 //    }
 //  }

 //  send(index);


  send(index);


  //board.sendPgn( 0xEF00, 0xFF, buf );

})
.catch( function( err ) {
  // Something went wrong... 
  console.error( err );
  board.close();
  process.exit(-1);
});

