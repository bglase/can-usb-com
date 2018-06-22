
// Example that listens to all PGNs and dump them
// to the console.
// CTRL-C stops the example

const Can = require('..');

let board = new Can();

// Event handler
board.on('open', function() {
  console.info('Port Open');
});

// Event handler
board.on('error', function( err ) {
  console.error('Port Error:', err );
});

// Event handler - port closed or disconnected
board.on('close', function(err){
  if( err && err.disconnected ) {
    console.log( 'Port Disconnected' );
  }
  else {
    console.log( 'Port Closed by application' );
  }
});

// Look for compatible CAN adapters
board.list()
.then( function( ports ) {

  if( ports.length > 0 ) {
    // got a list of the ports, try to open the last one which is likely
    // the USB cable
    ports = ports.slice(-1);

    // Event handler for each incoming message
    board.on('rx', function( msg ){
      console.log( 'Msg: ', msg.id.toString(16), msg.data );
    });

    // Open the COM port and initialize the USBCAN device...
    return board.open( ports[0].comName );
  }
  else {
    console.error( 'No CAN-USB-COM Devices found');
  }
  
})
.catch( function( err ) {
  // Something went wrong... 
  console.error( err );
  board.close();
  process.exit(-1);
});

