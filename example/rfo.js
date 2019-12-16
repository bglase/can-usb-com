// Example script that opens the CAN connection and
// sends a message.  
// The example also sets up a filter to catch a response message
// (obviously you will not get a ) 


const Can = require('..');

let board = new Can({
  canRate: 250000,
  filters: [{
    ext: false,
    id: '097',
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

    rxData( msg.data );
    
    //board.sendExt( 0x10EFC901, [0x48, 0xA0, 0x19, 0, 0, 0, 0, 0]);
  });

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
    // board.sendExt( 0x10EF8001, [0x49, 0x2B, 0x06, 0x00, 0x02]);
    // board.sendExt( 0x10EF8001, [0x49, 0x2B, 0x05, 0x00, 0x85, 0x85]);


})
.catch( function( err ) {
  // Something went wrong... 
  console.error( err );
  board.close();
  process.exit(-1);
});



//------------------------------//----------------------------------------------
// Definitions

const FRAME_CHAR =0x7E;
const ESCAPE_CHAR =0x7D;
const ESCAPE_FLAG =0x20;
const RX_BUFFER_SIZE = 80;

//------------------------------//----------------------------------------------
// Global variables

//------------------------------//----------------------------------------------
// Local variables

// State variables used in UART receive
var _bRxEscape;
var _rxBytes;
var _bRxInFrame;
var _rxCrc;
var rxBuffer;

//------------------------------//----------------------------------------------
// Local functions


// static void _EscapeAndSend( uint8_t byte )
// {
//     // Check for characters that must be escaped.
//     if( ( FRAME_CHAR == byte ) || ( ESCAPE_CHAR == byte ) )
//     {
//         // Insert escape sequence for control characters.
//         UART2_Put( ESCAPE_CHAR );

//         UART2_Put( ESCAPE_FLAG ^ byte );
//     }
//     else
//     {
//         // Insert non control characters.
//         UART2_Put( byte );
//     }
// }

/**
 * @brief      Send an framed protocol packet to the Host via UART
 *
 * Sends the specified bytes, adds framing, escaping, and crc bytes
 *
 * @param[in]  pBuf    The buffer
 * @param[in]  length  The length in bytes
 */
// static void _SendPacket( const void *pBuf, uint8_t length )
// {
//     const uint8_t *p = (uint8_t *)pBuf;
//     uint16_t crc = 0;

//     UART2_Put( FRAME_CHAR );

//     while( length > 0 )
//     {
//         uint8_t byte = *p++;

//         crc = CRC16_Update( crc, byte );

//         _EscapeAndSend( byte );

//         length--;
//     }

//     // close it out with crc and final framing char
//     _EscapeAndSend( crc >> 8 );
//     _EscapeAndSend( crc & 0xFF );
//     UART2_Put( FRAME_CHAR );
// }

function _ClearRx(  )
{
    _bRxEscape = false;
    _rxBytes = 0;
    _bRxInFrame = false;
    _rxCrc = 0;
    _rxBuffer = [];

}

/**
 * @brief      Process a received packet
 *
 * Checksum has already been verified at this point
 *
 * @param[in]  pBuf    The buffer
 * @param[in]  length  The length
 */
function _ProcessPacket( buf )
{
  console.log( 'Packet: ', buf );
}


function rxData( buf )
{
  buf.forEach( function( c ) {

            if( _bRxEscape )
            {
                _bRxEscape = false;

                // If we have room, store the unescaped byte
                if( _rxBuffer.length < RX_BUFFER_SIZE )
                {
                    _rxBuffer.push( c ^ ESCAPE_FLAG );
                }
                else
                {
                    // out of space -comm error.  might as well just wait
                    // till next flag character to clean up
                }
            }
            else if( ESCAPE_CHAR === c )
            {
                // If the next byte is an escaped byte
                _bRxEscape = true;
            }
            else if( FRAME_CHAR === c )
            {
                // If this byte marks the start or end of a frame
                if( _bRxInFrame )
                {
                    // this might/should be the end of the frame
                    if( _rxBuffer.length > 2 );//&& 0 === _rxCrc )
                    {
                        // packet is valid!
                        _ProcessPacket( _rxBuffer );
                        _ClearRx();
                    }

                    // we thought this was the end of the packet, but something is wrong
                    // with it if we get here.  We basically don't know anything at this
                    // point other than we got a flag character.  So reset everything and
                    // act like we are starting to receive a new packet
                    _rxBuffer = [];
                }
                else
                {
                    // start of frame
                    _bRxInFrame = true;
                }
            }
            else if( _bRxInFrame )
            {
                // just a plain o' byte.  If we have room, keep it
                if( _rxBuffer.length < RX_BUFFER_SIZE )
                {
                    //_rxCrc = CRC16_Update( _rxCrc, c );
                    _rxBuffer.push(c );
                }
                else
                {
                    // out of space -comm error.  might as well just wait
                    // till next flag character to clean up
                }
            }


  });
}



//------------------------------//----------------------------------------------
// Public functions

/**
 * @brief      Entry point for bootloader.
 *
 * @return     Never returns
 */

    // Setup receive state variables
    _ClearRx();



