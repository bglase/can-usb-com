# NodeJS CAN-USB-COM Module

This module provides a nodejs interface to the [gridconnect CAN-USB Converter](https://gridconnect.com/usb-can-interface.html).

The module implements the [device-specific serial protocol](https://gridconnect.box.com/shared/static/bt1lpbzdhx2fws11z1tvsoi2xnhbvgv3.pdf) and is not compatible with any other device or adapter.

## Getting Started
The following assumes that [NodeJS](https://nodejs.org) is already installed.  To install this module, use
```powershell
npm install can-usb-com
```

The usb device appears as a serial port; depending on your platform you may or may not need to install drivers.  If a serial port does not appear when you plug in the board, refer to the [board installation documents](https://gridconnect.box.com/shared/static/bt1lpbzdhx2fws11z1tvsoi2xnhbvgv3.pdf) and/or download drivers from https://gridconnect.com/usb-can-interface.html and correct the problem.

Create a script to use the board (change the COM port number as required):

```js
const Can = require('can-usb-com');

// Use default settings (do not filter messages)
let board = new Can();


// Handle each incoming message
board.on('rx', function( msg ) {
  console.log( 'Msg: ', msg.id.toString(16), msg.data );
});

// Open the com port and configure...
board.open( 'COM3' )

.then( function() {

  console.log('Listening....');

  // listen for 5 seconds, then end the script
  setTimeout( function() {
    board.close();
    process.exit(0); 
  }, 5000 );

})
.catch( function( err ) {
  // If anything goes wrong, report the error and exit
  console.error( err );
  board.close();
  process.exit(-1);
});

```

Several complete examples can be found in the `example` folder.

## Configuration
The constructor accepts an object that specifies the desired configuration.
The board/ports are set up before the 'open' command resolves (so once the 
open operation is complete, the CAN interface is ready to use).

The options are as shown in the following example (if you are happy with the option,
you can omit it from the options object and the default will be used).
```js
let board = new Can({

  // bit rate on the CAN bus
  canRate: 250000,

  // typical CAN sample point
  samplePoint: 75,

  // filters for incoming packets
  filters: [
  ]
  });
```
### Filters
By default, all CAN packets are captured.  You can limit the number of incoming frames by using filters.  They are specified as an array of up to 10 filter definitions.
A filter has these fields:

```js
{
  // true if the filter applies to 29-bit CAN IDs
  ext: true,

  // The ID to accept.  May also be specified as a range:
  // for example '10FF1100 10FF11FF'
  id: '10FF1122'
}
```

## Events
The board object emits the following events:
* `open` when the serial port is successfully opened
* `error` if an error occurs (like the serial port could not be opened)

To listen for the events, use the typical NodeJS EventEmitter pattern:
```js
  board.on('open', function(){
    console.log( 'Port opened');
  })

  board.on('msg', function(msg){
    console.log( msg );
  })

  board.on('close', function(err){
    if( err && err.disconnected ) {
      console.log( 'Port Disconnected' );
    }
    else {
      console.log( 'Port Closed by application' );
    }
  })

  board.on('error', function(msg){
    console.log( 'Serial Port error: ', err );
  })

```

## API
  
  API functions generally return Promises, which are resolved or rejected when the request is complete.  Refer to NodeJS Promise documentation for details on how to chain requests together, detect errors, etc.
  Refer to the CAN-USB-COM protocol document for additional details on the use of the commands and valid parameter ranges.



## Development
Please note the following if you wish to update or modify this package:

* JSHINT rules are included, please lint any changes.
* Unit tests are included (run them using `npm test`).  Some unit tests require an actual board to be attached and will fail if it is not found. 