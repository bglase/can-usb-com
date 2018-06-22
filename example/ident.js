// Example script to query the CANBUS network for J1939 devices.

// We will discover ourselves too (you should see a FOUND UNIT: 1) as long as address
// negotiation succeeds  

const Can = require('..');

let board = new Can({
  filters: [{
    ext: true,
    id: '10E00000 10EFFFFF',
  }

  ]
});


board.list()
.then( function( ports ) {

  // got a list of the ports, try to open the last one which is likely
  // the USB cable
  ports = ports.slice(-1);
  console.log( 'Opening ', ports[0].comName );

  board.on('rx', function( msg ){
    console.log( 'Msg: ', msg.id.toString(16), msg.data );
  });


  return board.open( ports[0].comName );

})
.then( function() {
  console.log('Board Opened.  Sending claim request....');

  return board.sendExt( 0x10EAFFFE, 
     [ 0x00, 0xEE, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00 ]);

})
.catch( function( err ) {
	console.error( err );
  process.exit(-1);
});

// Wait for responses, then exit
setTimeout( function() {
  //board.reset();
  process.exit(0);
}, 5000);
