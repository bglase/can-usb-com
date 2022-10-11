const AbstractBinding = require('@serialport/binding-abstract');

const MOCK_PORT = '/dev/MOCK';

function resolveNextTick() {
  return new Promise(resolve => process.nextTick(() => resolve()));
}

module.exports = class MockBinding extends AbstractBinding {
  constructor(opt) {
    // console.log('MockBinding::', opt);
    super(opt);
    this.isOpen = false;
    this.maxReadSize = 1000;
    this.rxdata = Buffer.alloc(0);
    this.pendingRead = null;
    this.configMode = true;
    this.txPackets = [];
    this.path = opt.bindingOptions.path;
    this.packetcb = opt.bindingOptions.packetcb;

  }

  static async list() {

    return [{
      path: MOCK_PORT,
      pnpId: undefined,
      locationId: undefined,
      manufacturer: 'Mockery Inc',
      vendorId: '0403',
      productId: '6001',
    }];
  }
  async open(path, options) {
    // console.log('MockBinding::open', path, options);
    await resolveNextTick();
    this.isOpen = true;
  }

  async close() {
    // console.log('MockBinding::close');
    await resolveNextTick();

    this.isOpen = false;
  }

  async read(buffer, offset, length) {
    // console.log('MockBinding::read', offset, length);
    if(!Buffer.isBuffer(buffer)) {
      throw new TypeError('"buffer" is not a Buffer');
    }
    if(typeof offset !== 'number' || isNaN(offset)) {
      throw new TypeError(`"offset" is not an integer got "${isNaN(offset) ? 'NaN' : typeof offset}"`);
    }
    if(typeof length !== 'number' || isNaN(length)) {
      throw new TypeError(`"length" is not an integer got "${isNaN(length) ? 'NaN' : typeof length}"`);
    }
    if(buffer.length < offset + length) {
      throw new Error('buffer is too small');
    }
    if(!this.isOpen) {
      throw new Error('Port is not open');
    }

    await resolveNextTick();
    if(!this.isOpen) {
      throw new Error('Read canceled');
    }
    if(this.rxdata.length <= 0) {
      return new Promise((resolve, reject) => {
        this.pendingRead = err => {
          if(err) {
            return reject(err);
          }
          this.read(buffer, offset, length).then(resolve, reject);
        };
      });
    }
    const lengthToRead = this.maxReadSize > length ? length : this.maxReadSize;
    const data = this.rxdata.slice(0, lengthToRead);
    const bytesRead = data.copy(buffer, offset);
    this.rxdata = this.rxdata.slice(lengthToRead);

    return { bytesRead, buffer };
  }

  // Emit data on a mock port
  emitData(data) {
    if(!this.isOpen) {
      throw new Error('Port must be open to pretend to receive data');
    }
    const bufferData = Buffer.isBuffer(data) ? data : Buffer.from(data);

    this.rxdata = Buffer.concat([this.rxdata, bufferData]);
    if(this.pendingRead) {
      process.nextTick(this.pendingRead);
      this.pendingRead = null;
    }
  }

  async write(buffer) {
    // console.log('MockBinding::write', buffer.toString());


    let cmd = buffer.toString().trim();

    switch (cmd.toUpperCase()) {
      case ':CONFIG;':
        this.configMode = true;
        this.emitData('#0#');
        break;

      case 'SET CAN PORT 250000 75':
        this.emitData('<A:>');
        break;

      case 'DEL CAN FILTER ALL':
        this.emitData('<A:All filters deleted>');
        break;

      case 'EXIT':
        this.configMode = false;
        this.emitData('<A>');
        break;

      default:
        if(cmd.startsWith('SET CAN FILTER')) {
          this.emitData('<A:>');
        } else if(cmd.startsWith('SET CAN CM FILTER')) {
          this.emitData('<A:EOL=NONE>');
        } else if(cmd.startsWith(':')) {
          // send packet
          this._txPacket(cmd.matchAll(/:([SX])([A-F0-9]{3,8})([NFH])((?:[A-F0-9])*);/g));
        } else if(cmd.startsWith('|')) {
          this._txPacket(cmd.matchAll(/\|([SX])([A-F0-9]{3,8})([NFH])((?:[A-F0-9])*);/g), true);
        } else {
          throw new Error('MockBinding::unhandled command');
        }

        break;
    }

  }

  async update(options) {
    throw new Error('MockBinding::update not implemented');
  }

  /**
   * Set control flags on an open port.
   * @param {object=} options All options are operating system default when the port is opened. Every flag is set on each call to the provided or default values. All options are always provided.
   * @param {Boolean} [options.brk=false] flag for brk
   * @param {Boolean} [options.cts=false] flag for cts
   * @param {Boolean} [options.dsr=false] flag for dsr
   * @param {Boolean} [options.dtr=true] flag for dtr
   * @param {Boolean} [options.rts=true] flag for rts
   * @param {Boolean} [options.lowLatency=false] flag for lowLatency mode on Linux
   * @returns {Promise} Resolves once the port's flags are set.
   * @rejects {TypeError} When given invalid arguments, a `TypeError` is rejected.
   */
  async set(options) {
    throw new Error('MockBinding::set not implemented');
  }

  /**
   * Get the control flags (CTS, DSR, DCD) on the open port.
   * @returns {Promise} Resolves with the retrieved flags.
   * @rejects {TypeError} When given invalid arguments, a `TypeError` is rejected.
   */
  async get() {
    throw new Error('MockBinding::get not implemented');
  }

  /**
   * Get the OS reported baud rate for the open port.
   * Used mostly for debugging custom baud rates.
   * @returns {Promise} Resolves with the current baud rate.
   * @rejects {TypeError} When given invalid arguments, a `TypeError` is rejected.
   */
  async getBaudRate() {
    throw new Error('MockBinding::getBaudRate not implemented');
  }

  /**
   * Flush (discard) data received but not read, and written but not transmitted.
   * @returns {Promise} Resolves once the flush operation finishes.
   * @rejects {TypeError} When given invalid arguments, a `TypeError` is rejected.
   */
  async flush() {
    throw new Error('MockBinding::flush not implemented');
  }

  /**
   * Drain waits until all output data is transmitted to the serial port. An in progress write should be completed before this returns.
   * @returns {Promise} Resolves once the drain operation finishes.
   * @rejects {TypeError} When given invalid arguments, a `TypeError` is rejected.
   */
  async drain() {

  }

  _txPacket(p, loopback) {

    for(const packet of p) {
      this.txPackets.push(packet);
      if(typeof this.packetcb === 'function') {
        this.packetcb(this, packet);

      }
      // console.log(packet);
      if(loopback) {
        let str = packet[0];

        this.emitData(':' + str.slice(1));
      }
    }
  }

}
