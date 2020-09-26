// Example that listens to all PGNs and dump them
// to the console.
// CTRL-C stops the example

const Can = require('..');

let board = new Can({
  // Serial port baud rate
  baudRate: 480800,

  canRate: 500000,

});

// Event handler
board.on('open', function() {
  console.info('Port Open');
});

// Event handler
board.on('error', function(err) {
  console.error('Port Error:', err);
});

// Event handler - port closed or disconnected
board.on('close', function(err) {
  if (err && err.disconnected) {
    console.log('Port Disconnected');
  } else {
    console.log('Port Closed by application');
  }
});

let throttle;


// Look for compatible CAN adapters
board.list()
  .then(function(ports) {

    if (ports.length > 0) {
      // got a list of the ports, try to open the last one which is likely
      // the USB cable
      ports = ports.slice(-1);

      // Event handler for each incoming message
      board.on('rx', function(msg) {
        if (msg.id === 0x10ef8280) {
          //console.log(msg.data);
          let val = msg.data[3] * 256 + msg.data[2];
          let newthrottle = val >> 3;
          //console.log(newthrottle);
          if (newthrottle !== throttle) {
            console.log('T: ' + newthrottle);
            throttle = newthrottle;
          }

          //      console.log( 'Msg: ', msg.id.toString(16), msg.data );
        }
      });

      // Open the COM port and initialize the USBCAN device...
      return board.open(ports[0].path);
    } else {
      console.error('No CAN-USB-COM Devices found');
    }

  })
  .catch(function(err) {
    // Something went wrong...
    console.error(err);
    board.close();
    process.exit(-1);
  });