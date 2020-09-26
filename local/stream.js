// Example script that provides a packet stream interface using a particular ID

// the CAN IDs we use to communicate
const ID_RX = 0x08EFB0B1;
const ID_TX = 0x1CEFB1B0;

const Can = require('..');

let board = new Can({
  canRate: 500000,
  filters: [{
    ext: true,
    id: ID_RX.toString(16),
  }
  ]
});


// Look for compatible CAN adapters
board.list()
.then( function( ports ) {

  // got a list of the ports, try to open the last one which is likely
  // the USB cable
  ports = ports.slice(-1);

  // Event handler for each incoming message
  board.on('rx', function( msg ){
    console.log( 'Msg: ', msg.id.toString(16), msg.data );
  });


  let inStream = board.getReadStream( ID_RX );

  //inStream.pipe( process.stdout );

//  inStream.on('data', function( data ) {
   // console.log('evt:', data );
 // });

  // Open the COM port and initialize the USBCAN device...
  return board.open( ports[0].path );
  
})
.then( function() {

  // set joystick options
 // board.sendExt( 0x10EF8201, [0x49, 0x2B, 0x09, 0x00, 0x0B, 0]);
  
  // read joystick options
 // board.sendExt( 0x10EF8201, [0x49, 0x43, 0x09, 0x00, 0, 0]);
   // board.sendExt( 0x10FF39EA, [0x49, 0x2B, 0x06, 0x00, 0x02]);

  //  board.sendExt( 0x10EF8201, [0x49, 0x2B, 0x09, 0x00, 0x0B]);

  //for( let i = 0; i<5; i++) {
  //  board.sendExt( 0x10EF8001, [0x49, 0x2B, 0x06, 0x00, 0x02]);
   // board.sendExt( 0x10EF8001, [0x49, 0x2B, 0x05, 0x00, 0x85, 0x85]);
//  let zoom = -20000;

//   board.send( 0x200, [3, zoom & 0xFF, (zoom >> 8) & 0xff]);

  //board.send( 0x200, [3, zoom & 0xFF, (zoom >> 8) & 0xff]);

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

