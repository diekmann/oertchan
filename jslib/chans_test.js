"use strict";
describe('chans', function () {
    const logger = (txt) => console.log(txt);
    describe('binary helpers', function () {
        it('hexlify', function () {
            const hexStr = UserIdentity.hexlify(new Uint8Array([42, 0, 10, 0xff]));
            assert.strictEqual(hexStr, '2a000aff');
        });
        it('hexlify unhexlify identity 1', function () {
            const arr = new Uint8Array([42, 0, 10, 0xff, 0x23, 0xab]);
            assert.deepEqual(UserIdentity.unhexlify(UserIdentity.hexlify(arr)), arr);
        });
        it('hexlify unhexlify identity 2', function () {
            const hexStr = '01020342ab0fff';
            assert.strictEqual(UserIdentity.hexlify(UserIdentity.unhexlify(hexStr)), hexStr);
        });
        it('unhexlify empty', function () {
            const hexStr = '';
            assert.deepEqual(UserIdentity.unhexlify(hexStr), new Uint8Array(0));
        });
        it('unhexlify string', function () {
            const hexStr = 'ff010242ab';
            assert.deepEqual(UserIdentity.unhexlify(hexStr), new Uint8Array([0xff, 0x1, 0x2, 0x42, 0xab]));
        });
        it('uid lenghth 384 bits', async function () {
            const uid = await UserIdentity.create(logger);
            const bits384inHexStr = 48 * 2;
            assert.strictEqual(uid.uidHash.length, bits384inHexStr);
        });
        it('valid challenge response run', async function () {
            const Alice = await UserIdentity.create(logger);
            const whatAliceClaims = await PeerIdentity.init(Alice.key.publicKey, "Alice", []);
            const challenge = whatAliceClaims.generateChallenge();
            const response = await Alice.responseForChallenge(challenge);
            const result = await whatAliceClaims.verifyResponse(response);
            assert.strictEqual(result, true);
        });
        it('invalid challenge response run', async function () {
            let Alice = await UserIdentity.create(logger);
            const whatAliceClaims = await PeerIdentity.init(Alice.key.publicKey, "Alice", []);
            const challenge = whatAliceClaims.generateChallenge();
            Alice = await UserIdentity.create(logger); //  re-initializing Alice, destroying original key, so challenge must fail
            const response = await Alice.responseForChallenge(challenge);
            const result = await whatAliceClaims.verifyResponse(response);
            assert.strictEqual(result, false);
        });
        it('invalid response', async function () {
            let Alice = await UserIdentity.create(logger);
            const whatAliceClaims = await PeerIdentity.init(Alice.key.publicKey, "Alice", []);
            const challenge = whatAliceClaims.generateChallenge();
            const response = ''; // invalid response
            const result = await whatAliceClaims.verifyResponse(response);
            assert.strictEqual(result, false);
        });
        it('invalid response 2', async function () {
            let Alice = await UserIdentity.create(logger);
            const whatAliceClaims = await PeerIdentity.init(Alice.key.publicKey, "Alice", []);
            const challenge = whatAliceClaims.generateChallenge();
            const response = '00b662f1039a8d44f7b558d2715ea9ce0fc4f211f6a65782d57c3bfbe4b066fdcd27595b0f7658c6fd021f0ea8608717f5239ea58c3cea7d7f34682790d14728cf7c00e2826bae78a7a36df461d9abcabea2c3479c508bf3ff6946af9db98a238a8a4ce4a2c7c39adb67ec56c9b3803c676390db55db95a63effb6f87b76016b840424be'; // wrong response
            const result = await whatAliceClaims.verifyResponse(response);
            assert.strictEqual(result, false);
        });
    });
    describe('display name', function () {
        it('uniqueDisplayName no collision', function () {
            const dn = PeerIdentity.uniqueDisplayName('1234', 'Alice', []);
            assert.strictEqual(dn, 'Alice');
        });
        it('uniqueDisplayName 1 collision', function () {
            const dn = PeerIdentity.uniqueDisplayName('1234', 'Alice', ['Alice']);
            assert.strictEqual(dn, 'Alice1');
        });
        it('uniqueDisplayName 2 collision', function () {
            const dn = PeerIdentity.uniqueDisplayName('1234', 'Alice', ['Alice1', 'Alice']);
            assert.strictEqual(dn, 'Alice12');
        });
        it('uniqueDisplayName 3 collision', function () {
            const dn = PeerIdentity.uniqueDisplayName('1234', 'Alice', ['Alice', 'Alice12', 'Alice1']);
            assert.strictEqual(dn, 'Alice123');
        });
    });
    describe('Chans.parseIncoming', function () {
        it('Chans.parseIncoming error empty', function () {
            const [msg, error] = Chans.parseIncoming('');
            assert.deepEqual(msg, {});
            assert.deepEqual(error, { logMe: 'unparsable: ', sendMe: '' });
        });
        it('Chans.parseIncoming error not an object', function () {
            const [msg, error] = Chans.parseIncoming('42');
            assert.deepEqual(msg, {});
            assert.deepEqual(error, { logMe: 'unparsable: 42 did not return an object', sendMe: '' });
        });
        it('Chans.parseIncoming error not an object', function () {
            const [msg, error] = Chans.parseIncoming('null');
            assert.deepEqual(msg, {});
            assert.deepEqual(error, { logMe: 'unparsable: null did not return an object', sendMe: '' });
        });
        it('Chans.parseIncoming success empty', function () {
            const [msg, error] = Chans.parseIncoming('{}');
            assert.deepEqual(msg, {});
            assert.deepEqual(error, undefined);
        });
        it('Chans.parseIncoming success message', function () {
            const [msg, error] = Chans.parseIncoming('{"message": "lol"}');
            assert.deepEqual(msg, { message: 'lol' });
            assert.deepEqual(error, undefined);
        });
        it('Chans.parseIncoming success message empty', function () {
            const [msg, error] = Chans.parseIncoming('{"message": ""}');
            assert.deepEqual(msg, { message: '' });
            assert.deepEqual(error, undefined);
        });
        it('Chans.parseIncoming success message not a string (number)', function () {
            const [msg, error] = Chans.parseIncoming('{"message": 42}');
            assert.deepEqual(msg, { message: '42' });
            assert.deepEqual(error, undefined);
        });
        it('Chans.parseIncoming success message not a string (null)', function () {
            const [msg, error] = Chans.parseIncoming('{"message": null}');
            assert.deepEqual(msg, { message: 'null' });
            assert.deepEqual(error, undefined);
        });
        it('Chans.parseIncoming success message not a string (object)', function () {
            const [msg, error] = Chans.parseIncoming('{"message": {}}');
            assert.deepEqual(msg, { message: '<not a string>' });
            assert.deepEqual(error, undefined);
        });
        it('Chans.parseIncoming error unknown field', function () {
            const [msg, error] = Chans.parseIncoming('{"unknownfield": "lol"}');
            assert.deepEqual(msg, {});
            assert.deepEqual(error, { logMe: 'request contains unknown fields: {"unknownfield":"lol"}', sendMe: '' });
        });
        it('Chans.parseIncoming success request GET no content', function () {
            const [msg, error] = Chans.parseIncoming('{"request": {"url": "/foo", "method": "GET"}}');
            assert.deepEqual(msg, { request: new RequestMessage('/foo', 'GET', undefined) });
            assert.deepEqual(error, undefined);
        });
        it('Chans.parseIncoming success request GET content', function () {
            const [msg, error] = Chans.parseIncoming('{"request": {"url": "/foo", "method": "GET", "content": "lol"}}');
            assert.deepEqual(msg, { request: new RequestMessage('/foo', 'GET', 'lol') });
            assert.deepEqual(error, undefined);
        });
        it('Chans.parseIncoming error request POST no content', function () {
            const [msg, error] = Chans.parseIncoming('{"request": {"url": "/foo", "method": "POST"}}');
            assert.deepEqual(msg, {});
            assert.deepEqual(error, { logMe: '', sendMe: 'request: POST needs content' });
        });
        it('Chans.parseIncoming success request POST content', function () {
            const [msg, error] = Chans.parseIncoming('{"request": {"url": "/foo", "method": "POST", "content": "lol"}}');
            assert.deepEqual(msg, { request: new RequestMessage('/foo', 'POST', 'lol') });
            assert.deepEqual(error, undefined);
        });
        it('Chans.parseIncoming success request POST content additional field silently ignored', function () {
            const [msg, error] = Chans.parseIncoming('{"request": {"url": "/foo", "method": "POST", "content": "lol", "extra field": "ignore me"}}');
            assert.deepEqual(msg, { request: new RequestMessage('/foo', 'POST', 'lol') });
            assert.deepEqual(error, undefined);
        });
    });
});
