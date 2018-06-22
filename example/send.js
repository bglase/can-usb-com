// Example script that opens the CAN connection and
// sends a message.  
// The example also sets up a filter to catch a response message
// (obviously you will not get a ) 


const Can = require('..');

let board = new Can({
  filters: [{
    ext: true,
    id: '10EF0000 10EFFFFF',
  }

  ]
});

//let board = new Can();

// Look for compatible CAN adapters
board.list()
.then( function( ports ) {

  // got a list of the ports, try to open the last one which is likely
  // the USB cable
  ports = ports.slice(-1);

  // Event handler for each incoming message
  board.on('rx', function( msg ){
    console.log( 'Msg: ', msg.id.toString(16), msg.data );
    //board.sendExt( 0x10EFC901, [0x48, 0xA0, 0x19, 0, 0, 0, 0, 0]);
  });

  // Open the COM port and initialize the USBCAN device...
  return board.open( ports[0].comName );
  
})
.then( function() {

  for( let i = 0; i<5; i++) {
    board.sendExt( 0x10EFC901, [0x48, 0xA0, i, 0, 0, 0, 0, 0]);
    }
})
.catch( function( err ) {
  // Something went wrong... 
  console.error( err );
  board.close();
  process.exit(-1);
});

