// Example script that opens the CAN connection and
// sends a message.  
// The example also sets up a filter to catch a response message
// (obviously you will not get a ) 

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


const Can = require('..');

let board = new Can({
  canRate: 500000,
  baudRate: 480800,
    // filters: [{
  //   ext: true,
  //   id: '10EF0000 10FFFFFF',
  //  }

  // ]
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

    if( msg.id !== 0x10FF10811 ) {

      //board.sendExt( 0x10EF8180, [0x47, 0xF0] );
      console.log( 'Msg: ', msg.id.toString(16), msg.data );
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

//board.sendExt( 0x10EF8180, [0x47, 0xF0] );

    let ledState = [0x05, 0x1F, 0x00, 0x00, 0x00, 0x1F, 0x01 ];

    setInterval( function() {


      //board.sendExt( 0x18EF8180, [0x47, 0xF3, 0x01] );
      //board.sendExt( 0x10EF8185, [0x47, 0xF0] );

      // ledState.forEach( function( value, index ) {
      //   let newValue =  value << 1;
      //   ledState[ index ] = (newValue > 16)? 1: newValue;
      // });
      
      //console.log( ledState );
      board.sendExt( 0x10FF2080, ledState );

    }, 50);

    // setInterval( function() {

    //   // ledState.forEach( function( value, index ) {
    //   //   let newValue =  value << 1;
    //   //   ledState[ index ] = (newValue > 16)? 1: newValue;
    //   // });
      
    //   //console.log( ledState );

    //   board.sendExt( 0x10EC8180, [
    //     J1939TP_CTRL_BYTE_RTS,
    //     16, //msg size lsb
    //     0, // msg size msb
    //     3,  // total packets
    //     0xFF, // no limit in response to cts
    //     0x10, //
    //     0x81, // ps of PGN
    //     0xEA, // pf
    //     ] );

    //   //board.sendExt( 0x10EF8280, [0,1,2] );

    // }, 5000);


//    board.sendExt( 0x10EF8001, [0x49, 0x2B, 0x06, 0x00, 0x02]);
//    board.sendExt( 0x10EF8001, [0x49, 0x2B, 0x05, 0x00, 0x85, 0x85]);


})
.catch( function( err ) {
  // Something went wrong... 
  console.error( err );
  board.close();
  process.exit(-1);
});

