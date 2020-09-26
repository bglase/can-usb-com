/**
 * Tests receive filtering
 *
 */
const CanUsbCom = require('..');
const chai = require('chai');
const expect = chai.expect;
const should = chai.should();
chai.use(require('chai-events'));

const CAN_OPTIONS = {
  canRate: 500000,
};




describe.skip('No Filters', () => {

  let can = null;

  // before all tests in this block, get an open port
  before(async () => {

    // set and keep for later tests
    can = new CanUsbCom(CAN_OPTIONS);

    let result = await can.list();

    let p = can.should.emit('open');

    can.open(result[0].path);

    return p;
  })

  it('should send a message with standard identifier', async () => {

    let p = can.should.not.emit('error');

    // mainly we are checking that the write does not throw or error

    can.write({
      id: 0x100,
      ext: false,
      buf: []
    });
    can.write({
      id: 0x101,
      ext: false,
      buf: [1]
    });
    can.write({
      id: 0x102,
      ext: false,
      buf: [1, 2]
    });
    can.write({
      id: 0x103,
      ext: false,
      buf: [1, 2, 3]
    });
    can.write({
      id: 0x104,
      ext: false,
      buf: [1, 2, 3, 4, 5]
    });
    can.write({
      id: 0x105,
      ext: false,
      buf: [1, 2, 3, 4, 5, 6]
    });
    can.write({
      id: 0x106,
      ext: false,
      buf: [1, 2, 3, 4, 5, 6, 7]
    });
    can.write({
      id: 0x107,
      ext: false,
      buf: [1, 2, 3, 4, 5, 6, 7, 8]
    });

    return p;

  });

  it('should emit a write event', async () => {

    let p = can.should.emit('write');

    can.write({
      id: 0x100,
      ext: false,
      buf: []
    });

    return p;
  });


  // after all tests in this block
  after(async () => {

    await can.close();

  })
});


describe('Receive a Message', () => {

  let can = null;

  // before all tests in this block, get an open port
  before(async () => {

    // set and keep for later tests
    can = new CanUsbCom(CAN_OPTIONS);

    let result = await can.list();

    let p = can.should.emit('open');

    can.open(result[0].path);

    return p;
  })


  it('should receive an extended message', (done) => {

    can.once('data', (msg) => {

      expect(msg).to.be.an('object');

      expect(msg.id).to.exist;
      expect(msg.ext).to.exist;
      expect(msg.buf).to.exist;
      expect(msg.id).to.be.eq(0x10EF8081);
      expect(msg.ext).to.be.eq(true);
      expect(msg.buf).to.deep.eq(Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]));

      done();

    });

    // here we simulate a receipt of a message thru the serial port
    // we could also send a packet and loop it back
    //
    can._onData(Buffer.from(':X10EF8081N0102030405060708;'));

  });

  it('should receive a standard message', (done) => {

    can.once('data', (msg) => {

      expect(msg).to.be.an('object');

      expect(msg.id).to.exist;
      expect(msg.ext).to.exist;
      expect(msg.buf).to.exist;
      expect(msg.id).to.be.eq(0x100);
      expect(msg.ext).to.be.eq(false);
      expect(msg.buf).to.deep.eq(Buffer.from([8, 7, 6, 5, 4, 3, 2, 1]));

      done();

    });

    // here we simulate a receipt of a message thru the serial port
    // we could also send a packet and loop it back
    can._onData(Buffer.from(':S100N0807060504030201;'));

  });

  // after all tests in this block
  after(async () => {

    await can.close();

  })
});