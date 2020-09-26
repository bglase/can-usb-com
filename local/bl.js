// Example script that opens the CAN connection and
// sends a message.  


const Can = require('..');

let board = new Can({
  canRate: 250000,

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
  return board.open( ports[0].path );
  
})
.then( function() {


  // board.sendExt( 0x10EF8001, [0x49, 0x2B, 0x05, 0x00, 0x83, 0x83]);

  // board.sendExt( 0x10EF8001, [0x47, 0xFB ]);

  board.send( 0x67E, [0x21,0x50,0x1f,0x01,0x2b,0x00,0x00,0x00]);

// board.send( 0x200, [9, 0x10, 0x81, 0x01, 0x04, 0x46, 0x00, 0x00]);
// board.send( 0x200, [9, 0x11, 0x08, 0x00, 0xFF ]);

// optical zoom in 10%
//board.send( 0x200, [9, 0x10, 0x81, 0x01, 0x04, 0x47, 0x00, 0x07]);
//board.send( 0x200, [9, 0x11, 0x00, 0x0D, 0x00, 0xFF ]);

})
.catch( function( err ) {
  // Something went wrong... 
  console.error( err );
  board.close();
  process.exit(-1);
});

